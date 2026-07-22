// 발행 빌더 — 글 작업폴더(posts-src/<slug>/)를 Chirpy 표준구조(repo/)로 펼친다.
// 정식 명세: apps/backend/SPEC.md §6 (9단계)
//
// 1차 범위: 1~6단계(slug확정/프론트매터/본문배치/미디어배치/워터마크슬롯/정책슬롯)까지 구현.
// 7~9단계(git add/commit/push)는 GitPublisher 인터페이스로 분리 (실제 git은 NAS 환경에서 주입).

import fs from 'node:fs/promises'
import path from 'node:path'
import type { Post } from '@mdchirp/shared'
import { config, FILES } from '../config.js'
import { normalizePublishDate, resolvePostMarkdownPath } from './dateSlug.js'

// 이번 청크는 KST 고정. 청크3에서 settings(fixed) / 발행요청(device)로 오프셋 주입.
const DEFAULT_OFFSET = '+0900'

export class MissingImagesError extends Error {
  constructor(public missingImages: string[]) {
    super(`Missing images: ${missingImages.join(', ')}`)
    this.name = 'MissingImagesError'
  }
}

/** 비동기 문자열 치환 헬퍼 */
async function replaceAsync(
  str: string,
  regex: RegExp,
  asyncFn: (match: string, ...args: unknown[]) => Promise<string>,
): Promise<string> {
  const promises: Promise<string>[] = []
  str.replace(regex, (match, ...args) => {
    promises.push(asyncFn(match, ...args))
    return match
  })
  const data = await Promise.all(promises)
  return str.replace(regex, () => data.shift()!)
}

export interface BuildResult {
  slug: string
  postMdPath: string // repo 기준 상대경로 (_posts/...)
  mediaPaths: string[] // repo 기준 상대경로 (assets/...)
  mediaSubpath: string
}

export interface GitPublisher {
  commitAndPush(slug: string, files: string[]): Promise<{ committed: boolean; pushedAt: string }>
  // 발행취소/삭제 — 본문+이미지폴더 등 경로를 git rm 후 커밋+push(발행과 커밋 흐름 공유).
  removePaths(slug: string, paths: string[]): Promise<{ committed: boolean; pushedAt: string }>
}

/** git이 없는 환경용 no-op 퍼블리셔 (sandbox/테스트). */
export class NoopGitPublisher implements GitPublisher {
  async commitAndPush(_slug: string, _files: string[]) {
    return { committed: false, pushedAt: new Date().toISOString() }
  }
  async removePaths(_slug: string, _paths: string[]) {
    return { committed: false, pushedAt: new Date().toISOString() }
  }
}

const ASSET_BASE = 'assets/img/posts'

async function exists(p: string) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true })
}

export class PublishBuilder {
  constructor(private git: GitPublisher = new NoopGitPublisher()) {}

  /** posts-src/<slug>/ → repo/ 로 펼침. (1~6단계) */
  async build(post: Post, offset: string = DEFAULT_OFFSET): Promise<BuildResult> {
    const slug = post.slug // 1. slug 확정 (폴더/미디어 경로는 slug 그대로 — SPEC §4 일관성)
    const srcDir = path.join(config.postsSrcDir, slug)
    const mediaSubpath = `/${ASSET_BASE}/${slug}/` // 2. media_subpath 주입

    // 2-1. date/파일명 정규화 (Jekyll 인식 필수: date=+0900 형식, 파일명=YYYY-MM-DD- 접두사)
    //   오프셋은 인자로 받는 게 원칙이나 이번 단계는 KST 고정. (fixed/device 선택은 청크3)
    const publishDate = normalizePublishDate(post.frontmatter.date, new Date(), offset)
    const postMdRel = resolvePostMarkdownPath(slug, publishDate, post.githubPath)

    // [추가] 이미지 정규화 및 유실 이미지 존재 검증
    const imageResult = await this.processImages(post.markdown, srcDir)
    const mediaFilesToCopy = new Set(imageResult.mediaFilesToCopy)
    const missingImages = [...imageResult.missingImages]

    let normalizedCover = post.frontmatter.image

    if (normalizedCover?.path && !/^(?:https?:)?\/\//i.test(normalizedCover.path)) {
      const coverFilename = path.basename(normalizedCover.path.replace(/\\/g, '/'))
      const localCoverPath = path.join(srcDir, FILES.mediaDir, coverFilename)

      if (await exists(localCoverPath)) {
        mediaFilesToCopy.add(coverFilename)
        normalizedCover = {
          ...normalizedCover,
          path: coverFilename,
        }
      } else {
        const repositoryCoverPath = path.join(
          config.repoDir,
          normalizedCover.path.replace(/^\/+/, ''),
        )

        if (!(await exists(repositoryCoverPath))) {
          missingImages.push(normalizedCover.path)
        }
      }
    }

    const normalizedPost: Post = {
      ...post,
      markdown: imageResult.normalizedMarkdown,
      frontmatter: {
        ...post.frontmatter,
        image: normalizedCover,
      },
    }

    if (missingImages.length > 0) {
      throw new MissingImagesError([...new Set(missingImages)])
    }

    // 3. 본문 배치: repo/_posts/<fileStem>.md
    const postsDir = path.join(config.repoDir, '_posts')
    await ensureDir(postsDir)
    const postMd = await this.renderWithSubpath(normalizedPost, mediaSubpath, publishDate)
    await fs.writeFile(path.join(config.repoDir, postMdRel), postMd)

    // 4. 미디어 배치: media/* → repo/assets/img/posts/<slug>/* (.source/.history/meta 제외)
    const mediaPaths: string[] = []
    if (mediaFilesToCopy.size > 0) {
      const destMediaDir = path.join(config.repoDir, ASSET_BASE, slug)
      await ensureDir(destMediaDir)
      for (const f of mediaFilesToCopy) {
        const srcFile = path.join(srcDir, FILES.mediaDir, f)
        const destFile = path.join(destMediaDir, f)
        // 5. 워터마크 합성 — 📋 슬롯 (지금은 원본 그대로 복사)
        await fs.copyFile(srcFile, destFile)
        mediaPaths.push(path.join(ASSET_BASE, slug, f).replace(/\\/g, '/'))
      }
    }
    // 6. 미디어 정책(외부백업/오프로드) — 📋 슬롯

    return { slug, postMdPath: postMdRel, mediaPaths, mediaSubpath }
  }

