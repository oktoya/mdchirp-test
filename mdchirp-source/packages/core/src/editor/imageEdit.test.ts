// imageEdit.test.ts — 기존 이미지 상세 편집의 크기 검증·비율 계산 테스트.
// 실행: pnpm exec tsx packages/core/src/editor/imageEdit.test.ts

import {
  pairedImageDimension,
  parseImageDimensions,
  positiveImageDimension,
  resolveImageAspectRatio,
} from './imageEdit.js'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

function same(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected)
}

console.log('\n── 기존 이미지 상세 편집: 크기 검증 ──')

check('양수 정수 허용', positiveImageDimension(700) === 700)
check('숫자 문자열 허용', positiveImageDimension('394') === 394)
check('소수는 정수로 반올림', positiveImageDimension('700.6') === 701)
check('0 거부', positiveImageDimension(0) === null)
check('음수 거부', positiveImageDimension(-10) === null)
check('NaN 거부', positiveImageDimension(Number.NaN) === null)
check('Infinity 거부', positiveImageDimension(Number.POSITIVE_INFINITY) === null)
check('빈 문자열 거부', positiveImageDimension('') === null)
check('반올림 후 0이 되는 값 거부', positiveImageDimension(0.1) === null)

check(
  '너비·높이 정상 적용',
  same(parseImageDimensions('700', '394'), {
    ok: true,
    width: 700,
    height: 394,
  }),
)

check(
  '너비·높이 빈 값은 원본 크기',
  same(parseImageDimensions('', ''), {
    ok: true,
    width: null,
    height: null,
  }),
)

check('너비만 입력하면 거부', parseImageDimensions('700', '').ok === false)
check('높이만 입력하면 거부', parseImageDimensions('', '394').ok === false)
check('0 크기는 거부', parseImageDimensions('0', '394').ok === false)
check('음수 크기는 거부', parseImageDimensions('-700', '394').ok === false)
check('NaN 크기는 거부', parseImageDimensions('NaN', '394').ok === false)
check('Infinity 크기는 거부', parseImageDimensions('Infinity', '394').ok === false)

console.log('\n── 기존 이미지 상세 편집: 원본 비율 유지 ──')

check('자연 크기 비율을 우선 사용', resolveImageAspectRatio(1600, 900, 700, 700) === 1600 / 900)

check('자연 크기가 없으면 현재 노드 비율 사용', resolveImageAspectRatio(0, 0, 800, 400) === 2)

check(
  '자연 크기와 현재 크기가 모두 없으면 비율 없음',
  resolveImageAspectRatio(0, 0, null, null) === null,
)

check('너비 변경 시 높이 자동 계산', pairedImageDimension('width', 800, 16 / 9) === 450)

check('높이 변경 시 너비 자동 계산', pairedImageDimension('height', 450, 16 / 9) === 800)

check('잘못된 입력은 반대쪽 크기를 계산하지 않음', pairedImageDimension('width', 0, 2) === null)
check(
  '비율이 없으면 반대쪽 크기를 계산하지 않음',
  pairedImageDimension('width', 800, null) === null,
)
check('잘못된 비율을 거부', pairedImageDimension('height', 400, 0) === null)

console.log(`\n결과: ${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
