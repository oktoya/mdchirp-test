import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { MediaFile } from '@mdchirp/shared'
import { config, FILES } from '../config.js'

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_IMAGE_FRAMES = 300

export type ImageFormatSetting = 'original' | 'webp'

export type ImageMediaErrorCode =
  | 'media_required'
  | 'unsupported_media_type'
  | 'media_too_large'
  | 'invalid_image'
  | 'media_upload_failed'

export type ImageMediaErrorStatus = 400 | 413 | 422 | 500

export class ImageMediaError extends Error {
  constructor(
    public readonly code: ImageMediaErrorCode,
    public readonly status: ImageMediaErrorStatus,
    message: string,
  ) {
    super(message)
    this.name = 'ImageMediaError'
  }
}

type SupportedInputFormat = 'jpeg' | 'png' | 'webp' | 'gif'
type StoredFormat = SupportedInputFormat

const SUPPORTED_FORMATS = new Set<SupportedInputFormat>(['jpeg', 'png', 'webp', 'gif'])

const EXTENSION_BY_FORMAT: Record<StoredFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
}

const CONTENT_TYPE_BY_FORMAT: Record<StoredFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

export interface SaveImageMediaInput {
  slug: string
  originalName: string
  data: Buffer
  imageFormat: ImageFormatSetting
  postsSrcDir?: string
}

export interface ReadImageMediaResult {
  data: Buffer
  contentType: string
}

interface ValidatedImage {
  format: SupportedInputFormat
  pages: number
}

function isSafePathSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !path.isAbsolute(value)
  )
}

function assertSafeSlug(slug: string): void {
  if (!isSafePathSegment(slug)) {
    throw new ImageMediaError('media_upload_failed', 400, 'Invalid post slug')
  }
}

function sanitizeBaseName(originalName: string): string {
  const leaf = path.basename(originalName.replaceAll('\\', '/'))
  const parsed = path.parse(leaf)

  // 한글을 포함한 Unicode 문자·숫자·결합문자는 보존한다.
  // 경로 구분자와 제어문자 등 나머지 문자는 하이픈으로 정규화한다.
  const normalized = parsed.name
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')

  // Unicode 문자의 중간을 자르지 않도록 코드 포인트 기준으로 제한한다.
  const sanitized = Array.from(normalized).slice(0, 80).join('')

  return sanitized || 'image'
}

function mediaDirectory(postsSrcDir: string, slug: string): string {
  assertSafeSlug(slug)

  const base = path.resolve(postsSrcDir)
  const directory = path.resolve(base, slug, FILES.mediaDir)
  const relative = path.relative(base, directory)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ImageMediaError('media_upload_failed', 400, 'Invalid media directory')
  }

  return directory
}

async function validateImage(data: Buffer): Promise<ValidatedImage> {
  try {
    const metadata = await sharp(data, {
      animated: true,
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).metadata()

    if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format as SupportedInputFormat)) {
      throw new ImageMediaError(
        'unsupported_media_type',
        400,
        'Only JPEG, PNG, WebP, and GIF images are supported',
      )
    }

    const pages = metadata.pages ?? 1
    if (pages > MAX_IMAGE_FRAMES) {
      throw new ImageMediaError(
        'invalid_image',
        422,
        `Animated image exceeds the ${MAX_IMAGE_FRAMES} frame limit`,
      )
    }

    const width = metadata.width ?? 0
    const frameHeight = metadata.pageHeight ?? metadata.height ?? 0
    if (width <= 0 || frameHeight <= 0 || width * frameHeight > MAX_IMAGE_PIXELS) {
      throw new ImageMediaError(
        'invalid_image',
        422,
        `Image exceeds the ${MAX_IMAGE_PIXELS} pixel limit`,
      )
    }

    return {
      format: metadata.format as SupportedInputFormat,
      pages,
    }
  } catch (error) {
    if (error instanceof ImageMediaError) throw error
    throw new ImageMediaError('invalid_image', 422, 'The uploaded file is not a valid image')
  }
}

