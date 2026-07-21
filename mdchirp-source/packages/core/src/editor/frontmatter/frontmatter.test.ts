// frontmatter.test.ts — frontmatterForm 순수 변환 단위 테스트.
// 실행: tsx (이 프로젝트 관례). 실패 시 process.exit(1).

import type { ChirpyFrontmatter } from '@mdchirp/shared'
import {
  parseCsv,
  joinCsv,
  toForm,
  toFrontmatter,
  dateToLocalInput,
  localInputToDate,
  type FrontmatterForm,
} from './frontmatterForm.js'

let pass = 0
let fail = 0
function check(name: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}`)
  }
}
function eq(name: string, a: unknown, b: unknown) {
  check(name, JSON.stringify(a) === JSON.stringify(b))
}

// 빈 폼 베이스 (테스트에서 일부만 덮어씀)
function emptyForm(over: Partial<FrontmatterForm> = {}): FrontmatterForm {
  return {
    title: '',
    date: '',
    categoryTop: '',
    categorySub: '',
    tags: '',
    description: '',
    author: '',
    imagePath: '',
    imageAlt: '',
    pin: false,
    math: false,
    mermaid: false,
    toc: false,
    comments: false,
    renderWithLiquid: false,
    ...over,
  }
}

console.log('frontmatterForm:')

// ── parseCsv ──
eq('parseCsv: 공백/빈항목 제거', parseCsv('a, b ,  c ,'), ['a', 'b', 'c'])
eq('parseCsv: lower=true 소문자화', parseCsv('Dev, MDChirp', true), ['dev', 'mdchirp'])
eq('parseCsv: 빈 문자열 → []', parseCsv(''), [])
eq('parseCsv: undefined 안전', parseCsv(undefined as unknown as string), [])

// ── joinCsv ──
eq('joinCsv: 배열 → 콤마문자열', joinCsv(['a', 'b']), 'a, b')
eq('joinCsv: undefined → 빈문자열', joinCsv(undefined), '')

// ── toFrontmatter: title 필수 ──
eq('title 은 항상 포함', toFrontmatter(emptyForm({ title: '안녕' })).title, '안녕')

// ── toFrontmatter: categories ──
eq(
  'categories TOP+SUB',
  toFrontmatter(emptyForm({ categoryTop: 'Dev', categorySub: 'Web' })).categories,
  ['Dev', 'Web'],
)
eq('categories TOP 만', toFrontmatter(emptyForm({ categoryTop: 'Dev' })).categories, ['Dev'])
check('categories 둘 다 비면 키 생략', toFrontmatter(emptyForm({})).categories === undefined)
check(
  'categories SUB 만 있으면(TOP 없음) 생략',
  toFrontmatter(emptyForm({ categorySub: 'Web' })).categories === undefined,
)

// ── toFrontmatter: tags 소문자 ──
eq('tags 소문자화', toFrontmatter(emptyForm({ tags: 'Dev, MDChirp' })).tags, ['dev', 'mdchirp'])
check('tags 비면 키 생략', toFrontmatter(emptyForm({})).tags === undefined)

// ── toFrontmatter: 불린은 true 일 때만 ──
check('math false 면 키 생략', toFrontmatter(emptyForm({})).math === undefined)
check('math true 면 포함', toFrontmatter(emptyForm({ math: true })).math === true)
eq('여러 불린 동시', toFrontmatter(emptyForm({ pin: true, toc: true, mermaid: true })), {
  title: '',
  pin: true,
  mermaid: true,
  toc: true,
})

// ── toFrontmatter: image ──
eq('image path+alt', toFrontmatter(emptyForm({ imagePath: '/a.png', imageAlt: '커버' })).image, {
  path: '/a.png',
  alt: '커버',
})
eq('image path 만', toFrontmatter(emptyForm({ imagePath: '/a.png' })).image, { path: '/a.png' })
check(
  'image path 없으면 alt 있어도 생략',
  toFrontmatter(emptyForm({ imageAlt: '커버' })).image === undefined,
)

// ── toFrontmatter: author (단일 필드 → 1명이면 author, 여럿이면 authors) ──
eq('author 1명 → author(단수)', toFrontmatter(emptyForm({ author: 'oktoya' })).author, 'oktoya')
check(
  'author 1명이면 authors(복수) 키 없음',
  toFrontmatter(emptyForm({ author: 'oktoya' })).authors === undefined,
)
eq('author 여럿(콤마) → authors(복수)', toFrontmatter(emptyForm({ author: 'Kim, Lee' })).authors, [
  'Kim',
  'Lee',
])
check(
  'author 여럿이면 author(단수) 키 없음',
  toFrontmatter(emptyForm({ author: 'Kim, Lee' })).author === undefined,
)
check('author 비면 둘 다 키 생략', toFrontmatter(emptyForm({})).author === undefined)

// ── date 변환 ──
eq(
  'dateToLocalInput: +0900 → datetime-local',
  dateToLocalInput('2026-07-02 01:09:07 +0900'),
  '2026-07-02T01:09',
)
eq('dateToLocalInput: 빈값 → ""', dateToLocalInput(''), '')
eq('dateToLocalInput: undefined → ""', dateToLocalInput(undefined), '')
eq('dateToLocalInput: 쓰레기 → ""', dateToLocalInput('nope'), '')
eq(
  'localInputToDate: datetime-local → "YYYY-MM-DD HH:MM:00"',
  localInputToDate('2026-07-02T01:09'),
  '2026-07-02 01:09:00',
)
eq('localInputToDate: 빈값 → ""', localInputToDate(''), '')
check('toFrontmatter: date 비면 키 생략', toFrontmatter(emptyForm({})).date === undefined)
eq(
  'toFrontmatter: date 값 있으면 초 00',
  toFrontmatter(emptyForm({ date: '2026-08-15T14:30' })).date,
  '2026-08-15 14:30:00',
)
eq(
  'toForm: date +0900 → datetime-local',
  toForm({ title: 't', date: '2026-08-15 14:30:00 +0900' }).date,
  '2026-08-15T14:30',
)

// ── toForm: 역방향 ──
const fm: ChirpyFrontmatter = {
  title: '제목',
  date: '2026-06-27 10:00:00 +0900',
  categories: ['Dev', 'Web'],
  tags: ['ts', 'react'],
  description: '설명',
  author: 'oktoya',
  authors: ['Kim'],
  image: { path: '/c.png', alt: '커버' },
  pin: true,
  math: false,
  mermaid: true,
  toc: true,
  comments: false,
  render_with_liquid: false,
}
const f = toForm(fm)
eq('toForm: title', f.title, '제목')
eq('toForm: categoryTop/Sub', [f.categoryTop, f.categorySub], ['Dev', 'Web'])
eq('toForm: tags 콤마문자열', f.tags, 'ts, react')
eq('toForm: image', [f.imagePath, f.imageAlt], ['/c.png', '커버'])
eq('toForm: 불린', [f.pin, f.mermaid, f.toc, f.math], [true, true, true, false])
eq('toForm: author 단수+복수 합쳐서 콤마문자열', f.author, 'oktoya, Kim')

// ── 왕복: form → frontmatter → form (값 보존) ──
const round = toForm({ ...fm, ...toFrontmatter(f) } as ChirpyFrontmatter)
eq('왕복 후 tags 보존', round.tags, 'ts, react')
eq('왕복 후 categories 보존', [round.categoryTop, round.categorySub], ['Dev', 'Web'])

console.log(`\nfrontmatterForm: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
