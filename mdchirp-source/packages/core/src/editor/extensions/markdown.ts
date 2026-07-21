// markdown.ts — 리치(TipTap JSON) ↔ Markdown 양방향 변환.
//
// ⚠️ 에디터에서 가장 위험한 부분: round-trip(JSON→MD→JSON)이 깨지면 글이 손상된다.
// 그래서 가장 먼저 만들고, 단독 테스트(markdown.test.ts)로 검증한다.
//
// 설계 선택:
//  - TipTap 런타임 스키마에 결합하지 않는다. JSON 문서 모양(ProseMirror doc JSON)을
//    직접 순회 → 결정론적이고 테스트하기 쉽다.
//  - MD→JSON 파싱만 markdown-it 토큰을 사용(검증된 파서).
//  - Chirpy 전용 문법({: .prompt }, 이미지 속성 등)은 1차 범위 밖(슬롯).
//
// SPEC: packages/core/src/editor/SPEC.md §7

import MarkdownIt from 'markdown-it'

// ── ProseMirror/TipTap JSON 최소 타입 ──────────────────────────
export interface PMMark {
  type: string
  attrs?: Record<string, unknown>
}
export interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  marks?: PMMark[]
  text?: string
}
export interface PMDoc {
  type: 'doc'
  content?: PMNode[]
}

// ═══════════════════════════════════════════════════════════════
// 1. TipTap JSON → Markdown (직렬화)
// ═══════════════════════════════════════════════════════════════

export function jsonToMarkdown(doc: PMDoc | PMNode): string {
  const root = doc as PMNode
  const blocks = root.content ?? []
  return (
    blocks
      .map((n) => serializeBlock(n))
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

function serializeBlock(node: PMNode, listDepth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return serializeInline(node.content ?? [])
    case 'heading': {
      const level = clampLevel(node.attrs?.level)
      return '#'.repeat(level) + ' ' + serializeInline(node.content ?? [])
    }
    case 'blockquote':
      return (node.content ?? [])
        .map((c) => serializeBlock(c, listDepth))
        .join('\n\n')
        .split('\n')
        .map((line) => (line.length ? '> ' + line : '>'))
        .join('\n')
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? ''
      const code = (node.content ?? []).map((c) => c.text ?? '').join('')
      return '```' + lang + '\n' + code + '\n```'
    }
    case 'bulletList':
      return serializeList(node, listDepth, false)
    case 'orderedList':
      return serializeList(node, listDepth, true)
    case 'taskList':
      return serializeTaskList(node, listDepth)
    case 'horizontalRule':
      return '---'
    case 'image':
      return serializeImage(node)
    default:
      // 알 수 없는 블록: 내부 텍스트만 보존(유실 방지)
      return serializeInline(node.content ?? [])
  }
}

function serializeList(node: PMNode, depth: number, ordered: boolean): string {
  const indent = '  '.repeat(depth)
  const items = node.content ?? []
  return items
    .map((item, i) => {
      const marker = ordered ? `${((node.attrs?.start as number) ?? 1) + i}. ` : '- '
      const inner = (item.content ?? []).map((c) => serializeBlock(c, depth + 1)).join('\n\n')
      // 멀티라인 항목 들여쓰기
      const lines = inner.split('\n')
      const head = indent + marker + (lines[0] ?? '')
      const rest = lines.slice(1).map((l) => (l.length ? indent + '  ' + l : l))
      return [head, ...rest].join('\n')
    })
    .join('\n')
}

function serializeTaskList(node: PMNode, depth: number): string {
  const indent = '  '.repeat(depth)
  return (node.content ?? [])
    .map((item) => {
      const checked = item.attrs?.checked ? 'x' : ' '
      const inner = (item.content ?? []).map((c) => serializeBlock(c, depth + 1)).join('\n\n')
      const lines = inner.split('\n')
      const head = `${indent}- [${checked}] ${lines[0] ?? ''}`
      const rest = lines.slice(1).map((l) => (l.length ? indent + '  ' + l : l))
      return [head, ...rest].join('\n')
    })
    .join('\n')
}

function serializeImage(node: PMNode): string {
  const src = (node.attrs?.src as string) ?? ''
  const alt = (node.attrs?.alt as string) ?? ''
  const title = node.attrs?.title ? ` "${node.attrs.title}"` : ''
  const width = positiveImageDimension(node.attrs?.width)
  const height = positiveImageDimension(node.attrs?.height)
  const size = width && height ? `{: width="${width}" height="${height}" }` : ''

  return `![${alt}](${src}${title})${size}`
}

