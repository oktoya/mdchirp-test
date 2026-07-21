import assert from 'node:assert'
import type { HttpAdapter, HttpRequest, HttpResponse } from './adapters.js'
import { FetchHttpAdapter } from './impl/FetchHttpAdapter.js'
import { MemoryStorageAdapter } from './impl/MemoryStorageAdapter.js'
import { NasClient } from './NasClient.js'
import { Sync } from './Sync.js'

let pass = 0

const ok = (name: string) => {
  console.log(`  ✓ ${name}`)
  pass++
}

console.log('mdchirp media upload sync test')

async function runTests(): Promise<void> {
  let capturedInit: RequestInit | undefined

  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const fetchAdapter = new FetchHttpAdapter({
    baseUrl: 'http://localhost:8787',
    fetchImpl,
  })

  await fetchAdapter.request({
    method: 'POST',
    path: '/api/json',
    body: { hello: 'world' },
  })

  assert(capturedInit)
  assert.equal(capturedInit.body, JSON.stringify({ hello: 'world' }))
  assert.equal(new Headers(capturedInit.headers).get('content-type'), 'application/json')
  ok('JSON body behavior preserved')

  const form = new FormData()
  form.append('file', new Blob(['image']), 'photo.png')

  await fetchAdapter.request({
    method: 'POST',
    path: '/api/media',
    body: form,
  })

  assert(capturedInit)
  assert.equal(capturedInit.body, form)
  assert.equal(new Headers(capturedInit.headers).has('content-type'), false)
  ok('FormData forwarded without manual content-type')

  let capturedRequest: HttpRequest | null = null

  const uploadHttp: HttpAdapter = {
    async request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
      capturedRequest = request

      return {
        status: 200,
        ok: true,
        data: {
          ok: true,
          media: {
            id: 'media-1',
            type: 'image',
            origin: 'local',
            filename: 'photo.png',
            nasPath: 'posts-src/test-post/media/photo.png',
            sizeBytes: 5,
          },
        } as T,
      }
    },
  }

  const nas = new NasClient(uploadHttp)
  const uploaded = await nas.uploadMedia('test-post', new Blob(['image']), 'photo.png')

  assert.equal(uploaded.media.filename, 'photo.png')
  assert(capturedRequest)
  assert.equal(capturedRequest.path, '/api/posts/test-post/media')
  assert(capturedRequest.body instanceof FormData)

  const uploadedFile = capturedRequest.body.get('file')
  assert(uploadedFile instanceof Blob)
  assert.equal((uploadedFile as Blob & { name: string }).name, 'photo.png')
  assert.equal(capturedRequest.body.has('imageFormat'), false)
  ok('NasClient builds multipart upload request')

  await nas.uploadMedia('test-post', new Blob(['image']), 'photo.png', {
    imageFormat: 'webp',
  })

  assert(capturedRequest)
  assert(capturedRequest.body instanceof FormData)
  assert.equal(capturedRequest.body.get('imageFormat'), 'webp')
  ok('NasClient forwards per-image WebP override')

  await nas.uploadMedia('test-post', new Blob(['image']), 'photo.png', {
    imageFormat: 'original',
  })

  assert(capturedRequest)
  assert(capturedRequest.body instanceof FormData)
  assert.equal(capturedRequest.body.get('imageFormat'), 'original')
  ok('NasClient forwards per-image original override')

  const offlineSync = new Sync({
    http: uploadHttp,
    storage: new MemoryStorageAdapter(),
    healthIntervalMs: 0,
    initialOnline: false,
  })

  const offlineResult = await offlineSync.uploadMedia('test-post', new Blob(['image']), 'photo.png')

  assert.equal(offlineResult.ok, false)
  if (!offlineResult.ok) {
    assert.equal(offlineResult.offline, true)
  }
  offlineSync.dispose()
  ok('offline media upload rejected without queue')

  const onlineSync = new Sync({
    http: uploadHttp,
    storage: new MemoryStorageAdapter(),
    healthIntervalMs: 0,
    initialOnline: true,
  })

  const onlineResult = await onlineSync.uploadMedia('test-post', new Blob(['image']), 'photo.png')

  assert.equal(onlineResult.ok, true)
  if (onlineResult.ok) {
    assert.equal(onlineResult.media.filename, 'photo.png')
  }

  await onlineSync.saveLocalDraft({
    id: 'post-id',
    slug: 'test-post',
    media: onlineResult.ok ? [onlineResult.media] : [],
    updatedAt: new Date().toISOString(),
  })

  const savedDraft = await onlineSync.getDraft('post-id')
  assert(savedDraft)
  assert.equal(savedDraft.post.slug, 'test-post')
  assert.equal(savedDraft.post.media[0]?.filename, 'photo.png')
  onlineSync.dispose()
  ok('online upload result and draft media merge')

  console.log(`\n✓ ${pass} checks passed`)
}

runTests().catch((error) => {
  console.error('Test Failed:', error)
  process.exit(1)
})
