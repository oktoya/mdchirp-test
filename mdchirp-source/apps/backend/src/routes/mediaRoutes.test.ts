import assert from 'node:assert'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import type { Post, UploadMediaResponse } from '@mdchirp/shared'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DATA_DIR = path.resolve(__dirname, 'test-tmp-media-routes')
process.env.MDCHIRP_DATA_DIR = TEST_DATA_DIR

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
      background: { r: 255, g: 128, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
}

async function runTests(): Promise<void> {
  await cleanup()

  try {
    // 환경변수 설정 뒤 import해야 config가 테스트 디렉터리를 사용한다.
    const { app } = await import('../server.js')

    const now = new Date().toISOString()
    const post: Post = {
      id: 'media-route-test',
      slug: 'media-route-test',
      title: 'Media Route Test',
      tiptapJson: null,
      markdown: '',
      frontmatter: {
        title: 'Media Route Test',
      },
      media: [],
      status: 'draft',
      hasRichSource: false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    }

    const saveResponse = await app.request('/api/posts/media-route-test', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post,
        baseRev: 0,
      }),
    })

    assert.equal(saveResponse.status, 200)
    ok('test post creation')

    const png = await makePng()
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'Route Photo.png')

    const uploadResponse = await app.request('/api/posts/media-route-test/media', {
      method: 'POST',
      body: form,
    })

    assert.equal(uploadResponse.status, 200)

    const uploadBody = (await uploadResponse.json()) as UploadMediaResponse
    assert.equal(uploadBody.ok, true)
    assert.equal(uploadBody.media.type, 'image')
    assert.equal(uploadBody.media.origin, 'local')
    assert.equal(uploadBody.media.filename, 'Route-Photo.png')
    ok('multipart image upload')

    const readResponse = await app.request(
      `/api/posts/media-route-test/media/${encodeURIComponent(uploadBody.media.filename)}`,
    )

    assert.equal(readResponse.status, 200)
    assert.equal(readResponse.headers.get('content-type'), 'image/png')
    assert.equal(readResponse.headers.get('x-content-type-options'), 'nosniff')

    const readData = Buffer.from(await readResponse.arrayBuffer())
    assert.deepEqual(readData, png)
    ok('uploaded image retrieval')

    const webpForm = new FormData()
    webpForm.append(
      'file',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'Format Override.png',
    )
    webpForm.append('imageFormat', 'webp')

    const webpUploadResponse = await app.request('/api/posts/media-route-test/media', {
      method: 'POST',
      body: webpForm,
    })

    assert.equal(webpUploadResponse.status, 200)

    const webpUploadBody = (await webpUploadResponse.json()) as UploadMediaResponse
    assert.equal(webpUploadBody.ok, true)
    assert.equal(webpUploadBody.media.filename, 'Format-Override.webp')

    const webpReadResponse = await app.request(
      `/api/posts/media-route-test/media/${encodeURIComponent(webpUploadBody.media.filename)}`,
    )

    assert.equal(webpReadResponse.status, 200)
    assert.equal(webpReadResponse.headers.get('content-type'), 'image/webp')

    const webpData = Buffer.from(await webpReadResponse.arrayBuffer())
    const webpMetadata = await sharp(webpData).metadata()

    assert.equal(webpMetadata.format, 'webp')
    ok('per-image WebP override converts PNG to WebP')

    const originalForm = new FormData()
    originalForm.append(
      'file',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'Keep Original.png',
    )
    originalForm.append('imageFormat', 'original')

    const originalUploadResponse = await app.request('/api/posts/media-route-test/media', {
      method: 'POST',
      body: originalForm,
    })

    assert.equal(originalUploadResponse.status, 200)

    const originalUploadBody = (await originalUploadResponse.json()) as UploadMediaResponse

    assert.equal(originalUploadBody.media.filename, 'Keep-Original.png')
    ok('per-image original override preserves PNG format')

    const invalidFormatForm = new FormData()
    invalidFormatForm.append(
      'file',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'Invalid Format.png',
    )
    invalidFormatForm.append('imageFormat', 'jpeg')

    const invalidFormatResponse = await app.request('/api/posts/media-route-test/media', {
      method: 'POST',
      body: invalidFormatForm,
    })

    assert.equal(invalidFormatResponse.status, 400)

    const invalidFormatBody = (await invalidFormatResponse.json()) as {
      error: string
    }

    assert.equal(invalidFormatBody.error, 'invalid_image_format')
    ok('invalid per-image format returns 400')

    const missingMediaResponse = await app.request('/api/posts/media-route-test/media/missing.png')

    assert.equal(missingMediaResponse.status, 404)
    ok('missing media returns 404')

    const missingPostForm = new FormData()
    missingPostForm.append(
      'file',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'photo.png',
    )

    const missingPostResponse = await app.request('/api/posts/not-found/media', {
      method: 'POST',
      body: missingPostForm,
    })

    assert.equal(missingPostResponse.status, 404)

    const missingPostBody = (await missingPostResponse.json()) as { error: string }
    assert.equal(missingPostBody.error, 'post_not_found')
    ok('missing post upload returns 404')

    const missingFileResponse = await app.request('/api/posts/media-route-test/media', {
      method: 'POST',
      body: new FormData(),
    })

    assert.equal(missingFileResponse.status, 400)

    const missingFileBody = (await missingFileResponse.json()) as { error: string }
    assert.equal(missingFileBody.error, 'media_required')
    ok('missing multipart file returns 400')
  } finally {
    await cleanup()
  }

  console.log(`\n✓ ${pass} checks passed`)
}

runTests().catch((error) => {
  console.error('Test Failed:', error)
  process.exit(1)
})
