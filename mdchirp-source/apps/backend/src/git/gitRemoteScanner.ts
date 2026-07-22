// 사용자가 요청한 수동 GitHub 새로고침 구현.
//
// 앱 시작 시에는 이 모듈을 호출하지 않는다.
// 사용자가 새로고침을 요청했을 때만 원격 브랜치를 fetch하고,
// 원격 _posts를 NAS posts-src 목록과 비교한 뒤 GitHub 전용 글을 가져온다.

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { parse as parseYaml } from 'yaml'
import type {
  ChirpyFrontmatter,
  GitRefreshResponse,
  Post,
  PostIssue,
  RemotePostDiagnostic,
  RemotePostState,
} from '@mdchirp/shared'
import { config } from '../config.js'
import { getSecret, getSettings } from '../store/secretStore.js'
import {
  PostStore,
  type RemoteMediaImport,
  type RemotePostObservation,
} from '../store/postStore.js'

const execFileAsync = promisify(execFile)

const STANDARD_POST_PATH = /^_posts\/\d{4}-\d{2}-\d{2}-(.+)\.md$/

export type RemoteMediaAsset = RemoteMediaImport

export interface ParsedRemotePost {
  githubPath: string
  slug: string
  title: string
  markdown: string
  frontmatter: ChirpyFrontmatter
  mdchirpId?: string
  mediaAssets?: RemoteMediaAsset[]
  mediaIssues?: PostIssue[]
}

export interface RemoteScanResult {
  remoteCommit: string
  posts: ParsedRemotePost[]
  invalidDiagnostics: RemotePostDiagnostic[]
  skippedNonstandardPaths: string[]
  discoveredStandardPaths: Set<string>
}

export interface RemotePostScanner {
  scan(): Promise<RemoteScanResult>
}

export interface RefreshPostStore {
  list(): Promise<Post[]>
  save(
    post: Post,
    baseRev: number,
  ): Promise<
    | {
        ok: true
        post: Post
        forkedFromId?: string
      }
    | {
        ok: false
        error: 'version_conflict' | 'slug_taken' | 'duplicate_post_id' | 'invalid_slug'
        message: string
      }
  >
  applyRemoteObservations(observations: RemotePostObservation[]): Promise<void>
  importRemoteMedia?(postId: string, assets: RemoteMediaImport[]): Promise<Post>
}

function normalizeGithubPath(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.trim().replace(/\\/g, '/')
}

function fallbackTitle(githubPath: string): string {
  const filename = githubPath.split('/').pop() ?? githubPath
  return filename.replace(/\.md$/i, '')
}

function issue(
  code: PostIssue['code'],
  severity: PostIssue['severity'],
  message: string,
  githubPath?: string,
  detail?: string,
): PostIssue {
  return {
    code,
    severity,
    message,
    githubPath,
    detail,
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function parseRemoteMarkdown(githubPath: string, source: string): ParsedRemotePost {
  const normalizedSource = source.replace(/^\uFEFF/, '')
  const match = normalizedSource.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/,
  )

  if (!match) {
    throw new Error('YAML frontmatter 구분자(---)를 찾을 수 없습니다.')
  }

  let parsed: unknown
  try {
    parsed = parseYaml(match[1])
  } catch (error) {
    throw new Error(`YAML 파싱 실패: ${errorText(error)}`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('프론트매터가 YAML 객체가 아닙니다.')
  }

  const record = parsed as Record<string, unknown>
  const title = typeof record.title === 'string' ? record.title.trim() : ''

  if (!title) {
    throw new Error('프론트매터 title이 없거나 비어 있습니다.')
  }

  const pathMatch = githubPath.match(STANDARD_POST_PATH)
  if (!pathMatch) {
    throw new Error('표준 GitHub 글 경로가 아닙니다.')
  }

  const slug = githubPath.slice('_posts/'.length).replace(/\.md$/i, '')

  const rawId = record.mdchirp_id
  const mdchirpId = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : undefined

  const frontmatter = {
    ...record,
    title,
    ...(mdchirpId ? { mdchirp_id: mdchirpId } : {}),
  } as unknown as ChirpyFrontmatter

  return {
    githubPath,
    slug,
    title,
    markdown: match[2],
    frontmatter,
    mdchirpId,
  }
}

function validBranch(branch: string): boolean {
  return (
    /^[A-Za-z0-9._/-]+$/.test(branch) &&
    !branch.startsWith('/') &&
    !branch.endsWith('/') &&
    !branch.includes('..')
  )
}

function validRepository(repository: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
}

function resolveRemoteMediaDirectory(post: ParsedRemotePost): string | undefined {
  const mediaSubpath = post.frontmatter.media_subpath?.trim()

  if (!mediaSubpath) return undefined

  if (/^(?:https?:)?\/\//i.test(mediaSubpath) || mediaSubpath.startsWith('data:')) {
    throw new Error(`외부 URL은 media_subpath로 사용할 수 없습니다: ${mediaSubpath}`)
  }

  const normalized = path.posix
    .normalize(mediaSubpath.replace(/^\/+/, ''))
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '')

  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('\0') ||
    normalized === '.git' ||
    normalized.startsWith('.git/')
  ) {
    throw new Error(`안전하지 않은 media_subpath입니다: ${mediaSubpath}`)
  }

  return normalized
}