function positiveImageDimension(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN

  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed)
}

function serializeInline(nodes: PMNode[]): string {
  return nodes.map((n) => serializeInlineNode(n)).join('')
}

function serializeInlineNode(node: PMNode): string {
  if (node.type === 'hardBreak') return '  \n'
  if (node.type === 'image') return serializeImage(node)
  if (node.type !== 'text') return serializeInline(node.content ?? [])

  let text = node.text ?? ''
  const marks = node.marks ?? []

  // 마크 적용 순서: code(가장 안쪽) → 강조/색/밑줄/하이라이트 → 링크(가장 바깥)
  // code 안에서는 다른 마크의 마크다운 기호를 적용하지 않는다.
  const hasCode = marks.some((m) => m.type === 'code')
  if (hasCode) {
    text = '`' + text + '`'
  } else {
    if (marks.some((m) => m.type === 'bold')) text = '**' + text + '**'
    if (marks.some((m) => m.type === 'italic')) text = '*' + text + '*'
    if (marks.some((m) => m.type === 'strike')) text = '~~' + text + '~~'

    // 하이라이트(형광펜): 색 없으면 ==…== (사실상 표준), 색 있으면 <mark style>
    const hl = marks.find((m) => m.type === 'highlight')
    if (hl) {
      const color = (hl.attrs?.color as string) || ''
      text = color ? `<mark style="background-color:${color}">${text}</mark>` : `==${text}==`
    }
    // 밑줄: 마크다운 표준 문법 없음 → <u> HTML 로 보존
    if (marks.some((m) => m.type === 'underline')) text = `<u>${text}</u>`
    // 글자색: TextStyle(color) → <span style="color:…">
    const ts = marks.find((m) => m.type === 'textStyle' && m.attrs?.color)
    if (ts) text = `<span style="color:${ts.attrs!.color}">${text}</span>`
  }
  const link = marks.find((m) => m.type === 'link')
  if (link) {
    const href = (link.attrs?.href as string) ?? ''
    const title = link.attrs?.title ? ` "${link.attrs.title}"` : ''
    text = `[${text}](${href}${title})`
  }
  return text
}

function clampLevel(level: unknown): number {
  const n = typeof level === 'number' ? level : 1
  return Math.min(6, Math.max(1, n))
}

// ═══════════════════════════════════════════════════════════════
// 2. Markdown → TipTap JSON (파싱)
//    markdown-it 토큰 스트림을 ProseMirror doc JSON으로 변환.
// ═══════════════════════════════════════════════════════════════

// html:true → 인라인 HTML(<u>/<mark>/<span style=color>)을 토큰으로 받아 마크로 환원.
// 우리가 직렬화 때 만든 제한된 태그만 처리하고, 그 외 HTML은 텍스트로 보존한다.
const md = new MarkdownIt({ html: true, linkify: true, breaks: false })

export function markdownToJson(markdown: string): PMDoc {
  const tokens = md.parse(markdown ?? '', {})
  const content = parseBlocks(tokens, 0, tokens.length)
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

type Token = ReturnType<MarkdownIt['parse']>[number]

function parseBlocks(tokens: Token[], start: number, end: number): PMNode[] {
  const nodes: PMNode[] = []
  let i = start
  while (i < end) {
    const t = tokens[i]
    switch (t.type) {
      case 'heading_open': {
        const level = Number(t.tag.slice(1)) || 1
        const inlineTok = tokens[i + 1]
        nodes.push({
          type: 'heading',
          attrs: { level },
          content: parseInline(inlineTok),
        })
        i += 3 // open, inline, close
        break
      }
      case 'paragraph_open': {
        const inlineTok = tokens[i + 1]
        const children = parseInline(inlineTok)
        // 이미지만 단독인 문단은 image 블록으로 승격
        if (children.length === 1 && children[0].type === 'image') {
          nodes.push(children[0])
        } else {
          nodes.push({ type: 'paragraph', content: children.length ? children : undefined })
        }
        i += 3
        break
      }
      case 'fence':
      case 'code_block': {
        nodes.push({
          type: 'codeBlock',
          attrs: { language: (t.info || '').trim() || null },
          content: t.content ? [{ type: 'text', text: t.content.replace(/\n$/, '') }] : undefined,
        })
        i += 1
        break
      }
      case 'blockquote_open': {
        const close = findClose(tokens, i, 'blockquote_open', 'blockquote_close')
        nodes.push({ type: 'blockquote', content: parseBlocks(tokens, i + 1, close) })
        i = close + 1
        break
      }
      case 'bullet_list_open': {
        const close = findClose(tokens, i, 'bullet_list_open', 'bullet_list_close')
        nodes.push(parseList(tokens, i, close, false))
        i = close + 1
        break
      }
      case 'ordered_list_open': {
        const close = findClose(tokens, i, 'ordered_list_open', 'ordered_list_close')
        nodes.push(parseList(tokens, i, close, true))
        i = close + 1
        break
      }
      case 'hr':
        nodes.push({ type: 'horizontalRule' })
        i += 1
        break
      default:
        i += 1
    }
  }
  return nodes
}

function parseList(tokens: Token[], openIdx: number, closeIdx: number, ordered: boolean): PMNode {
  const items: PMNode[] = []
  let i = openIdx + 1
  while (i < closeIdx) {
    if (tokens[i].type === 'list_item_open') {
      const itemClose = findClose(tokens, i, 'list_item_open', 'list_item_close')
      const inner = parseBlocks(tokens, i + 1, itemClose)
      // 태스크 리스트 감지: 첫 문단 텍스트가 [ ] / [x] 로 시작
      const task = detectTask(inner)
      if (task) {
        items.push(task)
      } else {
        items.push({ type: 'listItem', content: inner })
      }
      i = itemClose + 1
    } else {
      i += 1
    }
  }
  const allTask = items.length > 0 && items.every((it) => it.type === 'taskItem')
  if (allTask) return { type: 'taskList', content: items }
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    attrs: ordered ? { start: 1 } : undefined,
    content: items,
  }
}

