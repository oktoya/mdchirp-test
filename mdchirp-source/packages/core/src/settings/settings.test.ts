// settings.test.ts — 섹션 레지스트리 불변식 + 폼→콜백 매핑 순수함수 검증.
// 실행: pnpm --filter @mdchirp/core test
//
// 핵심 불변식:
//   1) SECTIONS 가 SPEC §4 표와 어긋나지 않는다(번호/상태 분포).
//   2) mergeDevice 가 editor 중첩을 통째로 날리지 않는다.
//   3) buildNasPatch 가 변경된 그룹만 담는다.
//   4) normalizeIdleMin 이 0=끔 규칙대로 정규화한다.
//   5) submitSecret 이 올바른 kind/값으로 호출 + 입력 비움.

import type { DeviceSettings, NasSettings } from '@mdchirp/shared'
import { SECTIONS } from './sections.js'
import { mergeDevice, buildNasPatch, normalizeIdleMin, submitSecret } from './payload.js'

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

// ── 픽스처 ─────────────────────────────────────────────────
function device(over: Partial<DeviceSettings> = {}): DeviceSettings {
  return {
    deviceId: 'dev-1',
    deviceName: 'My PC',
    nasBaseUrl: 'http://localhost:8787',
    editor: { splitView: true, spellcheckLang: 'ko' },
    ...over,
  }
}

// ── 섹션 레지스트리 불변식 ──────────────────────────────────
console.log('\n── settings: 섹션 레지스트리 ──')
{
  const nums = SECTIONS.map((s) => s.num)
  check('섹션 12개', SECTIONS.length === 12, `got ${SECTIONS.length}`)
  check(
    'num 1~12 중복·누락 없음',
    JSON.stringify([...nums].sort((a, b) => a - b)) ===
      JSON.stringify(Array.from({ length: 12 }, (_, i) => i + 1)),
    JSON.stringify(nums),
  )
  check('id 중복 없음', new Set(SECTIONS.map((s) => s.id)).size === 12)
  const ready = SECTIONS.filter((s) => s.status === 'ready').map((s) => s.num)
  const partial = SECTIONS.filter((s) => s.status === 'partial').map((s) => s.num)
  const slot = SECTIONS.filter((s) => s.status === 'slot').map((s) => s.num)
  check(
    'ready = 1·2·3·7',
    JSON.stringify(ready) === JSON.stringify([1, 2, 3, 7]),
    JSON.stringify(ready),
  )
  check(
    'partial = 4·5·6',
    JSON.stringify(partial) === JSON.stringify([4, 5, 6]),
    JSON.stringify(partial),
  )
  check(
    'slot = 8~12',
    JSON.stringify(slot) === JSON.stringify([8, 9, 10, 11, 12]),
    JSON.stringify(slot),
  )
  check(
    'slot 섹션은 note("준비 중") 보유',
    SECTIONS.filter((s) => s.status === 'slot').every((s) => s.note === '준비 중'),
  )
}

// ── mergeDevice ────────────────────────────────────────────
console.log('\n── settings: mergeDevice ──')
{
  const d = device()
  const merged = mergeDevice(d, { deviceName: 'Laptop' })
  check('최상위 필드 병합', merged.deviceName === 'Laptop')
  check(
    'editor 보존(통째 안 날림)',
    merged.editor.splitView === true && merged.editor.spellcheckLang === 'ko',
  )
}
{
  const d = device()
  const merged = mergeDevice(d, { editor: { autosave: { idleMin: 3 } } })
  check('editor 부분 변경 시 기존 editor 필드 유지', merged.editor.splitView === true)
  check('editor 새 필드 추가', merged.editor.autosave?.idleMin === 3)
}
{
  const d = device({ editor: { splitView: true, spellcheckLang: 'ko', defaultMode: 'rich' } })
  const merged = mergeDevice(d, { editor: { defaultMode: 'md' } })
  check('editor 기존 필드 덮어쓰기', merged.editor.defaultMode === 'md')
  check('editor 다른 필드 영향 없음', merged.editor.spellcheckLang === 'ko')
}
{
  const d = device()
  const merged = mergeDevice(d, {})
  check('빈 변경 → editor 동일 참조 유지', merged.editor === d.editor)
}

// ── buildNasPatch ──────────────────────────────────────────
console.log('\n── settings: buildNasPatch ──')
{
  const patch = buildNasPatch({ github: { repo: 'me/blog', branch: 'main', tokenSet: false } })
  check('github 만 담김', patch.github?.repo === 'me/blog' && patch.ai === undefined)
}
{
  const patch = buildNasPatch({
    ai: { provider: 'gemini', model: 'gemini-2.0-flash', keySet: true } as NasSettings['ai'],
  })
  check('ai 만 담김', patch.ai?.model === 'gemini-2.0-flash' && patch.github === undefined)
}
{
  const patch = buildNasPatch({})
  check('빈 입력 → 빈 patch', Object.keys(patch).length === 0)
}

// ── normalizeIdleMin ───────────────────────────────────────
console.log('\n── settings: normalizeIdleMin ──')
check('정상 정수', normalizeIdleMin(5) === 5)
check('문자열 숫자', normalizeIdleMin('3') === 3)
check('0 그대로(=끔)', normalizeIdleMin(0) === 0)
check('음수 → 0', normalizeIdleMin(-2) === 0)
check('빈값 → 0', normalizeIdleMin('') === 0)
check('null → 0', normalizeIdleMin(null) === 0)
check('NaN 문자열 → 0', normalizeIdleMin('abc') === 0)
check('소수 → 내림', normalizeIdleMin(2.9) === 2)

// ── submitSecret ───────────────────────────────────────────
console.log('\n── settings: submitSecret ──')
{
  const r = submitSecret('github', 'ghp_secret123')
  check(
    '올바른 kind/값으로 호출 의도',
    r.call.kind === 'github' && r.call.value === 'ghp_secret123',
  )
  check('입력 비움(메모리 미보유)', r.nextInput === '')
}
{
  const r = submitSecret('gemini', 'AIza_xxx')
  check('gemini kind 전달', r.call.kind === 'gemini' && r.call.value === 'AIza_xxx')
}

console.log(`\n결과: ${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