async function prepareStoredImage(
  data: Buffer,
  validated: ValidatedImage,
  imageFormat: ImageFormatSetting,
): Promise<{ data: Buffer; format: StoredFormat }> {
  if (imageFormat === 'original') {
    return {
      data,
      format: validated.format,
    }
  }

  try {
    const converted = await sharp(data, {
      animated: true,
      limitInputPixels: MAX_IMAGE_PIXELS,
    })
      .webp({
        quality: 82,
        effort: 4,
      })
      .toBuffer()

    return {
      data: converted,
      format: 'webp',
    }
  } catch {
    throw new ImageMediaError('invalid_image', 422, 'The image could not be converted to WebP')
  }
}

async function reserveFilename(
  directory: string,
  temporaryPath: string,
  baseName: string,
  extension: string,
): Promise<string> {
  for (let index = 1; index <= 10_000; index++) {
    const suffix = index === 1 ? '' : `-${index}`
    const filename = `${baseName}${suffix}.${extension}`
    const destination = path.join(directory, filename)

    try {
      await fs.link(temporaryPath, destination)
      return filename
    } catch (error: any) {
      if (error?.code === 'EEXIST') continue
      throw error
    }
  }

  throw new ImageMediaError('media_upload_failed', 500, 'Could not allocate a media filename')
}

export async function saveImageMedia(input: SaveImageMediaInput): Promise<MediaFile> {
  if (!input.data.length) {
    throw new ImageMediaError('media_required', 400, 'An image file is required')
  }

  if (input.data.length > MAX_IMAGE_BYTES) {
    throw new ImageMediaError(
      'media_too_large',
      413,
      `Image exceeds the ${MAX_IMAGE_BYTES} byte limit`,
    )
  }

  const validated = await validateImage(input.data)
  const stored = await prepareStoredImage(input.data, validated, input.imageFormat)
  const directory = mediaDirectory(input.postsSrcDir ?? config.postsSrcDir, input.slug)
  const baseName = sanitizeBaseName(input.originalName)
  const extension = EXTENSION_BY_FORMAT[stored.format]

  await fs.mkdir(directory, { recursive: true })

  const temporaryPath = path.join(directory, `.upload-${randomUUID()}.tmp`)

  try {
    await fs.writeFile(temporaryPath, stored.data, { flag: 'wx' })

    const filename = await reserveFilename(directory, temporaryPath, baseName, extension)

    return {
      id: randomUUID(),
      type: 'image',
      origin: 'local',
      filename,
      nasPath: path.posix.join('posts-src', input.slug, FILES.mediaDir, filename),
      sizeBytes: stored.data.length,
    }
  } catch (error) {
    if (error instanceof ImageMediaError) throw error
    throw new ImageMediaError('media_upload_failed', 500, 'The image could not be stored')
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

export async function readImageMedia(
  slug: string,
  filename: string,
  postsSrcDir: string = config.postsSrcDir,
): Promise<ReadImageMediaResult | null> {
  if (!isSafePathSegment(slug) || !isSafePathSegment(filename)) return null

  const directory = mediaDirectory(postsSrcDir, slug)
  const filePath = path.resolve(directory, filename)
  const relative = path.relative(directory, filePath)

  if (relative.startsWith('..') || path.isAbsolute(relative)) return null

  const extension = path.extname(filename).toLowerCase()
  const format: StoredFormat | null =
    extension === '.jpg' || extension === '.jpeg'
      ? 'jpeg'
      : extension === '.png'
        ? 'png'
        : extension === '.webp'
          ? 'webp'
          : extension === '.gif'
            ? 'gif'
            : null

  if (!format) return null

  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return null

    return {
      data: await fs.readFile(filePath),
      contentType: CONTENT_TYPE_BY_FORMAT[format],
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}
