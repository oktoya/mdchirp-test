// @mdchirp/core — 에디터/리스터/셸 등 UI 코어.
// 1차: 에디터 모듈.

export { EditorView } from './editor/EditorView.js'
export type { EditorProps } from './editor/EditorView.js'
export { SplitView } from './editor/split/SplitView.js'
export type { SplitViewProps } from './editor/split/SplitView.js'
export { Toolbar } from './editor/Toolbar.js'
export type { ToolbarProps } from './editor/Toolbar.js'
export { RichCommands } from './editor/commands/RichCommands.js'
export { MarkdownCommands } from './editor/commands/MarkdownCommands.js'
export type { MdTextareaHandle } from './editor/commands/MarkdownCommands.js'
export type {
  EditorCommands,
  ToggleIntent,
  ParagraphIntent,
  AlignIntent,
} from './editor/commands/types.js'
export { baseExtensions } from './editor/extensions/base.js'
export { BrowserDictation } from './editor/dictation/providers/BrowserDictation.js'
// 서식 제안 (NAS Gemini 프록시)
export { LlmFormatter } from './editor/formatter/LlmFormatter.js'
export type { LlmFormatterOptions } from './editor/formatter/LlmFormatter.js'
export { SuggestionPanel } from './editor/formatter/SuggestionPanel.js'
export type { SuggestionPanelProps } from './editor/formatter/SuggestionPanel.js'
// slug 제안 (NAS Gemini 프록시, 키 없으면 제목 정리 폴백)
export { LlmSlugSuggester, normalizeSlug } from './editor/formatter/LlmSlugSuggester.js'
export type { LlmSlugSuggesterOptions } from './editor/formatter/LlmSlugSuggester.js'
// 프론트매터 패널 (Chirpy 필드 GUI + slug 제안 버튼)
export { FrontmatterPanel } from './editor/frontmatter/FrontmatterPanel.js'
export type { FrontmatterPanelProps } from './editor/frontmatter/FrontmatterPanel.js'
export { toForm, toFrontmatter, parseCsv, joinCsv } from './editor/frontmatter/frontmatterForm.js'
export type { FrontmatterForm } from './editor/frontmatter/frontmatterForm.js'
export { jsonToMarkdown, markdownToJson } from './editor/extensions/markdown.js'
export type { PMDoc, PMNode, PMMark } from './editor/extensions/markdown.js'

// sync 레이어 (NAS 동기화)
export {
  Sync,
  NasClient,
  NasError,
  FetchHttpAdapter,
  MemoryStorageAdapter,
  COLLECTIONS,
} from './sync/index.js'
export type {
  SyncOptions,
  SaveResult,
  OpenResult,
  ConflictInfo,
  DraftEnvelope,
  QueueItem,
  HttpAdapter,
  HttpRequest,
  HttpResponse,
  LocalStorageAdapter,
  NasSaveResult,
  FetchHttpOptions,
} from './sync/index.js'

// lister 모듈 (글 목록/검색/배지)
export { Lister } from './lister/Lister.js'
export { selectPosts } from './lister/selectPosts.js'
export { statusBadge, extraBadges } from './lister/statusBadge.js'
export type { Badge, BadgeTone } from './lister/statusBadge.js'

// settings 모듈 (연결/키/정책 설정)
export { Settings } from './settings/Settings.js'
export { SECTIONS } from './settings/sections.js'
export type { SectionDef, SectionStatus } from './settings/sections.js'

// ui 공용 컴포넌트 (재사용 모달 등)
export { Modal } from './ui/Modal.js'
export type { ModalProps } from './ui/Modal.js'

// shell 모듈 (모듈 배치/전환 그릇)
export { Shell } from './shell/Shell.js'
export { adaptPlatformHttp, adaptPlatformStorage } from './shell/platformAdapters.js'
export { registerShellShortcuts } from './shell/shortcuts.js'
export type { ShellShortcutHandlers } from './shell/shortcuts.js'
