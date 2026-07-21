// walking skeleton 통합 테스트 — 저장/충돌/히스토리/발행빌더가 실제로 동작하는지 검증.
// 실행: pnpm --filter @mdchirp/backend test
import assert from 'node:assert'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { Post } from '@mdchirp/shared'

// 임시 데이터 디렉토리로 격리
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mdchirp-test-'))
process.env.MDCHIRP_DATA_DIR = tmp

const { config, FILES } = await import('../config.js')
const { PostStore } = await import('./postStore.js')
const { PublishBuilder } = await import('../publisher/publishBuilder.js')

const store = new PostStore()
let pass = 0
const ok = (name: string) => {
  console.log(`  ✓ ${name}`)
  pass++
}

function makePost(over: Partial<Post> = {}): Post {
  const now = new Date().toISOString()
  return {
    id: 'p1',
    slug: '2026-06-19-hello',
    title: '안녕 세계',
    tiptapJson: { type: 'doc', content: [] },
    markdown: '# 안녕\n\n본문입니다.',
    frontmatter: {
      title: '안녕 세계',
      date: '2026-06-19 14:00:00 +0900',
      categories: ['Test', 'Skeleton'],
      tags: ['mdchirp'],
    },
    media: [],
    status: 'draft',
    hasRichSource: true,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

console.log('mdchirp backend walking skeleton test')
console.log('data dir:', tmp)

// 1. 신규 저장 → rev=1, 파일 생성
{
  const r = await store.save(makePost(), 0)
  assert(r.ok && r.post.rev === 1, 'new save rev should be 1')
  const dir = path.join(config.postsSrcDir, '2026-06-19-hello')
  assert(await fs.stat(path.join(dir, FILES.postMd)), 'post.md exists')
  assert(await fs.stat(path.join(dir, FILES.meta)), 'meta.json exists')
  assert(await fs.stat(path.join(dir, FILES.source)), 'tiptap.json (.source) exists')
  ok('신규 저장: rev=1, post.md/meta.json/.source 생성')
}

// 2. meta.json엔 tiptapJson이 안 들어가야 함 (원본은 .source에만)
{
  const meta = JSON.parse(
    await fs.readFile(path.join(config.postsSrcDir, '2026-06-19-hello', FILES.meta), 'utf8'),
  )
  assert(meta.tiptapJson === null, 'meta.json should not embed tiptapJson')
  ok('meta.json은 리치원본 미포함 (.source로 분리)')
}

// 3. get은 .source를 합쳐 리치원본 복원
{
  const got = await store.get('2026-06-19-hello')
  assert(got?.tiptapJson != null, 'get should restore tiptapJson from .source')
  assert(got?.hasRichSource === true, 'hasRichSource true')
  ok('조회: .source에서 리치원본 복원, hasRichSource=true')
}

// 4. 정상 업데이트: baseRev=1 → rev=2
{
  const cur = await store.get('2026-06-19-hello')
  const r = await store.save({ ...cur!, title: '수정됨' }, 1)
  assert(r.ok && r.post.rev === 2, 'update with correct baseRev → rev=2')
  ok('정상 업데이트: baseRev 일치 → rev=2')
}

// 5. 충돌: 옛 baseRev=1로 저장 시도 → version_conflict + 히스토리 보관
{
  const r = await store.save(makePost({ title: '충돌시도', rev: 1 }), 1)
  assert(
    !r.ok &&
      r.error === 'version_conflict' &&
      r.currentRev === 2 &&
      r.currentPost.id === 'p1',
    'stale baseRev → version_conflict, currentRev=2',
  )
  const hist = await store.history('2026-06-19-hello')
  assert(hist.length >= 1, 'conflict snapshot saved to .history')
  ok('충돌 감지: 옛 baseRev → version_conflict + .history 보관')
}

// 6. 발행 빌더: posts-src → repo 표준구조로 펼침 + media_subpath 주입
{
  // 미디어 하나 추가
  const dir = path.join(config.postsSrcDir, '2026-06-19-hello', FILES.mediaDir)
  await fs.writeFile(path.join(dir, 'cover.png'), 'fake-png')
  const post = await store.get('2026-06-19-hello')
  if (post) {
    post.markdown += '\n\n![커버](cover.png)'
  }
  const builder = new PublishBuilder()
  const build = await builder.build(post!)

  const repoMd = path.join(config.repoDir, '_posts', '2026-06-19-hello.md')
  const repoImg = path.join(config.repoDir, 'assets/img/posts/2026-06-19-hello/cover.png')
  assert(await fs.stat(repoMd), '_posts/<slug>.md created in repo')
  assert(await fs.stat(repoImg), 'media copied to assets/')
  const mdContent = await fs.readFile(repoMd, 'utf8')
  assert(
    mdContent.includes('media_subpath: /assets/img/posts/2026-06-19-hello/'),
    'media_subpath injected',
  )
  assert(build.mediaSubpath === '/assets/img/posts/2026-06-19-hello/', 'mediaSubpath returned')
  ok('발행 빌더: _posts/*.md + assets/ 펼침 + media_subpath 주입')
}

// 7. 미발행 글 slug 변경 → 같은 ID를 유지하며 전체 폴더 rename
{
  const oldSlug = 'rename-old'
  const newSlug = 'rename-new'
  const id = 'rename-post'

  const created = await store.save(
    makePost({
      id,
      slug: oldSlug,
      title: 'rename 원본',
    }),
    0,
  )
  assert(created.ok && created.post.rev === 1, 'rename test post created')

  const oldDir = path.join(config.postsSrcDir, oldSlug)
  await fs.writeFile(
    path.join(oldDir, FILES.mediaDir, 'rename-image.png'),
    'rename-image',
  )

  const current = await store.get(oldSlug)
  assert(current, 'rename source post exists')

  const updated = await store.save(
    {
      ...current,
      title: 'rename 직전 수정',
    },
    current.rev,
  )
  assert(updated.ok && updated.post.rev === 2, 'history-producing update succeeds')

  const beforeRename = await store.get(oldSlug)
  assert(beforeRename, 'post exists before rename')

  const renamed = await store.save(
    {
      ...beforeRename,
      slug: newSlug,
      title: 'rename 완료',
    },
    beforeRename.rev,
  )

  assert(renamed.ok, 'unpublished slug rename succeeds')
  if (!renamed.ok) throw new Error('unpublished rename unexpectedly failed')

  assert(renamed.post.id === id, 'rename keeps the same Post.id')
  assert(renamed.post.slug === newSlug, 'rename stores the new slug')
  assert(renamed.post.rev === 3, 'rename continues the existing rev lineage')

  const oldExists = await fs
    .access(path.join(config.postsSrcDir, oldSlug))
    .then(
      () => true,
      () => false,
    )
  assert(oldExists === false, 'old slug folder removed after rename')

  const newDir = path.join(config.postsSrcDir, newSlug)
  assert(await fs.stat(path.join(newDir, FILES.meta)), 'renamed meta.json exists')
  assert(await fs.stat(path.join(newDir, FILES.postMd)), 'renamed post.md exists')
  assert(await fs.stat(path.join(newDir, FILES.source)), 'renamed .source exists')
  assert(
    await fs.stat(path.join(newDir, FILES.mediaDir, 'rename-image.png')),
    'renamed media exists',
  )

  const renamedHistory = await store.history(newSlug)
  assert(renamedHistory.length >= 2, 'rename preserves existing .history')

  ok('미발행 slug 변경: 같은 ID/rev 계보로 전체 폴더 rename')
}

// 8. 다른 글이 사용 중인 slug로 rename하면 slug_taken
{
  const source = await store.save(
    makePost({
      id: 'slug-source-id',
      slug: 'slug-source',
      title: 'slug source',
    }),
    0,
  )
  assert(source.ok, 'slug source post created')

  const target = await store.save(
    makePost({
      id: 'slug-target-id',
      slug: 'slug-target',
      title: 'slug target',
    }),
    0,
  )
  assert(target.ok, 'slug target post created')

  if (!source.ok) throw new Error('slug source creation failed')

  const collision = await store.save(
    {
      ...source.post,
      slug: 'slug-target',
    },
    source.post.rev,
  )

  assert(
    !collision.ok && collision.error === 'slug_taken',
    'occupied target slug returns slug_taken',
  )

  const sourceAfter = await store.get('slug-source')
  const targetAfter = await store.get('slug-target')
  assert(sourceAfter?.id === 'slug-source-id', 'source post remains unchanged')
  assert(targetAfter?.id === 'slug-target-id', 'target post remains unchanged')

  ok('slug 충돌: 기존 폴더를 덮어쓰지 않고 slug_taken 반환')
}

// 9. 같은 Post.id가 여러 폴더에 존재하면 duplicate_post_id
{
  const duplicateSource = await store.save(
    makePost({
      id: 'duplicate-id',
      slug: 'duplicate-one',
      title: 'duplicate source',
    }),
    0,
  )
  assert(duplicateSource.ok, 'duplicate test source created')

  await fs.cp(
    path.join(config.postsSrcDir, 'duplicate-one'),
    path.join(config.postsSrcDir, 'duplicate-two'),
    { recursive: true },
  )

  const duplicateSave = await store.save(
    makePost({
      id: 'duplicate-id',
      slug: 'duplicate-one',
      title: 'duplicate save attempt',
    }),
    1,
  )

  assert(
    !duplicateSave.ok && duplicateSave.error === 'duplicate_post_id',
    'duplicate Post.id returns duplicate_post_id',
  )

  ok('중복 ID 감지: 여러 폴더의 동일 Post.id 저장 차단')
}

// 10. 발행 이력이 있는 글의 slug 변경 → 기존 발행본 보존 + 새 draft fork
{
  const oldSlug = 'published-old'
  const newSlug = 'published-fork'
  const originalId = 'published-original-id'
  const originalGithubPath = '_posts/2026-06-19-published-old.md'

  const created = await store.save(
    makePost({
      id: originalId,
      slug: oldSlug,
      title: '발행 원본',
      markdown:
        '# 발행 원본\n\n![이미지](/api/posts/published-old/media/cover.png)',
      status: 'published',
      githubPath: originalGithubPath,
      publishedAt: '2026-06-19T05:00:00.000Z',
      publishedRev: 1,
      publishedSlug: oldSlug,
    }),
    0,
  )
  assert(created.ok && created.post.rev === 1, 'published source created')

  const originalDir = path.join(config.postsSrcDir, oldSlug)
  await fs.writeFile(
    path.join(originalDir, FILES.mediaDir, 'cover.png'),
    'published-cover',
  )

  if (!created.ok) throw new Error('published source creation failed')

  const forkResult = await store.save(
    {
      ...created.post,
      slug: newSlug,
      title: '새 fork',
      markdown:
        '# 새 fork\n\n![이미지](/api/posts/published-old/media/cover.png)',
    },
    created.post.rev,
  )

  assert(forkResult.ok, 'published slug change creates a fork')
  if (!forkResult.ok) throw new Error('published fork unexpectedly failed')

  assert(
    forkResult.forkedFromId === originalId,
    'fork result reports the original Post.id',
  )
  assert(forkResult.post.id !== originalId, 'fork receives a new Post.id')
  assert(forkResult.post.slug === newSlug, 'fork uses the requested new slug')
  assert(forkResult.post.status === 'draft', 'fork starts as draft')
  assert(forkResult.post.rev === 1, 'fork starts at rev=1')
  assert(forkResult.post.githubPath == null, 'fork does not inherit githubPath')
  assert(forkResult.post.publishedAt == null, 'fork does not inherit publishedAt')
  assert(forkResult.post.publishedRev == null, 'fork does not inherit publishedRev')
  assert(
    forkResult.post.publishedSlug == null,
    'fork does not inherit publishedSlug',
  )
  assert(
    (forkResult.post as Post & { schedule?: unknown }).schedule == null,
    'fork does not inherit schedule',
  )
  assert(
    forkResult.post.markdown.includes(
      '/api/posts/published-fork/media/cover.png',
    ),
    'fork markdown media URL uses the new slug',
  )

  const original = await store.get(oldSlug)
  assert(original, 'original published post still exists')
  assert(original.id === originalId, 'original keeps its Post.id')
  assert(original.slug === oldSlug, 'original keeps its slug')
  assert(original.title === '발행 원본', 'original content remains unchanged')
  assert(
    original.githubPath === originalGithubPath,
    'original keeps its GitHub path',
  )
  assert(
    original.publishedSlug === oldSlug,
    'original keeps its publishedSlug',
  )
  assert(original.rev === 2, 'original rev advances after first fork')
  assert(
    original.publishedRev === 2,
    'original publishedRev advances with original rev',
  )

  assert(
    await fs.stat(
      path.join(config.postsSrcDir, newSlug, FILES.mediaDir, 'cover.png'),
    ),
    'fork copies media files',
  )
  assert(
    await fs.stat(path.join(config.postsSrcDir, newSlug, FILES.source)),
    'fork copies rich source',
  )

  ok('발행 글 slug 변경: 원본 보존 + 새 ID/rev=1 draft fork')
}

// 11. 첫 fork 이후 옛 baseRev로 다시 요청하면 version_conflict
{
  const original = await store.get('published-old')
  assert(original?.rev === 2, 'original rev was advanced by first fork')

  const staleFork = await store.save(
    makePost({
      id: 'published-original-id',
      slug: 'published-stale-fork',
      title: 'stale fork attempt',
      rev: 1,
      status: 'published',
      githubPath: '_posts/2026-06-19-published-old.md',
      publishedAt: '2026-06-19T05:00:00.000Z',
      publishedRev: 1,
    }),
    1,
  )

  assert(
    !staleFork.ok &&
      staleFork.error === 'version_conflict' &&
      staleFork.currentRev === 2 &&
      staleFork.currentPost.id === 'published-original-id',
    'stale second fork returns version_conflict',
  )

  const staleFolderExists = await fs
    .access(path.join(config.postsSrcDir, 'published-stale-fork'))
    .then(
      () => true,
      () => false,
    )
  assert(staleFolderExists === false, 'stale fork does not create a folder')

  ok('stale fork 차단: 옛 baseRev 요청은 version_conflict')
}

// 12. 동시에 들어온 두 fork 요청 중 하나만 성공
{
  const originalId = 'concurrent-original-id'
  const oldSlug = 'concurrent-original'

  const created = await store.save(
    makePost({
      id: originalId,
      slug: oldSlug,
      title: '동시 fork 원본',
      status: 'published',
      githubPath: '_posts/2026-06-19-concurrent-original.md',
      publishedAt: '2026-06-19T05:00:00.000Z',
      publishedRev: 1,
    }),
    0,
  )
  assert(created.ok && created.post.rev === 1, 'concurrent source created')
  if (!created.ok) throw new Error('concurrent source creation failed')

  const [first, second] = await Promise.all([
    store.save(
      {
        ...created.post,
        slug: 'concurrent-fork-a',
        title: 'fork A',
      },
      1,
    ),
    store.save(
      {
        ...created.post,
        slug: 'concurrent-fork-b',
        title: 'fork B',
      },
      1,
    ),
  ])

  const results = [first, second]
  const successCount = results.filter((result) => result.ok).length
  const conflictCount = results.filter(
    (result) =>
      !result.ok &&
      result.error === 'version_conflict',
  ).length

  assert(successCount === 1, 'exactly one concurrent fork succeeds')
  assert(conflictCount === 1, 'the other concurrent fork conflicts')

  const original = await store.get(oldSlug)
  assert(original?.rev === 2, 'original rev advances exactly once')
  assert(
    original?.publishedRev === 2,
    'original publishedRev advances exactly once',
  )

  const forkA = await store.get('concurrent-fork-a')
  const forkB = await store.get('concurrent-fork-b')
  assert(
    Number(forkA != null) + Number(forkB != null) === 1,
    'only one fork folder is created',
  )

  ok('동시 fork 직렬화: 하나만 성공하고 나머지는 version_conflict')
}

// 13. 잘못된 slug 및 경로 탈출 차단
{
  const invalidSlugs = [
    '../escape',
    '..',
    '.',
    '/absolute',
    'nested/path',
    'nested\\path',
    ' trailing-space ',
  ]

  for (const slug of invalidSlugs) {
    const result = await store.save(
      makePost({
        id: `invalid-${slug}`,
        slug,
      }),
      0,
    )

    assert(
      !result.ok && result.error === 'invalid_slug',
      `invalid slug must be rejected: ${JSON.stringify(slug)}`,
    )
  }

  assert(
    (await store.get('../escape')) === null,
    'get rejects path traversal slug',
  )
  assert(
    (await store.remove('../escape')) === false,
    'remove rejects path traversal slug',
  )
  assert(
    (await store.history('../escape')).length === 0,
    'history rejects path traversal slug',
  )

  ok('경로 안전성: 절대경로·구분자·.. slug 차단')
}

// 14. 발행 취소된 draft는 publishedSlug 이력이 남아 있어도 같은 ID로 rename
{
  const oldSlug = 'unpublished-history-old'
  const newSlug = 'unpublished-history-renamed'
  const originalId = 'unpublished-history-id'

  // 발행 취소가 끝난 상태를 재현한다.
  // publishedSlug는 마지막 실제 발행 slug의 이력으로 보존되지만,
  // 현재 status가 draft이므로 slug 변경은 fork가 아니라 rename이어야 한다.
  const created = await store.save(
    makePost({
      id: originalId,
      slug: oldSlug,
      title: '발행 취소된 원본',
      status: 'draft',
      publishedSlug: oldSlug,
      githubPath: undefined,
      publishedAt: undefined,
      publishedRev: undefined,
    }),
    0,
  )

  assert(created.ok, 'unpublished-history source created')
  if (!created.ok) {
    throw new Error('unpublished-history source creation failed')
  }

  const oldDir = path.join(config.postsSrcDir, oldSlug)
  await fs.writeFile(
    path.join(oldDir, FILES.mediaDir, 'unpublished-image.png'),
    'unpublished-image',
  )

  const renamed = await store.save(
    {
      ...created.post,
      slug: newSlug,
      title: '발행 취소 후 slug 변경',
    },
    created.post.rev,
  )

  assert(
    renamed.ok,
    'unpublished draft slug change succeeds',
  )
  if (!renamed.ok) {
    throw new Error('unpublished draft rename failed')
  }

  assert(
    renamed.forkedFromId == null,
    'unpublished draft rename does not report forkedFromId',
  )
  assert(
    renamed.post.id === originalId,
    'rename keeps the same Post.id',
  )
  assert(
    renamed.post.slug === newSlug,
    'rename stores the requested new slug',
  )
  assert(
    renamed.post.status === 'draft',
    'renamed post remains draft',
  )
  assert(
    renamed.post.rev === 2,
    'rename continues the existing rev lineage',
  )
  assert(
    renamed.post.publishedSlug === oldSlug,
    'rename preserves the last published slug as history',
  )
  assert(
    renamed.post.githubPath == null,
    'renamed draft has no githubPath',
  )
  assert(
    renamed.post.publishedAt == null,
    'renamed draft has no publishedAt',
  )
  assert(
    renamed.post.publishedRev == null,
    'renamed draft has no publishedRev',
  )

  const oldPost = await store.get(oldSlug)
  assert(
    oldPost === null,
    'old slug no longer resolves after rename',
  )

  const renamedPost = await store.get(newSlug)
  assert(
    renamedPost?.id === originalId,
    'new slug resolves to the same Post.id',
  )
  assert(
    renamedPost?.title === '발행 취소 후 slug 변경',
    'renamed post contains the updated content',
  )

  const oldFolderExists = await fs
    .access(path.join(config.postsSrcDir, oldSlug))
    .then(
      () => true,
      () => false,
    )
  assert(
    oldFolderExists === false,
    'old slug folder is removed after rename',
  )

  assert(
    await fs.stat(path.join(config.postsSrcDir, newSlug, FILES.meta)),
    'renamed meta.json exists',
  )
  assert(
    await fs.stat(path.join(config.postsSrcDir, newSlug, FILES.postMd)),
    'renamed post.md exists',
  )
  assert(
    await fs.stat(path.join(config.postsSrcDir, newSlug, FILES.source)),
    'renamed rich source exists',
  )
  assert(
    await fs.stat(
      path.join(
        config.postsSrcDir,
        newSlug,
        FILES.mediaDir,
        'unpublished-image.png',
      ),
    ),
    'renamed media exists',
  )

  ok('발행 취소 후 slug 변경: publishedSlug를 보존하며 같은 ID로 rename')
}

console.log(`\n✅ ${pass} checks passed`)
await fs.rm(tmp, { recursive: true, force: true })
