// Sync ID 기반 큐, 구형 slug 큐 마이그레이션, 저장 결과 분기 회귀 테스트.
// 실행: pnpm --filter @mdchirp/core test

import assert from 'node:assert'
import type { Post, PostSummary } from '@mdchirp/shared'
import {
  COLLECTIONS,
  type HttpAdapter,
  type HttpRequest,
  type HttpResponse,
  type LocalStorageAdapter,
} from './adapters.js'
import {
  Sync,
  type DraftEnvelope,
  type QueueItem,
} from './Sync.js'

class MemoryStorage implements LocalStorageAdapter {
  private collections = new Map<string, Map<string, unknown>>()

  private collection(name: string): Map<string, unknown> {
    let collection = this.collections.get(name)

    if (!collection) {
      collection = new Map<string, unknown>()
      this.collections.set(name, collection)
    }

    return collection
  }

  async get<T = unknown>(
    collection: string,
    key: string,
  ): Promise<T | null> {
    const value = this.collection(collection).get(key)
    return value === undefined ? null : (value as T)
  }

  async set<T = unknown>(
    collection: string,
    key: string,
    value: T,
  ): Promise<void> {
    this.collection(collection).set(key, value)
  }

  async remove(collection: string, key: string): Promise<void> {
    this.collection(collection).delete(key)
  }

  async all<T = unknown>(collection: string): Promise<T[]> {
    return [...this.collection(collection).values()] as T[]
  }

  async keys(collection: string): Promise<string[]> {
    return [...this.collection(collection).keys()]
  }
}

class TestHttp implements HttpAdapter {
  readonly requests: HttpRequest[] = []

  constructor(
    private handler: (
      request: HttpRequest,
    ) => HttpResponse<unknown> | Promise<HttpResponse<unknown>>,
  ) {}

  async request<T = unknown>(
    request: HttpRequest,
  ): Promise<HttpResponse<T>> {
    this.requests.push(request)
    return (await this.handler(request)) as HttpResponse<T>
  }
}

