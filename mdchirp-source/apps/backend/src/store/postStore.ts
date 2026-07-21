// 글 저장소 — NAS 디스크의 글폴더 구조(posts-src/<slug>/)를 읽고 쓴다.
// Post.id 우선 조회, rev 충돌 감지, slug rename/fork 및 히스토리 보관을 담당.
// 정식 명세: apps/backend/SPEC.md §4, §6-1

import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Post, HistoryEntry } from '@mdchirp/shared'
import { config, FILES } from '../config.js'

export interface SaveOk {
  ok: true
  post: Post
  forkedFromId?: string
}

export interface SaveVersionConflict {
  ok: false
  error: 'version_conflict'
  message: string
  currentRev: number
  currentPost: Post
}

export interface SaveStorageConflict {
  ok: false
  error: 'slug_taken' | 'duplicate_post_id' | 'invalid_slug'
  message: string
}

export type SaveResult = SaveOk | SaveVersionConflict | SaveStorageConflict

interface LocatedPost {
  slug: string
  post: Post
}

function isSafeSlug(slug: unknown): slug is string {
  if (typeof slug !== 'string') return false
  if (slug.length === 0 || slug !== slug.trim()) return false
  if (slug === '.' || slug === '..') return false
  if (slug.includes('\0') || slug.includes('/') || slug.includes('\\')) return false
  if (path.isAbsolute(slug)) return false
  return true
}

