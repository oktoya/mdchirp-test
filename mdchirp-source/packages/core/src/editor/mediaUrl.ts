// 이미지 원본 경로와 화면 표시 URL을 분리한다.
// Markdown/TipTap 문서에는 로컬 파일명만 저장하고, 렌더링할 때만 NAS URL로 변환한다.

export type MediaUrlResolver = (slug: string, filename: string) => string

export interface MarkdownImageTarget {
  src: string
  alt: string
}

/**
 * NAS 미디어 API로 변환할 수 있는 안전한 로컬 파일명인지 확인한다.
 *
 * URL scheme, 절대/상대 경로, query/hash가 포함된 값은 변환하지 않는다.
 * 서버 업로드 결과가 반환한 단일 파일명만 로컬 미디어로 취급한다.
 */
export function isLocalMediaFilename(src: string): boolean {
  const value = src.trim()
  if (!value) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false
  if (value.startsWith('//')) return false
  if (value === '.' || value === '..') return false
  if (/[\\/]/.test(value)) return false
  if (/[?#]/.test(value)) return false
  return true
}

/**
 * 외부 URL과 특수 URL은 그대로 유지하고, 로컬 파일명만 mediaUrl로 변환한다.
 */
export function resolveMediaSrc(src: string, slug: string, mediaUrl?: MediaUrlResolver): string {
  if (!mediaUrl || !slug || !isLocalMediaFilename(src)) return src
  return mediaUrl(slug, src.trim())
}

/**
 * textarea 커서가 Markdown 이미지의 경로 부분 안에 있는 경우에만
 * 해당 이미지의 원본 src/alt를 반환한다.
 */
export function findMarkdownImageAt(markdown: string, offset: number): MarkdownImageTarget | null {
  const imagePattern = /!\[([^\]\r\n]*)\]\((<[^>\r\n]+>|[^)\r\n]+)\)/g

  for (const match of markdown.matchAll(imagePattern)) {
    if (match.index === undefined) continue

    const destination = match[2]
    const destinationOffset = match[0].indexOf(destination)
    if (destinationOffset < 0) continue

    let src = destination.trim()
    let relativeStart = destinationOffset + destination.indexOf(src)

    if (src.startsWith('<') && src.endsWith('>')) {
      src = src.slice(1, -1)
      relativeStart += 1
    }

    const start = match.index + relativeStart
    const end = start + src.length

    if (offset >= start && offset <= end) {
      return {
        src,
        alt: match[1],
      }
    }
  }

  return null
}
