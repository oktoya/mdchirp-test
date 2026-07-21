// mdchirp 공유 타입 — 모든 모듈/앱이 참조하는 단일 진실원(Single Source of Truth).
// 정식 명세: packages/shared/SPEC.md

// ───────────────────────────────────────────────────────────
// Post — 글 한 편
// ───────────────────────────────────────────────────────────

export interface Post {
  id: string // 로컬 uuid (불변)
  slug: string // "2026-06-19-hello" (NAS폴더=_posts파일=media_subpath 공통)
  title: string

  tiptapJson: object | null // 리치 원본. null이면 외부 유입(MD만)
  markdown: string // 발행용 MD 본문
  frontmatter: ChirpyFrontmatter

  media: MediaFile[]

  status: PostStatus
  hasRichSource: boolean // (tiptapJson !== null) 과 동기화. 외부글 판별용

  // 동시 수정 / 버전 관리
  rev: number // NAS 저장마다 +1. 충돌 감지 기준
  lockedBy?: EditLock // 소프트 잠금 (안내용, 강제 아님)

  // 예약발행
  schedule?: Schedule

  createdAt: string // ISO8601
  updatedAt: string
  publishedAt?: string
  publishedRev?: number // 마지막 발행 시점의 rev. rev > publishedRev 면 "발행 후 수정"(별표)
  publishedSlug?: string // 마지막으로 실제 발행된 slug. 발행 취소 후에도 이력 판별을 위해 보존
  githubPath?: string // "_posts/2026-06-19-hello.md"

  // 수동 GitHub 새로고침에서 확인된 원격 상태.
  // 앱 시작 시에는 GitHub를 조회하지 않으므로 값이 없을 수 있다.
  remoteState?: RemotePostState
  remoteCheckedAt?: string
  issues?: PostIssue[]
}

// 편집 중 부분 갱신 (전체 Post를 매번 만들지 않기 위함)
export interface PostPatch {
  id: string
  tiptapJson?: object
  markdown?: string
  title?: string
  slug?: string // 프론트매터 패널에서 slug 편집/제안 반영 (Post.slug 대응)
  frontmatter?: Partial<ChirpyFrontmatter>
  media?: MediaFile[]
  updatedAt: string
}

// ───────────────────────────────────────────────────────────
// PostStatus — 발행 상태 3단계
// (미발행 글은 로컬/NAS 구분 없이 draft. 오프라인 대기는 status 가 아니라
//  draft envelope 의 dirty 플래그로 표시 — SPEC §? / AI_WORKFLOW §7)
// ───────────────────────────────────────────────────────────

export type PostStatus =
  | 'draft' // 미발행 (로컬·NAS 공통)
  | 'scheduled' // 예약발행 대기 (schedule.publishAt 에 발행)
  | 'published' // GitHub 발행됨

// 마지막 수동 GitHub 새로고침에서 확인한 글의 원격 상태.
// 앱 시작 시에는 원격 조회를 하지 않으므로 Post.remoteState는 없을 수 있다.
export type RemotePostState =
  | 'in_sync'
  | 'github_only'
  | 'imported'
  | 'remote_missing'
  | 'slug_diverged'
  | 'conflict'
  | 'invalid'

export type PostIssueSeverity = 'warning' | 'error'

export type PostIssueCode =
  | 'missing_post_id'
  | 'invalid_frontmatter'
  | 'duplicate_post_id'
  | 'slug_conflict'
  | 'remote_slug_diverged'
  | 'remote_post_missing'
  | 'remote_refresh_failed'
  | 'remote_media_missing'
  | 'incomplete_nas_post'

export interface PostIssue {
  code: PostIssueCode
  severity: PostIssueSeverity
  message: string
  githubPath?: string
  detail?: string
}

export interface Schedule {
  publishAt: string // ISO8601 발행 예정 시각
  shortsJobId?: string // 쇼츠 연동 슬롯 (나중)
}

// ───────────────────────────────────────────────────────────
// 동시 수정 — 소프트 잠금 (2차 구현, 모델은 지금 박음)
// ───────────────────────────────────────────────────────────

export interface EditLock {
  deviceId: string
  deviceName: string
  since: string // ISO8601
  expiresAt: string // 만료(죽은 잠금 자동 해제)
}

// 충돌 시 보관되는 히스토리 항목 (.history/ 에 저장)
export interface HistoryEntry {
  rev: number
  deviceId: string
  savedAt: string
  reason: 'conflict' | 'overwrite' | 'manual'
  snapshotPath: string // .history/2026-...-rev5-device1.json
}

// ───────────────────────────────────────────────────────────
// ChirpyFrontmatter — Chirpy 공식 필드 (공식문서 검증 완료)
// ───────────────────────────────────────────────────────────

export interface ChirpyFrontmatter {
  title: string
  mdchirp_id?: string // mdchirp Post.id. GitHub 글과 NAS 글을 안정적으로 연결하는 불변 식별자
  date?: string // "YYYY-MM-DD HH:MM:SS +0900". 비우면(키 생략) 발행 빌더가 발행 시점으로 채움
  categories?: [string?, string?] // 최대 2개 (TOP, SUB)
  tags?: string[] // 항상 소문자
  description?: string
  author?: string
  authors?: string[]
  pin?: boolean
  math?: boolean
  mermaid?: boolean
  toc?: boolean
  comments?: boolean
  image?: ChirpyImage
  media_subpath?: string // 발행 빌더가 자동 주입
  render_with_liquid?: boolean
}

