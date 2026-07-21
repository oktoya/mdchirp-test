// MarkdownCommands — textarea(MD 패널) 선택영역을 마크다운 문법으로 가공하는 구현.
//
// 사용자 아이디어 실현: MD 칸에서 블록 잡고 툴바 버튼을 누르면 코드(문법)가 바뀐다.
//   - 인라인(굵게/기울임/…): 선택영역을 기호로 감싼다(**…**, *…*, ==…== 등). 이미 감싸져 있으면 해제.
//   - 줄 단위(제목/인용/목록): 선택된 줄들의 앞에 접두어를 토글한다.
//   - 삽입(링크/이미지/미디어/HR): 커서 위치에 텍스트를 끼운다.
//
// SplitView 가 textarea 의 현재값/선택범위를 주고, 결과(새 텍스트 + 새 선택)를 받아 반영한다.

import type {
  EditorCommands,
  ToggleIntent,
  ParagraphIntent,
  AlignIntent,
  ColorArgs,
  InsertLinkArgs,
  InsertImageArgs,
  InsertMediaArgs,
} from './types.js'

// textarea 와 상호작용하기 위한 핸들 (SplitView 가 제공)
export interface MdTextareaHandle {
  getValue(): string
  getSelection(): { start: number; end: number }
  /** 새 값으로 교체하고, 지정한 선택범위로 커서/선택을 복원한다 */
  apply(next: string, selStart: number, selEnd: number): void
  focus(): void
}

// 인라인 마크 → 감싸는 기호 (좌/우 동일)
const WRAP: Partial<Record<ToggleIntent, string>> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  code: '`',
  highlight: '==',
}

export class MarkdownCommands implements EditorCommands {
  readonly target = 'md' as const
  constructor(private ta: MdTextareaHandle) {}

  // ── 선택 보조 ──
  private sel() {
    const v = this.ta.getValue()
    const { start, end } = this.ta.getSelection()
    return { v, start, end, picked: v.slice(start, end) }
  }

  // 인라인 감싸기/해제 토글
  private wrapInline(open: string, close = open): void {
    const { v, start, end, picked } = this.sel()
    const before = v.slice(0, start)
    const after = v.slice(end)
    // 이미 감싸져 있으면 해제
    if (
      picked.startsWith(open) &&
      picked.endsWith(close) &&
      picked.length >= open.length + close.length
    ) {
      const inner = picked.slice(open.length, picked.length - close.length)
      const next = before + inner + after
      this.ta.apply(next, start, start + inner.length)
      return
    }
    const text = picked || '텍스트'
    const next = before + open + text + close + after
    // 선택이 비어있었으면 placeholder 를 선택 상태로
    const selStart = start + open.length
    this.ta.apply(next, selStart, selStart + text.length)
  }

