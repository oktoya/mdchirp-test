// lister.test.ts — selectPosts(검색/필터/정렬) + statusBadge 검증.
// 실행: pnpm --filter @mdchirp/core test
//
// 핵심 불변식:
//   주어진 posts 가 query 로 올바르게 걸러/정렬되어야 한다.
//   필드 매핑 근거: lister/SPEC.md §2-1 (카테고리/태그는 frontmatter 안에 있음).

import type { Post, ListQuery, ChirpyFrontmatter } from '@mdchirp/shared'
import { DEFAULT_LIST_QUERY } from '@mdchirp/shared'
import { selectPosts } from './selectPosts.js'
import { statusBadge, extraBadges } from './statusBadge.js'

let pass = 0
let fail = 0

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

function eqIds(name: string, got: Post[], want: string[]) {
  const gotIds = got.map((p) => p.id)
  check(
    name,
    JSON.stringify(gotIds) === JSON.stringify(want),
    `expected: ${JSON.stringify(want)}\n      got: ${JSON.stringify(gotIds)}`,
  )
}

// ── 픽스처 ─────────────────────────────────────────────────
function fm(over: Partial<ChirpyFrontmatter> = {}): ChirpyFrontmatter {
  return { title: 't', date: '2026-01-01 00:00:00 +0900', ...over }
}
function post(over: Partial<Post> = {}): Post {
  return {
    id: 'x',
    slug: '2026-01-01-x',
    title: 'Hello',
    tiptapJson: {},
    markdown: 'body',
    frontmatter: fm(),
    media: [],
    status: 'draft',
    hasRichSource: true,
    rev: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}
const q = (over: Partial<ListQuery> = {}): ListQuery => ({ ...DEFAULT_LIST_QUERY, ...over })

// ── 검색(text) ─────────────────────────────────────────────
console.log('\n── lister: 검색(text) ──')
eqIds(
  '제목 매칭 (대소문자 무시)',
  selectPosts(
    [post({ id: 'a', title: 'React Guide' }), post({ id: 'b', title: 'Vue' })],
    q({ text: 'react' }),
  ),
  ['a'],
)
eqIds(
  '본문 매칭',
  selectPosts(
    [post({ id: 'a', markdown: 'about typescript' }), post({ id: 'b', markdown: 'plain' })],
    q({ text: 'typescript' }),
  ),
  ['a'],
)
{
  const posts = [
    post({ id: 'a', frontmatter: fm({ tags: ['nas'] }) }),
    post({ id: 'b', frontmatter: fm({ categories: ['dev', undefined] }) }),
    post({ id: 'c' }),
  ]
  eqIds('태그 매칭', selectPosts(posts, q({ text: 'nas' })), ['a'])
  eqIds('카테고리 매칭 (빈 튜플 요소 무시)', selectPosts(posts, q({ text: 'dev' })), ['b'])
}
check(
  '빈 검색어는 전부 통과',
  selectPosts([post({ id: 'a' }), post({ id: 'b' })], q({ text: '   ' })).length === 2,
)

// ── 필터 ───────────────────────────────────────────────────
console.log('\n── lister: 필터 ──')
eqIds(
  'status 필터',
  selectPosts(
    [post({ id: 'a', status: 'draft' }), post({ id: 'b', status: 'published' })],
    q({ status: ['published'] }),
  ),
  ['b'],
)
eqIds(
  'onlyExternal: hasRichSource=false 만',
  selectPosts(
    [post({ id: 'a', hasRichSource: false }), post({ id: 'b', hasRichSource: true })],
    q({ onlyExternal: true }),
  ),
  ['a'],
)
eqIds(
  'category 필터',
  selectPosts(
    [
      post({ id: 'a', frontmatter: fm({ categories: ['tech', undefined] }) }),
      post({ id: 'b', frontmatter: fm({ categories: ['life'] }) }),
    ],
    q({ category: 'tech' }),
  ),
  ['a'],
)
eqIds(
  'tags 필터: 모든 태그 포함(AND)',
  selectPosts(
    [
      post({ id: 'a', frontmatter: fm({ tags: ['x', 'y'] }) }),
      post({ id: 'b', frontmatter: fm({ tags: ['x'] }) }),
    ],
    q({ tags: ['x', 'y'] }),
  ),
  ['a'],
)
eqIds(
  '필터 조합 (status + text)',
  selectPosts(
    [
      post({ id: 'a', status: 'published', title: 'React' }),
      post({ id: 'b', status: 'published', title: 'Vue' }),
      post({ id: 'c', status: 'draft', title: 'React' }),
    ],
    q({ status: ['published'], text: 'react' }),
  ),
  ['a'],
)

// ── 정렬 ───────────────────────────────────────────────────
console.log('\n── lister: 정렬 ──')
eqIds(
  'updatedAt desc (기본)',
  selectPosts(
    [
      post({ id: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
      post({ id: 'new', updatedAt: '2026-02-01T00:00:00Z' }),
    ],
    q(),
  ),
  ['new', 'old'],
)
eqIds(
  'title asc',
  selectPosts(
    [post({ id: 'b', title: 'Banana' }), post({ id: 'a', title: 'Apple' })],
    q({ sort: { by: 'title', dir: 'asc' } }),
  ),
  ['a', 'b'],
)
eqIds(
  'publishedAt desc — 값 없는 글은 맨 뒤',
  selectPosts(
    [
      post({ id: 'draft', status: 'draft', publishedAt: undefined }),
      post({ id: 'p1', publishedAt: '2026-01-01T00:00:00Z' }),
      post({ id: 'p2', publishedAt: '2026-02-01T00:00:00Z' }),
    ],
    q({ sort: { by: 'publishedAt', dir: 'desc' } }),
  ),
  ['p2', 'p1', 'draft'],
)
eqIds(
  'publishedAt asc — 값 없는 글은 asc 에서도 맨 뒤',
  selectPosts(
    [
      post({ id: 'draft', publishedAt: undefined }),
      post({ id: 'p1', publishedAt: '2026-01-01T00:00:00Z' }),
      post({ id: 'p2', publishedAt: '2026-02-01T00:00:00Z' }),
    ],
    q({ sort: { by: 'publishedAt', dir: 'asc' } }),
  ),
  ['p1', 'p2', 'draft'],
)

// ── 배지 ───────────────────────────────────────────────────
console.log('\n── lister: 상태 배지 ──')
check('statusBadge draft → gray', statusBadge(post({ status: 'draft' })).tone === 'gray')
check('statusBadge published → green', statusBadge(post({ status: 'published' })).tone === 'green')
check(
  'statusBadge published + rev>publishedRev → *발행됨',
  statusBadge(post({ status: 'published', rev: 6, publishedRev: 5 })).label === '*발행됨',
)
check(
  'statusBadge published + rev==publishedRev → 발행됨(별표 없음)',
  statusBadge(post({ status: 'published', rev: 5, publishedRev: 5 })).label === '발행됨',
)
{
  const b = statusBadge(
    post({ status: 'scheduled', schedule: { publishAt: '2026-03-01T09:00:00Z' } }),
  )
  check('statusBadge scheduled → purple', b.tone === 'purple')
  check('statusBadge scheduled 라벨에 publishAt 포함', b.label.includes('2026-03-01T09:00:00Z'))
}
check(
  'statusBadge scheduled (schedule 없음) → 기본 라벨',
  statusBadge(post({ status: 'scheduled' })).label === '예약',
)
check(
  'extraBadges external 표식',
  JSON.stringify(extraBadges(post({ hasRichSource: false })).map((b) => b.key)) ===
    JSON.stringify(['external']),
)
check('extraBadges 일반 글 → 없음', extraBadges(post({ hasRichSource: true })).length === 0)

console.log(`\n결과: ${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
