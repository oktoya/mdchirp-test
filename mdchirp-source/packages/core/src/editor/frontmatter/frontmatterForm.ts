// frontmatterForm.ts — 프론트매터 패널의 순수 변환 로직 (UI 없음).
//
// 폼 입력(문자열/불린) ↔ ChirpyFrontmatter 사이를 변환한다.
// 위험한 건 UI 가 아니라 이 변환(tags 소문자화/콤마 파싱, categories ≤2,
// authors 파싱, 빈값 처리)이라 B-2 패턴대로 먼저 떼어 테스트한다.
//
// SPEC: packages/core/src/editor/SPEC.md §11

import type { ChirpyFrontmatter, ChirpyImage } from '@mdchirp/shared'

// ───────────────────────────────────────────────────────────
// 폼 상태 — 모든 입력을 "화면에 그대로 보이는 문자열/불린"으로 들고 있는다.
// (배열/튜플은 입력 중간 상태를 표현하기 어려워 문자열로 보관 → 변환은 toFrontmatter)
// ───────────────────────────────────────────────────────────

export interface FrontmatterForm {
  title: string
  date: string // datetime-local 값("YYYY-MM-DDTHH:mm"). 비면 "" = 자동(발행 시점)
  categoryTop: string // categories[0]
  categorySub: string // categories[1]
  tags: string // "a, b, c" (콤마 구분)
  description: string
  author: string // "x" 한 명 또는 "x, y" 콤마 구분 여러 명
  imagePath: string
  imageAlt: string
  pin: boolean
  math: boolean
  mermaid: boolean
  toc: boolean
  comments: boolean
  renderWithLiquid: boolean
}

// ───────────────────────────────────────────────────────────
// 콤마 구분 문자열 ↔ 배열
// ───────────────────────────────────────────────────────────

/** "a, b ,c" → ["a","b","c"] (공백제거, 빈 항목 제거). lower=true 면 소문자화. */
export function parseCsv(raw: string, lower = false): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (lower ? s.toLowerCase() : s))
}

/** ["a","b"] → "a, b" */
export function joinCsv(list: string[] | undefined): string {
  return (list ?? []).join(', ')
}

// ───────────────────────────────────────────────────────────
// ChirpyFrontmatter → FrontmatterForm (패널 열 때)
// ───────────────────────────────────────────────────────────

export function toForm(fm: ChirpyFrontmatter): FrontmatterForm {
  const cats = fm.categories ?? []

  return {
    title: fm.title ?? '',
    date: dateToLocalInput(fm.date),
    categoryTop: cats[0] ?? '',
    categorySub: cats[1] ?? '',
    tags: joinCsv(fm.tags),
    description: fm.description ?? '',

    // 기존 글 호환: 단수 author와 복수 authors를 하나의 콤마 문자열로 합친다.
    author: joinCsv([...(fm.author ? [fm.author] : []), ...(fm.authors ?? [])]),

    imagePath: fm.image?.path ?? '',
    imageAlt: fm.image?.alt ?? '',

    // 기본 비활성 기능
    pin: fm.pin ?? false,
    math: fm.math ?? false,
    mermaid: fm.mermaid ?? false,

    // Chirpy/Jekyll에서 필드 생략 시 기본 활성 또는 전역 설정을 상속하는 기능.
    // 패널 상태가 실제 렌더링 동작과 일치하도록 생략된 값은 true로 표시한다.
    toc: fm.toc ?? true,
    comments: fm.comments ?? true,
    renderWithLiquid: fm.render_with_liquid ?? true,
  }
}

// ───────────────────────────────────────────────────────────
// FrontmatterForm → Partial<ChirpyFrontmatter> (저장/패치용)
//
// 규칙:
//   - 빈 문자열/빈 배열인 선택 필드는 키를 넣지 않는다.
//   - pin/math/mermaid는 true일 때만 키를 넣는다.
//   - toc/comments/render_with_liquid는 false도 의미가 있으므로 항상 boolean을 넣는다.
//   - tags는 항상 소문자. categories는 최대 2개(튜플).
//   - title은 항상 포함한다.
//   - media_subpath는 여기서 건드리지 않는다.
// ───────────────────────────────────────────────────────────

export function toFrontmatter(form: FrontmatterForm): Partial<ChirpyFrontmatter> {
  const out: Partial<ChirpyFrontmatter> = {}

  out.title = form.title ?? ''

  // date: 비면 키 생략(자동 = 발행 시점). 값 있으면 "YYYY-MM-DD HH:MM:00"(오프셋은 발행 빌더).
  const date = localInputToDate(form.date)
  if (date) out.date = date

  // categories: TOP/SUB → 빈 칸은 제외. 둘 다 비면 키 자체 생략.
  const top = form.categoryTop.trim()
  const sub = form.categorySub.trim()
  if (top && sub) out.categories = [top, sub]
  else if (top) out.categories = [top]

  const tags = parseCsv(form.tags, true)
  if (tags.length > 0) out.tags = tags

  const desc = form.description.trim()
  if (desc) out.description = desc

  // author: 콤마 구분. 1명이면 author(단수), 2명 이상이면 authors(복수)로 출력.
  const authorList = parseCsv(form.author)
  if (authorList.length === 1) out.author = authorList[0]
  else if (authorList.length > 1) out.authors = authorList

  const img = toImage(form)
  if (img) out.image = img

  // 기본 비활성 기능은 체크됐을 때만 true를 기록한다.
  if (form.pin) out.pin = true
  if (form.math) out.math = true
  if (form.mermaid) out.mermaid = true

  // 기본 활성 또는 전역 설정 상속 기능은 false도 명시해야
  // 체크 해제가 실제 사이트에 반영된다.
  out.toc = form.toc
  out.comments = form.comments
  out.render_with_liquid = form.renderWithLiquid

  return out
}

/** image.path 가 있을 때만 image 객체 생성(alt 는 있으면 추가). path 없으면 undefined. */
function toImage(form: FrontmatterForm): ChirpyImage | undefined {
  const path = form.imagePath.trim()
  if (!path) return undefined
  const alt = form.imageAlt.trim()
  return alt ? { path, alt } : { path }
}

// ───────────────────────────────────────────────────────────
// date 변환 — frontmatter.date("YYYY-MM-DD HH:MM:SS +0900") ↔ datetime-local("YYYY-MM-DDTHH:mm")
//
// 규칙:
//   - 폼은 datetime-local(분 단위, 초/오프셋 없음)로 다룬다. 초는 버린다(사용자 결정).
//   - 폼→frontmatter 는 "YYYY-MM-DD HH:MM:00" 까지만(오프셋은 발행 빌더가 부착 — 청크1).
//   - 비면 "" ⇄ 키 생략(자동 = 발행 시점).
// ───────────────────────────────────────────────────────────

const DATE_HEAD = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/

/** frontmatter.date → datetime-local 값. 파싱 안 되면 "". */
export function dateToLocalInput(raw: string | undefined): string {
  const m = DATE_HEAD.exec(String(raw ?? '').trim())
  if (!m) return ''
  const [, Y, Mo, D, h, mi] = m
  return `${Y}-${Mo}-${D}T${h}:${mi}`
}

/** datetime-local 값 → frontmatter.date("YYYY-MM-DD HH:MM:00"). 비거나 형식 안 맞으면 "". */
export function localInputToDate(local: string): string {
  const m = DATE_HEAD.exec(String(local ?? '').trim())
  if (!m) return ''
  const [, Y, Mo, D, h, mi] = m
  return `${Y}-${Mo}-${D} ${h}:${mi}:00`
}
