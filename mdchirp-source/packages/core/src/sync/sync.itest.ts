// sync 통합 테스트 — 라이브 백엔드(/api/posts/*) 대상.
// 실행: 백엔드를 8787에 띄운 뒤  npx tsx packages/core/src/sync/sync.itest.ts
//
// 검증: 저장→rev증가, stale baseRev→409 onConflict, resolveOverwrite, publish,
//       오프라인 큐 적재 → 온라인 복귀 시 flush.

import { Sync } from './Sync.js'
import { FetchHttpAdapter } from './impl/FetchHttpAdapter.js'
import { MemoryStorageAdapter } from './impl/MemoryStorageAdapter.js'
import type { Post } from '@mdchirp/shared'

const BASE = process.env.MDCHIRP_NAS_URL ?? 'http://localhost:8787'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}`, extra ?? '')
  }
}

function makePost(slug: string, title: string, md: string): Post {
  const now = new Date().toISOString()
  return {
    id: `id-${slug}`,
    slug,
    title,
    tiptapJson: { type: 'doc', content: [] },
    markdown: md,
    frontmatter: { title, date: now },
    media: [],
    status: 'draft',
    hasRichSource: true,
    rev: 0,
    createdAt: now,
    updatedAt: now,
  }
}

async function main() {
  console.log(`\n[sync.itest] target = ${BASE}\n`)

  const http = new FetchHttpAdapter({ baseUrl: BASE })
  const storage = new MemoryStorageAdapter()
  const sync = new Sync({ http, storage, healthIntervalMs: 0, initialOnline: true })

  // 충돌 이벤트 수집
  const conflicts: any[] = []
  sync.onConflict((c) => conflicts.push(c))
  const connectivity: boolean[] = []
  sync.onConnectivity((o) => connectivity.push(o))

  // 0) health
  const online = await sync.checkConnectivity()
  check('health 응답 → online', online === true)

  const slug = `2026-06-19-itest-${Date.now()}`
  const p0 = makePost(slug, '통합테스트 글', '# 안녕\n\n첫 저장입니다.')

  // 1) 최초 저장 → rev 1
  const r1 = await sync.saveToNas(p0)
  check('1차 저장 ok', r1.ok === true)
  const rev1 = r1.ok ? r1.post.rev : -1
  check('rev 증가(>=1)', rev1 >= 1, rev1)

  // 2) 정상 후속 저장 (draft 가 새 baseRev=rev1 을 들고 있어야 함) → rev 2
  const draftAfter1 = await sync.getDraft(p0.id)
  check('저장 후 draft.baseRev == rev1', draftAfter1?.baseRev === rev1, draftAfter1?.baseRev)
  const p1 = { ...(r1.ok ? r1.post : p0), markdown: '# 안녕\n\n두번째 저장.' }
  const r2 = await sync.saveToNas(p1)
  check('2차 저장 ok', r2.ok === true)
  const rev2 = r2.ok ? r2.post.rev : -1
  check('rev2 > rev1', rev2 > rev1, { rev1, rev2 })

  // 3) stale baseRev 로 강제 저장 → 409 conflict 이벤트
  //    (draft 의 baseRev 를 일부러 0 으로 되돌려 충돌 유발)
  const stale = { ...(r2.ok ? r2.post : p1), markdown: '# 충돌유발\n\n오래된 rev로 저장.' }
  await sync.putLocalDraft(stale, 0) // baseRev=0 (이미 rev2 인데)
  const r3 = await sync.saveToNas(stale)
  check('stale 저장 → ok:false (conflict)', r3.ok === false)
  check('onConflict 이벤트 1회', conflicts.length === 1, conflicts.length)
  check('conflict.currentRev == rev2', conflicts[0]?.currentRev === rev2, conflicts[0]?.currentRev)

  // 4) resolveOverwrite — currentRev 로 재시도하면 성공
  const r4 = await sync.resolveOverwrite(stale, rev2)
  check('resolveOverwrite ok', r4.ok === true)
  const rev3 = r4.ok ? r4.post.rev : -1
  check('rev3 > rev2', rev3 > rev2, { rev2, rev3 })

  // 5) publish — 영구 식별자인 Post.id로 요청한다.
  // Sync가 발행 직전에 현재 draft의 최신 slug를 찾아 NAS에 전송한다.
  await sync.requestPublish(p0.id)
  const draftPub = await sync.getDraft(p0.id)
  check(
    '발행 후 draft.status == published',
    draftPub?.post.status === 'published',
    draftPub?.post.status,
  )
  check('발행 후 dirty 해제', draftPub?.dirty === false)

  // 6) 오프라인 큐: 오프라인 전환 → 저장은 큐 적재
  sync.setOnline(false)
  const offSlug = `2026-06-19-offline-${Date.now()}`
  const pOff = makePost(offSlug, '오프라인 글', '# 오프라인\n\n큐에 쌓여야 함')
  const rOff = await sync.saveToNas(pOff)
  check(
    '오프라인 저장 → ok:true (status 유지, 큐 적재)',
    rOff.ok === true && (rOff as any).post.status === 'draft',
  )
  check('큐 1건 적재', (await sync.pendingCount()) === 1, await sync.pendingCount())

  // 7) 온라인 복귀 → flush → 큐 비워짐 + 실제 NAS 저장
  sync.setOnline(true) // 내부에서 flushQueue 트리거(비동기)
  await sync.flushQueue() // 명시적으로 한번 더 대기
  check('복귀 후 큐 0건', (await sync.pendingCount()) === 0, await sync.pendingCount())
  const offOnNas = await sync.get(pOff.id)
  check('오프라인 글이 NAS draft 로 반영(rev>=1)', (offOnNas?.rev ?? 0) >= 1, offOnNas?.rev)

  // 8) list 가 동작
  const all = await sync.list()
  check(
    'list 가 글 포함',
    all.some((p) => p.slug === slug),
    all.map((p) => p.slug),
  )

  // 9) openPost — "B 기기"(빈 storage) 가 NAS 에만 있는 글을 로드 (loaded)
  //    A(sync) 가 위에서 저장/발행한 slug 를, 로컬 draft 가 없는 새 sync 로 연다.
  const storageB = new MemoryStorageAdapter()
  const syncB = new Sync({ http, storage: storageB, healthIntervalMs: 0, initialOnline: true })
  const idOnNas = `id-${slug}` // makePost 의 id 규칙과 동일
  const openLoaded = await syncB.openPost(idOnNas, slug)
  check('openPost(로컬없음) → loaded', openLoaded.kind === 'loaded', openLoaded.kind)
  check(
    'loaded.post.slug 일치',
    openLoaded.kind === 'loaded' && openLoaded.post.slug === slug,
    openLoaded.kind === 'loaded' ? openLoaded.post.slug : openLoaded.kind,
  )
  // 로드 직후 draft 가 캐시됨 + baseRev=rev + dirty=false
  const cachedB = await syncB.getDraft(idOnNas)
  check('로드 후 로컬 캐시됨', cachedB != null)
  check('캐시 baseRev == post.rev', cachedB?.baseRev === cachedB?.post.rev, cachedB?.baseRev)
  check('캐시 dirty=false', cachedB?.dirty === false)

  // 10) openPost — 로컬이 최신(NAS rev ≤ baseRev) → local (다시 열면 로컬 그대로)
  const openLocal = await syncB.openPost(idOnNas, slug)
  check('openPost(로컬최신) → local', openLocal.kind === 'local', openLocal.kind)

  // 11) openPost — 로컬 baseRev 를 낮춰(다른 기기가 더 저장한 상황 흉내) → stale
  if (cachedB) {
    await syncB.putLocalDraft(cachedB.post, 0) // baseRev=0 (NAS 는 더 높은 rev)
  }
  const openStale = await syncB.openPost(idOnNas, slug)
  check('openPost(NAS 더 최신) → stale', openStale.kind === 'stale', openStale.kind)
  check(
    'stale.remote.rev > 로컬 baseRev(0)',
    openStale.kind === 'stale' && openStale.remote.rev > 0,
    openStale.kind === 'stale' ? openStale.remote.rev : openStale.kind,
  )
  // adoptRemote → 다시 열면 local (baseRev 가 NAS rev 로 확정됨)
  if (openStale.kind === 'stale') {
    await syncB.adoptRemote(openStale.remote)
  }
  const openAfterAdopt = await syncB.openPost(idOnNas, slug)
  check('adoptRemote 후 → local', openAfterAdopt.kind === 'local', openAfterAdopt.kind)

  syncB.dispose()

  sync.dispose()
  console.log(`\n[sync.itest] ${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
