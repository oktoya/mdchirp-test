// RichCommands — TipTap editor 를 EditorCommands 로 감싼 구현(리치 패널용).
// 의도(intent)를 editor.chain() 명령으로 번역한다.

import type { Editor } from '@tiptap/react'
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

export class RichCommands implements EditorCommands {
  readonly target = 'rich' as const
  constructor(private editor: Editor) {}

  private c() {
    return this.editor.chain().focus()
  }

  toggle(intent: ToggleIntent): void {
    switch (intent) {
      case 'bold':
        this.c().toggleBold().run()
        break
      case 'italic':
        this.c().toggleItalic().run()
        break
      case 'strike':
        this.c().toggleStrike().run()
        break
      case 'code':
        this.c().toggleCode().run()
        break
      case 'underline':
        this.c().toggleUnderline().run()
        break
      case 'highlight':
        this.c().toggleHighlight().run()
        break
      case 'blockquote':
        this.c().toggleBlockquote().run()
        break
      case 'codeBlock':
        this.c().toggleCodeBlock().run()
        break
      case 'bulletList':
        this.c().toggleBulletList().run()
        break
      case 'orderedList':
        this.c().toggleOrderedList().run()
        break
      case 'taskList':
        this.c().toggleTaskList().run()
        break
    }
  }

  isActive(intent: ToggleIntent): boolean {
    return this.editor.isActive(intent)
  }

  setParagraph(intent: ParagraphIntent): void {
    if (intent === 'paragraph') {
      this.c().setParagraph().run()
      return
    }
    const level = Number(intent.replace('heading', '')) as 1 | 2 | 3 | 4
    this.c().toggleHeading({ level }).run()
  }

  activeParagraph(): ParagraphIntent {
    for (const l of [1, 2, 3, 4] as const) {
      if (this.editor.isActive('heading', { level: l })) return `heading${l}` as ParagraphIntent
    }
    return 'paragraph'
  }

  setAlign(intent: AlignIntent): void {
    this.c().setTextAlign(intent).run()
  }

  activeAlign(): AlignIntent {
    for (const a of ['center', 'right', 'justify'] as const) {
      if (this.editor.isActive({ textAlign: a })) return a
    }
    return 'left'
  }

  setTextColor({ color }: ColorArgs): void {
    if (color) this.c().setColor(color).run()
    else this.c().unsetColor().run()
  }

  setHighlightColor({ color }: ColorArgs): void {
    if (color) this.c().setHighlight({ color }).run()
    else this.c().unsetHighlight().run()
  }

  insertLink({ href, text }: InsertLinkArgs): void {
    if (!href) {
      this.c().extendMarkRange('link').unsetLink().run()
      return
    }
    const sel = this.selectedText()
    if (!sel && text) {
      this.c().insertContent(`<a href="${href}">${text}</a>`).run()
    } else {
      this.c().extendMarkRange('link').setLink({ href }).run()
    }
  }

  isLinkActive(): boolean {
    return this.editor.isActive('link')
  }

  insertImage({ src, alt, width, height }: InsertImageArgs): void {
    this.c()
      .setImage({
        src,
        alt: alt ?? '',
        width: width ?? null,
        height: height ?? null,
      } as any)
      .run()
  }

  insertMedia({ kind, src, label }: InsertMediaArgs): void {
    // 리치에서도 비디오/파일은 1차로 링크로 삽입(전용 노드는 미디어 단계 슬롯)
    const text = label || (kind === 'video' ? '영상' : '파일')
    this.c().insertContent(`<a href="${src}">${text}</a>`).run()
  }

  insertHorizontalRule(): void {
    this.c().setHorizontalRule().run()
  }

  insertText(text: string): void {
    this.c().insertContent(text).run()
  }

  selectedText(): string {
    const { from, to, empty } = this.editor.state.selection
    if (empty) return ''
    return this.editor.state.doc.textBetween(from, to, ' ')
  }
}
