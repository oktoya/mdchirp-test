import assert from 'node:assert'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { ImageMediaError, MAX_IMAGE_BYTES, readImageMedia, saveImageMedia } from './imageMedia.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DATA_DIR = path.resolve(__dirname, 'test-tmp-data')
const POSTS_SRC_DIR = path.join(TEST_DATA_DIR, 'posts-src')
const SLUG = 'my-test-post'

let pass = 0

const ok = (name: string) => {
  console.log(`  ✓ ${name}`)
  pass++
}

async function cleanup(): Promise<void> {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true }).catch(() => {})
}

async function makePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
}

async function makeGif(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 0, g: 0, b: 255, alpha: 1 },
    },
  })
    .gif()
    .toBuffer()
}

async function runTests(): Promise<void> {
  try {
    await cleanup()

    const png = await makePng()

    const original = await saveImageMedia({
      slug: SLUG,
      originalName: 'My Photo.PNG',
      data: png,
      imageFormat: 'original',
      postsSrcDir: POSTS_SRC_DIR,
    })

    assert.equal(original.type, 'image')
    assert.equal(original.origin, 'local')
    assert.equal(original.filename, 'My-Photo.png')
    assert.equal(original.sizeBytes, png.length)
    assert.equal(original.nasPath, 'posts-src/my-test-post/media/My-Photo.png')

    const originalRead = await readImageMedia(SLUG, original.filename, POSTS_SRC_DIR)
    assert(originalRead)
    assert.equal(originalRead.contentType, 'image/png')
    assert.deepEqual(originalRead.data, png)
    ok('PNG original upload and read')

    const duplicate = await saveImageMedia({
      slug: SLUG,
      originalName: 'My Photo.PNG',
      data: png,
      imageFormat: 'original',
      postsSrcDir: POSTS_SRC_DIR,
    })

    assert.equal(duplicate.filename, 'My-Photo-2.png')
    ok('duplicate filename suffix')

    const koreanConverted = await saveImageMedia({
      slug: SLUG,
      originalName: '한글 사진.png',
      data: png,
      imageFormat: 'webp',
      postsSrcDir: POSTS_SRC_DIR,
    })

    assert.equal(koreanConverted.filename, '한글-사진.webp')
    assert.equal(
      koreanConverted.nasPath,
      'posts-src/my-test-post/media/한글-사진.webp',
    )

    const koreanRead = await readImageMedia(
      SLUG,
      koreanConverted.filename,
      POSTS_SRC_DIR,
    )
    assert(koreanRead)
    assert.equal(koreanRead.contentType, 'image/webp')

    const koreanDuplicate = await saveImageMedia({
      slug: SLUG,
      originalName: '한글 사진.png',
      data: png,
      imageFormat: 'webp',
      postsSrcDir: POSTS_SRC_DIR,
    })

    assert.equal(koreanDuplicate.filename, '한글-사진-2.webp')
    ok('한글 파일명 보존 및 중복 suffix')

    const converted = await saveImageMedia({
      slug: SLUG,
      originalName: 'convert-me.png',
      data: png,
      imageFormat: 'webp',
      postsSrcDir: POSTS_SRC_DIR,
    })

    assert.equal(converted.filename, 'convert-me.webp')

    const convertedRead = await readImageMedia(SLUG, converted.filename, POSTS_SRC_DIR)
    assert(convertedRead)
    assert.equal(convertedRead.contentType, 'image/webp')

    const convertedMetadata = await sharp(convertedRead.data).metadata()
    assert.equal(convertedMetadata.format, 'webp')
    ok('PNG to WebP conversion')

    const gif = await makeGif()

    const originalGif = await saveImageMedia({
      slug: SLUG,
      originalName: 'animation.gif',
      data: gif,
      imageFormat: 'original',
      postsSrcDir: POSTS_SRC_DIR,
    })

    assert.equal(originalGif.filename, 'animation.gif')

    const originalGifRead = await readImageMedia(SLUG, originalGif.filename, POSTS_SRC_DIR)
    assert(originalGifRead)
    assert.equal(originalGifRead.contentType, 'image/gif')

    const convertedGif = await saveImageMedia({
      slug: SLUG,
      originalName: 'animation.gif',
      data: gif,
      imageFormat: 'webp',
      postsSrcDir: POSTS_SRC_DIR,
    })

    assert.equal(convertedGif.filename, 'animation.webp')

    const convertedGifRead = await readImageMedia(SLUG, convertedGif.filename, POSTS_SRC_DIR)
    assert(convertedGifRead)
    assert.equal(convertedGifRead.contentType, 'image/webp')

    const convertedGifMetadata = await sharp(convertedGifRead.data, { animated: true }).metadata()
    assert.equal(convertedGifMetadata.format, 'webp')
    ok('GIF acceptance and WebP conversion')

    await assert.rejects(
      () =>
        saveImageMedia({
          slug: SLUG,
          originalName: 'fake.png',
          data: Buffer.from('not an image'),
          imageFormat: 'original',
          postsSrcDir: POSTS_SRC_DIR,
        }),
      (error: unknown) => {
        assert(error instanceof ImageMediaError)
        assert.equal(error.code, 'invalid_image')
        assert.equal(error.status, 422)
        return true
      },
    )
    ok('invalid image rejection')

    await assert.rejects(
      () =>
        saveImageMedia({
          slug: SLUG,
          originalName: 'too-large.png',
          data: Buffer.alloc(MAX_IMAGE_BYTES + 1),
          imageFormat: 'original',
          postsSrcDir: POSTS_SRC_DIR,
        }),
      (error: unknown) => {
        assert(error instanceof ImageMediaError)
        assert.equal(error.code, 'media_too_large')
        assert.equal(error.status, 413)
        return true
      },
    )
    ok('20 MiB upload limit')

    assert.equal(await readImageMedia('../outside', 'photo.png', POSTS_SRC_DIR), null)
    assert.equal(await readImageMedia(SLUG, '../photo.png', POSTS_SRC_DIR), null)
    assert.equal(await readImageMedia(SLUG, 'folder/photo.png', POSTS_SRC_DIR), null)
    assert.equal(await readImageMedia(SLUG, 'photo.txt', POSTS_SRC_DIR), null)
    ok('path traversal and unsupported retrieval rejection')
  } finally {
    await cleanup()
  }

  console.log(`\n✓ ${pass} checks passed`)
}

runTests().catch((error) => {
  console.error('Test Failed:', error)
  process.exit(1)
})
