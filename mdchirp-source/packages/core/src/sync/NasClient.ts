// NasClient — NAS 백엔드(/api/posts/*) 타입드 래퍼.
// HttpAdapter 만 의존하고, 백엔드 계약(packages/shared/api-contract)을 그대로 매핑한다.
// 핵심: 409(충돌)를 예외가 아니라 구조화된 결과로 반환 → sync 가 정상 흐름으로 분기.
//
// 백엔드 라우트 주의: 경로 파라미터는 :slug (id 아님). apps/backend/src/routes/posts.ts

import type {
  Post,
  ListPostsResponse,
  SavePostRequest,
  SavePostResponse,
  PublishResponse,
  HealthResponse,
  DeleteResponse,
  UnpublishResponse,
  UploadMediaResponse,
  UploadMediaOptions,
  GitRefreshResponse,
} from '@mdchirp/shared'
import type { HttpAdapter } from './adapters.js'

// 백엔드 저장 응답을 손실 없이 sync 계층에 전달한다.
// 성공 시 forkedFromId를 보존하고, 실패 시 오류 종류와 conflict를 구분한다.
export type NasSaveResult = SavePostResponse

export class NasClient {
  constructor(private http: HttpAdapter) {}

  // GET /api/posts → 요약 목록
  async list(): Promise<ListPostsResponse> {
    const res = await this.http.request<ListPostsResponse>({
      method: 'GET',
      path: '/api/posts',
    })
    if (!res.ok) throw new NasError('list', res.status, res.data)
    return res.data
  }

  // POST /api/git/refresh → 사용자가 요청한 수동 GitHub 새로고침.
  // 409/502도 구조화된 GitRefreshResponse를 반환하므로 예외로 바꾸지 않는다.
  async refreshGithub(): Promise<GitRefreshResponse> {
    const res = await this.http.request<GitRefreshResponse>({
      method: 'POST',
      path: '/api/git/refresh',
    })

    if (
      res.data &&
      typeof res.data === 'object' &&
      typeof res.data.ok === 'boolean' &&
      typeof res.data.checkedAt === 'string' &&
      Array.isArray(res.data.importedPostIds) &&
      Array.isArray(res.data.diagnostics) &&
      Array.isArray(res.data.skippedNonstandardPaths)
    ) {
      return res.data
    }

    throw new NasError('refreshGithub', res.status, res.data)
  }

  // GET /api/posts/:slug → 전체 1편 (없으면 null)
  async get(slug: string): Promise<Post | null> {
    const res = await this.http.request<Post>({
      method: 'GET',
      path: `/api/posts/${encodeURIComponent(slug)}`,
    })
    if (res.status === 404) return null
    if (!res.ok) throw new NasError('get', res.status, res.data)
    return res.data
  }

  // PUT /api/posts/:slug — 저장(업서트).
  // version_conflict/slug_taken/duplicate_post_id/invalid_slug를 구분하고,
  // 성공 응답의 forkedFromId를 손실 없이 전달한다.
  async save(post: Post, baseRev: number): Promise<NasSaveResult> {
    const reqBody: SavePostRequest = { post, baseRev }
    const res = await this.http.request<SavePostResponse>({
      method: 'PUT',
      path: `/api/posts/${encodeURIComponent(post.slug)}`,
      body: reqBody,
    })

    if (!res.ok) {
      const data = res.data

      if (
        data &&
        data.ok === false &&
        (data.error === 'version_conflict' ||
          data.error === 'slug_taken' ||
          data.error === 'duplicate_post_id' ||
          data.error === 'invalid_slug')
      ) {
        return data
      }

      throw new NasError('save', res.status, res.data)
    }

    const data = res.data

    if (!data || data.ok !== true || !data.post) {
      throw new NasError('save', res.status, res.data)
    }

    return data
  }

  // POST /api/posts/:slug/publish — 즉시 발행
  // 기기 오프셋을 항상 실어 보낸다. 실제 사용 여부는 백엔드가 설정(nas/device)으로 결정.
  async publish(slug: string): Promise<PublishResponse> {
    const res = await this.http.request<PublishResponse>({
      method: 'POST',
      path: `/api/posts/${encodeURIComponent(slug)}/publish`,
      body: { offset: deviceOffset() },
    })
    if (!res.ok) throw new NasError('publish', res.status, res.data)
    return res.data
  }

  // POST /api/posts/:slug/schedule — 예약발행
  async schedule(slug: string, publishAt: string): Promise<void> {
    const res = await this.http.request({
      method: 'POST',
      path: `/api/posts/${encodeURIComponent(slug)}/schedule`,
      body: { publishAt },
    })
    if (!res.ok) throw new NasError('schedule', res.status, res.data)
  }

  // DELETE /api/posts/:slug — 삭제(published 면 GitHub 제거 겸함).
  async delete(slug: string): Promise<DeleteResponse> {
    const res = await this.http.request<DeleteResponse>({
      method: 'DELETE',
      path: `/api/posts/${encodeURIComponent(slug)}`,
    })
    if (!res.ok) throw new NasError('delete', res.status, res.data)
    return res.data
  }

  // POST /api/posts/:slug/unpublish — 발행 취소(GitHub 제거, 글 보존, status→draft).
  async unpublish(slug: string): Promise<UnpublishResponse> {
    const res = await this.http.request<UnpublishResponse>({
      method: 'POST',
      path: `/api/posts/${encodeURIComponent(slug)}/unpublish`,
    })
    if (!res.ok) throw new NasError('unpublish', res.status, res.data)
    return res.data
  }

  // POST /api/posts/:slug/media — 이미지 첨부(FormData는 JSON 직렬화하지 않음).
  async uploadMedia(
    slug: string,
    file: Blob,
    filename: string,
    options: UploadMediaOptions = {},
  ): Promise<UploadMediaResponse> {
    const form = new FormData()
    form.append('file', file, filename)

    if (options.imageFormat !== undefined) {
      form.append('imageFormat', options.imageFormat)
    }

    const res = await this.http.request<UploadMediaResponse>({
      method: 'POST',
      path: `/api/posts/${encodeURIComponent(slug)}/media`,
      body: form,
    })

    if (!res.ok) throw new NasError('uploadMedia', res.status, res.data)
    return res.data
  }

  // GET /api/health — 연결 감지용
  async health(signal?: AbortSignal): Promise<HealthResponse> {
    const res = await this.http.request<HealthResponse>({
      method: 'GET',
      path: '/api/health',
      signal,
    })
    if (!res.ok) throw new NasError('health', res.status, res.data)
    return res.data
  }

  // GET /api/authors — _data/authors.yml 기반 저자 목록(없으면 빈 배열).
  // 부가기능이라 실패해도 예외를 던지지 않고 [] 반환(편집/발행을 막지 않음).
  async listAuthors(): Promise<{ key: string; name: string }[]> {
    const res = await this.http.request<{ key: string; name: string }[]>({
      method: 'GET',
      path: '/api/authors',
    })
    if (!res.ok) return []
    return res.data
  }
}

export class NasError extends Error {
  constructor(
    public op: string,
    public status: number,
    public payload: unknown,
  ) {
    super(`NAS ${op} failed (status ${status})`)
    this.name = 'NasError'
  }
}

// 기기(브라우저)의 현재 시간대 오프셋을 '+0900' / '-0500' 형식으로 반환.
function deviceOffset(): string {
  const mins = -new Date().getTimezoneOffset() // getTimezoneOffset 은 부호가 반대
  const sign = mins >= 0 ? '+' : '-'
  const abs = Math.abs(mins)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${sign}${hh}${mm}`
}