function detectTask(inner: PMNode[]): PMNode | null {
  const first = inner[0]
  if (!first || first.type !== 'paragraph' || !first.content?.length) return null
  const firstText = first.content[0]
  if (firstText.type !== 'text' || !firstText.text) return null
  const m = firstText.text.match(/^\[([ xX])\]\s?(.*)$/s)
  if (!m) return null
  const checked = m[1].toLowerCase() === 'x'
  const newFirst: PMNode = {
    ...firstText,
    text: m[2],
  }
  const newPara: PMNode = {
    type: 'paragraph',
    content: [newFirst, ...first.content.slice(1)],
  }
  return {
    type: 'taskItem',
    attrs: { checked },
    content: [newPara, ...inner.slice(1)],
  }
}

function findClose(tokens: Token[], openIdx: number, openType: string, closeType: string): number {
  let depth = 0
  for (let i = openIdx; i < tokens.length; i++) {
    if (tokens[i].type === openType) depth++
    else if (tokens[i].type === closeType) {
      depth--
      if (depth === 0) return i
    }
  }
  return tokens.length
}

// ── 인라인 토큰 → 텍스트 노드 + 마크 ──────────────────────────
function parseInline(inlineTok: Token | undefined): PMNode[] {
  if (!inlineTok || !inlineTok.children) return []
  const out: PMNode[] = []
  const markStack: PMMark[] = []
  const imageAttrs = parseChirpyImageAttrs(inlineTok.content)

  for (const child of inlineTok.children) {
    switch (child.type) {
      case 'text': {
        if (!child.content) break

        // markdown-it은 Chirpy 이미지 속성 문법을 일반 텍스트로 파싱한다.
        // 이미지 속성 부분은 이미지 노드 attrs로 옮기고 본문 텍스트에서는 제거한다.
        const text = imageAttrs ? child.content.replace(imageAttrs.raw, '') : child.content

        if (text) pushTextWithHighlight(out, text, markStack)
        break
      }
      case 'html_inline': {
        // 우리가 만든 제한된 인라인 HTML만 마크로 환원. 그 외는 텍스트로 보존.
        const tag = child.content
        const m = parseInlineHtmlTag(tag)
        if (m === 'u_open') markStack.push({ type: 'underline' })
        else if (m === 'u_close') popMark(markStack, 'underline')
        else if (m !== null && typeof m === 'object' && m.kind === 'mark_open')
          markStack.push({ type: 'highlight', attrs: m.color ? { color: m.color } : undefined })
        else if (m === 'mark_close') popMark(markStack, 'highlight')
        else if (m !== null && typeof m === 'object' && m.kind === 'span_open')
          markStack.push({ type: 'textStyle', attrs: { color: m.color } })
        else if (m === 'span_close') popMark(markStack, 'textStyle')
        else if (child.content)
          out.push({ type: 'text', text: child.content, marks: cloneMarks(markStack) })
        break
      }
      case 'strong_open':
        markStack.push({ type: 'bold' })
        break
      case 'strong_close':
        popMark(markStack, 'bold')
        break
      case 'em_open':
        markStack.push({ type: 'italic' })
        break
      case 'em_close':
        popMark(markStack, 'italic')
        break
      case 's_open':
        markStack.push({ type: 'strike' })
        break
      case 's_close':
        popMark(markStack, 'strike')
        break
      case 'code_inline':
        out.push({
          type: 'text',
          text: child.content,
          marks: [...cloneMarks(markStack), { type: 'code' }],
        })
        break
      case 'link_open': {
        const href = getAttr(child, 'href')
        const title = getAttr(child, 'title')
        markStack.push({ type: 'link', attrs: { href, ...(title ? { title } : {}) } })
        break
      }
      case 'link_close':
        popMark(markStack, 'link')
        break
      case 'softbreak':
      case 'hardbreak':
        out.push({ type: 'hardBreak' })
        break
      case 'image': {
        const src = getAttr(child, 'src')
        const alt = child.children?.map((c) => c.content).join('') ?? child.content ?? ''
        const title = getAttr(child, 'title')

        out.push({
          type: 'image',
          attrs: {
            src,
            alt,
            ...(title ? { title } : {}),
            ...(imageAttrs
              ? {
                  width: imageAttrs.width,
                  height: imageAttrs.height,
                }
              : {}),
          },
        })
        break
      }
      default:
        if (child.content)
          out.push({ type: 'text', text: child.content, marks: cloneMarks(markStack) })
    }
  }
  // 빈 marks 배열 제거(정규화)
  return out.map((n) =>
    n.marks && n.marks.length === 0 ? { type: n.type, text: n.text, attrs: n.attrs } : n,
  )
}

