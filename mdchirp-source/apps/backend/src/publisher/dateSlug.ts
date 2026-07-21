// dateSlug.ts — 발행 날짜/파일명 정규화 (순수 함수, 부수효과 없음).
//
// 왜 분리했나 (MANUAL B-2): 발행이 "push는 되는데 블로그에 안 뜨는" 근본 원인이
// 여기 계산이었다(Jekyll 인식 조건). 발행 빌더는 fs 를 만지는 무거운 코드라,
// 위험한 날짜/파일명 계산만 순수 함수로 떼어 단독 테스트한다.
//
// Jekyll(Chirpy)이 포스트로 인식하는 두 조건:
//   1. 파일명 = _posts/YYYY-MM-DD-<slug>.md  (날짜 접두사 필수)
//   2. date  = "YYYY-MM-DD HH:MM:SS +0900"    (오프셋 형식, UTC 문자열/미래시각 지양)
//
// 오프셋은 인자로 받는다(순수 유지). 호출부가 fixed(settings) / device(발행요청)에서
// 골라 넘긴다. 이번 단계 호출부는 KST(+0900) 고정. (fixed/device 선택은 청크3에서 배선)
//
// SPEC: apps/backend/SPEC.md §6, packages/shared/src/types.ts(ChirpyFrontmatter.date)

import { slugify } from '@mdchirp/shared'

// 이미 "…±HHMM" 오프셋으로 끝나는 date 인가 (사용자가 명시한 값 → 존중)
const HAS_OFFSET = /[+-]\d{4}\s*$/
// slug 가 이미 날짜 접두사를 가졌는가 (SPEC §4: 2026-06-19-hello)
const HAS_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/
// 오프셋 형식 검증 (+0900 / -0530 …)
const OFFSET_FORMAT = /^[+-]\d{4}$/

const DEFAULT_OFFSET = '+0900'

/** "+0900" → 분 단위(+540). 형식 안 맞으면 null. */
function offsetToMinutes(offset: string): number | null {
  if (!OFFSET_FORMAT.test(offset)) return null
  const sign = offset[0] === '-' ? -1 : 1
  const hh = Number(offset.slice(1, 3))
  const mm = Number(offset.slice(3, 5))
  return sign * (hh * 60 + mm)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 주어진 순간(date)을 offset 기준 "벽시계"로 본 "YYYY-MM-DD HH:MM:SS ±HHMM" 문자열.
 * 시스템 로케일과 무관하게 결정적으로 계산(UTC ms 에 오프셋 분을 더해 UTC getter 로 추출).
 */
function formatWithOffset(date: Date, offset: string): string {
  const off = OFFSET_FORMAT.test(offset) ? offset : DEFAULT_OFFSET
  const mins = offsetToMinutes(off) ?? 540
  const shifted = new Date(date.getTime() + mins * 60_000)
  const Y = shifted.getUTCFullYear()
  const M = pad2(shifted.getUTCMonth() + 1)
  const D = pad2(shifted.getUTCDate())
  const h = pad2(shifted.getUTCHours())
  const m = pad2(shifted.getUTCMinutes())
  const s = pad2(shifted.getUTCSeconds())
  return `${Y}-${M}-${D} ${h}:${m}:${s} ${off}`
}

/**
 * 발행에 쓸 date 를 확정한다. (미래 클램프는 하지 않음 — 방향1: 프론트 팝업이 처리)
 *
 *  - rawDate 가 이미 오프셋 포함 형식(…±HHMM)이면  → 그대로 존중(사용자 값 보존).
 *  - rawDate 가 비었으면                          → now 를 offset 기준으로 채움.
 *  - rawDate 가 오프셋 없음/UTC 등이면            → 파싱 시도 → offset 으로 재직렬화.
 *                                                   파싱 실패 시 now 로 폴백(깨진 date 방지).
 */
export function normalizePublishDate(
  rawDate: string | undefined | null,
  now: Date,
  offset: string = DEFAULT_OFFSET,
): string {
  const raw = (rawDate ?? '').trim()

  if (raw && HAS_OFFSET.test(raw)) return raw // 사용자가 명시한 오프셋 값은 손대지 않음

  if (!raw) return formatWithOffset(now, offset) // 빈 값 → 발행 시점

  // 오프셋 없음/UTC 문자열 등 → 파싱 재직렬화
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return formatWithOffset(now, offset) // 파싱 실패 → now 폴백
  return formatWithOffset(parsed, offset)
}

/**
 * _posts 파일 stem(확장자 제외)을 만든다. Jekyll 인식용 날짜 접두사 보장.
 *
 *  - slug 가 이미 "YYYY-MM-DD-…" 면            → slug 그대로.
 *  - 아니면                                     → dateStr 의 날짜부분(YYYY-MM-DD) + "-" + slug.
 *
 * dateStr 은 normalizePublishDate 결과("YYYY-MM-DD …")를 가정. 앞 10글자가 날짜부분.
 */
export function resolveFilename(slug: string, dateStr: string): string {
  // 방어선: 프론트를 우회한 요청/예전 데이터로 공백·대문자·한글이 slug 에 남아 있어도
  // 파일명이 항상 안전하도록 slugify 한다(프론트 onBlur 정규화의 이중 안전망).
  if (HAS_DATE_PREFIX.test(slug)) {
    // 이미 "YYYY-MM-DD-" 접두사가 붙은 slug: 날짜 부분은 보존, 뒤쪽만 정규화.
    const prefix = slug.slice(0, 11) // "YYYY-MM-DD-"
    const rest = slug.slice(11)
    return `${prefix}${slugify(rest)}`
  }
  const datePart = dateStr.slice(0, 10) // "YYYY-MM-DD"
  return `${datePart}-${slugify(slug)}`
}

const INVALID_POST_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/

/**
 * 저장된 githubPath를 repo 기준의 안전한 `_posts/<파일>.md` 경로로 정규화한다.
 *
 * 레거시 Windows 경로의 `\`는 `/`로 바꾼다. 한글 파일명은 허용하지만,
 * 절대경로·경로 탈출·하위 디렉터리·Windows에서 사용할 수 없는 문자는 거부한다.
 */
export function normalizeGithubPostPath(githubPath: string | undefined | null): string | null {
  const normalized = (githubPath ?? '').trim().replace(/\\/g, '/')
  const parts = normalized.split('/')

  if (parts.length !== 2 || parts[0] !== '_posts') return null

  const filename = parts[1]
  if (!filename || filename !== filename.trim() || !filename.endsWith('.md')) return null

  const basename = filename.slice(0, -3)
  if (!basename || basename === '.' || basename === '..' || basename.endsWith('.')) return null
  if (INVALID_POST_FILENAME_CHARS.test(filename)) return null

  return `_posts/${filename}`
}

/**
 * 기존 발행 경로가 안전하면 파일명을 그대로 재사용한다.
 * 경로가 없거나 안전하지 않을 때만 slug/date 기반 기본 규칙으로 계산한다.
 */
export function resolvePostMarkdownPath(
  slug: string,
  dateStr: string,
  githubPath?: string,
): string {
  return normalizeGithubPostPath(githubPath) ?? `_posts/${resolveFilename(slug, dateStr)}.md`
}