export class GitRemoteScanner implements RemotePostScanner {
  async scan(): Promise<RemoteScanResult> {
    if (!fs.existsSync(config.repoDir)) {
      throw new Error(`Git 저장소 디렉터리가 없습니다: ${config.repoDir}`)
    }

    if (!fs.existsSync(`${config.repoDir}/.git`)) {
      throw new Error(`Git 워킹카피가 아닙니다: ${config.repoDir}`)
    }

    const settings = getSettings()
    const repository = settings.github.repo.trim()
    const branch = settings.github.branch.trim() || 'main'

    if (!validRepository(repository)) {
      throw new Error('GitHub 저장소 설정은 owner/name 형식이어야 합니다.')
    }

    if (!validBranch(branch)) {
      throw new Error(`안전하지 않은 Git 브랜치 이름입니다: ${branch}`)
    }

    const token = getSecret('github')
    if (!token) {
      throw new Error('GitHub 토큰이 없습니다. 앱 설정에서 GitHub 토큰을 저장하세요.')
    }

    const authenticatedRemote = `https://x-access-token:${token}` + `@github.com/${repository}.git`
    const remoteRef = `refs/remotes/origin/${branch}`

    try {
      await this.git([
        'fetch',
        '--quiet',
        authenticatedRemote,
        `+refs/heads/${branch}:${remoteRef}`,
      ])
    } catch (error) {
      const safeMessage = errorText(error).replaceAll(token, '***')
      throw new Error(`GitHub fetch 실패: ${safeMessage}`)
    }

    const remoteCommit = (await this.git(['rev-parse', remoteRef])).trim()

    // repo/는 NAS 발행 전용 워킹카피다. 이전 발행 실패로 남은 로컬 커밋이나
    // 원격보다 뒤처진 상태가 다음 발행의 rebase 충돌을 만들지 않도록,
    // 워킹트리가 깨끗할 때만 현재 브랜치를 원격 브랜치와 일치시킨다.
    const currentBranch = (await this.git(['branch', '--show-current'])).trim()

    if (currentBranch !== branch) {
      throw new Error(
        `Git 워킹카피 브랜치가 설정과 다릅니다. 현재: ${currentBranch || '(없음)'}, 설정: ${branch}`,
      )
    }

    const worktreeStatus = (await this.git(['status', '--porcelain'])).trim()

    if (worktreeStatus) {
      throw new Error('Git 워킹카피에 커밋되지 않은 변경이 있어 원격 상태로 맞출 수 없습니다.')
    }

    // 발행 실패로 남은 미푸시 로컬 커밋은 posts-src에서 다시 생성할 수 있다.
    // GitHub 원격을 기준으로 발행 워킹카피를 복구한다.
    await this.git(['reset', '--hard', remoteRef])

    const treeOutput = await this.git([
      'ls-tree',
      '-r',
      '-z',
      '--name-only',
      remoteRef,
      '--',
      '_posts',
    ])

    const paths = treeOutput
      .split('\0')
      .map((value) => value.trim())
      .filter(Boolean)

    const posts: ParsedRemotePost[] = []
    const invalidDiagnostics: RemotePostDiagnostic[] = []
    const skippedNonstandardPaths: string[] = []
    const discoveredStandardPaths = new Set<string>()

    for (const githubPath of paths) {
      if (!STANDARD_POST_PATH.test(githubPath)) {
        skippedNonstandardPaths.push(githubPath)
        continue
      }

      discoveredStandardPaths.add(githubPath)

      try {
        const source = await this.git(['show', `${remoteRef}:${githubPath}`])
        const parsedPost = parseRemoteMarkdown(githubPath, source)

        const media = this.scanRemoteMedia(parsedPost)
        parsedPost.mediaAssets = media.assets
        parsedPost.mediaIssues = media.issues

        posts.push(parsedPost)
      } catch (error) {
        invalidDiagnostics.push({
          githubPath,
          title: fallbackTitle(githubPath),
          state: 'invalid',
          issues: [
            issue(
              'invalid_frontmatter',
              'error',
              '프론트매터를 읽을 수 없습니다.',
              githubPath,
              errorText(error),
            ),
          ],
        })
      }
    }

    return {
      remoteCommit,
      posts,
      invalidDiagnostics,
      skippedNonstandardPaths,
      discoveredStandardPaths,
    }
  }

