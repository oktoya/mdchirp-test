// shortcuts.ts — 전역 단축키 등록/해제 (Shell 에서 분리해 단독 테스트 가능).
// SPEC: packages/core/src/shell/SPEC.md §3
//
// platform.registerShortcut 이 있으면 등록하고, 모든 해제 함수를 모아
// 하나의 cleanup 으로 돌려준다. 없는 플랫폼이면 no-op cleanup.

import type { PlatformAdapter } from '@mdchirp/shared'

export interface ShellShortcutHandlers {
  newPost: () => void
  focusList: () => void
}

/** 단축키 등록 → 해제 함수 반환. registerShortcut 없으면 아무것도 안 하고 no-op 반환. */
export function registerShellShortcuts(
  platform: PlatformAdapter,
  handlers: ShellShortcutHandlers,
): () => void {
  const reg = platform.registerShortcut
  if (!reg) return () => {}
  const offs = [reg('mod+n', handlers.newPost), reg('mod+l', handlers.focusList)]
  return () => offs.forEach((off) => off())
}
