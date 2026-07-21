// EditorCommands — 툴바와 "실제 편집 대상" 사이의 경계 인터페이스.
//
// 핵심 아이디어(공용 툴바):
//   툴바 버튼은 "의도(intent)"만 안다 — bold / heading2 / bulletList / link …
//   그 의도를 실제 동작으로 바꾸는 건 활성 패널이 결정한다:
//     - 리치 패널 활성 → TipTap 명령 (표현이 바뀜)        → RichCommands
//     - MD 패널 활성   → textarea 선택영역을 MD 문법으로 감쌈 → MarkdownCommands
//
//   덕분에 툴바 UI는 한 벌, 동작만 갈아끼운다(sync 어댑터 패턴과 동일 철학).

// 토글형 인라인 마크 / 블록 의도
export type ToggleIntent =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'underline'
  | 'highlight'
  | 'blockquote'
  | 'codeBlock'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'

// 문단 형식 (본문/제목 N)
export type ParagraphIntent = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4'

// 정렬
export type AlignIntent = 'left' | 'center' | 'right' | 'justify'

// 삽입형 (인자 동반)
export interface InsertLinkArgs {
  href: string
  text?: string
}
export interface InsertImageArgs {
  src: string
  alt?: string
  /** 화면에 표시할 이미지 너비(px). 생략하면 원본/반응형 크기. */
  width?: number
  /** 화면에 표시할 이미지 높이(px). 생략하면 원본 비율. */
  height?: number
}
export interface InsertMediaArgs {
  kind: 'video' | 'file'
  src: string
  label?: string
}

// 색상 (글자색/하이라이트색). null = 해제
export interface ColorArgs {
  color: string | null
}

/**
 * 툴바가 부르는 명령 집합. rich/md 구현이 각각 채운다.
 * 상태질의(isActive 등)는 리치에서만 의미가 있고, MD 구현은 보수적으로 false/기본값을 돌려준다.
 */
export interface EditorCommands {
  /** 어느 패널을 다루는가 (UI 힌트용) */
  readonly target: 'rich' | 'md'

  // 토글
  toggle(intent: ToggleIntent): void
  isActive(intent: ToggleIntent): boolean

  // 문단 형식
  setParagraph(intent: ParagraphIntent): void
  activeParagraph(): ParagraphIntent

  // 정렬
  setAlign(intent: AlignIntent): void
  activeAlign(): AlignIntent

  // 색상
  setTextColor(args: ColorArgs): void
  setHighlightColor(args: ColorArgs): void

  // 삽입
  insertLink(args: InsertLinkArgs): void
  isLinkActive(): boolean
  insertImage(args: InsertImageArgs): void
  insertMedia(args: InsertMediaArgs): void
  insertHorizontalRule(): void

  /** 받아쓰기 등으로 평문 삽입 */
  insertText(text: string): void

  /** 현재 선택 텍스트(링크 기본값 등 UI 보조용). 없으면 '' */
  selectedText(): string
}
