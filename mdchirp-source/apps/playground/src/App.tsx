import { useEffect, useMemo, useRef, useState } from 'react'
import type { Post, PostPatch, ListQuery, DeviceSettings, NasSettings } from '@mdchirp/shared'
import { DEFAULT_LIST_QUERY } from '@mdchirp/shared'
import {
  SplitView,
  Lister,
  Settings,
  BrowserDictation,
  LlmFormatter,
  LlmSlugSuggester,
  Sync,
  FetchHttpAdapter,
  MemoryStorageAdapter,
  Shell,
  type ConflictInfo,
} from '@mdchirp/core'
import '@mdchirp/core/src/settings/settings.css'
import '@mdchirp/core/src/lister/lister.css'
import '@mdchirp/core/src/shell/shell.css'
import '@mdchirp/core/src/editor/frontmatter/frontmatter.css'
import { makePlaygroundPlatform } from './shellPlatform.js'

// 데모용 샘플 글 — 모든 기본 서식을 한 번에 보여준다.
const SAMPLE_MD = [
  '# mdchirp 에디터 데모',
  '',
  '손으로 마크다운을 치지 않아도 됩니다. **굵게**, *기울임*, ~~취소선~~, `인라인 코드`.',
  '',
  '## 기능 점검',
  '',
  '- 글머리 목록',
  '- [링크](https://example.com) 도 됩니다',
  '',
  '1. 번호 목록',
  '2. 두 번째',
  '',
  '- [ ] 할 일',
  '- [x] 끝낸 일',
  '',
  '> 인용도 됩니다. NAS가 단일 진실원.',
  '',
  '```ts',
  'const greeting: string = "hello chirpy"',
  'console.log(greeting)',
  '```',
  '',
  '![예시 이미지](/assets/img/posts/demo/sample.png)',
].join('\n')

function makeSamplePost(): Post {
  const now = new Date().toISOString()
  return {
    id: 'demo-1',
    slug: '2026-06-19-mdchirp-editor-demo',
    title: 'mdchirp 에디터 데모',
    tiptapJson: null, // 외부 유입 가정 → markdown 파싱해서 연다
    markdown: SAMPLE_MD,
    frontmatter: { title: 'mdchirp 에디터 데모', date: now, tags: ['dev', 'mdchirp'] },
    media: [],
    status: 'published',
    hasRichSource: false,
    rev: 0,
    createdAt: now,
    updatedAt: now,
  }
}

interface LogEntry {
  t: string
  kind: string
  detail: string
}

type SyncSaveResult = Awaited<ReturnType<Sync['saveToNas']>>

// NAS 기본 주소: Vite env > 같은 호스트의 8787 추정
const DEFAULT_NAS =
  (import.meta as any).env?.VITE_NAS_URL ??
  (typeof location !== 'undefined' && location.hostname.includes('sandbox')
    ? location.origin.replace(/^https:\/\/\d+-/, 'https://8787-')
    : 'http://localhost:8787')