export interface ChirpyImage {
  path: string
  alt?: string
  lqip?: string
}

// ───────────────────────────────────────────────────────────
// MediaFile + 미디어 정책 (정책 구현은 슬롯)
// ───────────────────────────────────────────────────────────

export interface MediaFile {
  id: string
  type: 'image' | 'video' | 'audio' | 'file'
  origin: 'local' | 'external' // 로컬 업로드 / 외부 URL
  filename: string // 파일명만. 예: sample.png
  relativePath?: string // 글의 media/ 기준 상대경로. 예: gallery/sample.png
  externalUrl?: string
  nasPath?: string // NAS 사본 경로
  gitPath?: string // 깃에 올라간 경로
  sizeBytes?: number
  isBroken?: boolean // 외부링크 깨짐 감지
}

export interface MediaPolicy {
  imageFormat?: 'original' | 'webp'
  backupExternal: 'always' | 'never' | 'ask'
  backupFilter: { types: MediaFile['type'][]; maxSizeMB: number }
  offloadToNas: { enabled: boolean; afterDays: number; types: MediaFile['type'][] }
  autoRestore: { enabled: boolean; checkIntervalDays: number }
  nasQuota: { maxTotalGB: number; evictionPolicy: 'oldest' | 'largest' | 'manual' }
  watermark: WatermarkPolicy
}

export interface WatermarkPolicy {
  enabled: boolean
  type: 'text' | 'image'
  content: string // 텍스트 or 로고경로
  position: 'br' | 'bl' | 'tr' | 'tl' | 'center'
  opacity: number // 0..1
  applyTo: MediaFile['type'][]
  skipIfExternal: boolean
}

// ───────────────────────────────────────────────────────────
// AI 어댑터 인터페이스 (교체 가능)
// ───────────────────────────────────────────────────────────

export interface DictationProvider {
  id: string
  isAvailable(): boolean
  start(onText: (chunk: string, isFinal: boolean) => void): void
  stop(): void
}

export interface FormatSuggestion {
  id: string
  range: { from: number; to: number }
  before: string
  after: string
  type: 'heading' | 'codeblock' | 'prompt' | 'list' | 'link' | 'quote' | string
  reason: string
}

export interface Formatter {
  id: string
  isAvailable(): boolean
  suggest(doc: object, opts?: Record<string, unknown>): Promise<FormatSuggestion[]>
}

export interface SlugSuggester {
  id: string
  isAvailable(): boolean
  suggest(title: string): Promise<string[]> // 영문 slug 후보들
}

// 다국어 문법검사 (슬롯) — Formatter 와 유사 계층
export interface Linter {
  id: string
  isAvailable(): boolean
  check(text: string, lang?: string): Promise<LintIssue[]>
}
export interface LintIssue {
  range: { from: number; to: number }
  message: string
  suggestions: string[]
  severity: 'error' | 'warning' | 'info'
}

// ───────────────────────────────────────────────────────────
// 설정 (기기측 + NAS측 분리)
// ───────────────────────────────────────────────────────────

export interface DeviceSettings {
  deviceId: string
  deviceName: string
  nasBaseUrl: string // NAS 백엔드 주소
  nasToken?: string // 기기↔NAS 인증 (키 아님)
  editor: {
    splitView: boolean
    spellcheckLang: string
    // ── 추가 (partial: 값 저장됨, 소비처 연결 후 효과) ──
    autosave?: { idleMin: number } // 입력 멈춘 뒤 자동저장까지 분. 0 = 끔. §4-4
    defaultMode?: 'rich' | 'md' // §4-4 기본 에디터 모드
    codeBlockStyle?: 'fenced' | 'indented' // §4-4 코드블록 형식(``` / 4칸들여쓰기)
    dictation?: { provider: string; lang: string } // §4-5 받아쓰기 provider/언어
  }
}

// NAS 측 설정 (키 마스킹되어 전달)
export interface NasSettings {
  github: { repo: string; branch: string; tokenSet: boolean }
  // 발행 시각 기준: 'nas' = 서버(NAS) 시간대 고정(+0900), 'device' = 발행한 기기의 로컬 시간대.
  timezone?: 'nas' | 'device'
  ai: {
    provider: 'gemini'
    model: string
    keySet: boolean
    // ── 추가 (partial: §4-6 서식·slug 제안 토글) ──
    suggestions?: {
      enabled: boolean
      types: ('heading' | 'codeblock' | 'prompt' | 'list' | 'link')[] // 켤 제안 종류
    }
    slug?: { enabled: boolean; offlineFallback: boolean } // slug 제안 on/off + 음역 폴백
  }
  mediaPolicy: MediaPolicy
}

// ───────────────────────────────────────────────────────────
// ShortsJob — 쇼츠 파이프라인 (prompter 모듈, 📋 1차 미구현 슬롯)
// 지금은 모델만 박아둔다. Post.shortsJobId 로 글과 연결.
// ───────────────────────────────────────────────────────────

export type ShortsStage = 'script' | 'tts' | 'video' | 'publishing' | 'done' | 'failed'

export interface ShortsJob {
  id: string
  postId: string
  stage: ShortsStage
  scriptDraft?: string
  voiceTrackUrl?: string
  videoUrl?: string
  shortsUrl?: string
  scheduledAt?: string // ISO/UTC
  error?: string // stage === 'failed' 일 때
}
