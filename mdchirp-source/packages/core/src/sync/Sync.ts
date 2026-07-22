// Sync — local-first 동기화 서비스. SPEC: packages/core/src/sync/SPEC.md
//
// 책임:
//  - 로컬 초안 즉시 저장 (오프라인 OK)
//  - NAS 저장(baseRev 동봉) → 409 충돌 시 onConflict 통지 (자동해소 안함)
//  - 오프라인 시 큐 적재 → 온라인 복귀 시 순차 전송
//  - 발행/예약발행 요청
//  - 연결 상태 감지(health 폴링) → onConnectivity 통지
//
// 핵심 안전장치:
//  - baseRev 낙관적 동시성: 로컬 draft 는 마지막으로 알던 rev 를 보관한다.
//  - 충돌은 예외가 아니라 이벤트. 해당 글만 보류하고 큐의 나머지는 계속 처리.

import type {
  GitRefreshResponse,
  MediaFile,
  Post,
  PostIssue,
  PostPatch,
  RemotePostState,
  UploadMediaOptions,
} from '@mdchirp/shared'
import type { LocalStorageAdapter } from './adapters.js'
import { COLLECTIONS } from './adapters.js'
import { NasClient, type NasSaveResult, NasError } from './NasClient.js'

// SPEC §3 — 충돌 정보 (api-contract ConflictPayload 와 동형)
export interface ConflictInfo {
  id: string
  currentRev: number
  currentPost: Post
}

export type SaveResult =
  | {
      ok: true
      post: Post
      forkedFromId?: string
    }
  | {
      ok: false
      error: 'version_conflict'
      message: string
      conflict: ConflictInfo
    }
  | {
      ok: false
      error: 'slug_taken' | 'duplicate_post_id' | 'invalid_slug'
      message: string
    }

// openPost 결과 — 글을 열 때 로컬 draft 와 NAS rev 를 맞춰본 결과.
// 자동 적용 금지: NAS 가 더 최신이면 자동 교체하지 않고 stale 로 넘겨 사람이 고른다.
export type OpenResult =
  | { kind: 'local'; post: Post } // 로컬 draft 그대로 (로컬이 최신이거나 offline)
  | { kind: 'loaded'; post: Post } // 로컬에 없어 NAS 에서 로드함 (이미 캐시됨)
  | { kind: 'stale'; local: Post; remote: Post } // 로컬 있고 NAS 가 더 최신 → 사람이 고름
  | { kind: 'none' } // 못 엶 (slug 없음/offline/404)

// 발행/예약발행 결과 — 성공/실패를 예외가 아니라 결과로 전달(409 철학과 동일).
// queued=true 는 오프라인 큐에 적재됨(성공으로 간주, 연결 시 자동 처리).
export type PublishResult =
  | { ok: true; queued: boolean; githubPath?: string; publishedAt?: string; scheduledAt?: string }
  | { ok: false; message: string }

// 삭제/발행취소 결과 — online 전용이라 큐 개념 없음. offline 이면 ok:false + offline 플래그.
export type DeleteResult =
  | { ok: true; unpublished: boolean }
  | { ok: false; offline?: boolean; message: string }

export type UnpublishResult =
  | {
      ok: true
      post: Post
      committed: boolean
      pushedAt: string
    }
  | {
      ok: false
      offline?: boolean
      message: string
    }

export type MediaUploadResult =
  | { ok: true; media: MediaFile }
  | { ok: false; offline?: boolean; message: string }

// 알 수 없는 예외에서 사람이 읽을 메시지 추출(NasError 도 Error 하위라 message 사용).
function errorMessage(e: unknown): string {
  if (e instanceof NasError) {
    const payload = e.payload as any

    if (payload?.error === 'missing_images' && Array.isArray(payload.details)) {
      return `누락된 이미지 파일이 있어 발행할 수 없습니다: ${payload.details.join(', ')}`
    }

    const mediaMessages: Record<string, string> = {
      post_not_found: '이미지를 첨부할 글이 NAS에 없습니다. 글을 먼저 저장해 주세요.',
      media_required: '첨부할 이미지 파일이 없습니다.',
      invalid_image_format: '이미지 저장 형식 설정이 올바르지 않습니다.',
      unsupported_media_type: 'JPEG, PNG, WebP 또는 GIF 이미지만 첨부할 수 있습니다.',
      media_too_large: '이미지 파일은 20 MiB 이하만 첨부할 수 있습니다.',
      invalid_image: '유효한 이미지 파일이 아니거나 이미지 제한을 초과했습니다.',
      media_upload_failed: '이미지를 NAS에 저장하지 못했습니다.',
    }

    if (typeof payload?.error === 'string' && mediaMessages[payload.error]) {
      return mediaMessages[payload.error]
    }
  }

  if (e instanceof Error) return e.message
  return String(e)
}

