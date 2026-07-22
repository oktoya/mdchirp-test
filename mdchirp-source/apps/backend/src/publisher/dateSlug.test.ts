// dateSlug 순수 함수 단위 테스트 — 발행 날짜/파일명 정규화.
// 실행: pnpm --filter @mdchirp/backend test
import assert from 'node:assert'
import {
  normalizeGithubPostPath,
  normalizePublishDate,
  resolveFilename,
  resolvePostMarkdownPath,
} from './dateSlug.js'

let pass = 0
const ok = (name: string) => {
  console.log(`  ✓ ${name}`)
  pass++
}

console.log('mdchirp dateSlug test')

// 고정 기준 시각(UTC): 2026-07-01 00:15:28 UTC = KST 09:15:28
const NOW = new Date('2026-07-01T00:15:28Z')

// ── normalizePublishDate ──

// 1. 오프셋 포함 값은 그대로 존중 (사용자가 명시한 값 보존)
{
  const v = '2026-06-19 08:00:00 +0900'
  assert(normalizePublishDate(v, NOW, '+0900') === v, 'offset value respected as-is')
  ok('오프셋 포함 date 는 그대로 존중')
}

// 2. 다른 오프셋 값도 그대로 존중 (재직렬화 안 함)
{
  const v = '2026-06-19 08:00:00 -0500'
  assert(normalizePublishDate(v, NOW, '+0900') === v, 'foreign offset preserved')
  ok('다른 오프셋 값도 재직렬화 없이 보존')
}

// 3. 빈 값 → now 를 +0900 벽시계로
{
  const v = normalizePublishDate('', NOW, '+0900')
  assert(v === '2026-07-01 09:15:28 +0900', `empty → now KST, got: ${v}`)
  ok('빈 date → 발행시점(now) KST 로 채움')
}

// 4. undefined / null 안전
{
  assert(normalizePublishDate(undefined, NOW, '+0900') === '2026-07-01 09:15:28 +0900', 'undefined')
  assert(normalizePublishDate(null, NOW, '+0900') === '2026-07-01 09:15:28 +0900', 'null')
  ok('undefined/null 도 now KST 로 채움')
}

// 5. UTC 문자열 → +0900 재직렬화 (핵심 버그 케이스)
{
  const v = normalizePublishDate('2026-07-01 00:15:28 UTC', NOW, '+0900')
  assert(v === '2026-07-01 09:15:28 +0900', `UTC string → KST, got: ${v}`)
  ok('UTC 문자열 → +0900 재직렬화 (실운영 버그 케이스)')
}

// 6. ISO(Z) → +0900 재직렬화
{
  const v = normalizePublishDate('2026-07-01T00:15:28Z', NOW, '+0900')
  assert(v === '2026-07-01 09:15:28 +0900', `ISO Z → KST, got: ${v}`)
  ok('ISO(Z) → +0900 재직렬화')
}

// 7. 파싱 불가한 쓰레기 값 → now 폴백 (깨진 date 로 발행 보류 방지)
{
  const v = normalizePublishDate('not-a-date', NOW, '+0900')
  assert(v === '2026-07-01 09:15:28 +0900', `garbage → now fallback, got: ${v}`)
  ok('파싱 실패 값 → now 폴백')
}

// 8. 오프셋 인자로 다른 지역 (device 모드 대비)
{
  const v = normalizePublishDate('', NOW, '+0000')
  assert(v === '2026-07-01 00:15:28 +0000', `offset +0000, got: ${v}`)
  ok('offset 인자로 다른 타임존 계산 (device 모드 대비)')
}

// 9. 잘못된 오프셋 인자 → +0900 폴백
{
  const v = normalizePublishDate('', NOW, 'garbage')
  assert(v === '2026-07-01 09:15:28 +0900', `bad offset → +0900, got: ${v}`)
  ok('잘못된 오프셋 인자 → +0900 폴백')
}

// 10. 기본 오프셋(인자 생략) = +0900
{
  const v = normalizePublishDate('', NOW)
  assert(v === '2026-07-01 09:15:28 +0900', `default offset, got: ${v}`)
  ok('오프셋 인자 생략 시 기본 +0900')
}

// ── resolveFilename ──

// 11. slug 에 날짜 없음 → date 날짜부분 접두사
{
  const v = resolveFilename('hello', '2026-07-01 09:15:28 +0900')
  assert(v === '2026-07-01-hello', `no-date slug → prefixed, got: ${v}`)
  ok('날짜 없는 slug → date 날짜부분 접두사 부착')
}

// 12. slug 에 이미 날짜 있음 → 그대로 (SPEC §4 일관성)
{
  const v = resolveFilename('2026-06-19-hello', '2026-07-01 09:15:28 +0900')
  assert(v === '2026-06-19-hello', `dated slug → as-is, got: ${v}`)
  ok('이미 날짜 접두사 있는 slug → 그대로')
}

// 13. 임시 slug(YYYY-MM-DD-untitled-xxxxx) 도 날짜 있으므로 그대로
{
  const v = resolveFilename('2026-07-01-untitled-a1b2c', '2026-07-01 09:15:28 +0900')
  assert(v === '2026-07-01-untitled-a1b2c', `temp slug → as-is, got: ${v}`)
  ok('임시 slug(날짜 포함) → 그대로')
}

// 14. 안전한 기존 githubPath는 date가 달라져도 재사용
{
  const v = resolvePostMarkdownPath(
    'hello',
    '2026-08-01 09:15:28 +0900',
    '_posts/2026-07-01-hello.md',
  )
  assert(v === '_posts/2026-07-01-hello.md', `existing path should be reused, got: ${v}`)
  ok('date 변경 시 안전한 기존 githubPath 재사용')
}

// 15. 레거시 Windows 백슬래시 경로 정규화
{
  const v = normalizeGithubPostPath('_posts\\2026-07-01-한글-글.md')
  assert(v === '_posts/2026-07-01-한글-글.md', `backslash path normalized, got: ${v}`)
  ok('Windows 백슬래시 githubPath를 슬래시 경로로 정규화')
}

// 16. githubPath가 없으면 기존 slug/date 파일명 규칙으로 폴백
{
  const v = resolvePostMarkdownPath('hello', '2026-08-01 09:15:28 +0900')
  assert(v === '_posts/2026-08-01-hello.md', `missing path should fall back, got: ${v}`)
  ok('githubPath 없음 → 기존 resolveFilename 규칙 사용')
}

// 17. 안전하지 않은 githubPath는 기존 규칙으로 폴백
{
  const fallback = '_posts/2026-08-01-hello.md'
  const unsafePaths = [
    '../_posts/evil.md',
    '/_posts/evil.md',
    'C:\\repo\\_posts\\evil.md',
    '_posts/../evil.md',
    '_posts/nested/evil.md',
    '_posts/evil.txt',
    '_posts/.md',
    '_posts/bad:name.md',
  ]

  for (const githubPath of unsafePaths) {
    const v = resolvePostMarkdownPath(
      'hello',
      '2026-08-01 09:15:28 +0900',
      githubPath,
    )
    assert(v === fallback, `unsafe path should fall back: ${githubPath} → ${v}`)
  }
  ok('절대경로·경로탈출·하위폴더·잘못된 확장자 githubPath 거부')
}

console.log(`\n✅ ${pass} checks passed`)