  /** 발행(build + git). 7~9단계. git은 주입된 퍼블리셔에 위임. */
  async publish(
    post: Post,
    offset: string = DEFAULT_OFFSET,
  ): Promise<{ build: BuildResult; pushedAt: string; committed: boolean }> {
    const build = await this.build(post, offset)
    const files = [build.postMdPath, ...build.mediaPaths]
    const res = await this.git.commitAndPush(post.slug, files) // 7~8
    return { build, pushedAt: res.pushedAt, committed: res.committed } // 9는 호출측에서 status 갱신
  }

  /** post.md를 렌더하되 media_subpath를 프론트매터에 주입. */
  private async renderWithSubpath(
    post: Post,
    mediaSubpath: string,
    publishDate: string,
  ): Promise<string> {
    const fm = post.frontmatter
    const lines: string[] = ['---']
    lines.push(`title: ${JSON.stringify(post.title)}`)
    lines.push(`mdchirp_id: ${JSON.stringify(post.id)}`)
    lines.push(`date: ${publishDate}`)
    if (fm.categories?.length) {
      const escapedCats = fm.categories.filter(Boolean).map((c) => JSON.stringify(c))
      lines.push(`categories: [${escapedCats.join(', ')}]`)
    }
    if (fm.tags?.length) {
      const escapedTags = fm.tags.map((t) => JSON.stringify(t))
      lines.push(`tags: [${escapedTags.join(', ')}]`)
    }
    if (fm.description) lines.push(`description: ${JSON.stringify(fm.description)}`)
    // author/authors — 없으면 생략(Chirpy 가 _config.yml social.name 으로 fallback).
    if (fm.author) {
      lines.push(`author: ${JSON.stringify(fm.author)}`)
    } else if (fm.authors?.length) {
      const escapedAuthors = fm.authors.map((a) => JSON.stringify(a))
      lines.push(`authors: [${escapedAuthors.join(', ')}]`)
    }
    if (fm.pin) lines.push('pin: true')
    if (fm.math) lines.push('math: true')
    if (fm.mermaid) lines.push('mermaid: true')

    // 전역 설정을 상속하지 않고 패널의 선택값을 명시적으로 발행한다.
    if (fm.toc !== undefined) {
      lines.push(`toc: ${fm.toc ? 'true' : 'false'}`)
    }

    if (fm.comments !== undefined) {
      lines.push(`comments: ${fm.comments ? 'true' : 'false'}`)
    }

    if (fm.render_with_liquid !== undefined) {
      lines.push(`render_with_liquid: ${fm.render_with_liquid ? 'true' : 'false'}`)
    }
    if (fm.image) {
      lines.push('image:')
      lines.push(`  path: ${fm.image.path}`)
      if (fm.image.alt) lines.push(`  alt: ${JSON.stringify(fm.image.alt)}`)
      if (fm.image.lqip) lines.push(`  lqip: ${fm.image.lqip}`)
    }
    lines.push(`media_subpath: ${mediaSubpath}`) // 자동 주입
    lines.push('---', '', post.markdown)
    return lines.join('\n')
  }
  /** 이미지 링크들을 스캔하여 정규화하고 실존 여부를 검증 */
  private async processImages(
    markdown: string,
    srcDir: string,
  ): Promise<{
    normalizedMarkdown: string
    mediaFilesToCopy: string[]
    missingImages: string[]
  }> {
    const mediaFilesToCopySet = new Set<string>()
    const missingImages: string[] = []
    const isExternal = (p: string) => /^(https?:)?\/\//.test(p)

    const normalizedMarkdown = await replaceAsync(
      markdown,
      /!\[(.*?)\]\((.*?)\)/g,
      async (match, alt, imagePath) => {
        const altText = String(alt)
        const trimmedPath = String(imagePath).trim()
        if (isExternal(trimmedPath)) {
          return match
        }

        const filename = path.basename(trimmedPath.replace(/\\/g, '/'))

        // 1. 글 로컬 미디어 디렉토리 확인
        const localMediaPath = path.join(srcDir, FILES.mediaDir, filename)
        const hasLocalFile = await exists(localMediaPath)

        if (hasLocalFile) {
          mediaFilesToCopySet.add(filename)
          return `![${altText}](${filename})` // 정규화
        }

        // 2. 깃 리포지토리 내 공용 이미지 확인
        const repoFilePath = path.join(config.repoDir, trimmedPath)
        const hasRepoFile = await exists(repoFilePath)

        if (hasRepoFile) {
          return match // 경로 보존
        }

        // 3. 둘 다 없음 -> 유실
        missingImages.push(trimmedPath)
        return match
      },
    )

    return {
      normalizedMarkdown,
      mediaFilesToCopy: Array.from(mediaFilesToCopySet),
      missingImages,
    }
  }
}