// 로컬에 보관하는 초안 봉투 — Post + 동기화 메타
export interface DraftEnvelope {
  post: Post
  baseRev: number // 마지막으로 NAS와 합의된 rev (충돌 판정 기준)
  dirty: boolean // NAS 미반영 변경 있음
  updatedAt: string
}

// 동기화 큐 항목(오프라인 적재).
// slug는 저장 중 변경될 수 있으므로 영구 식별자인 Post.id를 기준으로 한다.
export interface QueueItem {
  opId: string // 멱등 키
  kind: 'save' | 'publish' | 'schedule'
  postId: string
  baseRev: number // save일 때 사용
  publishAt?: string // schedule일 때 사용
  enqueuedAt: string
}

// 업데이트 전에 로컬 저장소에 남아 있을 수 있는 구형 큐 형식.
// 새 큐를 만들 때는 사용하지 않고 flush 직전에만 Post.id 형식으로 이전한다.
interface LegacyQueueItem {
  opId: string
  kind: 'save' | 'publish' | 'schedule'
  slug: string
  baseRev: number
  publishAt?: string
  enqueuedAt: string
}

type StoredQueueItem = QueueItem | LegacyQueueItem

export interface SyncOptions {
  http: import('./adapters.js').HttpAdapter
  storage: LocalStorageAdapter
  // 연결 감지 폴링 주기(ms). 0 이면 폴링 안함(테스트). 기본 15초.
  healthIntervalMs?: number
  // 현재 온라인 여부 초기값 (브라우저면 navigator.onLine 주입)
  initialOnline?: boolean
}

export class Sync {
  private nas: NasClient
  private storage: LocalStorageAdapter
  private online: boolean
  private conflictCbs: Array<(c: ConflictInfo) => void> = []
  private connectivityCbs: Array<(online: boolean) => void> = []
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private flushing: Promise<void> | null = null
  private githubRefreshing: Promise<GitRefreshResponse> | null = null

  constructor(opts: SyncOptions) {
    this.nas = new NasClient(opts.http)
    this.storage = opts.storage
    this.online = opts.initialOnline ?? true
    const interval = opts.healthIntervalMs ?? 15000
    if (interval > 0) this.startHealthPolling(interval)
  }

  // ─────────────────────────────────────────────────────────
  // 로컬 초안 — 즉시, 항상 성공 (오프라인 OK)
  // ─────────────────────────────────────────────────────────

  async saveLocalDraft(patch: PostPatch): Promise<void> {
    const existing = await this.getDraft(patch.id)
    const base: Post = existing?.post ?? this.emptyPost(patch.id)
    const merged: Post = {
      ...base,
      title: patch.title ?? base.title,
      slug: patch.slug ?? base.slug,
      tiptapJson: patch.tiptapJson ?? base.tiptapJson,
      markdown: patch.markdown ?? base.markdown,
      frontmatter: patch.frontmatter
        ? { ...base.frontmatter, ...patch.frontmatter }
        : base.frontmatter,
      media: patch.media ?? base.media,
      hasRichSource: (patch.tiptapJson ?? base.tiptapJson) != null,
      updatedAt: patch.updatedAt,
    }
    const env: DraftEnvelope = {
      post: merged,
      baseRev: existing?.baseRev ?? merged.rev ?? 0,
      dirty: true,
      updatedAt: patch.updatedAt,
    }
    await this.storage.set(COLLECTIONS.drafts, patch.id, env)
  }

