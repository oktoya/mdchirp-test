import assert from 'node:assert/strict'
import { findMarkdownImageAt, isLocalMediaFilename, resolveMediaSrc } from './mediaUrl.js'

let passed = 0

function ok(name: string) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('mdchirp editor media URL test')

const resolver = (slug: string, filename: string) =>
  `http://nas.test/api/posts/${encodeURIComponent(slug)}/media/${encodeURIComponent(filename)}`

assert.equal(
  resolveMediaSrc('photo.png', 'hello-post', resolver),
  'http://nas.test/api/posts/hello-post/media/photo.png',
)
ok('local filename resolved through mediaUrl')

assert.equal(
  resolveMediaSrc('한글 사진.webp', '한글 글', resolver),
  'http://nas.test/api/posts/%ED%95%9C%EA%B8%80%20%EA%B8%80/media/%ED%95%9C%EA%B8%80%20%EC%82%AC%EC%A7%84.webp',
)
ok('unicode and spaces delegated to mediaUrl resolver')

assert.equal(
  resolveMediaSrc('http://example.com/image.png', 'post', resolver),
  'http://example.com/image.png',
)
assert.equal(
  resolveMediaSrc('https://example.com/image.png', 'post', resolver),
  'https://example.com/image.png',
)
ok('external http and https URLs preserved')

assert.equal(
  resolveMediaSrc('data:image/png;base64,AAAA', 'post', resolver),
  'data:image/png;base64,AAAA',
)
assert.equal(resolveMediaSrc('../image.png', 'post', resolver), '../image.png')
assert.equal(resolveMediaSrc('media/image.png', 'post', resolver), 'media/image.png')
assert.equal(resolveMediaSrc('image.png?rev=1', 'post', resolver), 'image.png?rev=1')
ok('special URLs and path-like values are not treated as local filenames')

assert.equal(isLocalMediaFilename('photo.webp'), true)
assert.equal(isLocalMediaFilename('folder/photo.webp'), false)
assert.equal(isLocalMediaFilename('https://example.com/photo.webp'), false)
ok('local filename classification')

const markdown = '앞 문장\n\n![사진](photo.png)\n\n뒤 문장'
const filenameOffset = markdown.indexOf('photo.png') + 3
assert.deepEqual(findMarkdownImageAt(markdown, filenameOffset), {
  src: 'photo.png',
  alt: '사진',
})
ok('markdown image filename click resolved')

const normalTextOffset = markdown.indexOf('앞 문장') + 1
assert.equal(findMarkdownImageAt(markdown, normalTextOffset), null)
ok('normal markdown text click ignored')

const externalMarkdown = '![외부](https://example.com/image.png)'
const externalOffset = externalMarkdown.indexOf('https://') + 4
assert.deepEqual(findMarkdownImageAt(externalMarkdown, externalOffset), {
  src: 'https://example.com/image.png',
  alt: '외부',
})
ok('external markdown image target preserved')

console.log(`\n✓ ${passed} checks passed`)
