import assert from 'node:assert'
import type { GitRefreshResponse, PostSummary } from '@mdchirp/shared'
import type { HttpAdapter, HttpRequest, HttpResponse } from './adapters.js'
import { MemoryStorageAdapter } from './impl/MemoryStorageAdapter.js'
import { Sync } from './Sync.js'

interface RecordingHttp extends HttpAdapter {
  calls: HttpRequest[]
}

function refreshSuccess(): GitRefreshResponse {
  return {
    ok: true,
    checkedAt: '2026-07-21T00:00:00.000Z',
    remoteCommit: 'abc123',
    importedPostIds: ['remote-id'],
    diagnostics: [],
    skippedNonstandardPaths: [],
  }
}

function summary(): PostSummary {
  return {
    id: 'post-id',
    slug: '2026-07-21-post',
    title: 'Post',
    status: 'published',
    hasRichSource: false,
    rev: 1,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    publishedAt: '2026-07-21T00:00:00.000Z',
    publishedRev: 1,
    publishedSlug: '2026-07-21-post',
    githubPath: '_posts/2026-07-21-post.md',
    remoteState: 'remote_missing',
    remoteCheckedAt: '2026-07-21T01:00:00.000Z',
    issues: [
      {
        code: 'remote_post_missing',
        severity: 'error',
        message: '원격 글 없음',
        githubPath: '_posts/2026-07-21-post.md',
      },
    ],
  }
}

function makeHttp(
  handler: (request: HttpRequest) => Promise<HttpResponse<unknown>>,
): RecordingHttp {
  const calls: HttpRequest[] = []

  return {
    calls,
    async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
      calls.push(request)
      const response = await handler(request)

      return {
        status: response.status,
        ok: response.ok,
        data: response.data as T,
      }
    },
  }
}

let pass = 0

function ok(name: string): void {
  console.log(`  ✓ ${name}`)
  pass++
}

console.log('mdchirp GitHub refresh sync test')

// 1. 앱 시작 목록 조회는 GitHub API를 호출하지 않는다.
{
  const http = makeHttp(async (request) => {
    assert.equal(request.path, '/api/posts')

    return {
      status: 200,
      ok: true,
      data: {
        posts: [summary()],
        serverTime: '2026-07-21T00:00:00.000Z',
      },
    }
  })

  const sync = new Sync({
    http,
    storage: new MemoryStorageAdapter(),
    healthIntervalMs: 0,
    initialOnline: true,
  })

  const posts = await sync.list()

  assert.deepEqual(
    http.calls.map((call) => call.path),
    ['/api/posts'],
  )
  assert.equal(posts[0].githubPath, '_posts/2026-07-21-post.md')
  assert.equal(posts[0].remoteState, 'remote_missing')
  assert.equal(posts[0].issues?.[0].code, 'remote_post_missing')

  sync.dispose()
  ok('앱 시작 목록은 NAS만 조회하고 원격 상태 필드를 보존')
}

// 2. 명시적인 refreshGithub 호출만 GitHub API를 요청한다.
{
  const http = makeHttp(async (request) => {
    assert.equal(request.path, '/api/git/refresh')
    assert.equal(request.method, 'POST')

    return {
      status: 200,
      ok: true,
      data: refreshSuccess(),
    }
  })

  const sync = new Sync({
    http,
    storage: new MemoryStorageAdapter(),
    healthIntervalMs: 0,
    initialOnline: true,
  })

  const result = await sync.refreshGithub()

  assert.equal(result.ok, true)
  assert.deepEqual(
    http.calls.map((call) => call.path),
    ['/api/git/refresh'],
  )

  sync.dispose()
  ok('사용자 수동 새로고침에서만 GitHub API 호출')
}

// 3. 동시에 호출한 새로고침은 하나의 요청을 공유한다.
{
  let release: ((response: HttpResponse<unknown>) => void) | undefined

  const http = makeHttp(
    () =>
      new Promise<HttpResponse<unknown>>((resolve) => {
        release = resolve
      }),
  )

  const sync = new Sync({
    http,
    storage: new MemoryStorageAdapter(),
    healthIntervalMs: 0,
    initialOnline: true,
  })

  const first = sync.refreshGithub()
  const second = sync.refreshGithub()

  assert.equal(http.calls.length, 1)
  assert(release)

  release({
    status: 200,
    ok: true,
    data: refreshSuccess(),
  })

  const [firstResult, secondResult] = await Promise.all([first, second])

  assert.deepEqual(firstResult, secondResult)
  assert.equal(http.calls.length, 1)

  sync.dispose()
  ok('동시 새로고침 호출은 한 HTTP 요청을 공유')
}

// 4. 오프라인에서는 GitHub API를 호출하지 않는다.
{
  const http = makeHttp(async () => {
    throw new Error('오프라인에서 호출되면 안 됨')
  })

  const sync = new Sync({
    http,
    storage: new MemoryStorageAdapter(),
    healthIntervalMs: 0,
    initialOnline: false,
  })

  const result = await sync.refreshGithub()

  assert.equal(result.ok, false)
  assert.equal(result.error, 'remote_refresh_failed')
  assert.match(result.detail ?? '', /오프라인/)
  assert.equal(http.calls.length, 0)

  sync.dispose()
  ok('오프라인 새로고침은 원격 요청 없이 실패 반환')
}

console.log(`\n✅ ${pass} checks passed`)
