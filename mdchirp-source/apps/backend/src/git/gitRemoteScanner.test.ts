import assert from 'node:assert'
import type { GitRefreshResponse, Post } from '@mdchirp/shared'
import {
  GitRefreshService,
  parseRemoteMarkdown,
  type RefreshPostStore,
  type RemotePostScanner,
  type RemoteScanResult,
} from './gitRemoteScanner.js'
import { createGitRoutes } from '../routes/git.js'
import type { RemotePostObservation } from '../store/postStore.js'

let pass = 0

function ok(name: string): void {
  console.log(`  ✓ ${name}`)
  pass++
}

function makePost(overrides: Partial<Post> = {}): Post {
  const now = '2026-07-21T00:00:00.000Z'

  return {
    id: 'existing-id',
    slug: '2026-07-20-existing',
    title: 'Existing',
    tiptapJson: null,
    markdown: 'Existing body',
    frontmatter: {
      title: 'Existing',
      mdchirp_id: 'existing-id',
      date: '2026-07-20 09:00:00 +0900',
    },
    media: [],
    status: 'published',
    hasRichSource: false,
    rev: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    publishedRev: 1,
    publishedSlug: '2026-07-20-existing',
    githubPath: '_posts/2026-07-20-existing.md',
    ...overrides,
  }
}

function clonePost(post: Post): Post {
  return structuredClone(post)
}

class MemoryStore implements RefreshPostStore {
  constructor(public posts: Post[]) {}

  async list(): Promise<Post[]> {
    return this.posts.map(clonePost)
  }

  async save(incoming: Post, _baseRev: number): ReturnType<RefreshPostStore['save']> {
    if (this.posts.some((post) => post.id === incoming.id)) {
      return {
        ok: false,
        error: 'duplicate_post_id',
        message: 'duplicate id',
      }
    }

    if (this.posts.some((post) => post.slug === incoming.slug)) {
      return {
        ok: false,
        error: 'slug_taken',
        message: 'duplicate slug',
      }
    }

    const saved: Post = {
      ...clonePost(incoming),
      rev: 1,
    }

    this.posts.push(saved)

    return {
      ok: true,
      post: clonePost(saved),
    }
  }

  async applyRemoteObservations(observations: RemotePostObservation[]): Promise<void> {
    const byId = new Map(observations.map((observation) => [observation.id, observation]))

    for (const post of this.posts) {
      const observation = byId.get(post.id)

      if (!observation) {
        delete post.remoteState
        delete post.remoteCheckedAt
        delete post.issues
        continue
      }

      if (!post.githubPath && observation.githubPath) {
        post.githubPath = observation.githubPath
      }

      post.remoteState = observation.remoteState
      post.remoteCheckedAt = observation.remoteCheckedAt
      post.issues = observation.issues?.length ? structuredClone(observation.issues) : undefined
    }
  }
}

class FixedScanner implements RemotePostScanner {
  constructor(private result: RemoteScanResult) {}

  async scan(): Promise<RemoteScanResult> {
    return this.result
  }
}

function successResponse(): GitRefreshResponse {
  return {
    ok: true,
    checkedAt: '2026-07-21T00:00:00.000Z',
    remoteCommit: 'abc123',
    importedPostIds: [],
    diagnostics: [],
    skippedNonstandardPaths: [],
  }
}

console.log('mdchirp Git remote scanner test')

// 1. YAML 프론트매터와 본문 파싱
{
  const parsed = parseRemoteMarkdown(
    '_posts/2026-07-21-remote.md',
    [
      '---',
      'title: Remote post',
      'mdchirp_id: remote-id',
      'date: 2026-07-21 09:00:00 +0900',
      'tags:',
      '  - test',
      '---',
      '',
      '# Remote body',
    ].join('\n'),
  )

  assert.equal(parsed.slug, '2026-07-21-remote')
  assert.equal(parsed.title, 'Remote post')
  assert.equal(parsed.mdchirpId, 'remote-id')
  assert(parsed.markdown.includes('# Remote body'))
  ok('표준 GitHub Markdown 프론트매터와 본문 파싱')
}

// 2. 프론트매터가 없는 파일은 파싱 실패
{
  assert.throws(
    () => parseRemoteMarkdown('_posts/2026-07-21-invalid.md', '# frontmatter 없음'),
    /frontmatter/,
  )
  ok('프론트매터가 없는 파일은 구조화된 오류 대상으로 분류 가능')
}

