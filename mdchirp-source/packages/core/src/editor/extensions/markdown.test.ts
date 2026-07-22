// markdown.test.ts — 변환 round-trip 검증.
// 실행: pnpm --filter @mdchirp/core test
//
// 핵심 불변식:
//   MD → JSON → MD 가 (정규화 후) 동일해야 한다. 글 손상 방지.

import { jsonToMarkdown, markdownToJson } from './markdown.js'

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

function norm(s: string): string {
  return s.replace(/\n+$/, '').trim()
}

// MD → JSON → MD round-trip
function roundtrip(name: string, input: string, expected?: string) {
  const json = markdownToJson(input)
  const out = jsonToMarkdown(json)
  const want = norm(expected ?? input)
  const got = norm(out)
  check(name, got === want, `expected:\n${JSON.stringify(want)}\ngot:\n${JSON.stringify(got)}`)
}

console.log('\n── markdown 변환 round-trip ──')

roundtrip('문단', 'Hello world.')
roundtrip('제목 h1', '# Title')
roundtrip('제목 h3', '### Sub heading')
roundtrip('굵게', 'This is **bold** text.')
roundtrip('기울임', 'This is *italic* text.')
roundtrip('취소선', 'This is ~~struck~~ text.')
roundtrip('인라인코드', 'Use `npm install` here.')
roundtrip('링크', '[mdchirp](https://example.com)')
roundtrip('인용', '> a quote line')
roundtrip('순서없는목록', '- one\n- two\n- three')
roundtrip('순서있는목록', '1. first\n2. second')
roundtrip('체크리스트', '- [ ] todo\n- [x] done')
roundtrip('수평선', '---')
roundtrip('이미지', '![alt text](/assets/img/x.png)')
roundtrip('코드블록(언어)', '```ts\nconst x: number = 1\nconsole.log(x)\n```')
roundtrip(
  '복합 문서',
  [
    '# 안드로이드 개발기',
    '',
    '오늘은 **TipTap** 으로 에디터를 만들었다.',
    '',
    '## 핵심',
    '',
    '- 로컬 우선',
    '- `NAS` 가 단일 진실원',
    '',
    '> 손으로 마크다운을 치지 말자.',
    '',
    '```js',
    'const a = 1',
    '```',
  ].join('\n'),
)

// 중첩 마크
roundtrip('굵게+링크', '[**bold link**](https://x.com)')

// ── 새 마크: 밑줄 / 하이라이트 / 글자색 ──
console.log('\n── 새 마크: 밑줄/하이라이트/글자색 ──')
roundtrip('하이라이트(==)', 'This is ==highlighted== text.')
roundtrip('밑줄(<u>)', 'This is <u>underlined</u> text.')
roundtrip('글자색(span)', 'This is <span style="color:#e11d48">red</span> text.')
roundtrip('하이라이트 색상(mark)', 'A <mark style="background-color:#fde68a">yellow</mark> bg.')
roundtrip('밑줄+굵게', 'a <u>**bold under**</u> b')
idempotent('하이라이트', 'This is ==highlighted== text.')
idempotent('밑줄', 'a <u>under</u> b')
idempotent('글자색', 'a <span style="color:#333">c</span> b')

// ── 양방향 편집 안전성 (MD 칸을 직접 편집할 때 생기는 "입력 중" 상태) ──
// 이 케이스들은 깨지지 않는다 = 손상되지 않는다 가 핵심. 모양이 살짝 정규화돼도 OK.
console.log('\n── 양방향 편집: 입력 중 상태 안전성 ──')

// 빈 문서 / 빈 줄만
roundtrip('빈 문서', '', '')
roundtrip('공백만', '   ', '')

// 코드블록을 여는 중 (닫는 ``` 아직 없음) — markdown-it은 끝까지 코드로 본다
{
  const input = '```js\nconst x = 1'
  const out = jsonToMarkdown(markdownToJson(input))
  // 손상 없이 코드 내용이 보존되는지(언어+본문)
  check(
    '미완성 코드블록 보존',
    out.includes('const x = 1') && out.includes('```'),
    `got:\n${JSON.stringify(out)}`,
  )
}

// 별표 하나만 (강조 여는 중) — 깨지지 않고 텍스트로 살아남아야
{
  const out = jsonToMarkdown(markdownToJson('hello *world'))
  check(
    '미완성 강조 비손상',
    out.includes('hello') && out.includes('world'),
    `got:\n${JSON.stringify(out)}`,
  )
}

// 안정성: 한 번 더 돌려도 변하지 않아야 (idempotent) — 양방향 핑퐁 시 발산 방지
function idempotent(name: string, input: string) {
  const once = jsonToMarkdown(markdownToJson(input))
  const twice = jsonToMarkdown(markdownToJson(once))
  check(
    name + ' (idempotent)',
    norm(once) === norm(twice),
    `once:\n${JSON.stringify(norm(once))}\ntwice:\n${JSON.stringify(norm(twice))}`,
  )
}
idempotent(
  '복합문서',
  ['# 제목', '', '본문 **굵게**.', '', '- a', '- b', '', '```ts', 'const x=1', '```'].join('\n'),
)
idempotent('체크리스트', '- [ ] todo\n- [x] done')
idempotent('중첩 강조', '[**bold link**](https://x.com)')

// ── 기존 이미지 상세 편집 지속성 ──
console.log('\n── 기존 이미지 상세 편집 지속성 ──')

roundtrip(
  '이미지 alt와 크기 왕복',
  '![수정한 이미지 설명](photo.webp){: width="700" height="394" }',
)

{
  const markdown = '![수정한 이미지 설명](photo.webp){: width="700" height="394" }'
  const firstJson = markdownToJson(markdown)
  const savedMarkdown = jsonToMarkdown(firstJson)
  const reopenedJson = markdownToJson(savedMarkdown)
  const reopenedImage = reopenedJson.content?.[0]

  check(
    '저장 후 다시 열어도 이미지 속성 유지',
    reopenedImage?.type === 'image' &&
      reopenedImage.attrs?.src === 'photo.webp' &&
      reopenedImage.attrs?.alt === '수정한 이미지 설명' &&
      reopenedImage.attrs?.width === 700 &&
      reopenedImage.attrs?.height === 394,
    `got:\n${JSON.stringify(reopenedImage)}`,
  )
}

{
  const restoredMarkdown = jsonToMarkdown({
    type: 'doc',
    content: [
      {
        type: 'image',
        attrs: {
          src: 'photo.webp',
          alt: '원본 크기 이미지',
          width: null,
          height: null,
        },
      },
    ],
  })
  const reopenedJson = markdownToJson(restoredMarkdown)
  const reopenedImage = reopenedJson.content?.[0]

  check(
    '원본 크기 복원 후 Markdown 크기 속성 제거',
    !restoredMarkdown.includes('{:') &&
      reopenedImage?.type === 'image' &&
      reopenedImage.attrs?.src === 'photo.webp' &&
      reopenedImage.attrs?.alt === '원본 크기 이미지' &&
      reopenedImage.attrs?.width === undefined &&
      reopenedImage.attrs?.height === undefined,
    `markdown:\n${JSON.stringify(restoredMarkdown)}\njson:\n${JSON.stringify(reopenedImage)}`,
  )
}

console.log(`\n결과: ${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
