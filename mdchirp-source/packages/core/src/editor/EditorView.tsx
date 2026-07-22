// EditorView.tsx — mdchirp 에디터 메인 컴포넌트.
//
// 경계(SPEC §2): 저장/네트워크/발행/업로드/워터마크/충돌해소를 하지 않는다.
// 오직 props로 받고 events로 쏜다. 순수 컴포넌트.
//
// SPEC: packages/core/src/editor/SPEC.md §3

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import type { Post, PostPatch, SlugSuggester } from '@mdchirp/shared'
import { baseExtensions } from './extensions/base.js'
import type { RichImageEditTarget } from './extensions/ResizableImageView.js'
import { jsonToMarkdown, markdownToJson, type PMDoc } from './extensions/markdown.js'
import { resolveMediaSrc, type MediaUrlResolver } from './mediaUrl.js'

export type { RichImageEditTarget } from './extensions/ResizableImageView.js'

export interface EditorProps {
  post: Post
  readOnly?: boolean

  /**
   * 영문 slug 제안 어댑터. SplitView 의 프론트매터 패널이 사용한다.
   * (EditorView 본체는 쓰지 않고 통로 역할만 — 프론트매터는 SplitView 소유.)
   * 없으면 slug 제안 버튼 비활성.
   */
  slugSuggester?: SlugSuggester

  /**
   * 외부(MD 칸)에서 밀어넣는 마크다운. 값이 바뀌면 에디터 문서를 이걸로 교체한다.
   * 양방향 분할뷰에서 SplitView가 MD 편집 결과를 리치로 반영할 때 사용.
   * 에코 루프 방지: 에디터가 방금 만들어낸 MD와 같으면 무시한다.
   */
  externalMarkdown?: string

  onChange?: (patch: PostPatch) => void

  /** TipTap editor 인스턴스를 상위(SplitView)로 노출 — 공용 툴바가 명령을 보낸다. */
  onEditorReady?: (editor: Editor | null) => void
  /** 리치 에디터의 선택/트랜잭션이 바뀔 때 — 툴바 active 상태 갱신용 */
  onSelectionChange?: () => void

  /** 로컬 이미지 파일명을 NAS 조회 URL로 변환하는 플랫폼 함수. */
  mediaUrl?: MediaUrlResolver

  /**
   * 이미지 미리보기 외부 알림 통로.
   * SplitView의 MD 이미지 미리보기에서 사용하며 기존 호환성을 위해 유지한다.
   */
  onImagePreview?: (image: { src: string; alt: string }) => void

  /**
   * 리치 이미지 더블클릭 시 정확한 이미지 노드 위치와 현재 속성을 전달한다.
   * 상세 편집 모달은 SplitView가 소유한다.
   */
  onImageEdit?: (image: RichImageEditTarget) => void

  // 툴바/저장/발행은 EditorView 책임이 아니다(SplitView 가 소유).
}

const CHANGE_DEBOUNCE_MS = 400

/**
 * post.tiptapJson 이 있으면 그걸로, 없으면 markdown 을 파싱해서 초기 문서를 만든다.
 * (hasRichSource===false 인 외부 유입 글 처리)
 */
function initialContent(post: Post): PMDoc {
  if (post.tiptapJson) return post.tiptapJson as PMDoc
  return markdownToJson(post.markdown ?? '')
}

// 끝 공백/개행 차이는 같은 내용으로 취급 (불필요한 setContent 방지)
function norm(s: string): string {
  return s.replace(/\s+$/, '')
}

export function EditorView(props: EditorProps) {
  const {
    post,
    readOnly,
    externalMarkdown,
    onChange,
    onEditorReady,
    onSelectionChange,
    mediaUrl,
    onImageEdit,
  } = props
  // slugSuggester 는 SplitView 의 프론트매터 패널이 쓴다. EditorView 는 통로일 뿐 사용 안 함.
  void props.slugSuggester
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 에디터가 마지막으로 내보낸 MD. externalMarkdown 에코를 걸러내는 기준.
  const lastEmittedMdRef = useRef<string>('')

  // TipTap editor는 매 렌더마다 재생성하지 않는다.
  // 확장과 DOM 이벤트가 최신 slug/callback을 보도록 ref를 사용한다.
  const mediaContextRef = useRef({ slug: post.slug, mediaUrl })
  mediaContextRef.current = { slug: post.slug, mediaUrl }

  const imageEditRef = useRef(onImageEdit)
  imageEditRef.current = onImageEdit

  const editor = useEditor({
    editable: !readOnly,
    extensions: baseExtensions({
      placeholder: '여기에 글을 써보세요…',
      resolveImageSrc: (src) => {
        const context = mediaContextRef.current
        return resolveMediaSrc(src, context.slug, context.mediaUrl)
      },
      onImageEdit: (image) => imageEditRef.current?.(image),
    }),
    content: initialContent(post),
    onUpdate({ editor }) {
      scheduleChange(editor)
    },
  })

  // editor 인스턴스 + 선택 변경을 상위(SplitView)로 노출 → 공용 툴바가 명령/상태를 다룬다.
  useEffect(() => {
    if (!editor) return
    onEditorReady?.(editor)
    const notify = () => onSelectionChange?.()
    editor.on('selectionUpdate', notify)
    editor.on('transaction', notify)
    editor.on('focus', notify)
    return () => {
      editor.off('selectionUpdate', notify)
      editor.off('transaction', notify)
      editor.off('focus', notify)
      onEditorReady?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // 외부(MD 칸) 편집을 리치로 반영. 값이 실제로 다를 때만 setContent → 커서/이력 보존.
  useEffect(() => {
    if (!editor || externalMarkdown === undefined) return
    // 에디터가 방금 만든 MD와 같으면 = 내가 만든 변경의 메아리 → 무시(루프 차단)
    if (externalMarkdown === lastEmittedMdRef.current) return
    const currentMd = jsonToMarkdown(editor.getJSON() as PMDoc)
    if (norm(externalMarkdown) === norm(currentMd)) return
    const json = markdownToJson(externalMarkdown)
    // emitUpdate:false → onUpdate(스케줄변경) 재발화 방지(또 다른 루프 차단)
    editor.commands.setContent(json as object, false)
    lastEmittedMdRef.current = externalMarkdown
  }, [editor, externalMarkdown])

  // post.id 가 바뀌면(다른 글 열기) 내용 교체
  const loadedIdRef = useRef(post.id)
  useEffect(() => {
    if (!editor) return
    if (loadedIdRef.current !== post.id) {
      loadedIdRef.current = post.id
      editor.commands.setContent(initialContent(post))
    }
  }, [editor, post.id, post])

  function scheduleChange(ed: Editor) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const json = ed.getJSON()
      const markdown = jsonToMarkdown(json as PMDoc)
      // 다음 externalMarkdown 비교 기준 갱신(내가 만든 MD의 메아리를 거르기 위함)
      lastEmittedMdRef.current = markdown
      onChange?.({
        id: post.id,
        tiptapJson: json,
        markdown,
        updatedAt: new Date().toISOString(),
      })
    }, CHANGE_DEBOUNCE_MS)
  }

  if (!editor) return null

  return (
    <div className="mdc-editor" data-readonly={readOnly ? 'true' : 'false'}>
      {!post.hasRichSource && (
        <p className="mdc-badge mdc-badge--external">
          리치 원본 없음 — 외부에서 들어온 글입니다. 저장 시 리치 원본이 생성됩니다.
        </p>
      )}
      <EditorContent editor={editor} className="mdc-editor__content" />
    </div>
  )
}
