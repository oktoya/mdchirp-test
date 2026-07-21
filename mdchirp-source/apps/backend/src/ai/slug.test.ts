// slug.test.ts — normalizeSlug 순수함수 검증.
// 실행: tsx apps/backend/src/ai/slug.test.ts
import { normalizeSlug } from './gemini.js'

let pass = 0
let fail = 0
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) {
    pass++
    console.log(`  ok  ${name}`)
  } else {
    fail++
    console.error(`FAIL  ${name}\n      got:  ${g}\n      want: ${w}`)
  }
}

check('영문 그대로', normalizeSlug('hello-world'), 'hello-world')
check('대문자 → 소문자', normalizeSlug('Hello-World'), 'hello-world')
check('공백 → 하이픈', normalizeSlug('hello world'), 'hello-world')
check('언더스코어 → 하이픈', normalizeSlug('hello_world'), 'hello-world')
check('특수문자 제거', normalizeSlug('hello@world!'), 'helloworld')
check('연속 하이픈 축약', normalizeSlug('a---b'), 'a-b')
check('양끝 하이픈 제거', normalizeSlug('-hello-'), 'hello')
check('한글 제거', normalizeSlug('안녕 hello'), 'hello')
check('빈 문자열', normalizeSlug(''), '')
check('숫자 유지', normalizeSlug('post 2026'), 'post-2026')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