  // 전체 Post 를 로컬 초안으로 덮어쓰기 (에디터가 완성형 Post 를 줄 때)
  async putLocalDraft(post: Post, baseRev?: number): Promise<void> {
    const existing = await this.getDraft(post.id)
    const env: DraftEnvelope = {
      post,
      baseRev: baseRev ?? existing?.baseRev ?? post.rev ?? 0,
      dirty: true,
      updatedAt: post.updatedAt,
    }
    await this.storage.set(COLLECTIONS.drafts, post.id, env)
  }

  // ─────────────────────────────────────────────────────────
  // NAS 저장 — baseRev 동봉. 오프라인이면 큐 적재.
  // ─────────────────────────────────────────────────────────

  async saveToNas(post: Post): Promise<SaveResult> {
    // 로컬에 먼저 반영(local-first)
    await this.putLocalDraft(post)
    const draft = await this.getDraft(post.id)
    const baseRev = draft?.baseRev ?? post.rev ?? 0

    if (!this.online) {
      await this.enqueue({
        opId: `save:${post.id}:${Date.now()}`,
        kind: 'save',
        postId: post.id,
        baseRev,
        enqueuedAt: new Date().toISOString(),
      })
      // 오프라인 저장은 큐에 적재만 하고 status는 건드리지 않는다.
      // 이후 slug가 바뀌어도 flush 시 postId로 최신 draft를 찾아 저장한다.
      return { ok: true, post }
    }

    const res = await this.nas.save(post, baseRev)
    return this.applySaveResult(post.id, res)
  }

  // NAS 저장 결과를 로컬에 반영한다.
  // version_conflict만 충돌 이벤트로 알리고, 그 외 저장 오류는 원인을 그대로 반환한다.
  // fork 성공 시 기존 ID의 로컬 봉투를 새 ID 봉투로 전환한다.
  private async applySaveResult(id: string, res: NasSaveResult): Promise<SaveResult> {
    if (res.ok) {
      const envelope: DraftEnvelope = {
        post: res.post,
        baseRev: res.post.rev,
        dirty: false,
        updatedAt: res.post.updatedAt,
      }

      // 일반 저장/rename은 같은 ID에 기록되고, fork는 새 Post.id에 기록된다.
      await this.storage.set(COLLECTIONS.drafts, res.post.id, envelope)

      // fork로 ID가 바뀐 경우 이전 ID의 편집 봉투를 제거한다.
      // NAS의 기존 발행본 자체는 삭제하지 않으며, 다음 목록 동기화 때 다시 표시될 수 있다.
      if (res.post.id !== id) {
        await this.storage.remove(COLLECTIONS.drafts, id)
      }

      return {
        ok: true,
        post: res.post,
        ...(res.forkedFromId ? { forkedFromId: res.forkedFromId } : {}),
      }
    }

    if (res.error === 'version_conflict') {
      // 충돌은 자동 해소하지 않는다. 로컬 draft는 dirty 상태로 그대로 둔다.
      const conflict: ConflictInfo = {
        id: res.conflict.id,
        currentRev: res.conflict.currentRev,
        currentPost: res.conflict.currentPost,
      }

      this.emitConflict(conflict)

      return {
        ok: false,
        error: 'version_conflict',
        message: res.message || '다른 기기에서 변경이 있었습니다.',
        conflict,
      }
    }

    // slug_taken, duplicate_post_id, invalid_slug는 version conflict로 오인하지 않는다.
    return {
      ok: false,
      error: res.error,
      message: res.message,
    }
  }

  // 충돌 해소: 사용자가 "내 것으로 덮어쓰기" 선택 시 currentRev 를 baseRev 로 재시도
  async resolveOverwrite(post: Post, currentRev: number): Promise<SaveResult> {
    await this.storage.set(COLLECTIONS.drafts, post.id, {
      post,
      baseRev: currentRev,
      dirty: true,
      updatedAt: post.updatedAt,
    } satisfies DraftEnvelope)
    if (!this.online) return { ok: true, post }
    const res = await this.nas.save(post, currentRev)
    return this.applySaveResult(post.id, res)
  }