function makePost(overrides: Partial<Post> = {}): Post {
  const now = new Date().toISOString()

  return {
    id: 'queue-post-id',
    slug: 'queue-old-slug',
    title: 'Queue test',
    tiptapJson: {
      type: 'doc',
      content: [],
    },
    markdown: '# Queue test',
    frontmatter: {
      title: 'Queue test',
      date: '2026-06-19 14:00:00 +0900',
    },
    media: [],
    status: 'draft',
    hasRichSource: true,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function summaryOf(post: Post): PostSummary {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    status: post.status,
    hasRichSource: post.hasRichSource,
    rev: post.rev,
    lockedBy: post.lockedBy,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt,
    publishedRev: post.publishedRev,
    categories: post.frontmatter.categories?.filter(Boolean),
    tags: post.frontmatter.tags,
  }
}

function successResponse(post: Post): HttpResponse<unknown> {
  return {
    status: 200,
    ok: true,
    data: {
      ok: true,
      post,
    },
  }
}

let pass = 0

function ok(name: string): void {
  console.log(`  ✓ ${name}`)
  pass++
}

console.log('mdchirp sync ID queue test')

// 1. 같은 Post.id의 오프라인 save는 하나로 합쳐지고 최신 slug로 전송된다.
{
  const storage = new MemoryStorage()
  const http = new TestHttp((request) => {
    const body = request.body as {
      post: Post
      baseRev: number
    }

    return successResponse({
      ...body.post,
      rev: body.baseRev + 1,
      updatedAt: new Date().toISOString(),
    })
  })

  const sync = new Sync({
    http,
    storage,
    initialOnline: false,
    healthIntervalMs: 0,
  })

  const original = makePost({
    id: 'dedupe-id',
    slug: 'dedupe-old',
  })
  await sync.saveToNas(original)

  const renamed = {
    ...original,
    slug: 'dedupe-new',
    title: 'renamed while offline',
    updatedAt: new Date().toISOString(),
  }
  await sync.saveToNas(renamed)

  assert.equal(
    await sync.pendingCount(),
    1,
    'same Post.id must have one queued save',
  )

  sync.setOnline(true)
  await sync.flushQueue()

  const putRequests = http.requests.filter(
    (request) => request.method === 'PUT',
  )

  assert.equal(putRequests.length, 1, 'only one save request sent')
  assert.equal(
    putRequests[0].path,
    '/api/posts/dedupe-new',
    'queued save uses current draft slug',
  )
  assert.equal(await sync.pendingCount(), 0, 'save queue removed')
  sync.dispose()

  ok('동일 Post.id save 큐 dedupe + 최신 slug 사용')
}

// 2. 발행과 예약 큐도 실행 시점의 최신 slug를 사용한다.
{
  const storage = new MemoryStorage()
  const http = new TestHttp((request) => {
    if (request.path.endsWith('/publish')) {
      return {
        status: 200,
        ok: true,
        data: {
          ok: true,
          status: 'published',
          rev: 2,
          publishedRev: 2,
          githubPath: '_posts/2026-06-19-latest-slug.md',
          publishedAt: '2026-06-19T05:00:00.000Z',
        },
      }
    }

    if (request.path.endsWith('/schedule')) {
      return {
        status: 200,
        ok: true,
        data: {
          ok: true,
          status: 'scheduled',
        },
      }
    }

    throw new Error(`Unexpected request: ${request.path}`)
  })

  const sync = new Sync({
    http,
    storage,
    initialOnline: false,
    healthIntervalMs: 0,
  })

  const original = makePost({
    id: 'publish-queue-id',
    slug: 'queued-old-slug',
    rev: 1,
  })
  await sync.putLocalDraft(original, 1)

  const publishQueued = await sync.requestPublish(original.id)
  const scheduleQueued = await sync.schedulePublish(
    original.id,
    '2026-06-20T05:00:00.000Z',
  )

  assert(
    publishQueued.ok && publishQueued.queued,
    'publish request queued',
  )
  assert(
    scheduleQueued.ok && scheduleQueued.queued,
    'schedule request queued',
  )

  await sync.putLocalDraft(
    {
      ...original,
      slug: 'latest-slug',
      updatedAt: new Date().toISOString(),
    },
    1,
  )

  sync.setOnline(true)
  await sync.flushQueue()

  const paths = http.requests.map((request) => request.path)

  assert(
    paths.includes('/api/posts/latest-slug/publish'),
    'publish uses latest slug',
  )
  assert(
    paths.includes('/api/posts/latest-slug/schedule'),
    'schedule uses latest slug',
  )
  assert.equal(await sync.pendingCount(), 0, 'publish/schedule queue removed')
  sync.dispose()

  ok('발행·예약 큐: Post.id로 최신 slug 확인')
}

// 3. 구형 slug 큐는 같은 slug의 draft를 찾아 Post.id 형식으로 이전한다.
{
  const storage = new MemoryStorage()
  const post = makePost({
    id: 'legacy-migration-id',
    slug: 'legacy-slug',
  })

  const envelope: DraftEnvelope = {
    post,
    baseRev: 0,
    dirty: true,
    updatedAt: post.updatedAt,
  }
  await storage.set(
    COLLECTIONS.drafts,
    post.id,
    envelope,
  )

  await storage.set(
    COLLECTIONS.queue,
    'save:legacy-slug:1',
    {
      opId: 'save:legacy-slug:1',
      kind: 'save',
      slug: 'legacy-slug',
      baseRev: 0,
      enqueuedAt: '2026-06-19T00:00:00.000Z',
    },
  )

  // 요청 실패를 발생시켜 마이그레이션된 항목이 삭제되지 않고 저장소에 남게 한다.
  const http = new TestHttp(() => {
    throw new Error('simulated network failure')
  })

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  await sync.flushQueue()

  const queued = await storage.get<QueueItem>(
    COLLECTIONS.queue,
    'save:legacy-slug:1',
  )

  assert(queued, 'migrated queue remains after network failure')
  assert.equal(
    queued.postId,
    post.id,
    'legacy slug queue migrated to Post.id',
  )
  assert.equal(
    'slug' in queued,
    false,
    'migrated queue no longer stores slug',
  )
  sync.dispose()

  ok('구형 slug 큐를 Post.id 큐로 안전하게 이전')
}

// 4. 연결할 draft가 없는 구형 큐는 삭제하거나 임의 연결하지 않는다.
{
  const storage = new MemoryStorage()

  await storage.set(
    COLLECTIONS.queue,
    'publish:missing-slug:1',
    {
      opId: 'publish:missing-slug:1',
      kind: 'publish',
      slug: 'missing-slug',
      baseRev: 0,
      enqueuedAt: '2026-06-19T00:00:00.000Z',
    },
  )

  const http = new TestHttp(() => {
    throw new Error('HTTP must not be called')
  })

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  await sync.flushQueue()

  const remaining = await storage.get<Record<string, unknown>>(
    COLLECTIONS.queue,
    'publish:missing-slug:1',
  )

  assert(remaining, 'unresolved legacy queue remains')
  assert.equal(http.requests.length, 0, 'unresolved queue is not sent')
  sync.dispose()

  ok('해석 불가능한 구형 큐 보존')
}

// 5. version_conflict만 충돌 이벤트를 발생시킨다.
{
  const storage = new MemoryStorage()
  const currentPost = makePost({
    id: 'conflict-id',
    slug: 'conflict-slug',
    rev: 2,
  })

  const http = new TestHttp(() => ({
    status: 409,
    ok: false,
    data: {
      ok: false,
      error: 'version_conflict',
      message: '다른 기기에서 변경이 있었습니다.',
      conflict: {
        id: currentPost.id,
        currentRev: currentPost.rev,
        currentPost,
      },
    },
  }))

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  const conflicts: string[] = []
  sync.onConflict((conflict) => {
    conflicts.push(conflict.id)
  })

  const result = await sync.saveToNas(
    makePost({
      id: currentPost.id,
      slug: currentPost.slug,
      rev: 1,
    }),
  )

  assert(
    !result.ok &&
      result.error === 'version_conflict' &&
      result.conflict.currentRev === 2,
    'version conflict returned',
  )
  assert.deepEqual(
    conflicts,
    [currentPost.id],
    'version conflict event emitted once',
  )
  sync.dispose()

  ok('version_conflict만 충돌 이벤트 발생')
}

// 6. slug_taken은 충돌 이벤트 없이 고유 오류로 반환된다.
{
  const storage = new MemoryStorage()
  const http = new TestHttp(() => ({
    status: 409,
    ok: false,
    data: {
      ok: false,
      error: 'slug_taken',
      message: '이미 사용 중인 slug입니다.',
    },
  }))

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  let conflictCount = 0
  sync.onConflict(() => {
    conflictCount++
  })

  const result = await sync.saveToNas(
    makePost({
      id: 'slug-taken-id',
      slug: 'occupied-slug',
    }),
  )

  assert(
    !result.ok && result.error === 'slug_taken',
    'slug_taken returned without conversion',
  )
  assert.equal(
    conflictCount,
    0,
    'slug_taken does not emit conflict event',
  )
  sync.dispose()

  ok('slug_taken을 version_conflict로 오인하지 않음')
}

// 7. fork 성공 시 기존 로컬 ID 봉투를 제거하고 새 ID 봉투로 전환한다.
{
  const storage = new MemoryStorage()
  const oldPost = makePost({
    id: 'fork-old-id',
    slug: 'fork-old-slug',
    rev: 1,
    status: 'published',
    githubPath: '_posts/2026-06-19-fork-old-slug.md',
    publishedAt: '2026-06-19T05:00:00.000Z',
    publishedRev: 1,
  })

  const newPost: Post = {
    ...oldPost,
    id: 'fork-new-id',
    slug: 'fork-new-slug',
    status: 'draft',
    rev: 1,
    githubPath: undefined,
    publishedAt: undefined,
    publishedRev: undefined,
    updatedAt: new Date().toISOString(),
  }

  const http = new TestHttp(() => ({
    status: 200,
    ok: true,
    data: {
      ok: true,
      post: newPost,
      forkedFromId: oldPost.id,
    },
  }))

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  await sync.putLocalDraft(oldPost, oldPost.rev)

  const result = await sync.saveToNas({
    ...oldPost,
    slug: newPost.slug,
    updatedAt: new Date().toISOString(),
  })

  assert(
    result.ok &&
      result.post.id === newPost.id &&
      result.forkedFromId === oldPost.id,
    'fork result preserves forkedFromId',
  )

  const oldEnvelope = await sync.getDraft(oldPost.id)
  const newEnvelope = await sync.getDraft(newPost.id)

  assert.equal(oldEnvelope, null, 'old local envelope removed')
  assert(newEnvelope, 'new local envelope created')
  assert.equal(newEnvelope.post.id, newPost.id, 'new envelope uses fork ID')
  assert.equal(newEnvelope.baseRev, 1, 'new envelope stores fork rev')
  assert.equal(newEnvelope.dirty, false, 'new envelope is synchronized')
  sync.dispose()

  ok('fork 응답 후 로컬 draft 키를 새 Post.id로 전환')
}

// 8. 같은 ID의 NAS/로컬 글은 slug가 달라도 하나로 병합한다.
{
  const storage = new MemoryStorage()
  const local = makePost({
    id: 'list-same-id',
    slug: 'list-old-slug',
    title: 'local title',
    rev: 2,
  })
  const remote = {
    ...local,
    slug: 'list-current-slug',
    title: 'remote title',
    updatedAt: new Date(Date.now() + 1000).toISOString(),
  }

  await storage.set<DraftEnvelope>(
    COLLECTIONS.drafts,
    local.id,
    {
      post: local,
      baseRev: local.rev,
      dirty: false,
      updatedAt: local.updatedAt,
    },
  )

  const http = new TestHttp((request) => {
    assert.equal(request.path, '/api/posts')

    return {
      status: 200,
      ok: true,
      data: {
        posts: [summaryOf(remote)],
        serverTime: new Date().toISOString(),
      },
    }
  })

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  const posts = await sync.list()

  assert.equal(posts.length, 1, 'same ID must appear once')
  assert.equal(posts[0].id, local.id, 'merged post keeps ID')
  assert.equal(
    posts[0].slug,
    remote.slug,
    'clean local draft adopts current NAS slug',
  )
  assert.equal(
    posts[0].title,
    remote.title,
    'clean local draft adopts NAS summary metadata',
  )

  sync.dispose()
  ok('목록 병합: slug가 달라도 동일 Post.id는 한 항목')
}

// 9. NAS에 없는 clean draft는 삭제 잔재로 정리한다.
{
  const storage = new MemoryStorage()
  const local = makePost({
    id: 'clean-missing-id',
    slug: 'clean-missing-slug',
  })

  await storage.set<DraftEnvelope>(
    COLLECTIONS.drafts,
    local.id,
    {
      post: local,
      baseRev: local.rev,
      dirty: false,
      updatedAt: local.updatedAt,
    },
  )

  const http = new TestHttp(() => ({
    status: 200,
    ok: true,
    data: {
      posts: [],
      serverTime: new Date().toISOString(),
    },
  }))

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  const posts = await sync.list()
  const remaining = await sync.getDraft(local.id)

  assert.equal(posts.length, 0, 'clean NAS-missing draft excluded')
  assert.equal(remaining, null, 'clean NAS-missing draft removed')

  sync.dispose()
  ok('목록 정리: NAS에 없는 clean draft 제거')
}

// 10. NAS에 없는 dirty draft는 미저장 로컬 변경으로 보존한다.
{
  const storage = new MemoryStorage()
  const local = makePost({
    id: 'dirty-local-id',
    slug: 'dirty-local-slug',
    title: 'unsaved local draft',
  })

  await storage.set<DraftEnvelope>(
    COLLECTIONS.drafts,
    local.id,
    {
      post: local,
      baseRev: local.rev,
      dirty: true,
      updatedAt: local.updatedAt,
    },
  )

  const http = new TestHttp(() => ({
    status: 200,
    ok: true,
    data: {
      posts: [],
      serverTime: new Date().toISOString(),
    },
  }))

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  const posts = await sync.list()
  const remaining = await sync.getDraft(local.id)

  assert.equal(posts.length, 1, 'dirty local draft remains in list')
  assert.equal(posts[0].id, local.id, 'dirty local draft ID preserved')
  assert(remaining, 'dirty local draft remains in storage')
  assert.equal(remaining.dirty, true, 'dirty flag preserved')

  sync.dispose()
  ok('목록 보존: NAS에 없는 dirty draft 유지')
}

// 11. 오래된 slug를 전달해도 ID로 현재 NAS slug를 찾아 연다.
{
  const storage = new MemoryStorage()
  const remote = makePost({
    id: 'open-current-id',
    slug: 'open-current-slug',
    title: 'current remote post',
    rev: 3,
  })

  const http = new TestHttp((request) => {
    if (request.path === '/api/posts') {
      return {
        status: 200,
        ok: true,
        data: {
          posts: [summaryOf(remote)],
          serverTime: new Date().toISOString(),
        },
      }
    }

    if (request.path === '/api/posts/open-current-slug') {
      return {
        status: 200,
        ok: true,
        data: remote,
      }
    }

    throw new Error(`Unexpected request: ${request.path}`)
  })

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  const result = await sync.openPost(
    remote.id,
    'open-obsolete-slug',
  )

  assert(
    result.kind === 'loaded',
    'post must load through ID-resolved current slug',
  )

  if (result.kind !== 'loaded') {
    throw new Error('expected loaded result')
  }

  assert.equal(result.post.id, remote.id, 'correct remote ID loaded')
  assert.equal(
    result.post.slug,
    remote.slug,
    'current NAS slug loaded',
  )
  assert(
    http.requests.some(
      (request) =>
        request.path === '/api/posts/open-current-slug',
    ),
    'GET uses current slug discovered by ID',
  )
  assert(
    !http.requests.some(
      (request) =>
        request.path === '/api/posts/open-obsolete-slug',
    ),
    'obsolete slug is not requested when list lookup succeeds',
  )

  sync.dispose()
  ok('글 열기: 오래된 slug 대신 Post.id로 현재 slug 재탐색')
}

// 12. 현재 slug 조회 결과가 다른 ID의 글이면 잘못된 글을 열지 않는다.
{
  const storage = new MemoryStorage()
  const expected = makePost({
    id: 'expected-open-id',
    slug: 'shared-current-slug',
    title: 'expected summary',
  })
  const wrong = makePost({
    id: 'different-open-id',
    slug: 'shared-current-slug',
    title: 'wrong post',
  })

  const http = new TestHttp((request) => {
    if (request.path === '/api/posts') {
      return {
        status: 200,
        ok: true,
        data: {
          posts: [summaryOf(expected)],
          serverTime: new Date().toISOString(),
        },
      }
    }

    if (request.path === '/api/posts/shared-current-slug') {
      return {
        status: 200,
        ok: true,
        data: wrong,
      }
    }

    throw new Error(`Unexpected request: ${request.path}`)
  })

  const sync = new Sync({
    http,
    storage,
    initialOnline: true,
    healthIntervalMs: 0,
  })

  const result = await sync.openPost(
    expected.id,
    'obsolete-shared-slug',
  )

  assert.equal(
    result.kind,
    'none',
    'different Post.id response must not be opened',
  )
  assert.equal(
    await sync.getDraft(wrong.id),
    null,
    'wrong post is not cached',
  )
  assert.equal(
    await sync.getDraft(expected.id),
    null,
    'expected ID is not populated with wrong post',
  )

  sync.dispose()
  ok('글 열기 안전성: slug 응답의 Post.id가 다르면 거부')
}

console.log(`\n✅ ${pass} checks passed`)