export function App() {
  const [post, setPost] = useState<Post>(makeSamplePost)
  const [log, setLog] = useState<LogEntry[]>([])
  const [lastMd, setLastMd] = useState<string>(post.markdown)
  const dictation = useMemo(() => new BrowserDictation('ko-KR'), [])

  // ── sync 레이어 ──────────────────────────────────────────
  const [nasUrl, setNasUrl] = useState<string>(DEFAULT_NAS)
  const [online, setOnline] = useState<boolean>(false)
  const [rev, setRev] = useState<number>(post.rev)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const syncRef = useRef<Sync | null>(null)

  const [authorOptions, setAuthorOptions] = useState<{ key: string; name: string }[]>([])

  // ── lister (목록) ─────────────────────────────────────────
  const [view, setView] = useState<'list' | 'editor' | 'shell' | 'settings'>('editor')
  const platform = useMemo(() => makePlaygroundPlatform(nasUrl), [nasUrl])
  const [posts, setPosts] = useState<Post[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listQuery, setListQuery] = useState<ListQuery>(DEFAULT_LIST_QUERY)

  // ── settings ──────────────────────────────────────────────
  const [device, setDevice] = useState<DeviceSettings>(() => ({
    deviceId: 'pg-device',
    deviceName: 'Playground',
    nasBaseUrl: nasUrl,
    editor: { splitView: true, spellcheckLang: 'ko' },
  }))
  const [nasSettings, setNasSettings] = useState<NasSettings>(() => ({
    github: { repo: '', branch: 'main', tokenSet: false },
    ai: { provider: 'gemini', model: 'gemini-2.0-flash', keySet: false },
    mediaPolicy: {} as any, // playground 데모: 미디어정책 UI 미구현(slot)
  }))

  async function loadNasSettings() {
    const res = await platform.http.request({ method: 'GET', url: '/api/settings' })
    if (res.status === 200 && res.body) {
      setNasSettings((cur) => ({ ...cur, ...(res.body as Partial<NasSettings>) }))
      push('settings', 'NAS 설정 로드')
    }
  }

  function onSaveDevice(d: DeviceSettings) {
    setDevice(d)
    if (d.nasBaseUrl !== nasUrl) setNasUrl(d.nasBaseUrl) // 주소 바뀌면 sync 재구성
    push('settings', `기기 설정 저장 (${d.deviceName})`)
  }

  async function onSaveNas(part: Partial<NasSettings>) {
    setNasSettings((cur) => ({ ...cur, ...part }))
    const res = await platform.http.request({ method: 'PUT', url: '/api/settings', body: part })
    push('settings', `NAS 설정 저장 → ${res.status}`)
  }

  async function onSetSecret(kind: 'github' | 'gemini', value: string) {
    const res = await platform.http.request({
      method: 'PUT',
      url: '/api/secrets',
      body: { kind, value },
    })
    // 응답은 set 여부 불린만 → nas 마스킹 상태 갱신
    if (res.status === 200) {
      setNasSettings((cur) =>
        kind === 'github'
          ? { ...cur, github: { ...cur.github, tokenSet: true } }
          : { ...cur, ai: { ...cur.ai, keySet: true } },
      )
    }
    push('settings', `${kind} 키 저장 → ${res.status}`)
  }

  async function onTestConnection() {
    const res = await platform.http.request({ method: 'GET', url: '/api/health' })
    push('settings', `연결 테스트 → ${res.status}`)
  }

  async function refreshList() {
    const sync = syncRef.current
    if (!sync) return
    setListLoading(true)
    try {
      const all = await sync.list()
      setPosts(all)
      push('list', `목록 ${all.length}건 로드`)
    } finally {
      setListLoading(false)
    }
  }

  async function openFromList(id: string) {
    const sync = syncRef.current
    if (!sync) return
    const slug = posts.find((x) => x.id === id)?.slug
    const res = await sync.openPost(id, slug)
    if (res.kind === 'loaded') {
      push('open', `NAS 에서 로드: ${res.post.title || id} (rev ${res.post.rev})`)
    } else if (res.kind === 'local') {
      push('open', `로컬에서 열기: ${res.post.title || id} (rev ${res.post.rev})`)
    } else if (res.kind === 'stale') {
      push('open', `⚠️ NAS 최신본 있음 (로컬 base ${res.local.rev} < NAS ${res.remote.rev})`)
    } else {
      push('open', `못 엶 (오프라인이거나 slug 없음): ${id}`)
    }
    // 참고: 실제 에디터 열기(openPost state)는 Shell (조립) 탭에서 검증.
  }

  // ── 서식 제안(Formatter) — NAS Gemini 프록시 ──
  const [formatterReady, setFormatterReady] = useState(false)
  const formatter = useMemo(() => new LlmFormatter({ baseUrl: nasUrl }), [nasUrl])
  // ── slug 제안 — NAS Gemini 프록시(키 없으면 제목 정리 폴백) ──
  const slugSuggester = useMemo(() => new LlmSlugSuggester({ baseUrl: nasUrl }), [nasUrl])

  // NAS 주소가 바뀔 때마다 Sync 재구성
  useEffect(() => {
    const http = new FetchHttpAdapter({ baseUrl: nasUrl })
    const storage = new MemoryStorageAdapter(
      typeof window !== 'undefined' ? window.localStorage : undefined,
    )
    const sync = new Sync({ http, storage, healthIntervalMs: 8000, initialOnline: false })
    sync.onConnectivity((o) => {
      setOnline(o)
      push('connectivity', o ? '🟢 온라인' : '🔴 오프라인')
      // 연결될 때 서식 제안 가용성(NAS Gemini 키 설정 여부) 갱신
      if (o) {
        void formatter.refresh().then((ready) => {
          setFormatterReady(ready)
          push('formatter', ready ? '✨ 서식 제안 사용 가능' : '✨ 서식 제안 비활성(NAS 키 미설정)')
        })
        void slugSuggester.refresh().then((ready) => {
          push('slug', ready ? '✨ slug 제안 사용 가능(Gemini)' : 'slug 제안: 제목 정리 폴백')
        })
      } else setFormatterReady(false)
    })
    sync.onConflict((c) => {
      setConflict(c)
      push('conflict', `409 충돌! NAS rev=${c.currentRev}`)
    })
    void sync.checkConnectivity()
    syncRef.current = sync
    return () => sync.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nasUrl])

  // 저자 드롭다운 목록 로드(_data/authors.yml). NAS 주소 바뀌면 다시.
  useEffect(() => {
    void platform.http
      .request({ method: 'GET', url: '/api/authors' })
      .then((res) => {
        if (res.status === 200 && Array.isArray(res.body)) {
          setAuthorOptions(res.body as { key: string; name: string }[])
        }
      })
      .catch(() => {})
  }, [platform])

  function push(kind: string, detail: string) {
    setLog((l) => [{ t: new Date().toLocaleTimeString(), kind, detail }, ...l].slice(0, 14))
  }

  function onChange(patch: PostPatch) {
    if (patch.markdown !== undefined) setLastMd(patch.markdown)
    // 프론트매터/slug/제목 편집을 로그로 확인 (검증용)
    if (patch.frontmatter !== undefined) {
      push('frontmatter', `필드 변경: ${JSON.stringify(patch.frontmatter)}`)
    }
    if (patch.slug !== undefined) push('frontmatter', `slug 변경: ${patch.slug}`)
    if (patch.title !== undefined && patch.frontmatter === undefined) {
      push('frontmatter', `제목 변경: ${patch.title}`)
    }
    // 로컬 초안 즉시 저장 (오프라인 OK)
    void syncRef.current?.saveLocalDraft(patch)
  }

  function handleSaveFailure(
    result: Extract<SyncSaveResult, { ok: false }>,
    operation: string,
  ): string {
    if (result.error === 'version_conflict') {
      setConflict(result.conflict)
      const message =
        result.message || '다른 기기에서 변경이 있었습니다.'
      push(
        operation,
        `⚠️ ${message} NAS rev=${result.conflict.currentRev}`,
      )
      return message
    }

    setConflict(null)

    const message =
      result.error === 'slug_taken'
        ? '이미 사용 중인 slug입니다.'
        : result.error === 'duplicate_post_id'
          ? '동일한 글 ID가 NAS의 여러 폴더에 존재합니다.'
          : result.error === 'invalid_slug'
            ? 'slug가 올바르지 않습니다.'
            : result.message

    push(operation, `❌ 저장 실패 — ${message}`)
    return message
  }

  async function onSave(p: Post) {
    const sync = syncRef.current
    if (!sync) return

    setConflict(null)
    push('save', `NAS 저장 시도… (md ${p.markdown.length}자)`)

    const res = await sync.saveToNas(p)

    if (res.ok) {
      setPost(res.post)
      setRev(res.post.rev)

      push(
        'save',
        res.forkedFromId
          ? `🌱 기존 발행본(${res.forkedFromId})을 보존하고 새 초안으로 전환 · id=${res.post.id}`
          : `✅ 저장됨 · rev=${res.post.rev} · status=${res.post.status}`,
      )
      return
    }

    handleSaveFailure(res, 'save')
  }

  async function onRequestPublish(p: Post) {
    const sync = syncRef.current
    if (!sync) return

    push('publish', `발행 시도… (slug=${p.slug})`)

    try {
      // 발행 전에 최신 내용을 저장하고 fork 여부를 확정한다.
      const saved = await sync.saveToNas(p)

      if (!saved.ok) {
        handleSaveFailure(saved, 'publish')
        return
      }

      setPost(saved.post)
      setRev(saved.post.rev)

      // fork가 발생했을 수 있으므로 입력 p가 아니라 저장 응답의 새 ID를 사용한다.
      const published = await sync.requestPublish(saved.post.id)

      if (!published.ok) {
        push('publish', `❌ 발행 실패 — ${published.message}`)
        return
      }

      const after = await sync.getDraft(saved.post.id)

      if (after) {
        setPost(after.post)
        setRev(after.post.rev)
      }

      push(
        'publish',
        published.queued
          ? '📥 오프라인 — 발행 대기 중'
          : `🚀 발행됨 · status=${after?.post.status ?? 'published'} · path=${
              after?.post.githubPath ?? published.githubPath ?? '-'
            }`,
      )
    } catch (e: any) {
      push('publish', `❌ 발행 실패: ${e?.message ?? e}`)
    }
  }

  async function onSchedulePublish(p: Post, publishAt: string) {
    const sync = syncRef.current
    if (!sync) return

    push(
      'publish',
      `예약 발행 시도… (slug=${p.slug}, at=${publishAt})`,
    )

    try {
      const saved = await sync.saveToNas(p)

      if (!saved.ok) {
        handleSaveFailure(saved, 'publish')
        return
      }

      setPost(saved.post)
      setRev(saved.post.rev)

      // fork가 발생했을 수 있으므로 저장 응답의 새 ID를 사용한다.
      const scheduled = await sync.schedulePublish(
        saved.post.id,
        publishAt,
      )

      if (!scheduled.ok) {
        push('publish', `❌ 예약 실패 — ${scheduled.message}`)
        return
      }

      const after = await sync.getDraft(saved.post.id)

      if (after) {
        setPost(after.post)
        setRev(after.post.rev)
      }

      const local = new Date(publishAt).toLocaleString()
      push(
        'publish',
        scheduled.queued
          ? `📥 오프라인 — ${local} 예약 요청 대기 중`
          : `⏰ 예약됨 · ${local} 에 발행 예정`,
      )
    } catch (e: any) {
      push('publish', `❌ 예약 실패: ${e?.message ?? e}`)
    }
  }

  // 충돌 해소: 내 것으로 덮어쓰기
  async function resolveOverwrite() {
    const sync = syncRef.current
    if (!sync || !conflict) return

    const mine: Post = {
      ...post,
      markdown: lastMd,
      rev: conflict.currentRev,
      updatedAt: new Date().toISOString(),
    }

    const res = await sync.resolveOverwrite(
      mine,
      conflict.currentRev,
    )

    if (res.ok) {
      setPost(res.post)
      setRev(res.post.rev)
      setConflict(null)

      push(
        'resolve',
        res.forkedFromId
          ? `🌱 기존 발행본을 보존하고 새 초안으로 전환 · id=${res.post.id}`
          : `✅ 덮어쓰기 완료 · rev=${res.post.rev}`,
      )
      return
    }

    handleSaveFailure(res, 'resolve')
  }

  return (
    <div className="pg">
      <header className="pg__header">
        <h1>mdchirp · 에디터 플레이그라운드</h1>
        <p>
          좌(리치) ↔ 우(MD) <b>양방향 편집</b>. 저장/발행은 이제 <b>실제 NAS 백엔드</b>로 갑니다.
        </p>
        <div className="pg__nasbar">
          <span className={'pg__dot ' + (online ? 'pg__dot--on' : 'pg__dot--off')} />
          <span className="pg__online">{online ? '온라인' : '오프라인'}</span>
          <span className="pg__rev">rev {rev}</span>
          <label className="pg__nasinput">
            NAS&nbsp;
            <input
              value={nasUrl}
              onChange={(e) => setNasUrl(e.target.value)}
              spellCheck={false}
              placeholder="http://localhost:8787"
            />
          </label>
        </div>
      </header>

      {conflict && (
        <div className="pg__conflict" role="alert">
          ⚠️ <b>버전 충돌</b> — NAS의 글이 더 최신(rev {conflict.currentRev})입니다. 자동 병합하지
          않습니다.
          <button className="pg__cbtn" onClick={resolveOverwrite}>
            내 것으로 덮어쓰기
          </button>
          <button className="pg__cbtn pg__cbtn--ghost" onClick={() => setConflict(null)}>
            취소
          </button>
        </div>
      )}

      <div className="pg__viewtabs">
        <button
          className={view === 'list' ? 'pg__tab pg__tab--on' : 'pg__tab'}
          onClick={() => {
            setView('list')
            void refreshList()
          }}
        >
          목록
        </button>
        <button
          className={view === 'editor' ? 'pg__tab pg__tab--on' : 'pg__tab'}
          onClick={() => setView('editor')}
        >
          에디터
        </button>
        <button
          className={view === 'shell' ? 'pg__tab pg__tab--on' : 'pg__tab'}
          onClick={() => setView('shell')}
        >
          Shell (조립)
        </button>
        <button
          className={view === 'settings' ? 'pg__tab pg__tab--on' : 'pg__tab'}
          onClick={() => {
            setView('settings')
            void loadNasSettings()
          }}
        >
          설정
        </button>
      </div>

      <main className="pg__main">
        {view === 'shell' ? (
          <div style={{ height: '70vh', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <Shell platform={platform} />
          </div>
        ) : view === 'list' ? (
          <Lister
            posts={posts}
            loading={listLoading}
            query={listQuery}
            onQueryChange={setListQuery}
            onOpen={openFromList}
            onNew={() => {
              push('new', '새 글 (데모: 에디터로 전환)')
              setView('editor')
            }}
            onRefresh={refreshList}
          />
        ) : view === 'settings' ? (
          <Settings
            device={device}
            nas={nasSettings}
            onSaveDevice={onSaveDevice}
            onSaveNas={onSaveNas}
            onSetSecret={onSetSecret}
            onTestConnection={onTestConnection}
          />
        ) : (
          <SplitView
            key={`${post.id}:${formatterReady ? 'fmt-on' : 'fmt-off'}`}
            post={post}
            dictation={dictation}
            formatter={formatter}
            slugSuggester={slugSuggester}
            authorOptions={authorOptions}
            onChange={onChange}
            onSave={onSave}
            onRequestPublish={onRequestPublish}
            onSchedulePublish={onSchedulePublish}
            defaultOpen={true}
          />
        )}
      </main>

      <aside className="pg__events">
        <h2>이벤트 로그 (에디터 → sync → NAS)</h2>
        <ul>
          {log.length === 0 && <li className="pg__empty">편집/저장/발행을 해보세요…</li>}
          {log.map((e, i) => (
            <li key={i}>
              <span className="pg__time">{e.t}</span>
              <span className={'pg__kind pg__kind--' + e.kind}>{e.kind}</span>
              <span className="pg__detail">{e.detail}</span>
            </li>
          ))}
        </ul>
        <details className="pg__md">
          <summary>마지막 Markdown ({lastMd.length}자)</summary>
          <pre>{lastMd}</pre>
        </details>
      </aside>
    </div>
  )
}
