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

// 빈 폼 베이스. 테스트에서 필요한 필드만 덮어쓴다.
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
eq('title은 항상 포함', toFrontmatter(emptyForm({ title: '안녕' })).title, '안녕')

// ── toFrontmatter: categories ──
eq(
  'categories TOP+SUB',
  toFrontmatter(emptyForm({ categoryTop: 'Dev', categorySub: 'Web' })).categories,
  ['Dev', 'Web'],
)

eq('categories TOP만', toFrontmatter(emptyForm({ categoryTop: 'Dev' })).categories, ['Dev'])

check('categories 둘 다 비면 키 생략', toFrontmatter(emptyForm({})).categories === undefined)

check(
  'categories SUB만 있으면 TOP이 없으므로 생략',
  toFrontmatter(emptyForm({ categorySub: 'Web' })).categories === undefined,
)

// ── toFrontmatter: tags 소문자 ──
eq('tags 소문자화', toFrontmatter(emptyForm({ tags: 'Dev, MDChirp' })).tags, ['dev', 'mdchirp'])

check('tags 비면 키 생략', toFrontmatter(emptyForm({})).tags === undefined)

// ── toFrontmatter: 불린 변환 ──

// pin/math/mermaid는 기본 비활성이므로 false일 때 키를 생략한다.
check('pin false면 키 생략', toFrontmatter(emptyForm({ pin: false })).pin === undefined)
check('pin true면 포함', toFrontmatter(emptyForm({ pin: true })).pin === true)

check('math false면 키 생략', toFrontmatter(emptyForm({ math: false })).math === undefined)
check('math true면 포함', toFrontmatter(emptyForm({ math: true })).math === true)

check('mermaid false면 키 생략', toFrontmatter(emptyForm({ mermaid: false })).mermaid === undefined)
check('mermaid true면 포함', toFrontmatter(emptyForm({ mermaid: true })).mermaid === true)

// toc/comments/render_with_liquid는 false도 실제 동작을 결정하므로 항상 명시한다.
eq('toc 체크 해제는 false를 명시', toFrontmatter(emptyForm({ toc: false })).toc, false)

eq('toc 체크는 true를 명시', toFrontmatter(emptyForm({ toc: true })).toc, true)

eq(
  'comments 체크 해제는 false를 명시',
  toFrontmatter(emptyForm({ comments: false })).comments,
  false,
)

eq('comments 체크는 true를 명시', toFrontmatter(emptyForm({ comments: true })).comments, true)

eq(
  'render_with_liquid 체크 해제는 false를 명시',
  toFrontmatter(emptyForm({ renderWithLiquid: false })).render_with_liquid,
  false,
)

eq(
  'render_with_liquid 체크는 true를 명시',
  toFrontmatter(emptyForm({ renderWithLiquid: true })).render_with_liquid,
  true,
)

// 전체 객체 결과를 확인하여 false 필드가 빠지지 않는지 검증한다.
eq(
  '여러 불린 동시',
  toFrontmatter(
    emptyForm({
      pin: true,
      math: true,
      mermaid: true,
      toc: true,
      comments: false,
      renderWithLiquid: false,
    }),
  ),
  {
    title: '',
    pin: true,
    math: true,
    mermaid: true,
    toc: true,
    comments: false,
    render_with_liquid: false,
  },
)

// ── toFrontmatter: image ──
eq('image path+alt', toFrontmatter(emptyForm({ imagePath: '/a.png', imageAlt: '커버' })).image, {
  path: '/a.png',
  alt: '커버',
})

eq('image path만', toFrontmatter(emptyForm({ imagePath: '/a.png' })).image, {
  path: '/a.png',
})

check(
  'image path 없으면 alt 있어도 생략',
  toFrontmatter(emptyForm({ imageAlt: '커버' })).image === undefined,
)

// ── toFrontmatter: author ──
eq('author 1명 → author 단수', toFrontmatter(emptyForm({ author: 'oktoya' })).author, 'oktoya')

check(
  'author 1명이면 authors 복수 키 없음',
  toFrontmatter(emptyForm({ author: 'oktoya' })).authors === undefined,
)

eq('author 여러 명 → authors 복수', toFrontmatter(emptyForm({ author: 'Kim, Lee' })).authors, [
  'Kim',
  'Lee',
])

check(
  'author 여러 명이면 author 단수 키 없음',
  toFrontmatter(emptyForm({ author: 'Kim, Lee' })).author === undefined,
)

check('author 비면 author 키 생략', toFrontmatter(emptyForm({})).author === undefined)

check('author 비면 authors 키 생략', toFrontmatter(emptyForm({})).authors === undefined)

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

// ── toForm: 필드가 없는 글의 기본 표시값 ──
const defaultForm = toForm({ title: '기본값 테스트' })

eq(
  '필드 없는 글은 toc/comments/render_with_liquid를 활성 상태로 표시',
  [defaultForm.toc, defaultForm.comments, defaultForm.renderWithLiquid],
  [true, true, true],
)

eq(
  '필드 없는 글은 pin/math/mermaid를 비활성 상태로 표시',
  [defaultForm.pin, defaultForm.math, defaultForm.mermaid],
  [false, false, false],
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
  image: {
    path: '/c.png',
    alt: '커버',
  },
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

eq(
  'toForm: 불린',
  [f.pin, f.math, f.mermaid, f.toc, f.comments, f.renderWithLiquid],
  [true, false, true, true, false, false],
)

eq('toForm: author 단수+복수 합쳐서 콤마문자열', f.author, 'oktoya, Kim')

// ── 왕복: form → frontmatter → form ──
const round = toForm({
  ...fm,
  ...toFrontmatter(f),
} as ChirpyFrontmatter)

eq('왕복 후 tags 보존', round.tags, 'ts, react')

eq('왕복 후 categories 보존', [round.categoryTop, round.categorySub], ['Dev', 'Web'])

eq(
  '왕복 후 불린 보존',
  [round.pin, round.math, round.mermaid, round.toc, round.comments, round.renderWithLiquid],
  [true, false, true, true, false, false],
)

console.log(`\nfrontmatterForm: ${pass} passed, ${fail} failed`)

if (fail > 0) process.exit(1)
