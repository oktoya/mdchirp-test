// mdchirp API 계약 — 기기(프론트) ↔ NAS 백엔드 간 요청/응답 타입.
// 정식 명세: apps/backend/SPEC.md §5, packages/shared/SPEC.md §4

import type { Post, PostStatus, NasSettings, HistoryEntry, MediaFile } from './types.js'

// ───────────────────────────────────────────────────────────
// 공통 응답
// ───────────────────────────────────────────────────────────

export interface ApiError {
  error: string
  detail?: string
}

export type ImageFormatSetting = 'original' | 'webp'

export interface UploadMediaOptions {
  /**
   * 생략하면 NAS의 전역 mediaPolicy.imageFormat 설정을 사용한다.
   */
  imageFormat?: ImageFormatSetting
}

export interface UploadMediaResponse {
  ok: true
  media: MediaFile
}

export type MediaUploadErrorCode =
  | 'post_not_found'
  | 'media_required'
  | 'invalid_image_format'
  | 'unsupported_media_type'
  | 'media_too_large'
  | 'invalid_image'
  | 'media_upload_failed'

export interface MediaUploadErrorResponse extends ApiError {
  error: MediaUploadErrorCode
}

export interface MissingImagesErrorResponse extends ApiError {
  error: 'missing_images'
  details: string[]
}

// ───────────────────────────────────────────────────────────
// Posts
// ───────────────────────────────────────────────────────────

// GET /api/posts → 목록(요약). 본문(tiptapJson)은 제외해 가볍게.
export type PostSummary = Pick<
  Post,
  | 'id'
  | 'slug'
  | 'title'
  | 'status'
  | 'hasRichSource'
  | 'rev'
  | 'lockedBy'
  | 'createdAt'
  | 'updatedAt'
  | 'publishedAt'
  | 'publishedRev'
  | 'publishedSlug'
> & {
  categories?: string[]
  tags?: string[]
}

export interface ListPostsResponse {
  posts: PostSummary[]
  serverTime: string
}

// GET /api/posts/:id → 전체 1편
export type GetPostResponse = Post

// PUT /api/posts/:slug → ID 우선 저장. baseRev 필수.
export interface SavePostRequest {
  post: Post
  baseRev: number // 클라이언트가 알고 있던 rev
}

export interface ConflictPayload {
  id: string
  currentRev: number
  currentPost: Post
}

export type SavePostResponse =
  | {
      ok: true
      post: Post
      forkedFromId?: string
    }
  | {
      ok: false
      error: 'version_conflict'
      message: string
      conflict: ConflictPayload
    }
  | {
      ok: false
      error: 'slug_taken' | 'duplicate_post_id' | 'invalid_slug'
      message: string
    }

// GET /api/posts/sync?since=ts → 증분
export interface SyncResponse {
  changed: PostSummary[]
  deleted: string[]
  serverTime: string
}

// ───────────────────────────────────────────────────────────
// Publish / Schedule
// ───────────────────────────────────────────────────────────

export interface PublishResponse {
  ok: boolean
  status: PostStatus
  githubPath?: string
  publishedAt?: string
  rev: number
  publishedRev?: number
}

export interface ScheduleRequest {
  publishAt: string // ISO8601
}

// DELETE /api/posts/:id → 삭제(published 면 GitHub 제거 겸함)
export interface DeleteResponse {
  ok: boolean
  unpublished: boolean // published 였어서 GitHub 에서도 제거했는가
  committed?: boolean // git 커밋이 실제로 생겼는가(내용 동일 시 false)
  pushedAt?: string
}

// POST /api/posts/:id/unpublish → 발행 취소(GitHub 제거, NAS/로컬 보존, status→draft)
export interface UnpublishResponse {
  ok: true
  status: 'draft'
  committed: boolean
  pushedAt: string
  post: Post // 발행 취소 저장 후 증가한 rev를 포함한 최신 NAS Post
}

// ───────────────────────────────────────────────────────────
// History / Lock
// ───────────────────────────────────────────────────────────

export interface HistoryResponse {
  entries: HistoryEntry[]
}

export interface LockRequest {
  deviceId: string
  deviceName: string
  ttlSeconds?: number
}

// ───────────────────────────────────────────────────────────
// Git
// ───────────────────────────────────────────────────────────

export interface GitStatusResponse {
  lastPullAt?: string
  lastPushAt?: string
  branch: string
  dirty: boolean
}

// ───────────────────────────────────────────────────────────
// AI proxy
// ───────────────────────────────────────────────────────────

export interface FormatSuggestRequest {
  doc: object // TipTap JSON 또는 markdown 컨텍스트 (1차: { markdown: string })
  enable?: string[]
}

/** 서식 제안 응답 — 항목은 shared 의 FormatSuggestion 형태. */
export interface FormatSuggestResponse {
  suggestions: Array<{
    id: string
    range: { from: number; to: number }
    before: string
    after: string
    type: string
    reason: string
  }>
}

export interface SlugSuggestRequest {
  title: string
}
export interface SlugSuggestResponse {
  candidates: string[]
}

// ───────────────────────────────────────────────────────────
// Settings / Secrets / Health
// ───────────────────────────────────────────────────────────

export interface HealthResponse {
  ok: true
  version: string
  serverTime: string
  /** 어떤 AI 기능이 켜져 있는지(키 설정 여부). 프론트의 isAvailable() 판단용. */
  features?: {
    formatter: 'ready' | 'not_configured'
    slug: 'ready' | 'not_configured'
  }
}

export type GetSettingsResponse = NasSettings // 키 마스킹됨

export interface SetSecretRequest {
  kind: 'github' | 'gemini'
  value: string // write-only
}