interface ChirpyImageAttrs {
  raw: string
  width: number
  height: number
}

function parseChirpyImageAttrs(content: string): ChirpyImageAttrs | null {
  const match = /\{:\s*width\s*=\s*"(\d+)"\s+height\s*=\s*"(\d+)"\s*\}\s*$/.exec(content)

  if (!match) return null

  const width = positiveImageDimension(match[1])
  const height = positiveImageDimension(match[2])

  if (!width || !height) return null

  return {
    raw: match[0],
    width,
    height,
  }
}

// ==text== → highlight 마크로 분해해서 out 에 push. (markdown-it 기본 토큰 아님)
function pushTextWithHighlight(out: PMNode[], content: string, markStack: PMMark[]): void {
  const re = /==([^=]+)==/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      out.push({ type: 'text', text: content.slice(last, m.index), marks: cloneMarks(markStack) })
    }
    out.push({ type: 'text', text: m[1], marks: [...cloneMarks(markStack), { type: 'highlight' }] })
    last = re.lastIndex
  }
  if (last < content.length) {
    out.push({ type: 'text', text: content.slice(last), marks: cloneMarks(markStack) })
  }
}

// 제한된 인라인 HTML 태그 해석. 우리가 직렬화한 형태만 인식.
type HtmlTag =
  | 'u_open'
  | 'u_close'
  | 'mark_close'
  | 'span_close'
  | { kind: 'mark_open'; color?: string }
  | { kind: 'span_open'; color: string }
  | null
function parseInlineHtmlTag(tag: string): HtmlTag {
  const t = tag.trim().toLowerCase()
  if (t === '<u>') return 'u_open'
  if (t === '</u>') return 'u_close'
  if (t === '</mark>') return 'mark_close'
  if (t === '</span>') return 'span_close'
  if (t.startsWith('<mark')) {
    const c = /background-color\s*:\s*([^;"')]+)/.exec(tag)
    return { kind: 'mark_open', color: c ? c[1].trim() : undefined }
  }
  if (t.startsWith('<span')) {
    const c = /color\s*:\s*([^;"')]+)/.exec(tag)
    return { kind: 'span_open', color: c ? c[1].trim() : '' }
  }
  return null
}

function cloneMarks(stack: PMMark[]): PMMark[] {
  return stack.map((m) => ({ type: m.type, ...(m.attrs ? { attrs: { ...m.attrs } } : {}) }))
}
function popMark(stack: PMMark[], type: string): void {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].type === type) {
      stack.splice(i, 1)
      return
    }
  }
}
function getAttr(token: Token, name: string): string {
  const attrs = token.attrs as [string, string][] | null
  if (!attrs) return ''
  const found = attrs.find((a) => a[0] === name)
  return found ? found[1] : ''
}