  // 이미지 업로드 — Blob 큐가 없으므로 online 전용이다.
  // 글을 먼저 NAS에 저장하는 책임은 이 메서드의 호출부(Shell)가 가진다.
  async uploadMedia(
    slug: string,
    file: Blob,
    filename: string,
    options: UploadMediaOptions = {},
  ): Promise<MediaUploadResult> {
    if (!this.online) {
      return {
        ok: false,
        offline: true,
        message: 'NAS에 연결된 상태에서만 이미지를 첨부할 수 있습니다.',
      }
    }

    try {
      const result = await this.nas.uploadMedia(slug, file, filename, options)
      return {
        ok: true,
        media: result.media,
      }
    } catch (e) {
      return {
        ok: false,
        message: errorMessage(e),
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 발행 / 예약발행
  // ─────────────────────────────────────────────────────────

  async requestPublish(postId: string): Promise<PublishResult> {
    const draft = await this.getDraft(postId)

    if (!draft) {
      return {
        ok: false,
        message: '발행할 로컬 글을 찾을 수 없습니다.',
      }
    }

    if (!this.online) {
      await this.enqueue({
        opId: `publish:${postId}:${Date.now()}`,
        kind: 'publish',
        postId,
        baseRev: 0,
        enqueuedAt: new Date().toISOString(),
      })
      return { ok: true, queued: true }
    }

    try {
      // 실제 HTTP 요청 시점에 현재 draft의 최신 slug를 사용한다.
      const res = await this.nas.publish(draft.post.slug)

      await this.bumpDraftAfterPublish(
        postId,
        res.rev,
        res.publishedRev,
        res.githubPath,
        res.publishedAt,
        res.remoteState,
        res.remoteCheckedAt,
        res.issues,
      )

      return {
        ok: true,
        queued: false,
        githubPath: res.githubPath,
        publishedAt: res.publishedAt,
      }
    } catch (e) {
      return { ok: false, message: errorMessage(e) }
    }
  }

  async schedulePublish(postId: string, publishAt: string): Promise<PublishResult> {
    const draft = await this.getDraft(postId)

    if (!draft) {
      return {
        ok: false,
        message: '예약 발행할 로컬 글을 찾을 수 없습니다.',
      }
    }

    if (!this.online) {
      await this.enqueue({
        opId: `schedule:${postId}:${Date.now()}`,
        kind: 'schedule',
        postId,
        baseRev: 0,
        publishAt,
        enqueuedAt: new Date().toISOString(),
      })
      return { ok: true, queued: true }
    }

    try {
      // 실제 HTTP 요청 시점에 현재 draft의 최신 slug를 사용한다.
      await this.nas.schedule(draft.post.slug, publishAt)
      await this.bumpDraftAfterSchedule(postId, publishAt)

      return {
        ok: true,
        queued: false,
        scheduledAt: publishAt,
      }
    } catch (e) {
      return { ok: false, message: errorMessage(e) }
    }
  }

  // 삭제 — online 전용(파괴적 git 동작이라 큐잉하지 않음). 성공 시 로컬 draft 제거.
  async deletePost(id: string, slug: string): Promise<DeleteResult> {
    if (!this.online) {
      return { ok: false, offline: true, message: '오프라인에서는 삭제할 수 없습니다.' }
    }
    try {
      const res = await this.nas.delete(slug)
      await this.storage.remove(COLLECTIONS.drafts, id) // 로컬 잔재 제거
      return { ok: true, unpublished: res.unpublished }
    } catch (e) {
      return { ok: false, message: errorMessage(e) }
    }
  }

  // 발행 취소 — online 전용.
  // 백엔드가 저장한 최신 Post를 그대로 캐시해 rev/baseRev 불일치를 만들지 않는다.
  async unpublish(slug: string): Promise<UnpublishResult> {
    if (!this.online) {
      return {
        ok: false,
        offline: true,
        message: '오프라인에서는 발행 취소할 수 없습니다.',
      }
    }

    try {
      const result = await this.nas.unpublish(slug)

      // 발행 취소 저장으로 증가한 NAS rev를 로컬 baseRev에도 즉시 반영한다.
      await this.cacheFromNas(result.post)

      return {
        ok: true,
        post: result.post,
        committed: result.committed,
        pushedAt: result.pushedAt,
      }
    } catch (e) {
      return {
        ok: false,
        message: errorMessage(e),
      }
    }
  }

  private async bumpDraftAfterPublish(
    postId: string,
    rev: number,
    publishedRev: number | undefined,
    githubPath?: string,
    publishedAt?: string,
    remoteState?: RemotePostState,
    remoteCheckedAt?: string,
    issues?: PostIssue[],
  ): Promise<void> {
    const env = await this.getDraft(postId)
    if (!env) return

    // 새 백엔드는 발행 성공 후 최신 issues를 응답한다.
    // 구형 백엔드 응답에는 issues가 없을 수 있으므로 그 경우에도
    // 발행으로 해결된 missing_post_id만 로컬에서 제거한다.
    const remainingIssues =
      issues ?? env.post.issues?.filter((postIssue) => postIssue.code !== 'missing_post_id')

    const updated: DraftEnvelope = {
      ...env,
      post: {
        ...env.post,
        status: 'published',
        rev,
        publishedRev,
        publishedSlug: env.post.slug,
        githubPath,
        publishedAt,
        remoteState: remoteState ?? 'in_sync',
        remoteCheckedAt: remoteCheckedAt ?? publishedAt ?? new Date().toISOString(),
        issues: remainingIssues?.length ? remainingIssues : undefined,
      },
      baseRev: rev,
      dirty: false,
    }

    await this.storage.set(COLLECTIONS.drafts, postId, updated)
  }

  // 예약 성공 후 로컬 draft를 scheduled로 전환한다.
  private async bumpDraftAfterSchedule(postId: string, publishAt: string): Promise<void> {
    const env = await this.getDraft(postId)
    if (!env) return

    const updated: DraftEnvelope = {
      ...env,
      post: {
        ...env.post,
        status: 'scheduled',
        schedule: { publishAt },
      },
      dirty: false,
    }

    await this.storage.set(COLLECTIONS.drafts, postId, updated)
  }

  // ─────────────────────────────────────────────────────────
  // 사용자 요청 GitHub 새로고침
  // ─────────────────────────────────────────────────────────

  /**
   * 앱 시작 시에는 호출하지 않는다.
   * 사용자가 새로고침 버튼을 눌렀을 때만 Shell이 명시적으로 호출한다.
   *
   * 동시에 여러 호출이 들어오면 같은 Promise를 반환해 원격 fetch를 한 번만 실행한다.
   */
  async refreshGithub(): Promise<GitRefreshResponse> {
    if (this.githubRefreshing) {
      return this.githubRefreshing
    }

    if (!this.online) {
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        importedPostIds: [],
        diagnostics: [],
        skippedNonstandardPaths: [],
        error: 'remote_refresh_failed',
        detail: '오프라인에서는 GitHub 새로고침을 실행할 수 없습니다.',
      }
    }

    this.githubRefreshing = this.nas.refreshGithub().finally(() => {
      this.githubRefreshing = null
    })

    return this.githubRefreshing
  }

  // ─────────────────────────────────────────────────────────
  // 조회 — 로컬 캐시 우선 (NAS 는 보강)
  // ─────────────────────────────────────────────────────────

  async list(): Promise<Post[]> {
    if (this.online) {
      try {
        const res = await this.nas.list()
        const drafts = await this.storage.all<DraftEnvelope>(COLLECTIONS.drafts)

        // slug는 rename될 수 있으므로 NAS 목록과 로컬 draft를 Post.id로 병합한다.
        const draftsById = new Map(drafts.map((draft) => [draft.post.id, draft]))
        const nasIds = new Set(res.posts.map((summary) => summary.id))

        // NAS에 없는 clean draft는 삭제 잔재로 정리한다.
        // dirty draft는 아직 NAS에 저장하지 않은 로컬 변경일 수 있으므로 보존한다.
        for (const draft of drafts) {
          if (!nasIds.has(draft.post.id) && !draft.dirty) {
            await this.storage.remove(COLLECTIONS.drafts, draft.post.id)
          }
        }

        const merged = res.posts.map((summary) => {
          const local = draftsById.get(summary.id)

          if (!local) {
            return this.summaryToPost(summary)
          }

          // 로컬 본문은 유지하되 NAS가 알고 있는 현재 slug와 상태 메타를 반영한다.
          // dirty draft의 slug는 아직 저장 대기 중인 편집값일 수 있으므로 덮어쓰지 않는다.
          if (local.dirty) {
            return {
              ...local.post,
              githubPath: local.post.githubPath ?? summary.githubPath,
              remoteState: summary.remoteState,
              remoteCheckedAt: summary.remoteCheckedAt,
              issues: summary.issues,
            }
          }

          return {
            ...local.post,
            slug: summary.slug,
            title: summary.title,
            status: summary.status,
            hasRichSource: summary.hasRichSource,
            rev: summary.rev,
            lockedBy: summary.lockedBy,
            updatedAt: summary.updatedAt,
            publishedAt: summary.publishedAt,
            publishedRev: summary.publishedRev,
            publishedSlug: summary.publishedSlug,
            githubPath: summary.githubPath,
            remoteState: summary.remoteState,
            remoteCheckedAt: summary.remoteCheckedAt,
            issues: summary.issues,
          }
        })

        // NAS에 아직 없는 새 로컬 dirty draft도 목록에 유지한다.
        for (const draft of drafts) {
          if (!nasIds.has(draft.post.id) && draft.dirty) {
            merged.unshift(draft.post)
          }
        }

        return merged
      } catch {
        // NAS 목록 조회 실패 시 로컬 draft로 폴백한다.
      }
    }

    const drafts = await this.storage.all<DraftEnvelope>(COLLECTIONS.drafts)
    return drafts.map((draft) => draft.post)
  }

  async get(id: string): Promise<Post | null> {
    const draft = await this.getDraft(id)
    if (draft) return draft.post
    return null
  }

  /**
   * NAS 목록에서 Post.id에 해당하는 현재 slug를 찾는다.
   *
   * 목록 조회가 성공했는데 ID가 없다면 NAS에서 삭제된 것으로 판단해 null을 반환한다.
   * 목록 조회 자체가 실패한 경우에만 호출부가 알고 있던 slug로 폴백한다.
   */
  private async currentNasSlug(id: string, fallbackSlug?: string): Promise<string | null> {
    try {
      const response = await this.nas.list()
      const summary = response.posts.find((post) => post.id === id)
      return summary?.slug ?? null
    } catch {
      return fallbackSlug ?? null
    }
  }

  // 글 열기 — 로컬 draft와 NAS rev를 Post.id 기준으로 맞춰본다(SPEC §4-3).
  //  - 로컬 없음  : online+slug 면 NAS 에서 로드해 캐시(loaded), 아니면 none.
  //  - 로컬 있음  : offline 이면 로컬(local). online 이면 NAS rev 확인 →
  //                 NAS rev ≤ baseRev 면 local, NAS rev > baseRev 면 stale(사람이 고름).
  // 자동 덮어쓰기 금지 — stale 은 교체하지 않고 그대로 넘긴다(호출부가 adoptRemote 로 확정).
  async openPost(id: string, slug?: string): Promise<OpenResult> {
    const draft = await this.getDraft(id)

    // 로컬에 없고 오프라인이면 NAS에서 불러올 수 없다.
    if (!draft && !this.online) {
      return { kind: 'none' }
    }

    // 로컬에 있으면 오프라인에서도 즉시 연다.
    if (draft && !this.online) {
      return { kind: 'local', post: draft.post }
    }

    // 온라인에서는 전달받은 slug를 그대로 신뢰하지 않고,
    // NAS 목록에서 Post.id에 대응하는 현재 slug를 다시 찾는다.
    const remoteSlug = await this.currentNasSlug(id, slug ?? draft?.post.slug)

    if (!remoteSlug) {
      // NAS 목록에 해당 ID가 없으면 로컬 dirty draft는 보존해 연다.
      return draft ? { kind: 'local', post: draft.post } : { kind: 'none' }
    }

    const remote = await this.nas.get(remoteSlug)

    if (!remote || remote.id !== id) {
      // stale slug가 다른 글을 가리켜도 잘못된 글을 열지 않는다.
      return draft ? { kind: 'local', post: draft.post } : { kind: 'none' }
    }

    if (!draft) {
      await this.cacheFromNas(remote)
      return { kind: 'loaded', post: remote }
    }

    if (remote.rev > draft.baseRev) {
      return {
        kind: 'stale',
        local: draft.post,
        remote,
      }
    }

    // NAS에서 rename됐지만 rev가 같거나 낮은 경우에도 현재 slug는 로컬에 반영한다.
    if (!draft.dirty && draft.post.slug !== remote.slug) {
      await this.cacheFromNas(remote)
      return { kind: 'local', post: remote }
    }

    return { kind: 'local', post: draft.post }
  }

  // "불러오기" 선택 시 NAS 본문을 로컬 draft 로 확정(캐시). baseRev=rev, dirty=false.
  async adoptRemote(post: Post): Promise<void> {
    await this.cacheFromNas(post)
  }

  // NAS 에서 받은 Post 를 로컬 draft 로 캐시. NAS 와 합의된 상태이므로 dirty=false.
  private async cacheFromNas(post: Post): Promise<void> {
    await this.storage.set(COLLECTIONS.drafts, post.id, {
      post,
      baseRev: post.rev,
      dirty: false,
      updatedAt: post.updatedAt,
    } satisfies DraftEnvelope)
  }

  async getDraft(id: string): Promise<DraftEnvelope | null> {
    return this.storage.get<DraftEnvelope>(COLLECTIONS.drafts, id)
  }

  // ─────────────────────────────────────────────────────────
  // 동기화 큐
  // ─────────────────────────────────────────────────────────

  private async enqueue(item: QueueItem): Promise<void> {
    // 같은 글의 save가 여러 번 쌓이면 가장 최신 draft 하나만 보내면 된다.
    // publish/schedule의 실행 순서는 보존한다.
    if (item.kind === 'save') {
      const queued = await this.storage.all<QueueItem>(COLLECTIONS.queue)

      for (const existing of queued) {
        if (existing.kind === 'save' && existing.postId === item.postId) {
          await this.storage.remove(COLLECTIONS.queue, existing.opId)
        }
      }
    }

    await this.storage.set(COLLECTIONS.queue, item.opId, item)
  }

  async pendingCount(): Promise<number> {
    return (await this.storage.keys(COLLECTIONS.queue)).length
  }

  // 온라인 복귀 시 큐 순차 전송. 409 는 해당 글만 보류(이벤트), 나머지 계속.
  // 동시 호출(자동 트리거 + 명시 호출)은 같은 진행을 공유해 await 가능.
  async flushQueue(): Promise<void> {
    if (this.flushing) return this.flushing // 이미 진행 중이면 그 완료를 기다림
    if (!this.online) return
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  /**
   * 구형 slug 큐 항목을 현재 로컬 draft의 Post.id로 이전한다.
   *
   * 같은 slug의 draft가 정확히 하나일 때만 이전한다.
   * 찾지 못하거나 여러 개라서 모호하면 데이터 유실을 막기 위해 큐를 그대로 남긴다.
   */
  private async migrateLegacyQueueItem(item: StoredQueueItem): Promise<QueueItem | null> {
    if ('postId' in item && typeof item.postId === 'string' && item.postId.length > 0) {
      return item
    }

    if (!('slug' in item) || typeof item.slug !== 'string' || item.slug.length === 0) {
      return null
    }

    const drafts = await this.storage.all<DraftEnvelope>(COLLECTIONS.drafts)
    const matches = drafts.filter((draft) => draft.post.slug === item.slug)

    // 잘못된 글로 연결하는 것보다 큐를 보존하고 사람이 확인하게 하는 편이 안전하다.
    if (matches.length !== 1) return null

    const migrated: QueueItem = {
      opId: item.opId,
      kind: item.kind,
      postId: matches[0].post.id,
      baseRev: item.baseRev,
      publishAt: item.publishAt,
      enqueuedAt: item.enqueuedAt,
    }

    // 같은 opId에 덮어써 큐 순서와 멱등 키를 유지한다.
    await this.storage.set(COLLECTIONS.queue, migrated.opId, migrated)

    return migrated
  }

  private async doFlush(): Promise<void> {
    const items = (await this.storage.all<StoredQueueItem>(COLLECTIONS.queue)).sort((a, b) =>
      a.enqueuedAt.localeCompare(b.enqueuedAt),
    )

    for (const storedItem of items) {
      const item = await this.migrateLegacyQueueItem(storedItem)

      // 안전하게 Post.id를 결정하지 못한 구형 큐는 삭제하지 않고 남겨둔다.
      if (!item) continue

      try {
        await this.processQueueItem(item)
        await this.storage.remove(COLLECTIONS.queue, item.opId)
      } catch {
        // 네트워크 실패 → 현재 항목과 후속 항목을 큐에 남겨두고 중단한다.
        break
      }
    }
  }

  private async processQueueItem(item: QueueItem): Promise<void> {
    const env = await this.getDraft(item.postId)

    // draft가 삭제됐다면 해당 글의 대기 작업도 더 실행하지 않는다.
    if (!env) return

    if (item.kind === 'save') {
      const res = await this.nas.save(env.post, item.baseRev)
      await this.applySaveResult(item.postId, res)
      return
    }

    if (item.kind === 'publish') {
      const res = await this.nas.publish(env.post.slug)

      await this.bumpDraftAfterPublish(
        item.postId,
        res.rev,
        res.publishedRev,
        res.githubPath,
        res.publishedAt,
        res.remoteState,
        res.remoteCheckedAt,
        res.issues,
      )
      return
    }

    if (item.kind === 'schedule' && item.publishAt) {
      await this.nas.schedule(env.post.slug, item.publishAt)
      await this.bumpDraftAfterSchedule(item.postId, item.publishAt)
    }
  }

  // ─────────────────────────────────────────────────────────
  // 연결 감지 (health 폴링)
  // ─────────────────────────────────────────────────────────

  private startHealthPolling(intervalMs: number): void {
    this.healthTimer = setInterval(() => {
      void this.checkConnectivity()
    }, intervalMs)
  }

  async checkConnectivity(): Promise<boolean> {
    let nowOnline = false
    try {
      await this.nas.health()
      nowOnline = true
    } catch {
      nowOnline = false
    }
    this.setOnline(nowOnline)
    return nowOnline
  }

  setOnline(next: boolean): void {
    if (next === this.online) return
    this.online = next
    this.connectivityCbs.forEach((cb) => cb(next))
    if (next) void this.flushQueue() // 복귀 → 큐 비우기
  }

  isOnline(): boolean {
    return this.online
  }

  // ─────────────────────────────────────────────────────────
  // 이벤트 구독
  // ─────────────────────────────────────────────────────────

  onConflict(cb: (c: ConflictInfo) => void): void {
    this.conflictCbs.push(cb)
  }
  onConnectivity(cb: (online: boolean) => void): void {
    this.connectivityCbs.push(cb)
  }

  private emitConflict(c: ConflictInfo): void {
    this.conflictCbs.forEach((cb) => cb(c))
  }

  // 정리 (타이머 해제) — 앱 종료/리렌더 시
  dispose(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }

  // ─────────────────────────────────────────────────────────
  // 헬퍼
  // ─────────────────────────────────────────────────────────

  private emptyPost(id: string): Post {
    const now = new Date().toISOString()
    return {
      id,
      slug: '',
      title: '',
      tiptapJson: null,
      markdown: '',
      frontmatter: { title: '', date: now },
      media: [],
      status: 'draft',
      hasRichSource: false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    }
  }

  private summaryToPost(s: import('@mdchirp/shared').PostSummary): Post {
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      tiptapJson: null,
      markdown: '',
      frontmatter: {
        title: s.title,
        date: s.createdAt,
        categories: s.categories as any,
        tags: s.tags,
      },
      media: [],
      status: s.status,
      hasRichSource: s.hasRichSource,
      rev: s.rev,
      lockedBy: s.lockedBy,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      publishedAt: s.publishedAt,
      publishedRev: s.publishedRev,
      publishedSlug: s.publishedSlug,
      githubPath: s.githubPath,
      remoteState: s.remoteState,
      remoteCheckedAt: s.remoteCheckedAt,
      issues: s.issues,
    }
  }
}