// 3. GitHub 전용 글 import, 일치, 누락, 중복 ID 진단
{
  const existing = makePost()
  const missing = makePost({
    id: 'missing-id',
    slug: '2026-07-19-missing',
    title: 'Missing',
    frontmatter: {
      title: 'Missing',
      mdchirp_id: 'missing-id',
    },
    publishedSlug: '2026-07-19-missing',
    githubPath: '_posts/2026-07-19-missing.md',
  })

  const scan: RemoteScanResult = {
    remoteCommit: 'remote-commit-sha',
    posts: [
      {
        githubPath: '_posts/2026-07-20-existing.md',
        slug: '2026-07-20-existing',
        title: 'Existing',
        markdown: 'Existing body',
        frontmatter: {
          title: 'Existing',
          mdchirp_id: 'existing-id',
        },
        mdchirpId: 'existing-id',
      },
      {
        githubPath: '_posts/2026-07-21-new.md',
        slug: '2026-07-21-new',
        title: 'New remote post',
        markdown: '# New body',
        frontmatter: {
          title: 'New remote post',
        },
      },
      {
        githubPath: '_posts/2026-07-18-duplicate-a.md',
        slug: '2026-07-18-duplicate-a',
        title: 'Duplicate A',
        markdown: 'A',
        frontmatter: {
          title: 'Duplicate A',
          mdchirp_id: 'duplicate-id',
        },
        mdchirpId: 'duplicate-id',
      },
      {
        githubPath: '_posts/2026-07-18-duplicate-b.md',
        slug: '2026-07-18-duplicate-b',
        title: 'Duplicate B',
        markdown: 'B',
        frontmatter: {
          title: 'Duplicate B',
          mdchirp_id: 'duplicate-id',
        },
        mdchirpId: 'duplicate-id',
      },
    ],
    invalidDiagnostics: [
      {
        githubPath: '_posts/2026-07-17-invalid.md',
        title: '2026-07-17-invalid',
        state: 'invalid',
        issues: [
          {
            code: 'invalid_frontmatter',
            severity: 'error',
            message: '프론트매터 오류',
            githubPath: '_posts/2026-07-17-invalid.md',
          },
        ],
      },
    ],
    skippedNonstandardPaths: ['_posts/no-date-file.md'],
    discoveredStandardPaths: new Set([
      '_posts/2026-07-20-existing.md',
      '_posts/2026-07-21-new.md',
      '_posts/2026-07-18-duplicate-a.md',
      '_posts/2026-07-18-duplicate-b.md',
      '_posts/2026-07-17-invalid.md',
    ]),
  }

  const store = new MemoryStore([existing, missing])
  const service = new GitRefreshService(new FixedScanner(scan), store)
  const response = await service.refresh()

  assert.equal(response.ok, true)
  assert.equal(response.remoteCommit, 'remote-commit-sha')
  assert.equal(response.importedPostIds.length, 1)
  assert.deepEqual(response.skippedNonstandardPaths, ['_posts/no-date-file.md'])

  const imported = store.posts.find((post) => post.slug === '2026-07-21-new')

  assert(imported)
  assert.equal(imported.status, 'published')
  assert.equal(imported.hasRichSource, false)
  assert.equal(imported.githubPath, '_posts/2026-07-21-new.md')
  assert.equal(imported.frontmatter.mdchirp_id, imported.id)
  assert.equal(imported.remoteState, 'imported')
  assert(imported.issues?.some((entry) => entry.code === 'missing_post_id'))

  const synced = store.posts.find((post) => post.id === 'existing-id')
  assert.equal(synced?.remoteState, 'in_sync')

  const remoteMissing = store.posts.find((post) => post.id === 'missing-id')
  assert.equal(remoteMissing?.remoteState, 'remote_missing')
  assert(remoteMissing?.issues?.some((entry) => entry.code === 'remote_post_missing'))

  assert(
    response.diagnostics.some(
      (entry) => entry.state === 'invalid' && entry.githubPath === '_posts/2026-07-17-invalid.md',
    ),
  )
  assert.equal(
    response.diagnostics.filter((entry) =>
      entry.issues.some((item) => item.code === 'duplicate_post_id'),
    ).length,
    2,
  )

  ok('GitHub 전용 글 import와 일치·누락·중복·비표준 진단')
}

// 4. HTTP 라우트는 동시에 두 번 새로고침하지 않는다.
{
  let release: ((value: GitRefreshResponse) => void) | undefined

  const runner = {
    refresh: () =>
      new Promise<GitRefreshResponse>((resolve) => {
        release = resolve
      }),
  }

  const routes = createGitRoutes(runner)
  const firstRequest = routes.request('/refresh', {
    method: 'POST',
  })

  await Promise.resolve()

  const duplicateRequest = await routes.request('/refresh', {
    method: 'POST',
  })

  assert.equal(duplicateRequest.status, 409)

  const duplicateBody = (await duplicateRequest.json()) as GitRefreshResponse
  assert.equal(duplicateBody.ok, false)
  assert.equal(duplicateBody.error, 'refresh_in_progress')

  assert(release)
  release(successResponse())

  const firstResponse = await firstRequest
  assert.equal(firstResponse.status, 200)

  ok('동시 GitHub 새로고침 요청 차단')
}

// 5. 원격 조회 실패는 구조화된 실패 응답으로 변환
{
  const routes = createGitRoutes({
    async refresh() {
      throw new Error('network unavailable')
    },
  })

  const response = await routes.request('/refresh', {
    method: 'POST',
  })
  const body = (await response.json()) as GitRefreshResponse

  assert.equal(response.status, 502)
  assert.equal(body.ok, false)
  assert.equal(body.error, 'remote_refresh_failed')
  assert.match(body.detail ?? '', /network unavailable/)

  ok('원격 조회 실패를 remote_refresh_failed로 반환')
}

console.log(`\n✅ ${pass} checks passed`)
