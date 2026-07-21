// SplitView.tsx — 리치 ↔ Markdown 양방향 편집 + 공용 툴바 + 저장/발행 바.
//
// 공용 툴바(이번 단계 핵심):
//   툴바는 SplitView 가 소유하고, "지금 포커스가 어느 패널이냐"에 따라
//   RichCommands(TipTap) 또는 MarkdownCommands(textarea) 를 골라 명령을 보낸다.
//     - 리치에 포커스 → 버튼이 표현을 바꿈
//     - MD 에 포커스  → 같은 버튼이 마크다운 문법(코드)을 바꿈
//   한 줄 통합 툴바라 보기에도 깔끔.
//
// 양방향 반영 안전 규칙(기존 유지):
//   1. last-edited-side-wins  2. MD→리치 디바운스  3. 에코 루프 차단.
//
// 저장/발행도 SplitView 가 소유(리치/MD 공통). 단일 상태(markdown+tiptapJson) 조립.
// SPEC: packages/core/src/editor/SPEC.md §3, §7

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import type { Editor } from '@tiptap/react'
import type {
  Post,
  PostPatch,
  MediaFile,
  DictationProvider,
  Formatter,
  UploadMediaOptions,
  ImageFormatSetting,
} from '@mdchirp/shared'
import { EditorView, type EditorProps, type RichImageEditTarget } from '../EditorView.js'
import { Toolbar } from '../Toolbar.js'
import { Icon } from '../icons.js'
import { jsonToMarkdown, markdownToJson, type PMDoc } from '../extensions/markdown.js'
import { RichCommands } from '../commands/RichCommands.js'
import { MarkdownCommands, type MdTextareaHandle } from '../commands/MarkdownCommands.js'
import type { EditorCommands } from '../commands/types.js'
import { SuggestionPanel } from '../formatter/SuggestionPanel.js'
import type { FormatSuggestion } from '@mdchirp/shared'
import { FrontmatterPanel } from '../frontmatter/FrontmatterPanel.js'
import { toForm, toFrontmatter, type FrontmatterForm } from '../frontmatter/frontmatterForm.js'
import { Modal } from '../../ui/Modal.js'
import { findMarkdownImageAt, resolveMediaSrc, type MarkdownImageTarget } from '../mediaUrl.js'
import {
  pairedImageDimension,
  parseImageDimensions,
  resolveImageAspectRatio,
} from '../imageEdit.js'

export type ImageUploadResult =
  | { ok: true; media: MediaFile }
  | { ok: false; message: string; offline?: boolean }

type ImageFormatChoice = 'default' | ImageFormatSetting
type ImageSizeMode = 'original' | 'custom'

interface PendingImage {
  file: File
  target: EditorCommands
  previewUrl: string
  naturalWidth: number
  naturalHeight: number
  alt: string
  sizeMode: ImageSizeMode
  width: string
  height: string
  lockAspect: boolean
  imageFormat: ImageFormatChoice
}

interface EditingImage {
  pos: number
  src: string
  url: string
  alt: string
  width: string
  height: string
  naturalWidth: number
  naturalHeight: number
  lockAspect: boolean
  notice: string | null
}

export interface SplitViewProps extends EditorProps {
  /** 처음에 MD 패널을 펼칠지 */
  defaultOpen?: boolean
  dictation?: DictationProvider
  formatter?: Formatter
  onSave?: (post: Post) => void
  /** NAS 설정에 저장된 글로벌 기본 이미지 형식. */
  defaultImageFormat?: ImageFormatSetting
  /** 현재 글 저장 → 이미지 업로드 → Post.media 저장을 상위 Shell에 위임한다. */
  onUploadImage?: (
    post: Post,
    file: File,
    options?: UploadMediaOptions,
  ) => Promise<ImageUploadResult>
  /** 즉시 발행 */
  onRequestPublish?: (post: Post) => void
  /** 예약 발행 — publishAt 은 ISO 문자열 */
  onSchedulePublish?: (post: Post, publishAt: string) => void
  /** 발행 취소 — published 글일 때만 발행 메뉴에 노출. GitHub 에서 내리되 글은 보존. */
  onUnpublish?: (post: Post) => void
  onOpenSuggestions?: () => void
  /** 저자 드롭다운 목록(상위에서 /api/authors 로드해 주입). 없으면 자유 입력만. */
  authorOptions?: { key: string; name: string }[]
}

const MD_TO_RICH_DEBOUNCE_MS = 500