/** 글 작업폴더 절대경로. slug가 곧 폴더명. */
function postDir(slug: string): string {
  if (!isSafeSlug(slug)) {
    throw new Error(`Invalid post slug: ${JSON.stringify(slug)}`)
  }

  const root = path.resolve(config.postsSrcDir)
  const resolved = path.resolve(root, slug)

  if (path.dirname(resolved) !== root) {
    throw new Error(`Post slug escapes posts-src: ${JSON.stringify(slug)}`)
  }

  return resolved
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function moveDirectory(source: string, destination: string): Promise<void> {
  try {
    await fs.rename(source, destination)
  } catch {
    await fs.cp(source, destination, { recursive: true })
    await fs.rm(source, { recursive: true, force: true })
  }
}

async function copyIfExists(source: string, destination: string): Promise<void> {
  if (!(await exists(source))) return
  await ensureDir(path.dirname(destination))
  await fs.cp(source, destination, { recursive: true })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * fork된 글이 기존 slug의 NAS/API/GitHub 이미지 경로를 들고 있지 않도록
 * Post 내부의 문자열 경로를 새 slug 기준으로 바꾼다.
 */
function rewriteForkPaths<T>(value: T, oldSlug: string, newSlug: string): T {
  const oldSlugPattern = escapeRegExp(oldSlug)

  const rewriteString = (text: string): string =>
    text
      .replace(
        new RegExp(`posts-src([\\\\/]+)${oldSlugPattern}([\\\\/]+)media`, 'g'),
        (_match, slash1: string, slash2: string) =>
          `posts-src${slash1}${newSlug}${slash2}media`,
      )
      .replace(
        new RegExp(`/api/posts/${oldSlugPattern}/media`, 'g'),
        `/api/posts/${newSlug}/media`,
      )
      .replace(
        new RegExp(`assets/img/posts/${oldSlugPattern}(?=/|$)`, 'g'),
        `assets/img/posts/${newSlug}`,
      )

  const visit = (current: unknown): unknown => {
    if (typeof current === 'string') return rewriteString(current)
    if (Array.isArray(current)) return current.map(visit)

    if (current && typeof current === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(current)) {
        result[key] = visit(child)
      }
      return result
    }

    return current
  }

  return visit(value) as T
}

/** post.md = 프론트매터(YAML) + 본문. meta.json이 진실원이고 post.md는 파생물. */
function renderPostMd(post: Post): string {
  const fm = post.frontmatter
  const lines: string[] = ['---']
  lines.push(`title: ${JSON.stringify(post.title)}`)
  lines.push(`date: ${fm.date}`)
  if (fm.categories?.length) lines.push(`categories: [${fm.categories.filter(Boolean).join(', ')}]`)
  if (fm.tags?.length) lines.push(`tags: [${fm.tags.join(', ')}]`)
  if (fm.description) lines.push(`description: ${JSON.stringify(fm.description)}`)
  if (fm.pin) lines.push('pin: true')
  if (fm.math) lines.push('math: true')
  if (fm.mermaid) lines.push('mermaid: true')
  if (fm.toc === false) lines.push('toc: false')
  if (fm.comments === false) lines.push('comments: false')
  lines.push('---', '', post.markdown)
  return lines.join('\n')
}

export class PostStore {
  /**
   * rename/fork/rev 검사를 하나의 임계 구역에서 처리한다.
   * 한 프로세스 안에서 동시에 들어온 저장 요청은 반드시 순서대로 실행된다.
   */
  private mutationTail: Promise<void> = Promise.resolve()

  /** 안전한 slug의 meta.json과 리치 원본을 읽는다. */
  private async readPost(slug: string): Promise<Post | null> {
    if (!isSafeSlug(slug)) return null

    const dir = postDir(slug)
    const metaPath = path.join(dir, FILES.meta)
    if (!(await exists(metaPath))) return null

    const post: Post = JSON.parse(await fs.readFile(metaPath, 'utf8'))

    const srcPath = path.join(dir, FILES.source)
    if (await exists(srcPath)) {
      try {
        post.tiptapJson = JSON.parse(await fs.readFile(srcPath, 'utf8'))
      } catch {
        /* 손상된 리치 원본은 무시하고 meta.json 내용을 유지한다. */
      }
    }

    return post
  }

  /** meta.json과 파생 post.md, 선택적 리치 원본을 기록한다. */
  private async writePost(post: Post): Promise<void> {
    const dir = postDir(post.slug)

    await ensureDir(dir)
    await ensureDir(path.join(dir, FILES.mediaDir))

    if (post.tiptapJson != null) {
      const sourcePath = path.join(dir, FILES.source)
      await ensureDir(path.dirname(sourcePath))
      await fs.writeFile(sourcePath, JSON.stringify(post.tiptapJson, null, 2))
    }

    const metaToWrite: Post = {
      ...post,
      tiptapJson: null,
    }

    await fs.writeFile(
      path.join(dir, FILES.meta),
      JSON.stringify(metaToWrite, null, 2),
    )
    await fs.writeFile(path.join(dir, FILES.postMd), renderPostMd(post))
  }

  /** 같은 Post.id를 가진 모든 폴더를 찾는다. */
  private async findById(id: string): Promise<LocatedPost[]> {
    await ensureDir(config.postsSrcDir)

    const entries = await fs.readdir(config.postsSrcDir, {
      withFileTypes: true,
    })
    const matches: LocatedPost[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeSlug(entry.name)) continue

      try {
        const post = await this.readPost(entry.name)
        if (post?.id === id) {
          matches.push({
            slug: entry.name,
            post,
          })
        }
      } catch {
        // 손상된 다른 글 하나 때문에 전체 ID 검색을 중단하지 않는다.
      }
    }

    return matches
  }

  /** 모든 글의 meta.json을 읽어 목록 반환. */
  async list(): Promise<Post[]> {
    await ensureDir(config.postsSrcDir)

    const entries = await fs.readdir(config.postsSrcDir, {
      withFileTypes: true,
    })
    const posts: Post[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeSlug(entry.name)) continue

      try {
        const post = await this.readPost(entry.name)
        if (post) posts.push(post)
      } catch {
        /* 손상된 글은 목록에서 제외한다. */
      }
    }

    return posts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(slug: string): Promise<Post | null> {
    if (!isSafeSlug(slug)) return null
    return this.readPost(slug)
  }

  /**
   * 모든 저장 요청을 직렬화한다.
   *
   * 실제 처리 순서:
   * 1. incoming.id로 현재 글 검색
   * 2. 중복 ID 검사
   * 3. baseRev 검사
   * 4. 동일 slug 저장 / draft rename / 현재 발행 중인 글 fork
   */
  async save(incoming: Post, baseRev: number): Promise<SaveResult> {
    const operation = this.mutationTail.then(() =>
      this.saveSerialized(incoming, baseRev),
    )

    this.mutationTail = operation.then(
      () => undefined,
      () => undefined,
    )

    return operation
  }

  private async saveSerialized(
    incoming: Post,
    baseRev: number,
  ): Promise<SaveResult> {
    if (
      !incoming ||
      typeof incoming.id !== 'string' ||
      incoming.id.trim().length === 0 ||
      !isSafeSlug(incoming.slug)
    ) {
      return {
        ok: false,
        error: 'invalid_slug',
        message: '유효한 post.id와 안전한 slug가 필요합니다.',
      }
    }

    const matches = await this.findById(incoming.id)

    if (matches.length > 1) {
      return {
        ok: false,
        error: 'duplicate_post_id',
        message: `동일한 Post.id가 여러 폴더에 존재합니다: ${incoming.id}`,
      }
    }

    const located = matches[0]

    // 신규 글: 대상 slug 폴더가 이미 있으면 다른 글을 덮어쓰지 않는다.
    if (!located) {
      const targetDir = postDir(incoming.slug)

      if (await exists(targetDir)) {
        return {
          ok: false,
          error: 'slug_taken',
          message: `이미 사용 중인 slug입니다: ${incoming.slug}`,
        }
      }

      const now = new Date().toISOString()
      const post: Post = {
        ...incoming,
        rev: 1,
        hasRichSource: incoming.tiptapJson != null || incoming.hasRichSource || false,
        createdAt: incoming.createdAt ?? now,
        updatedAt: now,
      }

      await this.writePost(post)
      return { ok: true, post }
    }

    const existing = located.post
    const existingSlug = located.slug

    // rename/fork 판단 전에 반드시 현재 ID의 rev부터 검사한다.
    if (baseRev !== existing.rev) {
      await this.appendHistory(existingSlug, incoming, 'conflict')

      return {
        ok: false,
        error: 'version_conflict',
        message: '다른 기기에서 변경이 있었습니다.',
        currentRev: existing.rev,
        currentPost: existing,
      }
    }

    // slug가 바뀌는 경우 대상 폴더 점유 여부를 먼저 확인한다.
    if (incoming.slug !== existingSlug) {
      const targetDir = postDir(incoming.slug)

      if (await exists(targetDir)) {
        return {
          ok: false,
          error: 'slug_taken',
          message: `이미 사용 중인 slug입니다: ${incoming.slug}`,
        }
      }
    }

    // 현재 실제로 발행 중인 글만 기존 GitHub 발행본을 보존하는 fork 대상이다.
    // 발행 취소되어 status='draft'가 된 글은 publishedSlug 같은 과거 이력이
    // 남아 있더라도 동일 ID와 전체 폴더를 유지한 채 rename한다.
    const hasActivePublication = existing.status === 'published'

    if (incoming.slug !== existingSlug && hasActivePublication) {
      return this.forkPublishedPost(existingSlug, existing, incoming)
    }

    await this.appendHistory(existingSlug, existing, 'overwrite')

    // 미발행 글의 slug 변경은 동일 ID와 전체 폴더 내용을 유지한 채 rename한다.
    if (incoming.slug !== existingSlug) {
      await moveDirectory(postDir(existingSlug), postDir(incoming.slug))
    }

    const now = new Date().toISOString()
    const post: Post = {
      ...incoming,
      id: existing.id,
      rev: existing.rev + 1,
      hasRichSource:
        incoming.tiptapJson != null ||
        existing.hasRichSource ||
        false,
      createdAt: existing.createdAt,
      updatedAt: now,

      // 일반 저장에서는 기존 발행 revision과 발행 slug 이력을 보존한다.
      publishedRev: incoming.publishedRev ?? existing.publishedRev,
      publishedSlug: incoming.publishedSlug ?? existing.publishedSlug,
    }

    await this.writePost(post)
    return { ok: true, post }
  }

  /**
   * 현재 status가 published인 글의 slug가 변경되면:
   * - 기존 글은 내용/slug/GitHub 경로를 그대로 유지한다.
   * - 기존 rev를 1 증가시키고 publishedRev를 같은 값으로 맞춘다.
   * - 새 UUID를 가진 rev=1 draft를 생성한다.
   * - media와 리치 원본은 새 폴더로 복사한다.
   *
   * 발행 취소되어 status가 draft인 글은 이 함수를 호출하지 않고
   * 같은 Post.id와 rev 계보를 유지한 폴더 rename으로 처리한다.
   */
  private async forkPublishedPost(
    originalSlug: string,
    existing: Post,
    incoming: Post,
  ): Promise<SaveResult> {
    const now = new Date().toISOString()
    const originalNextRev = existing.rev + 1

    await this.appendHistory(originalSlug, existing, 'overwrite')

    const original: Post = {
      ...existing,
      rev: originalNextRev,
      publishedRev: originalNextRev,
      updatedAt: now,
    }

    // 기존 발행본은 기존 폴더와 기존 GitHub 경로에 그대로 기록한다.
    await this.writePost(original)

    const sourceDir = postDir(originalSlug)
    const forkDir = postDir(incoming.slug)

    await ensureDir(forkDir)

    await copyIfExists(
      path.join(sourceDir, FILES.mediaDir),
      path.join(forkDir, FILES.mediaDir),
    )
    await copyIfExists(
      path.join(sourceDir, FILES.source),
      path.join(forkDir, FILES.source),
    )

    const rewrittenIncoming = rewriteForkPaths(
      incoming,
      originalSlug,
      incoming.slug,
    )

    const fork: Post = {
      ...rewrittenIncoming,
      id: randomUUID(),
      status: 'draft',
      rev: 1,
      hasRichSource:
        rewrittenIncoming.tiptapJson != null ||
        existing.hasRichSource ||
        false,
      createdAt: now,
      updatedAt: now,
    }

    // 새 fork는 기존 발행 및 예약 흔적을 이어받지 않는다.
    delete fork.githubPath
    delete fork.publishedAt
    delete fork.publishedRev
    delete fork.publishedSlug
    delete fork.schedule

    await this.writePost(fork)

    return {
      ok: true,
      post: fork,
      forkedFromId: existing.id,
    }
  }

  /** 글 삭제 = 완전 제거가 아니라 .trash로 이동한다. */
  async remove(slug: string): Promise<boolean> {
    if (!isSafeSlug(slug)) return false

    const dir = postDir(slug)
    if (!(await exists(dir))) return false

    await ensureDir(config.trashDir)

    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)
    const dest = path.join(config.trashDir, `${slug}__${stamp}`)

    await moveDirectory(dir, dest)
    return true
  }

  /** 충돌/덮어쓰기 시 스냅샷을 .history/에 보관한다. */
  async appendHistory(
    slug: string,
    snapshot: Post,
    reason: HistoryEntry['reason'],
  ): Promise<HistoryEntry> {
    if (!isSafeSlug(slug)) {
      throw new Error(`Invalid history slug: ${JSON.stringify(slug)}`)
    }

    const histDir = path.join(postDir(slug), FILES.historyDir)
    await ensureDir(histDir)

    const now = new Date()
    const stamp = now.toISOString().replace(/[:.]/g, '-')
    const fileName =
      `${stamp}-rev${snapshot.rev}-` +
      `${snapshot.lockedBy?.deviceId ?? 'unknown'}.json`
    const snapshotPath = path.join(histDir, fileName)

    await fs.writeFile(
      snapshotPath,
      JSON.stringify(snapshot, null, 2),
    )

    return {
      rev: snapshot.rev,
      deviceId: snapshot.lockedBy?.deviceId ?? 'unknown',
      savedAt: now.toISOString(),
      reason,
      snapshotPath: path.relative(config.postsSrcDir, snapshotPath),
    }
  }

  async history(slug: string): Promise<HistoryEntry[]> {
    if (!isSafeSlug(slug)) return []

    const histDir = path.join(postDir(slug), FILES.historyDir)
    if (!(await exists(histDir))) return []

    const files = await fs.readdir(histDir)

    return files.sort().map((fileName) => {
      const match = fileName.match(/rev(\d+)-(.+)\.json$/)

      return {
        rev: match ? Number(match[1]) : 0,
        deviceId: match ? match[2] : 'unknown',
        savedAt: fileName.slice(0, 19),
        reason: 'conflict' as const,
        snapshotPath: path.join(path.basename(histDir), fileName),
      }
    })
  }
}
