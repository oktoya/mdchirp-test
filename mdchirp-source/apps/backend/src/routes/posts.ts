// /api/posts 라우트 — CRUD + 발행 + 히스토리. 정식 명세: apps/backend/SPEC.md §5
import { Hono } from 'hono'
import type {
  ListPostsResponse,
  PostSummary,
  SavePostRequest,
  ScheduleRequest,
  DeleteResponse,
  UnpublishResponse,
  UploadMediaResponse,
} from '@mdchirp/shared'
import { PostStore } from '../store/postStore.js'
import { PublishBuilder, MissingImagesError } from '../publisher/publishBuilder.js'
import { SimpleGitPublisher } from '../publisher/simpleGitPublisher.js'
import { normalizePublishDate, resolvePostMarkdownPath } from '../publisher/dateSlug.js'
import { getSettings } from '../store/secretStore.js'
import {
  ImageMediaError,
  MAX_IMAGE_BYTES,
  readImageMedia,
  saveImageMedia,
} from '../media/imageMedia.js'

const store = new PostStore()

// 이 서버(NAS 컨테이너)의 현재 시간대 오프셋을 '+0900' / '-0500' 형식으로 반환.
// 컨테이너 TZ 설정(예: Asia/Seoul)에 따라 값이 결정된다.
function serverOffset(): string {
  const mins = -new Date().getTimezoneOffset() // getTimezoneOffset 은 부호가 반대
  const sign = mins >= 0 ? '+' : '-'
  const abs = Math.abs(mins)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${sign}${hh}${mm}`
}

// 실제 git push 로 발행(NoopGitPublisher 대신). git 은 이미지에 설치됨(Dockerfile).
// 삭제/발행취소(git rm)도 같은 publisher 인스턴스를 공유한다.
const gitPublisher = new SimpleGitPublisher()
const builder = new PublishBuilder(gitPublisher)

// 발행취소/삭제 시 GitHub 에서 제거할 경로.
// 본문은 발행이 실제로 만든 경로(post.githubPath = _posts/YYYY-MM-DD-<slug>.md)를 그대로 쓴다.
// slug 만으로 재구성하면 날짜 접두사 때문에 어긋나 "안 지워짐" 이 되므로(dateSlug.resolveFilename 참조),
// 저장된 githubPath 를 진실로 삼고, 없는 예전 데이터만 resolveFilename 으로 폴백 계산한다.
// 이미지 폴더는 slug 기반으로 확정적(assets/img/posts/<slug>/).
// ※ meta.json 이 현재 가리키는 발행본만 제거한다. slug/date 를 바꿔 재발행해 갈라진
//    옛 파일은 별개 글(별도 폴더/목록 항목)이라 여기서 건드리지 않는다.
function githubPathsFor(post: {
  slug: string
  githubPath?: string
  frontmatter?: { date?: string }
}): string[] {
  const md = resolvePostMarkdownPath(
    post.slug,
    normalizePublishDate(post.frontmatter?.date, new Date()),
    post.githubPath,
  )
  return [md, `assets/img/posts/${post.slug}/`]
}

function toSummary(p: any): PostSummary {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    status: p.status,
    hasRichSource: p.hasRichSource,
    rev: p.rev,
    lockedBy: p.lockedBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    publishedAt: p.publishedAt,
    publishedRev: p.publishedRev,
    publishedSlug: p.publishedSlug,
    githubPath: p.githubPath,
    remoteState: p.remoteState,
    remoteCheckedAt: p.remoteCheckedAt,
    issues: p.issues,
    categories: p.frontmatter?.categories?.filter(Boolean),
    tags: p.frontmatter?.tags,
  }
}

export const posts = new Hono()

// 목록
posts.get('/', async (c) => {
  const all = await store.list()
  const res: ListPostsResponse = {
    posts: all.map(toSummary),
    serverTime: new Date().toISOString(),
  }
  return c.json(res)
})

// 이미지 업로드 — posts-src/<slug>/media/에 검증 후 저장한다.
posts.post('/:slug/media', async (c) => {
  const slug = c.req.param('slug')
  const post = await store.get(slug)

  if (!post) {
    return c.json({ error: 'post_not_found', detail: 'Post not found' }, 404)
  }

  let body: Record<string, string | File>
  try {
    body = await c.req.parseBody()
  } catch {
    return c.json({ error: 'media_required', detail: 'A multipart file is required' }, 400)
  }

  const value = body.file
  const requestedImageFormat = body.imageFormat

  if (!value || typeof value === 'string' || typeof value.arrayBuffer !== 'function') {
    return c.json({ error: 'media_required', detail: 'The file field is required' }, 400)
  }

  if (
    requestedImageFormat !== undefined &&
    requestedImageFormat !== 'original' &&
    requestedImageFormat !== 'webp'
  ) {
    return c.json(
      {
        error: 'invalid_image_format',
        detail: 'imageFormat must be original or webp',
      },
      400,
    )
  }

  if (value.size > MAX_IMAGE_BYTES) {
    return c.json(
      {
        error: 'media_too_large',
        detail: `Image exceeds the ${MAX_IMAGE_BYTES} byte limit`,
      },
      413,
    )
  }

  try {
    const media = await saveImageMedia({
      slug,
      originalName: value.name,
      data: Buffer.from(await value.arrayBuffer()),
      imageFormat: requestedImageFormat ?? getSettings().mediaPolicy.imageFormat ?? 'original',
    })

    const response: UploadMediaResponse = {
      ok: true,
      media,
    }

    return c.json(response)
  } catch (error) {
    if (error instanceof ImageMediaError) {
      return c.json(
        {
          error: error.code,
          detail: error.message,
        },
        error.status,
      )
    }

    return c.json(
      {
        error: 'media_upload_failed',
        detail: 'The image could not be uploaded',
      },
      500,
    )
  }
})

// 이미지 조회 — 에디터 미리보기와 리치 패널 렌더링에서 사용한다.
posts.get('/:slug/media/:filename', async (c) => {
  const slug = c.req.param('slug')
  const post = await store.get(slug)

  if (!post) {
    return c.json({ error: 'post_not_found', detail: 'Post not found' }, 404)
  }

  const image = await readImageMedia(slug, c.req.param('filename'))

  if (!image) {
    return c.json({ error: 'not_found', detail: 'Media file not found' }, 404)
  }

  return c.body(new Uint8Array(image.data), 200, {
    'Content-Type': image.contentType,
    'Content-Length': String(image.data.length),
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  })
})

// 글 한 건 조회
posts.get('/:slug', async (c) => {
  const post = await store.get(c.req.param('slug'))
  if (!post) return c.json({ error: 'not_found' }, 404)
  return c.json(post)
})

// 저장(업서트) — Post.id 우선 조회 + baseRev 충돌 감지
posts.put('/:slug', async (c) => {
  let body: SavePostRequest

  try {
    body = await c.req.json<SavePostRequest>()
  } catch {
    return c.json(
      {
        ok: false,
        error: 'bad_request',
        message: '올바른 JSON 요청 본문이 필요합니다.',
      },
      400,
    )
  }

  if (
    !body?.post ||
    typeof body.post.id !== 'string' ||
    body.post.id.trim().length === 0 ||
    typeof body.post.slug !== 'string' ||
    body.post.slug.trim().length === 0 ||
    !Number.isInteger(body.baseRev) ||
    body.baseRev < 0
  ) {
    return c.json(
      {
        ok: false,
        error: 'bad_request',
        message: 'post.id, post.slug 및 0 이상의 정수 baseRev가 필요합니다.',
      },
      400,
    )
  }

  const result = await store.save(body.post, body.baseRev)

  if (!result.ok) {
    const error = result.error
    const message =
      'message' in result && typeof result.message === 'string'
        ? result.message
        : error === 'version_conflict'
          ? '다른 기기에서 변경이 있었습니다.'
          : '글을 저장할 수 없습니다.'

    if (error === 'version_conflict' && 'currentPost' in result && 'currentRev' in result) {
      const conflict = {
        id: result.currentPost.id,
        currentRev: result.currentRev,
        currentPost: result.currentPost,
      }

      return c.json(
        {
          ok: false,
          error,
          message,
          conflict,

          // 기존 클라이언트와의 호환을 위한 최상위 필드
          ...conflict,
        },
        409,
      )
    }

    if (error === 'invalid_slug') {
      return c.json(
        {
          ok: false,
          error,
          message,
        },
        400,
      )
    }

    return c.json(
      {
        ok: false,
        error,
        message,
      },
      409,
    )
  }

  const forkedFromId =
    'forkedFromId' in result && typeof result.forkedFromId === 'string'
      ? result.forkedFromId
      : undefined

  return c.json({
    ok: true,
    post: result.post,
    ...(forkedFromId ? { forkedFromId } : {}),
  })
})

// 삭제 — published 면 GitHub 에서 본문+이미지 제거(git rm) 후, NAS 글폴더를 .trash 로 이동.
// draft/scheduled 면 git 없이 .trash 이동만. 로컬 draft 제거는 프론트(sync)가 응답 보고 처리.
posts.delete('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const post = await store.get(slug)
  if (!post) return c.json({ error: 'not_found' }, 404)

  let unpublished = false
  let committed: boolean | undefined
  let pushedAt: string | undefined

  // 발행된 글이면 GitHub 에서도 제거(본문+이미지폴더). git 실패는 502 로 명확히.
  if (post.status === 'published') {
    try {
      const res = await gitPublisher.removePaths(slug, githubPathsFor(post))
      unpublished = true
      committed = res.committed
      pushedAt = res.pushedAt
    } catch (e: any) {
      return c.json({ error: 'delete_failed', message: String(e?.message ?? e) }, 502)
    }
  }

  // NAS 글폴더를 .trash 로 이동(완전 삭제 아님 — 복원 여지).
  const moved = await store.remove(slug)
  if (!moved) return c.json({ error: 'not_found' }, 404)

  const body: DeleteResponse = { ok: true, unpublished, committed, pushedAt }
  return c.json(body)
})

// 발행 취소 — GitHub 에서 본문+이미지 제거. NAS 글폴더/로컬 draft 는 보존, status→draft.
// 삭제와 달리 글 자체는 남는다(다시 발행하면 복귀).
posts.post('/:slug/unpublish', async (c) => {
  const slug = c.req.param('slug')
  const post = await store.get(slug)
  if (!post) return c.json({ error: 'not_found' }, 404)
  if (post.status !== 'published') {
    return c.json({ error: 'not_published' }, 400)
  }

  let committed: boolean
  let pushedAt: string
  try {
    const res = await gitPublisher.removePaths(slug, githubPathsFor(post))
    committed = res.committed
    pushedAt = res.pushedAt
  } catch (e: any) {
    return c.json({ error: 'unpublish_failed', message: String(e?.message ?? e) }, 502)
  }

  // status를 draft로 되돌리고 현재 발행 필드를 제거한다.
  // publishedSlug는 마지막 실제 발행 slug 이력으로 보존한다.
  post.status = 'draft'
  post.githubPath = undefined
  post.publishedAt = undefined
  post.publishedRev = undefined

  const saved = await store.save(post, post.rev)

  if (!saved.ok) {
    if (saved.error === 'version_conflict') {
      return c.json(
        {
          error: 'version_conflict',
          message: saved.message,
          conflict: {
            id: saved.currentPost.id,
            currentRev: saved.currentRev,
            currentPost: saved.currentPost,
          },
        },
        409,
      )
    }

    return c.json(
      {
        error: saved.error,
        message: saved.message,
      },
      409,
    )
  }

  const body: UnpublishResponse = {
    ok: true,
    status: 'draft',
    committed,
    pushedAt,
    post: saved.post,
  }
  return c.json(body)
})

// 히스토리
posts.get('/:slug/history', async (c) => {
  return c.json({ entries: await store.history(c.req.param('slug')) })
})

// 발행 (즉시)
posts.post('/:slug/publish', async (c) => {
  const post = await store.get(c.req.param('slug'))
  if (!post) return c.json({ error: 'not_found' }, 404)

  // 발행 빌더(1~6) + git add/commit/push(7~8). git 실패는 502 로 프론트에 명확히 전달.
  // timezone 모드: 'device' 면 요청 body 의 기기 오프셋, 'nas'(기본) 면 이 서버(NAS)의 실제 오프셋.
  const body = await c.req.json().catch(() => ({}) as any)
  const mode = getSettings().timezone ?? 'nas'
  const deviceOffset = typeof body?.offset === 'string' ? body.offset : null
  const offset = mode === 'device' && deviceOffset ? deviceOffset : serverOffset()
  let build, pushedAt, committed
  try {
    ;({ build, pushedAt, committed } = await builder.publish(post, offset))
  } catch (e: any) {
    if (e instanceof MissingImagesError) {
      return c.json(
        {
          error: 'missing_images',
          details: e.missingImages,
        },
        400,
      )
    }
    return c.json({ error: 'publish_failed', message: String(e?.message ?? e) }, 502)
  }

  // 상태 갱신 (9단계) — push 성공 후에만 도달.
  post.status = 'published'
  post.githubPath = build.postMdPath
  post.publishedAt = new Date().toISOString()
  post.publishedSlug = post.slug

  // 발행 빌더가 mdchirp_id를 프런트매터에 넣고 push까지 성공했으므로,
  // 가져오기 당시의 "ID 없음" 진단과 imported 상태를 즉시 갱신한다.
  post.remoteState = 'in_sync'
  post.remoteCheckedAt = post.publishedAt
  post.issues = post.issues?.filter((postIssue) => postIssue.code !== 'missing_post_id')

  if (post.issues?.length === 0) {
    post.issues = undefined
  }

  // save 가 rev 를 +1 올리므로, 저장 후의 rev(= post.rev + 1)를 미리 publishedRev 로 기록.
  // 발행 직후엔 rev == publishedRev → 별표 없음. 이후 수정 저장 시 rev > publishedRev → "*발행됨".
  post.publishedRev = post.rev + 1
  const saved = await store.save(post, post.rev)
  const publishedPost = saved.ok ? saved.post : post

  return c.json({
    ok: true,
    status: 'published',
    githubPath: build.postMdPath,
    publishedAt: publishedPost.publishedAt,
    committed,
    pushedAt,
    rev: publishedPost.rev,
    publishedRev: publishedPost.publishedRev,
    remoteState: publishedPost.remoteState,
    remoteCheckedAt: publishedPost.remoteCheckedAt,
    issues: publishedPost.issues,
  })
})

// 예약발행
posts.post('/:slug/schedule', async (c) => {
  const body = await c.req.json<ScheduleRequest>()
  const post = await store.get(c.req.param('slug'))
  if (!post) return c.json({ error: 'not_found' }, 404)
  post.status = 'scheduled'
  post.schedule = { publishAt: body.publishAt }
  const saved = await store.save(post, post.rev)
  return c.json({ ok: saved.ok, status: 'scheduled', publishAt: body.publishAt })
})
