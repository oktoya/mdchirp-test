import assert from 'node:assert'
import type {
  ListPostsResponse,
  Post,
  UnpublishResponse,
} from '@mdchirp/shared'
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

  async get<T>(
    collection: string,
    key: string,
  ): Promise<T | null> {
    const value = this.collection(collection).get(key)
    return value === undefined ? null : (value as T)
  }

  async set<T>(
    collection: string,
    key: string,
    value: T,
  ): Promise<void> {
    this.collection(collection).set(key, value)
  }

  async remove(
    collection: string,
    key: string,
  ): Promise<void> {
    this.collection(collection).delete(key)
  }

  async all<T>(collection: string): Promise<T[]> {
    return Array.from(
      this.collection(collection).values(),
    ) as T[]
  }

  async keys(collection: string): Promise<string[]> {
    return Array.from(this.collection(collection).keys())
  }
}

class UnpublishHttp implements HttpAdapter {
  readonly requests: HttpRequest[] = []

  constructor(private readonly remotePost: Post) {}

  async request<T>(
    request: HttpRequest,
  ): Promise<HttpResponse<T>> {
    this.requests.push(request)

    if (
      request.method === 'POST' &&
      request.path ===
        `/api/posts/${encodeURIComponent(this.remotePost.slug)}/unpublish`
    ) {
      const response: UnpublishResponse = {
        ok: true,
        status: 'draft',
        committed: false,
        pushedAt: '2026-07-13T08:00:00.000Z',
        post: this.remotePost,
      }

      return {
        status: 200,
        ok: true,
        data: response as T,
      }
    }

    if (
      request.method === 'GET' &&
      request.path === '/api/posts'
    ) {
      const response: ListPostsResponse = {
        posts: [
          {
            id: this.remotePost.id,
            slug: this.remotePost.slug,
            title: this.remotePost.title,
            status: this.remotePost.status,
            hasRichSource: this.remotePost.hasRichSource,
            rev: this.remotePost.rev,
            createdAt: this.remotePost.createdAt,
            updatedAt: this.remotePost.updatedAt,
            publishedAt: this.remotePost.publishedAt,
            publishedRev: this.remotePost.publishedRev,
            publishedSlug: this.remotePost.publishedSlug,
          },
        ],
        serverTime: '2026-07-13T08:00:00.000Z',
      }

      return {
        status: 200,
        ok: true,
        data: response as T,
      }
    }

    if (
      request.method === 'GET' &&
      request.path ===
        `/api/posts/${encodeURIComponent(this.remotePost.slug)}`
    ) {
      return {
        status: 200,
        ok: true,
        data: this.remotePost as T,
      }
    }

    return {
      status: 500,
      ok: false,
      data: {
        error: 'unexpected_request',
        method: request.method,
        path: request.path,
      } as T,
    }
  }
}

function makePost(
  overrides: Partial<Post> = {},
): Post {
  return {
    id: 'unpublish-post-id',
    slug: '2026-07-13-unpublish-test',
    title: '발행 취소 테스트',
    tiptapJson: {
      type: 'doc',
      content: [],
    },
    markdown: '# 발행 취소 테스트',
    frontmatter: {
      title: '발행 취소 테스트',
      date: '2026-07-13 17:00:00 +0900',
    },
    media: [],
    status: 'published',
    hasRichSource: true,
    rev: 5,
    createdAt: '2026-07-13T07:00:00.000Z',
    updatedAt: '2026-07-13T07:30:00.000Z',
    publishedAt: '2026-07-13T07:30:00.000Z',
    publishedRev: 5,
    publishedSlug: '2026-07-13-unpublish-test',
    githubPath: '_posts/2026-07-13-unpublish-test.md',
    ...overrides,
  }
}

let pass = 0

function ok(name: string): void {
  console.log(`  ✓ ${name}`)
  pass++
}

console.log('mdchirp unpublish sync test')

const published = makePost()
const unpublished = makePost({
  status: 'draft',
  rev: 6,
  updatedAt: '2026-07-13T08:00:00.000Z',
  githubPath: undefined,
  publishedAt: undefined,
  publishedRev: undefined,
})

const storage = new MemoryStorage()
const http = new UnpublishHttp(unpublished)

await storage.set<DraftEnvelope>(
  COLLECTIONS.drafts,
  published.id,
  {
    post: published,
    baseRev: 5,
    dirty: false,
    updatedAt: published.updatedAt,
  },
)

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

const result = await sync.unpublish(published.slug)

assert(result.ok, 'unpublish must succeed')
if (!result.ok) {
  throw new Error('unpublish unexpectedly failed')
}

assert.equal(result.post.id, published.id)
assert.equal(result.post.status, 'draft')
assert.equal(result.post.rev, 6)
assert.equal(result.post.publishedSlug, published.slug)
assert.equal(result.post.githubPath, undefined)
assert.equal(result.post.publishedAt, undefined)
assert.equal(result.post.publishedRev, undefined)
assert.equal(result.committed, false)
ok('발행 취소 응답의 최신 Post와 rev 보존')

const cached = await sync.getDraft(published.id)

assert(cached, 'unpublished draft must remain cached')
assert.equal(cached.post.rev, 6)
assert.equal(cached.baseRev, 6)
assert.equal(cached.dirty, false)
assert.equal(cached.post.status, 'draft')
assert.equal(cached.post.publishedSlug, published.slug)
ok('발행 취소 후 로컬 post.rev와 baseRev 동기화')

const opened = await sync.openPost(
  published.id,
  published.slug,
)

assert.equal(opened.kind, 'local')
assert.equal(conflictCount, 0)
ok('발행 취소 후 다시 열어도 stale 또는 충돌 없음')

sync.dispose()

console.log(`\n✅ ${pass} checks passed`)