  private scanRemoteMedia(post: ParsedRemotePost): {
    assets: RemoteMediaAsset[]
    issues: PostIssue[]
  } {
    const assets: RemoteMediaAsset[] = []
    const issues: PostIssue[] = []

    let gitDirectory: string | undefined

    try {
      gitDirectory = resolveRemoteMediaDirectory(post)
    } catch (error) {
      issues.push(
        issue(
          'remote_media_missing',
          'warning',
          'GitHub 미디어 폴더 경로를 읽을 수 없습니다.',
          post.githubPath,
          errorText(error),
        ),
      )

      return { assets, issues }
    }

    if (!gitDirectory) {
      return { assets, issues }
    }

    const repositoryRoot = path.resolve(config.repoDir)
    const mediaDirectory = path.resolve(repositoryRoot, ...gitDirectory.split('/'))

    if (
      mediaDirectory !== repositoryRoot &&
      !mediaDirectory.startsWith(repositoryRoot + path.sep)
    ) {
      issues.push(
        issue(
          'remote_media_missing',
          'warning',
          'GitHub 미디어 폴더가 저장소 밖을 가리킵니다.',
          post.githubPath,
          gitDirectory,
        ),
      )

      return { assets, issues }
    }

    if (!fs.existsSync(mediaDirectory)) {
      issues.push(
        issue(
          'remote_media_missing',
          'warning',
          'GitHub media_subpath 폴더가 없습니다.',
          post.githubPath,
          gitDirectory,
        ),
      )

      return { assets, issues }
    }

    const rootStat = fs.lstatSync(mediaDirectory)

    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      issues.push(
        issue(
          'remote_media_missing',
          'warning',
          'GitHub media_subpath가 일반 디렉터리가 아닙니다.',
          post.githubPath,
          gitDirectory,
        ),
      )

      return { assets, issues }
    }

    const walk = (directory: string): void => {
      const entries = fs.readdirSync(directory, {
        withFileTypes: true,
      })

      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name)

        // 링크 및 특수 파일은 따라가지 않는다.
        if (entry.isSymbolicLink()) continue

        if (entry.isDirectory()) {
          walk(absolutePath)
          continue
        }

        if (!entry.isFile()) continue

        const relativePath = path.relative(mediaDirectory, absolutePath).replace(/\\/g, '/')

        const gitPath = path.posix.join(gitDirectory!, relativePath)
        const stat = fs.statSync(absolutePath)

        assets.push({
          filename: path.posix.basename(relativePath),
          relativePath,
          gitPath,
          sourcePath: absolutePath,
          sizeBytes: stat.size,
        })
      }
    }

    try {
      walk(mediaDirectory)
    } catch (error) {
      issues.push(
        issue(
          'remote_media_missing',
          'warning',
          'GitHub 미디어 폴더를 전부 읽지 못했습니다.',
          post.githubPath,
          errorText(error),
        ),
      )
    }

    assets.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

    return { assets, issues }
  }

  private async git(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: config.repoDir,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      })
      return String(stdout)
    } catch (error) {
      const record =
        error && typeof error === 'object'
          ? (error as {
              stdout?: unknown
              stderr?: unknown
              message?: unknown
            })
          : {}

      const message = [record.stdout, record.stderr, record.message]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join('\n')

      throw new Error(message || 'git 명령 실행 실패')
    }
  }
}

function stateDiagnostic(
  remote: ParsedRemotePost,
  state: RemotePostState,
  issues: PostIssue[],
  postId?: string,
): RemotePostDiagnostic {
  return {
    githubPath: remote.githubPath,
    title: remote.title,
    slug: remote.slug,
    postId,
    state,
    issues,
  }
}

function findDuplicateRemoteIds(posts: ParsedRemotePost[]): Set<string> {
  const counts = new Map<string, number>()

  for (const post of posts) {
    if (!post.mdchirpId) continue
    counts.set(post.mdchirpId, (counts.get(post.mdchirpId) ?? 0) + 1)
  }

  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id))
}

export class GitRefreshService {
  constructor(
    private scanner: RemotePostScanner = new GitRemoteScanner(),
    private store: RefreshPostStore = new PostStore(),
  ) {}