  // 줄 접두어 토글 (제목/인용)
  private linePrefix(prefix: string, opts: { exclusive?: boolean } = {}): void {
    const { v, start, end } = this.sel()
    const lineStart = v.lastIndexOf('\n', start - 1) + 1
    const lineEndRaw = v.indexOf('\n', end)
    const lineEnd = lineEndRaw === -1 ? v.length : lineEndRaw
    const block = v.slice(lineStart, lineEnd)
    const lines = block.split('\n')

    // exclusive(제목): 기존 #/>/목록 접두어 제거 후 적용. 같은 접두어면 해제.
    const stripped = lines.map((l) =>
      l.replace(/^(\s*)(#{1,6}\s+|>\s?|[-*]\s+\[[ xX]\]\s+|[-*]\s+|\d+\.\s+)/, '$1'),
    )
    const allHave = lines.every((l) => l.replace(/^\s*/, '').startsWith(prefix.trim()))
    let outLines: string[]
    if (allHave) {
      outLines = stripped // 토글 해제
    } else if (opts.exclusive) {
      outLines = stripped.map((l) => {
        const m = l.match(/^(\s*)(.*)$/)
        return (m ? m[1] : '') + prefix + (m ? m[2] : l)
      })
    } else {
      outLines = lines.map((l) => {
        const m = l.match(/^(\s*)(.*)$/)
        return (m ? m[1] : '') + prefix + (m ? m[2] : l)
      })
    }
    const next = v.slice(0, lineStart) + outLines.join('\n') + v.slice(lineEnd)
    this.ta.apply(next, lineStart, lineStart + outLines.join('\n').length)
  }

  // 번호 목록 (각 줄에 1. 2. …)
  private numberList(): void {
    const { v, start, end } = this.sel()
    const lineStart = v.lastIndexOf('\n', start - 1) + 1
    const lineEndRaw = v.indexOf('\n', end)
    const lineEnd = lineEndRaw === -1 ? v.length : lineEndRaw
    const lines = v.slice(lineStart, lineEnd).split('\n')
    const has = lines.every((l) => /^\s*\d+\.\s+/.test(l))
    const out = has
      ? lines.map((l) => l.replace(/^(\s*)\d+\.\s+/, '$1'))
      : lines.map((l, i) => {
          const m = l.match(/^(\s*)(.*)$/)
          return (m ? m[1] : '') + `${i + 1}. ` + (m ? m[2] : l)
        })
    const next = v.slice(0, lineStart) + out.join('\n') + v.slice(lineEnd)
    this.ta.apply(next, lineStart, lineStart + out.join('\n').length)
  }

  // 커서 위치에 텍스트 삽입
  private insertAtCursor(text: string, selectInner?: [number, number]): void {
    const { v, start, end } = this.sel()
    const next = v.slice(0, start) + text + v.slice(end)
    if (selectInner) this.ta.apply(next, start + selectInner[0], start + selectInner[1])
    else this.ta.apply(next, start + text.length, start + text.length)
  }

  private codeFence(): void {
    const { v, start, end, picked } = this.sel()
    const body = picked || 'code'
    const block = '```\n' + body + '\n```'
    const next = v.slice(0, start) + block + v.slice(end)
    const innerStart = start + 4
    this.ta.apply(next, innerStart, innerStart + body.length)
  }

  // ── EditorCommands 구현 ──
  toggle(intent: ToggleIntent): void {
    const wrap = WRAP[intent]
    if (wrap) {
      this.wrapInline(wrap)
      return
    }
    switch (intent) {
      case 'underline':
        this.wrapInline('<u>', '</u>')
        break
      case 'blockquote':
        this.linePrefix('> ')
        break
      case 'codeBlock':
        this.codeFence()
        break
      case 'bulletList':
        this.linePrefix('- ')
        break
      case 'orderedList':
        this.numberList()
        break
      case 'taskList':
        this.linePrefix('- [ ] ')
        break
    }
  }

  // MD 패널은 선택영역 상태를 신뢰성 있게 판별하기 어렵다 → 보수적으로 false
  isActive(): boolean {
    return false
  }

  setParagraph(intent: ParagraphIntent): void {
    if (intent === 'paragraph') {
      this.linePrefix('', {})
      return
    } // 제목 해제만 의미
    const level = Number(intent.replace('heading', ''))
    this.linePrefix('#'.repeat(level) + ' ', { exclusive: true })
  }
  activeParagraph(): ParagraphIntent {
    return 'paragraph'
  }

  // 정렬/색상은 마크다운 표준 문법이 없음 → MD 패널에서는 HTML 로 감싼다(리치와 동일 직렬화 형태)
  setAlign(intent: AlignIntent): void {
    if (intent === 'left') return
    this.wrapInline(`<div style="text-align:${intent}">\n`, '\n</div>')
  }
  activeAlign(): AlignIntent {
    return 'left'
  }

  setTextColor({ color }: ColorArgs): void {
    if (color) this.wrapInline(`<span style="color:${color}">`, '</span>')
  }
  setHighlightColor({ color }: ColorArgs): void {
    if (color) this.wrapInline(`<mark style="background-color:${color}">`, '</mark>')
    else this.wrapInline('==')
  }

  insertLink({ href, text }: InsertLinkArgs): void {
    const label = text || this.sel().picked || '링크'
    const md = `[${label}](${href})`
    // 선택이 있었으면 대체, 없으면 라벨 부분을 선택
    const { picked } = this.sel()
    if (picked) this.insertAtCursor(md)
    else this.insertAtCursor(md, [1, 1 + label.length])
  }
  isLinkActive(): boolean {
    return false
  }

  insertImage({ src, alt, width, height }: InsertImageArgs): void {
    const size =
      width && height ? `{: width="${Math.round(width)}" height="${Math.round(height)}" }` : ''

    this.insertAtCursor(`![${alt ?? ''}](${src})${size}`)
  }
  insertMedia({ kind, src, label }: InsertMediaArgs): void {
    const text = label || (kind === 'video' ? '영상' : '파일')
    this.insertAtCursor(`[${text}](${src})`)
  }
  insertHorizontalRule(): void {
    this.insertAtCursor('\n\n---\n\n')
  }

  insertText(text: string): void {
    this.insertAtCursor(text)
  }

  selectedText(): string {
    return this.sel().picked
  }
}
