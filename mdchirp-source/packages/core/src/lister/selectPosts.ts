import type { Post, ListQuery } from '@mdchirp/shared'

// ───────────────────────────────────────────────────────────
// selectPosts — 주어진 posts 를 query(검색/필터/정렬)로 가공하는 순수함수.
// lister 는 직접 fetch 하지 않는다(SPEC §2). 이 함수가 모듈의 핵심 로직.
// 필드 매핑 근거: lister/SPEC.md §2-1 (카테고리/태그는 frontmatter 안에 있음).
// ───────────────────────────────────────────────────────────

/** categories 는 [string?, string?] 튜플 → 빈 요소 제거 후 string[] 로 정규화 */
function categoriesOf(post: Post): string[] {
  return (post.frontmatter.categories ?? []).filter(
    (c): c is string => typeof c === 'string' && c.length > 0,
  )
}

function tagsOf(post: Post): string[] {
  return post.frontmatter.tags ?? []
}

/** 검색(text) 매칭 — 제목+본문+태그+카테고리를 대소문자 무시 includes */
function matchesText(post: Post, text: string): boolean {
  const needle = text.trim().toLowerCase()
  if (needle === '') return true
  const haystack = [post.title, post.markdown, ...tagsOf(post), ...categoriesOf(post)]
    .join('\n')
    .toLowerCase()
  return haystack.includes(needle)
}

function matchesFilters(post: Post, query: ListQuery): boolean {
  // status 필터: 지정되면 그 안에 포함되어야
  if (query.status && query.status.length > 0 && !query.status.includes(post.status)) {
    return false
  }
  // onlyExternal: 리치 원본 없는(외부 유입) 글만
  if (query.onlyExternal && post.hasRichSource !== false) {
    return false
  }
  // category: 해당 카테고리를 가진 글만
  if (query.category && !categoriesOf(post).includes(query.category)) {
    return false
  }
  // tags: 지정 태그를 모두 가진 글만 (AND)
  if (query.tags && query.tags.length > 0) {
    const postTags = tagsOf(post)
    if (!query.tags.every((t) => postTags.includes(t))) return false
  }
  return true
}

/**
 * 정렬 비교값 추출.
 * publishedAt 정렬 시 값이 없는 글(draft/synced 등)은 항상 맨 뒤로 (SPEC §2-1).
 */
function compare(a: Post, b: Post, by: ListQuery['sort']['by']): number {
  if (by === 'title') {
    return a.title.localeCompare(b.title)
  }
  if (by === 'publishedAt') {
    // 없는 값은 맨 뒤. dir 적용 전에 "뒤로 보내기"를 우선 처리하기 위해
    // 빈 값끼리는 동률(0), 한쪽만 비면 비어있는 쪽이 항상 뒤.
    const av = a.publishedAt
    const bv = b.publishedAt
    if (!av && !bv) return 0
    if (!av) return 1 // a 가 뒤
    if (!bv) return -1 // b 가 뒤
    return av.localeCompare(bv)
  }
  // updatedAt (필수 필드)
  return a.updatedAt.localeCompare(b.updatedAt)
}

export function selectPosts(posts: Post[], query: ListQuery): Post[] {
  const filtered = posts.filter((p) => matchesText(p, query.text ?? '') && matchesFilters(p, query))

  const { by, dir } = query.sort
  const sorted = [...filtered].sort((a, b) => compare(a, b, by))

  // publishedAt 의 "빈 값은 맨 뒤" 규칙은 dir 과 무관하게 유지해야 한다.
  // → asc/desc 는 값이 있는 항목들 사이에서만 뒤집고, 빈 값은 항상 끝에 남긴다.
  if (by === 'publishedAt') {
    const withDate = sorted.filter((p) => p.publishedAt)
    const without = sorted.filter((p) => !p.publishedAt)
    const ordered = dir === 'desc' ? withDate.reverse() : withDate
    return [...ordered, ...without]
  }

  return dir === 'desc' ? sorted.reverse() : sorted
}
