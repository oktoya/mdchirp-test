// base.ts — mdchirp 에디터의 기본 TipTap 확장 묶음.
//
// 책임: "어떤 서식이 존재하는가"를 한 곳에서 정의한다.
//  - 노드: paragraph, heading(1~6), bulletList, orderedList, listItem,
//          taskList, taskItem, blockquote, codeBlock, image, horizontalRule, hardBreak
//  - 마크: bold, italic, strike, code, link, underline, textStyle(color), highlight
//  - 정렬: textAlign (paragraph/heading 대상)
//
// markdown.ts(변환)와 EditorView.tsx(렌더)가 공통으로 이 목록을 신뢰한다.
// SPEC: packages/core/src/editor/SPEC.md §2, §4

import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { mergeAttributes, type Extensions } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { createResizableImageView, type RichImageEditHandler } from './ResizableImageView.js'

export interface BaseExtensionOptions {
  placeholder?: string
  /** 문서의 원본 src를 변경하지 않고, 화면에 렌더링할 URL만 변환한다. */
  resolveImageSrc?: (src: string) => string
  /** 리치 이미지 더블클릭 시 정확한 이미지 노드 위치와 현재 속성을 전달한다. */
  onImageEdit?: RichImageEditHandler
}

/**
 * mdchirp 1차 기본 서식 확장 묶음.
 * Chirpy 전용 문법(promptBox/imageAttrs 등)은 여기 없음 → extensions/chirpy/ 슬롯.
 */
export function baseExtensions(opts: BaseExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      // StarterKit이 기본 제공: paragraph, heading, bold, italic, strike, code,
      // bulletList, orderedList, listItem, blockquote, codeBlock, horizontalRule,
      // hardBreak, history, dropcursor, gapcursor
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      codeBlock: { HTMLAttributes: { class: 'mdc-code-block' } },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          width: {
            default: null,
            parseHTML: (element) => {
              const value = element.getAttribute('width')
              if (!value) return null

              const parsed = Number(value)
              return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
            },
            renderHTML: (attributes) =>
              attributes.width ? { width: String(attributes.width) } : {},
          },
          height: {
            default: null,
            parseHTML: (element) => {
              const value = element.getAttribute('height')
              if (!value) return null

              const parsed = Number(value)
              return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
            },
            renderHTML: (attributes) =>
              attributes.height ? { height: String(attributes.height) } : {},
          },
        }
      },

      renderHTML({ HTMLAttributes }) {
        const originalSrc = typeof HTMLAttributes.src === 'string' ? HTMLAttributes.src : ''
        const renderedSrc = opts.resolveImageSrc?.(originalSrc) ?? originalSrc

        return [
          'img',
          mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
            src: renderedSrc,
            // 클릭 미리보기에는 변환 전 Markdown/TipTap 원본을 사용한다.
            'data-mdchirp-src': originalSrc,
          }),
        ]
      },

      addNodeView() {
        return ReactNodeViewRenderer(
          createResizableImageView(opts.resolveImageSrc, opts.onImageEdit),
        )
      },
    }).configure({
      inline: false,
      allowBase64: true,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    // 밑줄 (마크다운 표준엔 없음 → 변환 시 <u>…</u> HTML로 보존)
    Underline,
    // 글자색 — TextStyle(span style 기반) + Color
    TextStyle,
    Color,
    // 하이라이트(형광펜) — 다색 지원. 변환 시 ==…== (기본) / <mark> (색상)
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({
      placeholder: opts.placeholder ?? '여기에 글을 써보세요…',
    }),
  ]
}
