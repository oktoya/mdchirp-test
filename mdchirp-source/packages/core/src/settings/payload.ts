// payload.ts — 폼 상태 → 콜백 payload 매핑(순수함수).
// settings 는 controlled 컴포넌트라 "폼 변경 → 어떤 콜백에 어떤 인자"가 핵심 로직.
// 이를 JSX 에서 떼어 순수함수로 두어 단독 테스트(settings.test.ts)가 가능하게 함.

import type { DeviceSettings, NasSettings, SecretKind } from '@mdchirp/shared'

// editor 의 부분 변경만 표현(중첩 병합용). 최상위 device 부분 변경과 분리.
type DevicePart = Partial<Omit<DeviceSettings, 'editor'>> & {
  editor?: Partial<DeviceSettings['editor']>
}

/**
 * 현재 device 에 부분 변경을 합쳐 onSaveDevice 에 넘길 완전한 DeviceSettings 를 만든다.
 * editor 중첩 객체를 통째로 날리지 않고 필드 단위로 병합한다(얕은 spread 함정 방지).
 */
export function mergeDevice(device: DeviceSettings, part: DevicePart): DeviceSettings {
  const { editor: editorPart, ...rest } = part
  return {
    ...device,
    ...rest,
    editor: editorPart ? { ...device.editor, ...editorPart } : device.editor,
  }
}

// nas 의 부분 변경 입력. github/ai 는 중첩이라 부분만 받는다.
interface NasPart {
  github?: Partial<NasSettings['github']>
  ai?: Partial<NasSettings['ai']>
  mediaPolicy?: NasSettings['mediaPolicy']
  timezone?: 'nas' | 'device'
}

/**
 * nas 폼 일부 변경에서 onSaveNas 에 넘길 Partial<NasSettings> 를 만든다.
 * 변경된 키만 담는다(undefined 인 그룹은 제외) → 받는 쪽이 부분 PUT 가능.
 */
export function buildNasPatch(part: NasPart): Partial<NasSettings> {
  const patch: Partial<NasSettings> = {}
  if (part.github !== undefined) patch.github = part.github as NasSettings['github']
  if (part.ai !== undefined) patch.ai = part.ai as NasSettings['ai']
  if (part.mediaPolicy !== undefined) patch.mediaPolicy = part.mediaPolicy
  if (part.timezone !== undefined) patch.timezone = part.timezone
  return patch
}

/**
 * 자동저장 분 입력 정규화. "0 = 끔" 규칙이 여기 한 곳에 모인다.
 * 문자열/음수/빈값/소수/NaN 을 0 이상의 정수로 만든다.
 */
export function normalizeIdleMin(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/**
 * secret 입력 제출. "올바른 kind/값으로 호출 + 직후 입력 비움"을 순수하게 표현.
 * 컴포넌트는 call 로 onSetSecret 을 호출하고 nextInput 으로 입력 state 를 리셋한다.
 * → 키가 컴포넌트 메모리에 남지 않음(SPEC §5-1).
 */
export function submitSecret(
  kind: SecretKind,
  value: string,
): { call: { kind: SecretKind; value: string }; nextInput: string } {
  return { call: { kind, value }, nextInput: '' }
}
