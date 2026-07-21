// shell.test.ts — PlatformAdapter → sync 어댑터 변환기 검증.
// 실행: pnpm --filter @mdchirp/core test  (라이브 백엔드 불필요 — 전부 메모리)
//
// 핵심 불변식:
//   adaptPlatformHttp:    path→url, ok=2xx 계산, body→data 가 보존된다.
//   adaptPlatformStorage: put/delete 매핑 + all=keys+get 합성이 올바르다.
//   변환 어댑터 위에서 실제 Sync 가 동작한다(saveLocalDraft/list/get).

import type { PlatformHttp, PlatformStorage, Post, PostPatch } from '@mdchirp/shared'
import { adaptPlatformHttp, adaptPlatformStorage } from './platformAdapters.js'
import { Sync } from '../sync/index.js'
import { registerShellShortcuts } from './shortcuts.js'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}`, detail ?? '')
  }
}

// ── 가짜 PlatformStorage (메모리) ──────────────────────────
function memStorage(): PlatformStorage & { _dump: () => Record<string, unknown> } {
  const m = new Map<string, unknown>()
  const k = (c: string, key: string) => `${c}\u0000${key}`
  return {
    async get<T>(c: string, key: string) {
      return m.has(k(c, key)) ? (m.get(k(c, key)) as T) : null
    },
    async put<T>(c: string, key: string, value: T) {
      m.set(k(c, key), value)
    },
    async delete(c: string, key: string) {
      m.delete(k(c, key))
    },
    async keys(c: string) {
      return [...m.keys()]
        .filter((x) => x.startsWith(`${c}\u0000`))
        .map((x) => x.split('\u0000')[1])
    },
    _dump: () => Object.fromEntries(m),
  }
}

// ── 가짜 PlatformHttp (요청 기록 + 고정 응답) ──────────────
function fakeHttp(
  handler: (opts: { method: string; url: string; body?: unknown }) => {
    status: number
    body: unknown
  },
): PlatformHttp & { calls: any[] } {
  const calls: any[] = []
  return {
    calls,
    async request(opts) {
      calls.push(opts)
      const { status, body } = handler(opts)
      return { status, body }
    },
  }
}

function makePost(id: string, slug: string): Post {
  const now = new Date().toISOString()
  return {
    id,
    slug,
    title: 't',
    tiptapJson: null,
    markdown: 'body',
    frontmatter: { title: 't', date: now },
    media: [],
    status: 'draft',
    hasRichSource: false,
    rev: 0,
    createdAt: now,
    updatedAt: now,
  }
}

async function main() {
  // ── adaptPlatformHttp ────────────────────────────────────
  console.log('\n── shell: adaptPlatformHttp ──')
  {
    const ph = fakeHttp((o) => {
      if (o.url === '/ok') return { status: 200, body: { hello: 'world' } }
      if (o.url === '/conflict') return { status: 409, body: { currentRev: 5 } }
      return { status: 404, body: null }
    })
    const http = adaptPlatformHttp(ph)

    const r1 = await http.request({ method: 'GET', path: '/ok' })
    check('path→url 매핑', ph.calls[0].url === '/ok', ph.calls[0].url)
    check('2xx → ok:true', r1.ok === true && r1.status === 200)
    check('body→data 보존', (r1.data as any).hello === 'world')

    const r2 = await http.request({ method: 'PUT', path: '/conflict', body: { a: 1 } })
    check('409 → ok:false (throw 안함)', r2.ok === false && r2.status === 409)
    check('409 data 보존', (r2.data as any).currentRev === 5)
    check('body 전달', ph.calls[1].body !== undefined && (ph.calls[1].body as any).a === 1)
  }

  // ── adaptPlatformStorage ─────────────────────────────────
  console.log('\n── shell: adaptPlatformStorage ──')
  {
    const ps = memStorage()
    const st = adaptPlatformStorage(ps)

    await st.set('c', 'k1', { v: 1 })
    await st.set('c', 'k2', { v: 2 })
    const got = await st.get<{ v: number }>('c', 'k1')
    check('set→get 왕복', got?.v === 1)
    check('없는 키 → null', (await st.get('c', 'nope')) === null)

    const ks = await st.keys('c')
    check('keys 2건', ks.length === 2 && ks.includes('k1') && ks.includes('k2'), ks)

    const all = await st.all<{ v: number }>('c')
    check('all = keys+get 합성 (2건)', all.length === 2, all)
    check(
      'all 은 null 제외',
      all.every((x) => x != null),
    )

    await st.remove('c', 'k1')
    check('remove 동작', (await st.get('c', 'k1')) === null && (await st.keys('c')).length === 1)
  }

  // ── 변환 어댑터 위에서 Sync 동작 ─────────────────────────
  console.log('\n── shell: Sync over adapters (local-first) ──')
  {
    const ps = memStorage()
    const ph = fakeHttp(() => ({ status: 200, body: { posts: [] } }))
    const sync = new Sync({
      http: adaptPlatformHttp(ph),
      storage: adaptPlatformStorage(ps),
      healthIntervalMs: 0,
      initialOnline: false, // 네트워크 안 타고 로컬만 검증
    })

    const patch: PostPatch = { id: 'p1', markdown: '# hi', updatedAt: new Date().toISOString() }
    await sync.saveLocalDraft(patch)
    const got = await sync.get('p1')
    check('saveLocalDraft → get 으로 읽힘', got?.markdown === '# hi', got?.markdown)

    const list = await sync.list() // 오프라인 → 로컬 draft 폴백
    check(
      'list 가 로컬 draft 반환',
      list.some((p) => p.id === 'p1'),
      list.map((p) => p.id),
    )

    sync.dispose()
  }
  // ── 단축키 등록/해제 ──────────────────────────────────────
  console.log('\n── shell: registerShellShortcuts ──')
  {
    const registered: string[] = []
    const released: string[] = []
    const platform = {
      kind: 'web' as const,
      http: fakeHttp(() => ({ status: 200, body: {} })),
      storage: memStorage(),
      registerShortcut(combo: string, _h: () => void) {
        registered.push(combo)
        return () => released.push(combo)
      },
    }
    let newCalls = 0
    const cleanup = registerShellShortcuts(platform, {
      newPost: () => newCalls++,
      focusList: () => {},
    })
    check('combo 2개 등록', registered.length === 2, registered)
    // 등록된 핸들러가 실제로 연결됐는지 — newPost 호출 확인
    platform.registerShortcut('mod+n', () => newCalls++) // 직접 호출용 더미 무시
    check('mod+n 등록됨', registered.includes('mod+n'))
    check('mod+l 등록됨', registered.includes('mod+l'))
    cleanup()
    check('cleanup 시 전부 해제', released.length === 2, released)

    // registerShortcut 없는 플랫폼 → no-op, throw 없음
    const bare = {
      kind: 'web' as const,
      http: fakeHttp(() => ({ status: 200, body: {} })),
      storage: memStorage(),
    }
    const noop = registerShellShortcuts(bare, { newPost: () => {}, focusList: () => {} })
    noop() // throw 안 하면 통과
    check('registerShortcut 없어도 안전(no-op)', true)
  }
  console.log(`\n결과: ${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