export function SplitView(props: SplitViewProps) {
  const {
    defaultOpen = true,
    onChange,
    onSave,
    onUploadImage,
    defaultImageFormat = 'original',
    onRequestPublish,
    onSchedulePublish,
    onUnpublish,
    onOpenSuggestions,
    authorOptions,
    dictation,
    formatter,
    mediaUrl,
    onImagePreview,
    onImageEdit: onExternalImageEdit,
    slugSuggester,
    post,
    externalMarkdown: _ignored,
    onEditorReady: _oer,
    onSelectionChange: _osc,
    ...rest
  } = props
  // 리치/MD 패널은 각각 토글할 수 있지만 최소 하나는 항상 표시한다.
  const [richOpen, setRichOpen] = useState(true)
  const [mdOpen, setMdOpen] = useState(defaultOpen)

  // ── 프론트매터 패널 상태(SplitView 소유) ──
  const [fmOpen, setFmOpen] = useState(false)
  const [fmForm, setFmForm] = useState<FrontmatterForm>(() => toForm(post.frontmatter))
  const [slug, setSlug] = useState<string>(post.slug)

  // 현재 문서 상태(저장/발행 시 조립용 단일 출처)
  const [mdText, setMdText] = useState<string>(() => initialMarkdown(post))
  const tiptapJsonRef = useRef<object | null>(post.tiptapJson)
  const [pushToRich, setPushToRich] = useState<string | undefined>(undefined)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 서식 제안 패널 ──
  const [suggestOpen, setSuggestOpen] = useState(false)

  // 파일 선택·드래그앤드롭·클립보드는 모두 같은 업로드 흐름을 사용한다.
  const [imageUploading, setImageUploading] = useState(false)
  const [imageUploadNotice, setImageUploadNotice] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const pendingImageRef = useRef<PendingImage | null>(null)
  pendingImageRef.current = pendingImage

  // 더블클릭한 기존 리치 이미지의 상세 편집 상태.
  const [editingImage, setEditingImage] = useState<EditingImage | null>(null)

  // 원본 Markdown/TipTap src와 화면 표시 URL은 분리한다.
  const [imagePreview, setImagePreview] = useState<{
    src: string
    url: string
    alt: string
  } | null>(null)

  // ── 미래 날짜 발행 확인 모달 (date 가 미래일 때 doPublish 가 띄움) ──
  const [futureModal, setFutureModal] = useState<{ post: Post; dateStr: string } | null>(null)

  // ── slug 변경 경고 모달 (발행된 글의 slug 를 바꿔 발행하려 할 때) ──
  // 발행 시점에만 경고(로컬 편집은 자유). 확인하면 발행 진행(→ 미래날짜 검사로 이어짐).
  const [slugChangeModal, setSlugChangeModal] = useState<{ post: Post } | null>(null)

  // ── 공용 툴바: 활성 패널 + 명령 구현 ──
  const [activePanel, setActivePanel] = useState<'rich' | 'md'>('rich')
  const [toolbarRev, setToolbarRev] = useState(0) // 리치 선택 변경 → 툴바 active 갱신
  const editorRef = useRef<Editor | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const mdTextRef = useRef(mdText)
  mdTextRef.current = mdText

  // textarea 핸들 (MarkdownCommands 가 선택영역을 가공)
  const taHandle = useMemo<MdTextareaHandle>(
    () => ({
      getValue: () => taRef.current?.value ?? mdTextRef.current,
      getSelection: () => ({
        start: taRef.current?.selectionStart ?? 0,
        end: taRef.current?.selectionEnd ?? 0,
      }),
      apply: (next, selStart, selEnd) => {
        handleMdInput(next)
        // DOM 반영 후 선택 복원
        requestAnimationFrame(() => {
          const ta = taRef.current
          if (!ta) return
          ta.focus()
          ta.setSelectionRange(selStart, selEnd)
        })
      },
      focus: () => taRef.current?.focus(),
    }),
    [],
  )

  // 활성 패널에 맞는 명령 구현 선택 (sync 어댑터 패턴과 동일)
  const commands: EditorCommands = useMemo(() => {
    if (activePanel === 'md' || !editorRef.current) return new MarkdownCommands(taHandle)
    return new RichCommands(editorRef.current)
    // toolbarRev 가 바뀌면 RichCommands 의 isActive 재계산을 위해 새 인스턴스
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel, toolbarRev, taHandle])

  function firstImage(files: FileList): File | null {
    return Array.from(files).find((file) => file.type.startsWith('image/')) ?? null
  }

  function hasImageItem(items: DataTransferItemList): boolean {
    return Array.from(items).some((item) => item.kind === 'file' && item.type.startsWith('image/'))
  }

  function closePendingImage() {
    if (imageUploading) return

    setPendingImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return null
    })
  }

  function beginImageInsert(file: File, target: EditorCommands) {
    if (imageUploading) return

    if (!onUploadImage) {
      setImageUploadNotice('이 환경에서는 로컬 이미지 업로드를 사용할 수 없습니다.')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    const alt = file.name.replace(/\.[^.]+$/, '')

    setPendingImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)

      return {
        file,
        target,
        previewUrl,
        naturalWidth: 0,
        naturalHeight: 0,
        alt,
        sizeMode: 'original',
        width: '',
        height: '',
        lockAspect: true,
        imageFormat: 'default',
      }
    })

    const image = new Image()

    image.onload = () => {
      setPendingImage((current) => {
        if (!current || current.previewUrl !== previewUrl) return current

        return {
          ...current,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        }
      })
    }

    image.onerror = () => {
      setImageUploadNotice('선택한 이미지의 미리보기를 불러오지 못했습니다.')
    }

    image.src = previewUrl
  }

  function selectImageSizeMode(sizeMode: ImageSizeMode) {
    setPendingImage((current) => {
      if (!current) return current

      if (sizeMode === 'original') {
        return {
          ...current,
          sizeMode,
          width: '',
          height: '',
        }
      }

      return {
        ...current,
        sizeMode,
        width: current.width || (current.naturalWidth ? String(current.naturalWidth) : ''),
        height: current.height || (current.naturalHeight ? String(current.naturalHeight) : ''),
      }
    })
  }

  function updatePendingWidth(value: string) {
    setPendingImage((current) => {
      if (!current) return current

      const width = value.replace(/[^\d]/g, '')
      if (!current.lockAspect || !current.naturalWidth || !current.naturalHeight || !width) {
        return { ...current, width }
      }

      const height = Math.max(
        1,
        Math.round((Number(width) * current.naturalHeight) / current.naturalWidth),
      )

      return {
        ...current,
        width,
        height: String(height),
      }
    })
  }

  function updatePendingHeight(value: string) {
    setPendingImage((current) => {
      if (!current) return current

      const height = value.replace(/[^\d]/g, '')
      if (!current.lockAspect || !current.naturalWidth || !current.naturalHeight || !height) {
        return { ...current, height }
      }

      const width = Math.max(
        1,
        Math.round((Number(height) * current.naturalWidth) / current.naturalHeight),
      )

      return {
        ...current,
        width: String(width),
        height,
      }
    })
  }

  async function uploadImage(
    file: File,
    target: EditorCommands,
    settings: {
      alt: string
      width?: number
      height?: number
      imageFormat: ImageFormatChoice
    },
  ): Promise<boolean> {
    if (imageUploading) return false

    if (!onUploadImage) {
      setImageUploadNotice('이 환경에서는 로컬 이미지 업로드를 사용할 수 없습니다.')
      return false
    }

    setImageUploading(true)
    setImageUploadNotice(`업로드 중 — ${file.name}`)

    try {
      const options: UploadMediaOptions | undefined =
        settings.imageFormat === 'default' ? undefined : { imageFormat: settings.imageFormat }

      const result = await onUploadImage(buildPost(), file, options)

      if (!result.ok) {
        setImageUploadNotice(result.message)
        return false
      }

      // 서버가 확정한 안전한 로컬 파일명만 본문에 삽입한다.
      target.insertImage({
        src: result.media.filename,
        alt: settings.alt,
        width: settings.width,
        height: settings.height,
      })

      setImageUploadNotice(`첨부 완료 — ${result.media.filename}`)
      return true
    } catch {
      setImageUploadNotice('이미지 첨부 중 예상하지 못한 오류가 발생했습니다.')
      return false
    } finally {
      setImageUploading(false)
    }
  }

  async function confirmImageInsert() {
    const pending = pendingImageRef.current
    if (!pending || imageUploading) return

    let width: number | undefined
    let height: number | undefined

    if (pending.sizeMode === 'custom') {
      width = Number(pending.width)
      height = Number(pending.height)

      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        setImageUploadNotice('사용자 지정 크기의 너비와 높이를 입력해 주세요.')
        return
      }

      width = Math.round(width)
      height = Math.round(height)
    }

    const success = await uploadImage(pending.file, pending.target, {
      alt: pending.alt.trim(),
      width,
      height,
      imageFormat: pending.imageFormat,
    })

    if (!success) return

    URL.revokeObjectURL(pending.previewUrl)
    setPendingImage(null)
  }

  function handleImageDrop(event: DragEvent<HTMLElement>, target: EditorCommands) {
    const file = firstImage(event.dataTransfer.files)
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    beginImageInsert(file, target)
  }

  function handleImagePaste(event: ClipboardEvent<HTMLElement>, target: EditorCommands) {
    const file = firstImage(event.clipboardData.files)
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    beginImageInsert(file, target)
  }

  function openImagePreview(image: MarkdownImageTarget) {
    const preview = {
      src: image.src,
      url: resolveMediaSrc(image.src, post.slug, mediaUrl),
      alt: image.alt,
    }
    setImagePreview(preview)
    onImagePreview?.(image)
  }

  function handleMarkdownImageClick(textarea: HTMLTextAreaElement) {
    const image = findMarkdownImageAt(textarea.value, textarea.selectionStart)
    if (image) openImagePreview(image)
  }

  function openRichImageEditor(image: RichImageEditTarget) {
    const url = resolveMediaSrc(image.src, post.slug, mediaUrl)

    setActivePanel('rich')
    setEditingImage({
      pos: image.pos,
      src: image.src,
      url,
      alt: image.alt,
      width: image.width === null ? '' : String(image.width),
      height: image.height === null ? '' : String(image.height),
      naturalWidth: 0,
      naturalHeight: 0,
      lockAspect: true,
      notice: null,
    })

    onExternalImageEdit?.(image)

    const preview = new Image()

    preview.onload = () => {
      setEditingImage((current) => {
        if (!current || current.pos !== image.pos || current.src !== image.src) return current

        return {
          ...current,
          naturalWidth: preview.naturalWidth,
          naturalHeight: preview.naturalHeight,
        }
      })
    }

    preview.onerror = () => {
      setEditingImage((current) => {
        if (!current || current.pos !== image.pos || current.src !== image.src) return current

        return {
          ...current,
          notice: '이미지의 자연 크기를 불러오지 못했습니다. 현재 크기는 직접 입력할 수 있습니다.',
        }
      })
    }

    preview.src = url
  }

  function updateEditingWidth(value: string) {
    setEditingImage((current) => {
      if (!current) return current

      if (!current.lockAspect) {
        return {
          ...current,
          width: value,
          notice: null,
        }
      }

      const ratio = resolveImageAspectRatio(
        current.naturalWidth,
        current.naturalHeight,
        current.width,
        current.height,
      )
      const paired = pairedImageDimension('width', value, ratio)

      return {
        ...current,
        width: value,
        height: paired === null ? current.height : String(paired),
        notice: null,
      }
    })
  }

  function updateEditingHeight(value: string) {
    setEditingImage((current) => {
      if (!current) return current

      if (!current.lockAspect) {
        return {
          ...current,
          height: value,
          notice: null,
        }
      }

      const ratio = resolveImageAspectRatio(
        current.naturalWidth,
        current.naturalHeight,
        current.width,
        current.height,
      )
      const paired = pairedImageDimension('height', value, ratio)

      return {
        ...current,
        width: paired === null ? current.width : String(paired),
        height: value,
        notice: null,
      }
    })
  }

  function editingImageNode(image: EditingImage) {
    const editor = editorRef.current
    if (!editor) return null

    const node = editor.state.doc.nodeAt(image.pos)

    if (!node || node.type.name !== 'image' || node.attrs.src !== image.src) {
      return null
    }

    return { editor, node }
  }

  function syncRichDocumentNow(editor: Editor) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    const json = editor.getJSON()
    const markdown = jsonToMarkdown(json as PMDoc)

    tiptapJsonRef.current = json
    mdTextRef.current = markdown
    setMdText(markdown)
    setPushToRich(undefined)

    onChange?.({
      id: post.id,
      tiptapJson: json,
      markdown,
      updatedAt: new Date().toISOString(),
    })
  }

  function applyExistingImage() {
    if (!editingImage) return

    const target = editingImageNode(editingImage)

    if (!target) {
      setEditingImage((current) =>
        current
          ? {
              ...current,
              notice: '편집할 이미지를 찾지 못했습니다. 모달을 닫고 이미지를 다시 선택해 주세요.',
            }
          : current,
      )
      return
    }

    const dimensions = parseImageDimensions(editingImage.width, editingImage.height)

    if (!dimensions.ok) {
      setEditingImage((current) =>
        current
          ? {
              ...current,
              notice: dimensions.message,
            }
          : current,
      )
      return
    }

    const transaction = target.editor.state.tr.setNodeMarkup(editingImage.pos, target.node.type, {
      ...target.node.attrs,
      alt: editingImage.alt.trim(),
      width: dimensions.width,
      height: dimensions.height,
    })

    target.editor.view.dispatch(transaction)
    syncRichDocumentNow(target.editor)
    setEditingImage(null)
  }

  function restoreExistingImageSize() {
    if (!editingImage) return

    const target = editingImageNode(editingImage)

    if (!target) {
      setEditingImage((current) =>
        current
          ? {
              ...current,
              notice: '복원할 이미지를 찾지 못했습니다. 모달을 닫고 이미지를 다시 선택해 주세요.',
            }
          : current,
      )
      return
    }

    const transaction = target.editor.state.tr.setNodeMarkup(editingImage.pos, target.node.type, {
      ...target.node.attrs,
      width: null,
      height: null,
    })

    target.editor.view.dispatch(transaction)
    syncRichDocumentNow(target.editor)
    setEditingImage(null)
  }

  function deleteExistingImage() {
    if (!editingImage) return

    const target = editingImageNode(editingImage)

    if (!target) {
      setEditingImage((current) =>
        current
          ? {
              ...current,
              notice: '삭제할 이미지를 찾지 못했습니다. 모달을 닫고 이미지를 다시 선택해 주세요.',
            }
          : current,
      )
      return
    }

    const confirmed = window.confirm(
      '이 이미지를 본문에서 삭제할까요?\n\nNAS에 업로드된 이미지 파일은 삭제되지 않습니다.',
    )

    if (!confirmed) return

    const transaction = target.editor.state.tr.delete(
      editingImage.pos,
      editingImage.pos + target.node.nodeSize,
    )

    target.editor.view.dispatch(transaction)
    syncRichDocumentNow(target.editor)
    setEditingImage(null)
  }

  // ── 리치에서 편집 → MD 칸 갱신 ──
  function handleRichChange(patch: PostPatch) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    if (patch.tiptapJson !== undefined) tiptapJsonRef.current = patch.tiptapJson
    if (patch.markdown !== undefined) {
      mdTextRef.current = patch.markdown
      setMdText(patch.markdown)
      setPushToRich(undefined) // 리치가 진실원 → MD→리치 푸시 멈춤(에코 차단)
    }
    onChange?.(patch)
  }

  // ── MD 칸에서 직접 편집 → (디바운스) 리치 갱신 ──
  function handleMdInput(next: string) {
    mdTextRef.current = next
    setMdText(next)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      setPushToRich(next)
      tiptapJsonRef.current = markdownToJson(next) as object
      onChange?.({
        id: post.id,
        markdown: next,
        tiptapJson: tiptapJsonRef.current,
        updatedAt: new Date().toISOString(),
      })
    }, MD_TO_RICH_DEBOUNCE_MS)
  }

  // ── 프론트매터 패널 편집 → 상태 갱신 + onChange 패치 ──
  // 날짜를 바꿔도 slug(=파일명)는 건드리지 않는다. 발행일은 프론트매터 date 만 갱신 →
  // 블로그에 보이는 날짜만 바뀌고 파일명은 유지(rename 불필요). slug 는 사용자가
  // slug 칸에서 직접 바꿀 때만 변경(handleSlugChange).
  function handleFmChange(next: FrontmatterForm) {
    setFmForm(next)
    onChange?.({
      id: post.id,
      title: next.title, // Post.title 과 frontmatter.title 동기화(§11)
      frontmatter: toFrontmatter(next),
      updatedAt: new Date().toISOString(),
    })
  }

  function handleSlugChange(next: string) {
    setSlug(next)
    onChange?.({ id: post.id, slug: next, updatedAt: new Date().toISOString() })
  }

  // ── 저장/발행 페이로드 조립 ──
  // frontmatter 조립 주의(§11): 폼이 관리하는 필드는 toFrontmatter 결과로 "완전히 교체"한다.
  // 예전 frontmatter 를 통째로 깔면(...post.frontmatter) 폼에서 지운 값(예: date 비움,
  // 단수 author→복수 authors 전환)이 예전 값에 덮여 살아남아 버린다.
  // 따라서 폼이 안 다루는 시스템 필드(media_subpath = 발행 빌더 소유)만 골라 보존한다.
  function buildPost(): Post {
    const fm = toFrontmatter(fmForm)

    // GitHub에서 가져온 글은 처음 열었을 때 tiptapJson이 null이다.
    // 사용자가 리치 본문을 직접 변경하지 않고 저장하더라도 현재 편집기 문서를
    // 리치 원본으로 저장할 수 있도록 저장 시점에 JSON을 확정한다.
    const currentTiptapJson =
      tiptapJsonRef.current ??
      (editorRef.current && !editorRef.current.isDestroyed
        ? (editorRef.current.getJSON() as object)
        : (markdownToJson(mdTextRef.current) as object))

    tiptapJsonRef.current = currentTiptapJson

    // 폼이 관리하지 않는 발행 빌더/시스템 필드만 보존한다.
    const preserved: Partial<typeof post.frontmatter> = {}

    if (post.frontmatter.media_subpath !== undefined) {
      preserved.media_subpath = post.frontmatter.media_subpath
    }

    return {
      ...post,
      slug,
      title: fmForm.title,
      markdown: mdTextRef.current,
      tiptapJson: currentTiptapJson,
      frontmatter: {
        ...preserved,
        ...fm,
        title: fmForm.title,
      },
      hasRichSource: true,
      updatedAt: new Date().toISOString(),
    }
  }

  function doSave() {
    onSave?.(buildPost())
  }

  function doPublish() {
    const built = buildPost()
    // 1) 발행된 글인데 slug(=파일명)를 바꿔서 발행하려 하면 경고.
    //    확인하면 slugChangeModal 이 proceedAfterSlug 로 이어 다음 검사(미래날짜)로.
    if (post.status === 'published' && slug !== post.slug) {
      setSlugChangeModal({ post: built })
      return
    }
    proceedPublish(built)
  }

  // slug 경고를 통과(또는 해당 없음)한 뒤의 발행 절차: 미래 날짜 검사 → 발행.
  function proceedPublish(built: Post) {
    const dateStr = built.frontmatter.date // "YYYY-MM-DD HH:MM:00" 또는 undefined(자동)
    // date 가 비었으면(자동) 미래 아님 → 발행 시점으로 채워짐. 값 있고 미래면 확인 모달.
    if (dateStr && isFutureDate(dateStr)) {
      setFutureModal({ post: built, dateStr })
      return
    }
    onRequestPublish?.(built)
  }

  // slug 변경 경고에서 "계속" → 모달 닫고 다음 검사(미래날짜)로 이어감.
  function confirmSlugChange() {
    if (!slugChangeModal) return
    const built = slugChangeModal.post
    setSlugChangeModal(null)
    proceedPublish(built)
  }

  // (a) 지금으로 강제변경: date 를 비워 발행 → 백엔드가 발행 시점으로 채움(청크1).
  function publishNow() {
    if (!futureModal) return
    const p = futureModal.post
    const { date: _drop, ...fmRest } = p.frontmatter
    onRequestPublish?.({ ...p, frontmatter: fmRest as typeof p.frontmatter })
    setFutureModal(null)
  }

  // (b) 미래 예약: 미래 date 유지하고 예약 경로로. publishAt 은 ISO(UTC).
  function publishScheduled() {
    if (!futureModal) return
    const p = futureModal.post
    // "YYYY-MM-DD HH:MM:00"(로컬 KST 벽시계) → ISO(UTC)
    const iso = new Date(futureModal.dateStr.replace(' ', 'T')).toISOString()
    onSchedulePublish?.(p, iso)
    setFutureModal(null)
  }

  function doSchedule(publishAt: string) {
    onSchedulePublish?.(buildPost(), publishAt)
  }

  // 발행 취소 — 확인 후 상위에 위임(GitHub 에서 내리되 글은 초안으로 보존).
  function doUnpublish() {
    const name = post.title || '(제목 없음)'
    const msg = `"${name}" 의 발행을 취소할까요?\n\nGitHub 에서 글·이미지가 제거되어 블로그에서 내려가고, 글은 초안으로 남습니다(다시 발행하면 복귀).`
    if (window.confirm(msg)) onUnpublish?.(post)
  }

  // ── 서식 제안 수락 → 본문 텍스트 교체(사람이 누른 것만 적용) ──
  function applySuggestion(s: FormatSuggestion) {
    const cur = mdTextRef.current
    // range 우선, 어긋나면 before 문자열로 fallback (본문이 그새 바뀌었을 수 있음)
    let next: string | null = null
    if (cur.slice(s.range.from, s.range.to) === s.before) {
      next = cur.slice(0, s.range.from) + s.after + cur.slice(s.range.to)
    } else {
      const idx = cur.indexOf(s.before)
      if (idx >= 0) next = cur.slice(0, idx) + s.after + cur.slice(idx + s.before.length)
    }
    if (next === null) return // 본문이 바뀌어 못 찾음 → 조용히 무시(자동 변형 금지)
    handleMdInput(next)
    setPushToRich(next)
    tiptapJsonRef.current = markdownToJson(next) as object
  }

  // 툴바 ✨ → 패널 토글 (외부 핸들러가 있으면 그것도 호출)
  function toggleSuggestions() {
    setSuggestOpen((v) => !v)
    onOpenSuggestions?.()
  }

  // 컴포넌트가 닫힐 때 남아 있는 로컬 미리보기 URL을 정리한다.
  useEffect(() => {
    return () => {
      const pending = pendingImageRef.current
      if (pending) URL.revokeObjectURL(pending.previewUrl)
    }
  }, [])

  // Cmd/Ctrl+S → 저장
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (onSave) doSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSave, mdText])

  function toggleRichPanel() {
    // 리치만 남은 상태에서는 마지막 패널을 닫지 않는다.
    if (richOpen && !mdOpen) return

    const next = !richOpen
    setRichOpen(next)

    if (next) {
      setActivePanel('rich')
    } else {
      setActivePanel('md')
    }
  }

  function toggleMarkdownPanel() {
    // MD만 남은 상태에서는 마지막 패널을 닫지 않는다.
    if (mdOpen && !richOpen) return

    const next = !mdOpen
    setMdOpen(next)

    if (next) {
      setActivePanel('md')
    } else {
      setActivePanel('rich')
    }
  }

  const panelLabel = activePanel === 'md' ? 'MD' : '리치'

  return (
    <div className={'mdc-split' + (richOpen && mdOpen ? ' is-split' : '')}>
      {/* 1행(맨 위): 문서 액션 — 저장 / 발행(즉시·예약) */}
      <div className="mdc-split__actionbar">
        <div className="mdc-split__actions">
          <button
            type="button"
            className={'mdc-btn mdc-btn--ghost' + (fmOpen ? ' is-active' : '')}
            title="프론트매터(글 설정) 펼치기/접기"
            aria-expanded={fmOpen}
            onClick={() => setFmOpen((v) => !v)}
          >
            <span>⚙ 필드 {fmOpen ? '▴' : '▾'}</span>
          </button>
          {onSave && (
            <button
              type="button"
              className="mdc-btn mdc-btn--ghost"
              title="저장 (Ctrl/Cmd+S)"
              onClick={doSave}
            >
              <Icon.save />
              <span>저장</span>
            </button>
          )}
          {(onRequestPublish || onSchedulePublish) && (
            <PublishMenu
              canPublish={!!onRequestPublish}
              canSchedule={!!onSchedulePublish}
              canUnpublish={!!onUnpublish && post.status === 'published'}
              onPublishNow={doPublish}
              onSchedule={doSchedule}
              onUnpublish={doUnpublish}
            />
          )}
        </div>
      </div>

      {/* 액션 바 아래: 프론트매터(글 설정) 접이식 가로 영역 — SplitView 소유, 한 번만 표시 */}
      {fmOpen && (
        <FrontmatterPanel
          form={fmForm}
          onChange={handleFmChange}
          slug={slug}
          onSlugChange={handleSlugChange}
          slugSuggester={slugSuggester}
          authorOptions={authorOptions}
        />
      )}

      {/* 2행(에디터 바로 위): 리치/MD 패널 토글 + 공용 툴바 */}
      <div className="mdc-split__bar">
        <div className="mdc-split__paneltoggles" role="group" aria-label="에디터 패널 표시">
          <button
            type="button"
            className={'mdc-split__toggle' + (richOpen ? ' is-active' : '')}
            aria-pressed={richOpen}
            disabled={richOpen && !mdOpen}
            title={
              richOpen && !mdOpen ? '최소 한 패널은 열려 있어야 합니다.' : '리치 편집기 표시/숨기기'
            }
            onClick={toggleRichPanel}
          >
            리치
          </button>
          <span className="mdc-split__toggle-separator" aria-hidden="true">
            |
          </span>
          <button
            type="button"
            className={'mdc-split__toggle' + (mdOpen ? ' is-active' : '')}
            aria-pressed={mdOpen}
            disabled={mdOpen && !richOpen}
            title={
              mdOpen && !richOpen
                ? '최소 한 패널은 열려 있어야 합니다.'
                : 'Markdown 편집기 표시/숨기기'
            }
            onClick={toggleMarkdownPanel}
          >
            MD
          </button>
        </div>
        <div className="mdc-split__tbwrap">
          <Toolbar
            commands={commands}
            revision={toolbarRev}
            dictation={dictation}
            formatter={formatter}
            imageUploading={imageUploading}
            onSelectImage={(file) => beginImageInsert(file, commands)}
            onOpenSuggestions={toggleSuggestions}
          />
          <span className="mdc-split__activehint" title="툴바가 적용되는 패널">
            적용 대상: <b>{panelLabel}</b>
          </span>
          {imageUploadNotice && (
            <span
              className={'mdc-split__uploadnotice' + (imageUploading ? ' is-uploading' : '')}
              role="status"
            >
              {imageUploading ? '🚧 ' : ''}
              {imageUploadNotice}
            </span>
          )}
        </div>
      </div>

      <div className="mdc-split__panes">
        {richOpen && (
          <div
            className={'mdc-split__rich' + (activePanel === 'rich' ? ' is-active-panel' : '')}
            onFocusCapture={() => setActivePanel('rich')}
            onDragOverCapture={(event) => {
              if (hasImageItem(event.dataTransfer.items)) event.preventDefault()
            }}
            onDropCapture={(event) => {
              setActivePanel('rich')
              const target = editorRef.current ? new RichCommands(editorRef.current) : commands
              handleImageDrop(event, target)
            }}
            onPasteCapture={(event) => {
              setActivePanel('rich')
              const target = editorRef.current ? new RichCommands(editorRef.current) : commands
              handleImagePaste(event, target)
            }}
          >
            <EditorView
              post={post}
              externalMarkdown={pushToRich}
              mediaUrl={mediaUrl}
              onImageEdit={openRichImageEditor}
              onChange={handleRichChange}
              onEditorReady={(ed) => {
                editorRef.current = ed
                setToolbarRev((n) => n + 1)
              }}
              onSelectionChange={() => setToolbarRev((n) => n + 1)}
              {...rest}
            />
          </div>
        )}

        {mdOpen && (
          <div className={'mdc-split__md' + (activePanel === 'md' ? ' is-active-panel' : '')}>
            <div className="mdc-split__md-label">Markdown (편집 가능 · 발행 형식)</div>
            <textarea
              ref={taRef}
              className="mdc-split__md-code"
              value={mdText}
              spellCheck={false}
              onFocus={() => setActivePanel('md')}
              onSelect={() => {
                if (activePanel === 'md') setToolbarRev((n) => n + 1)
              }}
              onChange={(e) => handleMdInput(e.target.value)}
              onClick={(event) => handleMarkdownImageClick(event.currentTarget)}
              onDragOver={(event) => {
                if (hasImageItem(event.dataTransfer.items)) event.preventDefault()
              }}
              onDrop={(event) => {
                setActivePanel('md')
                handleImageDrop(event, new MarkdownCommands(taHandle))
              }}
              onPaste={(event) => {
                setActivePanel('md')
                handleImagePaste(event, new MarkdownCommands(taHandle))
              }}
              aria-label="Markdown 편집"
            />
          </div>
        )}

        {suggestOpen && (
          <SuggestionPanel
            formatter={formatter}
            markdown={mdText}
            onApply={applySuggestion}
            onClose={() => setSuggestOpen(false)}
          />
        )}
      </div>

      <Modal
        open={!!editingImage}
        onClose={() => setEditingImage(null)}
        title="이미지 상세 편집"
        footer={
          <>
            <button
              type="button"
              className="mdc-btn mdc-btn--ghost mdc-image-edit__delete"
              onClick={deleteExistingImage}
            >
              본문에서 삭제
            </button>
            <button
              type="button"
              className="mdc-btn mdc-btn--ghost"
              onClick={() => setEditingImage(null)}
            >
              취소
            </button>
            <button
              type="button"
              className="mdc-btn mdc-btn--ghost"
              onClick={restoreExistingImageSize}
            >
              원본 크기 복원
            </button>
            <button type="button" className="mdc-btn mdc-btn--primary" onClick={applyExistingImage}>
              적용
            </button>
          </>
        }
      >
        {editingImage && (
          <div className="mdc-image-insert mdc-image-edit">
            <div className="mdc-image-insert__preview">
              <img src={editingImage.url} alt={editingImage.alt} />
            </div>

            <div className="mdc-image-insert__info">
              <strong>{editingImage.src}</strong>
              <span>
                {editingImage.naturalWidth > 0 && editingImage.naturalHeight > 0
                  ? `원본 ${editingImage.naturalWidth} × ${editingImage.naturalHeight}px`
                  : '원본 크기 확인 중…'}
              </span>
            </div>

            <label className="mdc-image-insert__field">
              <span>대체 텍스트(alt)</span>
              <input
                type="text"
                value={editingImage.alt}
                onChange={(event) =>
                  setEditingImage((current) =>
                    current
                      ? {
                          ...current,
                          alt: event.target.value,
                          notice: null,
                        }
                      : current,
                  )
                }
                placeholder="이미지 설명"
              />
            </label>

            <fieldset className="mdc-image-insert__group">
              <legend>표시 크기</legend>

              <div className="mdc-image-insert__size">
                <label>
                  <span>너비</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editingImage.width}
                    onChange={(event) => updateEditingWidth(event.target.value)}
                    placeholder="원본"
                  />
                  <em>px</em>
                </label>

                <span aria-hidden="true">×</span>

                <label>
                  <span>높이</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editingImage.height}
                    onChange={(event) => updateEditingHeight(event.target.value)}
                    placeholder="원본"
                  />
                  <em>px</em>
                </label>
              </div>

              <label>
                <input
                  type="checkbox"
                  checked={editingImage.lockAspect}
                  onChange={(event) =>
                    setEditingImage((current) =>
                      current
                        ? {
                            ...current,
                            lockAspect: event.target.checked,
                            notice: null,
                          }
                        : current,
                    )
                  }
                />
                원본 비율 유지
              </label>
            </fieldset>

            <p className="mdc-image-edit__help">
              크기를 직접 지정하려면 너비와 높이를 모두 입력하세요. 원본 크기 복원은 본문의 크기
              속성만 제거하며 NAS 파일은 변경하지 않습니다.
            </p>

            {editingImage.notice && (
              <div className="mdc-image-insert__notice" role="alert">
                {editingImage.notice}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!pendingImage}
        onClose={closePendingImage}
        title="이미지 첨부 설정"
        footer={
          <>
            <button
              type="button"
              className="mdc-btn mdc-btn--ghost"
              disabled={imageUploading}
              onClick={closePendingImage}
            >
              취소
            </button>
            <button
              type="button"
              className="mdc-btn mdc-btn--primary"
              disabled={imageUploading}
              onClick={() => void confirmImageInsert()}
            >
              {imageUploading ? '업로드 중…' : '업로드 후 삽입'}
            </button>
          </>
        }
      >
        {pendingImage && (
          <div className="mdc-image-insert">
            <div className="mdc-image-insert__preview">
              <img src={pendingImage.previewUrl} alt="" />
            </div>

            <div className="mdc-image-insert__info">
              <strong>{pendingImage.file.name}</strong>
              <span>
                {(pendingImage.file.size / 1024).toFixed(1)} KiB
                {pendingImage.naturalWidth > 0 && pendingImage.naturalHeight > 0
                  ? ` · ${pendingImage.naturalWidth} × ${pendingImage.naturalHeight}px`
                  : ' · 크기 확인 중…'}
              </span>
            </div>

            <label className="mdc-image-insert__field">
              <span>대체 텍스트(alt)</span>
              <input
                type="text"
                value={pendingImage.alt}
                disabled={imageUploading}
                onChange={(event) =>
                  setPendingImage((current) =>
                    current ? { ...current, alt: event.target.value } : current,
                  )
                }
                placeholder="이미지 설명"
              />
            </label>

            <fieldset className="mdc-image-insert__group">
              <legend>표시 크기</legend>

              <label>
                <input
                  type="radio"
                  name="image-size-mode"
                  checked={pendingImage.sizeMode === 'original'}
                  disabled={imageUploading}
                  onChange={() => selectImageSizeMode('original')}
                />
                자동 크기
              </label>

              <label>
                <input
                  type="radio"
                  name="image-size-mode"
                  checked={pendingImage.sizeMode === 'custom'}
                  disabled={imageUploading}
                  onChange={() => selectImageSizeMode('custom')}
                />
                사용자 지정
              </label>

              {pendingImage.sizeMode === 'custom' && (
                <div className="mdc-image-insert__size">
                  <label>
                    <span>너비</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={pendingImage.width}
                      disabled={imageUploading}
                      onChange={(event) => updatePendingWidth(event.target.value)}
                    />
                    <em>px</em>
                  </label>

                  <span aria-hidden="true">×</span>

                  <label>
                    <span>높이</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={pendingImage.height}
                      disabled={imageUploading}
                      onChange={(event) => updatePendingHeight(event.target.value)}
                    />
                    <em>px</em>
                  </label>
                </div>
              )}

              {pendingImage.sizeMode === 'custom' && (
                <label>
                  <input
                    type="checkbox"
                    checked={pendingImage.lockAspect}
                    disabled={imageUploading}
                    onChange={(event) =>
                      setPendingImage((current) =>
                        current ? { ...current, lockAspect: event.target.checked } : current,
                      )
                    }
                  />
                  원본 비율 유지
                </label>
              )}
            </fieldset>

            <label className="mdc-image-insert__field">
              <span>저장 형식</span>
              <select
                value={pendingImage.imageFormat}
                disabled={imageUploading}
                onChange={(event) =>
                  setPendingImage((current) =>
                    current
                      ? {
                          ...current,
                          imageFormat: event.target.value as ImageFormatChoice,
                        }
                      : current,
                  )
                }
              >
                <option value="default">
                  전역 설정 사용 ({defaultImageFormat === 'webp' ? 'WebP로 변환' : '원본 유지'})
                </option>
                <option value="original">원본 유지</option>
                <option value="webp">WebP로 변환</option>
              </select>
            </label>

            {imageUploadNotice && (
              <div
                className={'mdc-image-insert__notice' + (imageUploading ? ' is-uploading' : '')}
                role="status"
              >
                {imageUploadNotice}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!slugChangeModal}
        onClose={() => setSlugChangeModal(null)}
        title="slug 변경 확인"
        footer={
          <>
            <button
              type="button"
              className="mdc-btn mdc-btn--ghost"
              onClick={() => setSlugChangeModal(null)}
            >
              취소
            </button>
            <button type="button" className="mdc-btn mdc-btn--primary" onClick={confirmSlugChange}>
              계속
            </button>
          </>
        }
      >
        slug가 변경되었습니다. 발행하면 GitHub에 <b>새 파일</b>로 올라가고 기존 발행글은 그대로
        남습니다(중복). 계속하시겠습니까?
      </Modal>

      <Modal
        open={!!futureModal}
        onClose={() => setFutureModal(null)}
        title="미래 날짜로 발행"
        footer={
          <>
            <button type="button" className="mdc-btn mdc-btn--ghost" onClick={publishNow}>
              지금 시각으로 발행
            </button>
            {onSchedulePublish && (
              <button type="button" className="mdc-btn mdc-btn--primary" onClick={publishScheduled}>
                예약 발행
              </button>
            )}
          </>
        }
      >
        발행 날짜가 <b>{futureModal?.dateStr}</b> 로 미래입니다.
        <br />
        지금 시각으로 바꿔 즉시 발행하거나, 그 시각에 예약 발행할 수 있습니다.
      </Modal>

      <Modal
        open={!!imagePreview}
        onClose={() => setImagePreview(null)}
        title={imagePreview?.alt || imagePreview?.src || '이미지 미리보기'}
        footer={
          <button
            type="button"
            className="mdc-btn mdc-btn--primary"
            onClick={() => setImagePreview(null)}
          >
            닫기
          </button>
        }
      >
        {imagePreview && (
          <div className="mdc-image-preview">
            <img
              className="mdc-image-preview__image"
              src={imagePreview.url}
              alt={imagePreview.alt}
            />
            <code className="mdc-image-preview__src">{imagePreview.src}</code>
          </div>
        )}
      </Modal>
    </div>
  )
}

function initialMarkdown(post: Post): string {
  if (post.tiptapJson) return jsonToMarkdown(post.tiptapJson as PMDoc)
  return post.markdown ?? ''
}

// date 문자열("YYYY-MM-DD HH:MM:SS" 또는 오프셋 포함)이 현재보다 미래인가.
// 오프셋 없으면 브라우저 로컬(KST 가정)로 파싱 — 청크3에서 타임존 정교화.
function isFutureDate(dateStr: string): boolean {
  const t = new Date(dateStr.replace(' ', 'T')).getTime()
  if (Number.isNaN(t)) return false // 파싱 불가 → 미래 아님(팝업 안 띄움)
  return t > Date.now()
}

// ── 발행 메뉴: 즉시 발행 / 예약 발행(날짜·시간) ──
function PublishMenu(props: {
  canPublish: boolean
  canSchedule: boolean
  canUnpublish?: boolean
  onPublishNow: () => void
  onSchedule: (publishAt: string) => void
  onUnpublish?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [when, setWhen] = useState<string>(defaultScheduleLocal())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setScheduling(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function confirmSchedule() {
    if (!when) return
    // datetime-local(로컬 시각) → ISO(UTC) 문자열
    const iso = new Date(when).toISOString()
    props.onSchedule(iso)
    setOpen(false)
    setScheduling(false)
  }

  // 발행 버튼 = 메뉴 열기. 메뉴에서 [지금 발행]/[예약 발행]을 고른다(사용자 요청).
  return (
    <div className="mdc-pub" ref={ref}>
      <button
        type="button"
        className="mdc-btn mdc-btn--primary mdc-pub__main"
        title="발행"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setScheduling(false)
          setOpen((v) => !v)
        }}
      >
        <Icon.publish />
        <span>발행</span>
        <span className="mdc-pub__caret">
          <Icon.chevron />
        </span>
      </button>

      {open && (
        <div className="mdc-pub__menu" role="menu">
          {!scheduling && (
            <>
              {props.canPublish && (
                <button
                  type="button"
                  className="mdc-mi"
                  role="menuitem"
                  onClick={() => {
                    props.onPublishNow()
                    setOpen(false)
                  }}
                >
                  <Icon.publish />
                  <span className="mdc-mi__t">지금 발행</span>
                </button>
              )}

              {props.canSchedule && (
                <button
                  type="button"
                  className="mdc-mi"
                  role="menuitem"
                  onClick={() => setScheduling(true)}
                >
                  <Icon.clock />
                  <span className="mdc-mi__t">예약 발행…</span>
                </button>
              )}

              {props.canUnpublish && (
                <button
                  type="button"
                  className="mdc-mi mdc-mi--danger"
                  role="menuitem"
                  onClick={() => {
                    props.onUnpublish?.()
                    setOpen(false)
                  }}
                >
                  <span className="mdc-mi__t">발행 취소</span>
                </button>
              )}
            </>
          )}

          {props.canSchedule && scheduling && (
            <div className="mdc-pub__sched">
              <label className="mdc-pub__schedlabel">예약 시각</label>
              <input
                type="datetime-local"
                className="mdc-pub__schedinput"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
              <div className="mdc-pub__schedrow">
                <button
                  type="button"
                  className="mdc-btn mdc-btn--ghost"
                  onClick={() => setScheduling(false)}
                >
                  ← 뒤로
                </button>
                <button
                  type="button"
                  className="mdc-btn mdc-btn--primary"
                  onClick={confirmSchedule}
                >
                  예약
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 기본 예약 시각: 1시간 뒤(로컬), datetime-local 포맷(YYYY-MM-DDTHH:mm)
function defaultScheduleLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