  async refresh(): Promise<GitRefreshResponse> {
    const scan = await this.scanner.scan()
    const checkedAt = new Date().toISOString()
    const nasPosts = await this.store.list()

    const nasById = new Map(nasPosts.map((post) => [post.id, post]))
    const nasByPath = new Map(
      nasPosts
        .map((post) => [normalizeGithubPath(post.githubPath), post] as const)
        .filter((entry): entry is [string, Post] => typeof entry[0] === 'string'),
    )
    const nasBySlug = new Map(nasPosts.map((post) => [post.slug, post]))

    const duplicateRemoteIds = findDuplicateRemoteIds(scan.posts)
    const observations = new Map<string, RemotePostObservation>()
    const diagnostics: RemotePostDiagnostic[] = [...scan.invalidDiagnostics]
    const importedPostIds: string[] = []

    const setObservation = (
      post: Post,
      remoteState: RemotePostState,
      issues: PostIssue[],
      githubPath?: string,
    ) => {
      observations.set(post.id, {
        id: post.id,
        githubPath,
        remoteState,
        remoteCheckedAt: checkedAt,
        issues,
      })
    }

    /**
     * 새 글과 기존 글 모두 GitHub media_subpath의 모든 일반 파일을
     * NAS media 폴더로 복사한다.
     */
    const syncRemoteMedia = async (
      post: Post,
      remote: ParsedRemotePost,
      issues: PostIssue[],
    ): Promise<Post> => {
      if (!remote.mediaAssets?.length || !this.store.importRemoteMedia) {
        return post
      }

      try {
        return await this.store.importRemoteMedia(post.id, remote.mediaAssets)
      } catch (error) {
        issues.push(
          issue(
            'remote_media_missing',
            'warning',
            'GitHub 미디어 파일을 NAS에 저장하지 못했습니다.',
            remote.githubPath,
            errorText(error),
          ),
        )

        return post
      }
    }

    for (const invalid of scan.invalidDiagnostics) {
      const matchingNas = nasByPath.get(invalid.githubPath)
      if (matchingNas) {
        setObservation(matchingNas, 'invalid', invalid.issues, invalid.githubPath)
      }
    }

    for (const remote of scan.posts) {
      const baseIssues: PostIssue[] = [...(remote.mediaIssues ?? [])]

      if (!remote.mdchirpId) {
        baseIssues.push(
          issue(
            'missing_post_id',
            'warning',
            'GitHub 프론트매터에 mdchirp_id가 없습니다.',
            remote.githubPath,
          ),
        )
      }

      if (remote.mdchirpId && duplicateRemoteIds.has(remote.mdchirpId)) {
        const duplicateIssue = issue(
          'duplicate_post_id',
          'warning',
          `같은 mdchirp_id를 사용하는 원격 글이 여러 개입니다: ${remote.mdchirpId}`,
          remote.githubPath,
        )
        const issues = [...baseIssues, duplicateIssue]
        const matchingNas = nasById.get(remote.mdchirpId)

        if (matchingNas) {
          setObservation(matchingNas, 'conflict', issues)
        }

        diagnostics.push(stateDiagnostic(remote, 'conflict', issues, remote.mdchirpId))
        continue
      }

      const idMatch = remote.mdchirpId ? nasById.get(remote.mdchirpId) : undefined

      if (idMatch) {
        const matchedPost = await syncRemoteMedia(idMatch, remote, baseIssues)
        const existingPath = normalizeGithubPath(matchedPost.githubPath)

        nasById.set(matchedPost.id, matchedPost)
        nasBySlug.set(matchedPost.slug, matchedPost)

        if (existingPath && existingPath !== remote.githubPath) {
          const divergenceIssue = issue(
            'remote_slug_diverged',
            'warning',
            '같은 글 ID의 GitHub 경로가 NAS 기록과 다릅니다.',
            remote.githubPath,
            `NAS: ${existingPath}`,
          )
          const issues = [...baseIssues, divergenceIssue]

          setObservation(matchedPost, 'slug_diverged', issues)
          diagnostics.push(stateDiagnostic(remote, 'slug_diverged', issues, matchedPost.id))
        } else {
          setObservation(matchedPost, 'in_sync', baseIssues, remote.githubPath)
          diagnostics.push(stateDiagnostic(remote, 'in_sync', baseIssues, matchedPost.id))
        }

        continue
      }

      const pathMatch = nasByPath.get(remote.githubPath)

      if (pathMatch) {
        if (remote.mdchirpId && remote.mdchirpId !== pathMatch.id) {
          const conflictIssue = issue(
            'slug_conflict',
            'warning',
            '같은 GitHub 경로가 다른 NAS 글 ID에 연결되어 있습니다.',
            remote.githubPath,
            `NAS ID: ${pathMatch.id}, GitHub ID: ${remote.mdchirpId}`,
          )
          const issues = [...baseIssues, conflictIssue]

          setObservation(pathMatch, 'conflict', issues)
          diagnostics.push(stateDiagnostic(remote, 'conflict', issues, pathMatch.id))
        } else {
          const matchedPost = await syncRemoteMedia(pathMatch, remote, baseIssues)

          nasById.set(matchedPost.id, matchedPost)
          nasByPath.set(remote.githubPath, matchedPost)
          nasBySlug.set(matchedPost.slug, matchedPost)

          setObservation(matchedPost, 'in_sync', baseIssues, remote.githubPath)
          diagnostics.push(stateDiagnostic(remote, 'in_sync', baseIssues, matchedPost.id))
        }

        continue
      }

      const slugMatch = nasBySlug.get(remote.slug)

      if (slugMatch) {
        const conflictIssue = issue(
          'slug_conflict',
          'warning',
          '같은 slug를 사용하는 다른 NAS 글이 있습니다.',
          remote.githubPath,
          `NAS ID: ${slugMatch.id}`,
        )
        const issues = [...baseIssues, conflictIssue]

        setObservation(slugMatch, 'conflict', issues)
        diagnostics.push(stateDiagnostic(remote, 'conflict', issues, slugMatch.id))
        continue
      }

      const id = remote.mdchirpId ?? randomUUID()
      const imported: Post = {
        id,
        slug: remote.slug,
        title: remote.title,
        tiptapJson: null,
        markdown: remote.markdown,
        frontmatter: {
          ...remote.frontmatter,
          mdchirp_id: id,
        },
        media: [],
        status: 'published',
        hasRichSource: false,
        rev: 0,
        createdAt: checkedAt,
        updatedAt: checkedAt,
        publishedAt: checkedAt,
        publishedRev: 1,
        publishedSlug: remote.slug,
        githubPath: remote.githubPath,
        remoteState: 'imported',
        remoteCheckedAt: checkedAt,
        issues: baseIssues.length ? baseIssues : undefined,
      }

      const saved = await this.store.save(imported, 0)

      if (saved.ok) {
        let importedPost = saved.post

        importedPost = await syncRemoteMedia(saved.post, remote, baseIssues)

        importedPostIds.push(importedPost.id)
        nasById.set(importedPost.id, importedPost)
        nasByPath.set(remote.githubPath, importedPost)
        nasBySlug.set(importedPost.slug, importedPost)

        setObservation(importedPost, 'imported', baseIssues, remote.githubPath)
        diagnostics.push(stateDiagnostic(remote, 'imported', baseIssues, importedPost.id))
      } else {
        const saveIssue = issue(
          saved.error === 'duplicate_post_id' ? 'duplicate_post_id' : 'slug_conflict',
          'warning',
          'GitHub 글을 NAS로 가져오지 못했습니다.',
          remote.githubPath,
          saved.message,
        )
        const issues = [...baseIssues, saveIssue]

        diagnostics.push(stateDiagnostic(remote, 'conflict', issues, id))
      }
    }

    for (const nasPost of nasPosts) {
      if (nasPost.status !== 'published') continue

      // ID·경로·프론트매터 비교에서 이미 상태가 결정된 글은
      // 단순 경로 누락 검사로 그 결과를 덮어쓰지 않는다.
      if (observations.has(nasPost.id)) continue

      const githubPath = normalizeGithubPath(nasPost.githubPath)

      if (!githubPath) {
        const incompleteIssue = issue(
          'incomplete_nas_post',
          'error',
          '발행 상태이지만 githubPath가 없습니다.',
        )
        setObservation(nasPost, 'conflict', [incompleteIssue])
        continue
      }

      if (!scan.discoveredStandardPaths.has(githubPath)) {
        const missingIssue = issue(
          'remote_post_missing',
          'error',
          'NAS에는 발행 기록이 있지만 GitHub 원격 파일이 없습니다.',
          githubPath,
        )
        setObservation(nasPost, 'remote_missing', [missingIssue])
      }
    }

    await this.store.applyRemoteObservations([...observations.values()])

    return {
      ok: true,
      checkedAt,
      remoteCommit: scan.remoteCommit,
      importedPostIds,
      diagnostics,
      skippedNonstandardPaths: scan.skippedNonstandardPaths,
    }
  }
}
