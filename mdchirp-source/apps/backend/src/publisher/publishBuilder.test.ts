// PublishBuilder 단위 테스트 — 이미지 정규화 및 유실 이미지 발행 차단.
// 실행: pnpm --filter @mdchirp/backend test
import assert from 'node:assert'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DATA_DIR = path.resolve(__dirname, 'test-tmp-data')
process.env.MDCHIRP_DATA_DIR = TEST_DATA_DIR

import { config, FILES } from '../config.js'
import { PublishBuilder, MissingImagesError } from './publishBuilder.js'
import type { Post } from '@mdchirp/shared'

let pass = 0
const ok = (name: string) => {
  console.log(`  ✓ ${name}`)
  pass++
}

console.log('mdchirp publishBuilder test')

async function cleanup() {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true }).catch(() => {})
}

async function setup() {
  await cleanup()
  await fs.mkdir(path.join(config.postsSrcDir, 'my-test-post', FILES.mediaDir), { recursive: true })
  await fs.mkdir(path.join(config.repoDir, 'assets/img/global'), { recursive: true })
}

async function runTests() {
  try {
    await setup()

    const builder = new PublishBuilder()

    const post: Post = {
      id: 'test-id',
      slug: 'my-test-post',
      title: 'My Test Post',
      tiptapJson: null,
      markdown:
        '안녕하세요.\n\n![로컬 개별 이미지](./media/local-photo.png)\n\n![공용 이미지](/assets/img/global/logo.png)\n\n![외부 이미지](https://google.com/logo.png)',
      frontmatter: {
        title: 'My Test Post',
        date: '2026-07-01 09:15:28 +0900',
        categories: ['Test Category', 'Sub Category'],
        tags: ['test-tag'],
        author: 'Author Name',
      },
      media: [],
      status: 'draft',
      hasRichSource: false,
      rev: 0,
      createdAt: '2026-07-01T00:15:28Z',
      updatedAt: '2026-07-01T00:15:28Z',
    }

    // 1. 임시 파일 생성
    await fs.writeFile(
      path.join(config.postsSrcDir, 'my-test-post', FILES.mediaDir, 'local-photo.png'),
      'dummy local',
    )
    await fs.writeFile(path.join(config.repoDir, 'assets/img/global/logo.png'), 'dummy logo')

    // 2. 정상 빌드 검사 (정규화 및 유효성 통과)
    const result = await builder.build(post)

    // 본문이 정상적으로 정규화되었는지 확인
    const publishedMdPath = path.join(config.repoDir, result.postMdPath)
    const publishedContent = await fs.readFile(publishedMdPath, 'utf8')

    // 로컬 이미지는 파일명으로 정규화
    assert(
      publishedContent.includes('![로컬 개별 이미지](local-photo.png)'),
      'local-photo.png should be normalized',
    )
    // 공용 이미지는 경로가 그대로 유지
    assert(
      publishedContent.includes('![공용 이미지](/assets/img/global/logo.png)'),
      'global logo path should be preserved',
    )
    // 외부 이미지는 그대로 유지
    assert(
      publishedContent.includes('![외부 이미지](https://google.com/logo.png)'),
      'external image path should be preserved',
    )

    // mdchirp_id는 GitHub 글과 NAS 글을 연결하는 불변 Post.id여야 한다.
    assert(
      publishedContent.includes('mdchirp_id: "test-id"'),
      'published frontmatter should contain the immutable Post.id',
    )

    // Frontmatter 카테고리/태그/저자 JSON stringify 처리 검증 (4번 이슈 관련)
    assert(
      publishedContent.includes('categories: ["Test Category", "Sub Category"]'),
      'categories should be double-quoted',
    )
    assert(publishedContent.includes('tags: ["test-tag"]'), 'tags should be double-quoted')
    assert(publishedContent.includes('author: "Author Name"'), 'author should be double-quoted')

    // 미디어가 리포지토리에 표준화된 슬래시 경로로 복사 및 매핑되었는지 검증 (6번 이슈 관련)
    assert(result.postMdPath.includes('/'), 'postMdPath should use forward slashes')
    assert(result.mediaPaths[0].includes('/'), 'mediaPath should use forward slashes')

    const copiedMediaPath = path.join(config.repoDir, result.mediaPaths[0])
    const copiedContent = await fs.readFile(copiedMediaPath, 'utf8')
    assert(copiedContent === 'dummy local', 'local image file should be copied to repo')
    ok('정상적인 파일들과 정규화 처리 통과 검증')

    // 3. date-only 재발행은 기존 GitHub Markdown 파일을 갱신
    const republishPost: Post = {
      ...post,
      status: 'published',
      githubPath: result.postMdPath,
      frontmatter: {
        ...post.frontmatter,
        date: '2026-08-01 09:15:28 +0900',
      },
    }

    const republished = await builder.build(republishPost)
    assert(
      republished.postMdPath === result.postMdPath,
      `date-only republish should reuse path: ${republished.postMdPath}`,
    )

    const republishedContent = await fs.readFile(
      path.join(config.repoDir, republished.postMdPath),
      'utf8',
    )
    assert(
      republishedContent.includes('date: 2026-08-01 09:15:28 +0900'),
      'frontmatter date should be updated in the reused file',
    )

    const duplicatePath = path.join(config.repoDir, '_posts/2026-08-01-my-test-post.md')
    await assert.rejects(
      fs.access(duplicatePath),
      'date-only republish should not create a new _posts file',
    )
    ok('date-only 재발행은 기존 githubPath 파일만 갱신')

    // 4. scheduled Post도 동일한 기존 경로 결정 규칙 사용
    const scheduledPost: Post = {
      ...republishPost,
      status: 'scheduled',
      githubPath: '_posts\\2026-06-01-my-test-post.md',
      frontmatter: {
        ...post.frontmatter,
        date: '2026-09-01 09:15:28 +0900',
      },
    }

    const scheduledBuild = await builder.build(scheduledPost)
    assert(
      scheduledBuild.postMdPath === '_posts/2026-06-01-my-test-post.md',
      `scheduled build should reuse normalized path: ${scheduledBuild.postMdPath}`,
    )
    ok('예약 상태 Post도 기존 githubPath 재사용')

    // 5. 유실 이미지 감지 시 빌드 차단 검사
    const missingPost = {
      ...post,
      markdown: '안녕하세요.\n\n![유실 이미지](./media/missing-photo.png)',
    }

    await assert.rejects(
      async () => {
        await builder.build(missingPost)
      },
      (err: any) => {
        assert(err instanceof MissingImagesError, 'should throw MissingImagesError')
        assert(
          err.missingImages.includes('./media/missing-photo.png'),
          'error should contain missing photo path',
        )
        return true
      },
      'missing image should block build with MissingImagesError',
    )
    ok('유실 이미지 감지 시 에러 발생 및 발행 차단 검증')
  } finally {
    await cleanup()
  }
  console.log(`\n✅ ${pass} checks passed`)
}

runTests().catch((e) => {
  console.error('Test Failed:', e)
  process.exit(1)
})
