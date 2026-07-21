// Shell — 모듈 배치/전환 그릇. SPEC: packages/core/src/shell/SPEC.md
//
// 책임(§2): 레이아웃에 모듈 배치 + 전환, platform 으로 Sync 구성해 주입,
//           AI 어댑터(platform 에서 주입)를 editor 에 전달, 전역 단축키 등록/해제,
//           전역 상태 표시(NAS연결/오프라인).
// 안 함: 저장/네트워크 직접(sync 위임). NAS 본문 로드는 sync.openPost 에 위임
//        (로컬 없으면 NAS 로드, 로컬 있고 NAS 더 최신이면 확인 후 교체).
//
// App.tsx(playground)의 흩어진 sync 구성/구독/전환을 platform 기반으로 모은 것.

import { useEffect, useRef, useState } from 'react'
import type {
  Post,
  PostPatch,
  ListQuery,
  ShellProps,
  ShellPane,
  DictationProvider,
  DeviceSettings,
  NasSettings,
  SecretKind,
  UploadMediaOptions,
} from '@mdchirp/shared'
import { DEFAULT_LIST_QUERY } from '@mdchirp/shared'
import {
  Sync,
  type ConflictInfo,
  type SaveResult as SyncSaveResult,
} from '../sync/index.js'
import { SplitView, type ImageUploadResult } from '../editor/split/SplitView.js'
import { Lister } from '../lister/Lister.js'
import { Settings } from '../settings/Settings.js'
import { BrowserDictation } from '../editor/dictation/providers/BrowserDictation.js'
import { adaptPlatformHttp, adaptPlatformStorage } from './platformAdapters.js'
import { registerShellShortcuts } from './shortcuts.js'

export function Shell({ platform, mode = 'full' }: ShellProps) {
  const syncRef = useRef<Sync | null>(null)
  const [online, setOnline] = useState(false)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)

  const [pane, setPane] = useState<ShellPane>('editor')
  const [posts, setPosts] = useState<Post[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listQuery, setListQuery] = useState<ListQuery>(DEFAULT_LIST_QUERY)
  const [openPost, setOpenPost] = useState<Post | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // formatter 가용성 변경 시 SplitView 강제 리렌더용 key (App.tsx 패턴)
  const [fmtReady, setFmtReady] = useState(false)
  const [authorOptions, setAuthorOptions] = useState<{ key: string; name: string }[]>([])

  // ── settings 상태 (Shell 이 소유, controlled <Settings> 에 내림) ──
  // device: 기기 로컬 설정. nas: NAS 설정(키는 항상 마스킹 불린만).
  const [device, setDevice] = useState<DeviceSettings>(() => ({
    deviceId: 'shell-device',
    deviceName: 'mdchirp',
    nasBaseUrl: '',
    editor: { splitView: true, spellcheckLang: 'ko' },
  }))
  const [nasSettings, setNasSettings] = useState<NasSettings>(() => ({
    github: { repo: '', branch: 'main', tokenSet: false },
    ai: { provider: 'gemini', model: 'gemini-2.0-flash', keySet: false },
    mediaPolicy: {} as NasSettings['mediaPolicy'],
  }))
  // settings 화면 전용 안내(연결 테스트 결과 등). 에디터의 notice 와 분리.
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null)
  // 안내를 띄우고 3초 뒤 자동으로 지움(토스트). 스크롤 위치와 무관하게 하단 고정 표시.
  function flashNotice(msg: string) {
    setSettingsNotice(msg)
    setTimeout(() => setSettingsNotice((cur) => (cur === msg ? null : cur)), 3000)
  }

  // 받아쓰기: platform 이 주입하면 그것, 없으면 기본 BrowserDictation 폴백(1차).
  const dictationRef = useRef<DictationProvider | null>(null)
  if (!dictationRef.current) {
    dictationRef.current = platform.dictation ?? new BrowserDictation('ko-KR')
  }
  const formatter = platform.formatter
  const slugSuggester = platform.slugSuggester

  // ── Sync 구성 (platform → 변환 어댑터 → Sync) ─────────────
  useEffect(() => {
    const sync = new Sync({
      http: adaptPlatformHttp(platform.http),
      storage: adaptPlatformStorage(platform.storage),
      healthIntervalMs: 8000,
      initialOnline: false,
    })
    sync.onConnectivity((o) => {
      setOnline(o)
      // 연결되면 서식제안 가용성(NAS Gemini 키) 갱신
      if (
        o &&
        formatter &&
        'refresh' in formatter &&
        typeof (formatter as any).refresh === 'function'
      ) {
        void (formatter as any).refresh().then((ready: boolean) => setFmtReady(ready))
      } else if (!o) {
        setFmtReady(false)
      }
    })
    sync.onConflict((c) => setConflict(c))
    void sync.checkConnectivity()
    syncRef.current = sync
    return () => sync.dispose()
  }, [platform, formatter])

  // ── 전역 단축키 (있는 플랫폼에서만) ───────────────────────
  useEffect(() => {
    return registerShellShortcuts(platform, {
      newPost: () => onNew(),
      focusList: () => {
        setPane('editor')
        void refreshList()
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform])

  // ── 마운트(=Sync 구성) 시 목록 1회 로드 ───────────────────
  // Sync 가 platform 마다 새로 만들어지므로 platform 이 바뀌면 다시 로드.
  useEffect(() => {
    void refreshList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform])

  // 저자 드롭다운 목록(_data/authors.yml) 로드. posts 아님 → platform.http 직접(settings 패턴).
  useEffect(() => {
    void platform.http
      .request({ method: 'GET', url: '/api/authors' })
      .then((res) => {
        if (res.status === 200 && Array.isArray(res.body)) {
          setAuthorOptions(res.body as { key: string; name: string }[])
        }
      })
      .catch(() => {}) // 부가기능 — 실패해도 무시(자유 입력은 됨)
  }, [platform])

  // ── 목록 / 열기 / 새 글 ───────────────────────────────────
  // 발행/예약/저장 후, 그 글 하나만 목록에 즉시 반영(네트워크 재조회 없음).
  // 같은 id 가 있으면 교체, 없으면 맨 앞에 추가(새 글이 바로 보이도록).
  function upsertPost(p: Post) {
    setPosts((cur) => {
      const i = cur.findIndex((x) => x.id === p.id)
      if (i === -1) return [p, ...cur]
      const next = cur.slice()
      next[i] = p
      return next
    })
  }

  async function refreshList() {
    const sync = syncRef.current
    if (!sync) return
    setListLoading(true)
    try {
      setPosts(await sync.list())
    } finally {
      setListLoading(false)
    }
  }

  // 글 열기 — sync.openPost 가 로컬/NAS rev 를 맞춰본다.
  //  - loaded/local : 그 글을 연다.
  //  - stale        : 다른 기기에서 더 최신본이 저장됨 → window.confirm 으로 확인.
  //                   불러오기=NAS 본문 교체(adoptRemote), 아니오=로컬 유지.
  //  - none         : 못 엶(오프라인이라 로컬에 없는 글 로드 불가 등).
  async function onOpen(id: string) {
    const sync = syncRef.current
    if (!sync) return
    // NAS 로드는 slug 기준. 목록(posts)에서 slug 확보(열린 글이면 그것도).
    const target = posts.find((x) => x.id === id) ?? (openPost?.id === id ? openPost : null)
    const res = await sync.openPost(id, target?.slug)
    setPane('editor')
    if (res.kind === 'loaded' || res.kind === 'local') {
      setOpenPost(res.post)
      setNotice(null)
    } else if (res.kind === 'stale') {
      const adopt = window.confirm(
        '다른 기기에서 이 글의 새 버전이 저장됐습니다.\n' +
          '지금 편집 중인 내용이 있다면 사라집니다.\n' +
          '최신본을 불러올까요? (취소하면 지금 로컬 버전을 엽니다)',
      )
      if (adopt) {
        await sync.adoptRemote(res.remote)
        setOpenPost(res.remote)
        upsertPost(res.remote)
      } else {
        setOpenPost(res.local)
      }
      setNotice(null)
    } else {
      setOpenPost(null)
      setNotice(
        online
          ? '이 글을 불러올 수 없습니다.'
          : '오프라인 상태라 이 기기에 없는 글은 불러올 수 없습니다.',
      )
    }
  }

  function onNew() {
    const now = new Date().toISOString()
    setOpenPost({
      id: `new-${Date.now()}`,
      slug: makeTempSlug(),
      title: '',
      tiptapJson: null,
      markdown: '',
      frontmatter: { title: '', date: now },
      media: [],
      status: 'draft',
      hasRichSource: false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    })
    setNotice(null)
    setPane('editor')
  }

  // ── 에디터 이벤트 → sync 위임 ─────────────────────────────
  function onChange(patch: PostPatch) {
    void syncRef.current?.saveLocalDraft(patch)
  }

  // version_conflict만 충돌 배너로 표시한다.
  // slug/ID 오류는 충돌로 오인하지 않고 저장 실패 안내로 표시한다.
  function handleSaveFailure(
    result: Extract<SyncSaveResult, { ok: false }>,
  ): string {
    if (result.error === 'version_conflict') {
      setConflict(result.conflict)
      return result.message || '다른 기기에서 변경이 있었습니다.'
    }

    setConflict(null)

    const message =
      result.error === 'slug_taken'
        ? '이미 사용 중인 slug입니다. 다른 slug를 입력해 주세요.'
        : result.error === 'duplicate_post_id'
          ? '동일한 글 ID가 NAS의 여러 폴더에 존재합니다. 저장소를 확인해 주세요.'
          : result.error === 'invalid_slug'
            ? 'slug가 올바르지 않습니다. 경로 구분자나 상위 경로는 사용할 수 없습니다.'
            : result.message

    flashNotice('⚠️ 저장 실패 — ' + message)
    return message
  }

  async function onSave(p: Post) {
    const sync = syncRef.current
    if (!sync) return

    setConflict(null)

    const res = await sync.saveToNas(p)

    if (res.ok) {
      setOpenPost(res.post)
      upsertPost(res.post)

      flashNotice(
        res.forkedFromId
          ? '🌱 발행된 원본은 보존하고 새 초안으로 전환했습니다.'
          : '💾 저장됨',
      )
      return
    }

    handleSaveFailure(res)
  }

  // 이미지 첨부는 온라인 전용이다.
  // 현재 본문을 먼저 NAS에 저장해 글/slug를 확정한 뒤 파일을 업로드하고,
  // 성공한 MediaFile을 글의 media 목록에 반영해 다시 저장한다.
  // 업로드가 성공하기 전에는 에디터 본문에 이미지 문법을 삽입하지 않는다.
  async function onUploadImage(
    p: Post,
    file: File,
    options: UploadMediaOptions = {},
  ): Promise<ImageUploadResult> {
    const sync = syncRef.current
    if (!sync) {
      return { ok: false, message: '동기화 모듈을 사용할 수 없습니다.' }
    }
    if (!online) {
      const message = '이미지 첨부는 NAS에 연결된 온라인 상태에서만 사용할 수 있습니다.'
      flashNotice('⚠️ ' + message)
      return { ok: false, message }
    }

    setConflict(null)

    const saved = await sync.saveToNas(p)
    if (!saved.ok) {
      const message = handleSaveFailure(saved)

      return {
        ok: false,
        message:
          saved.error === 'version_conflict'
            ? '다른 기기에서 변경이 있었습니다. 충돌을 해결한 뒤 이미지를 다시 첨부해 주세요.'
            : message,
      }
    }

    setOpenPost(saved.post)
    upsertPost(saved.post)

    const uploaded = await sync.uploadMedia(saved.post.slug, file, file.name, options)
    if (!uploaded.ok) {
      flashNotice('⚠️ 이미지 첨부 실패 — ' + uploaded.message)
      return uploaded
    }

    const media = [
      ...(saved.post.media ?? []).filter(
        (item) => item.id !== uploaded.media.id && item.filename !== uploaded.media.filename,
      ),
      uploaded.media,
    ]
    const withMedia: Post = {
      ...saved.post,
      media,
      updatedAt: new Date().toISOString(),
    }

    const persisted = await sync.saveToNas(withMedia)
    if (!persisted.ok) {
      const message = handleSaveFailure(persisted)

      return {
        ok: false,
        message:
          persisted.error === 'version_conflict'
            ? '이미지는 업로드됐지만 다른 기기에서 변경이 있어 미디어 목록을 저장하지 못했습니다.'
            : `이미지는 업로드됐지만 글의 미디어 목록을 저장하지 못했습니다. ${message}`,
      }
    }

    setOpenPost(persisted.post)
    upsertPost(persisted.post)
    flashNotice(`🖼 이미지 첨부 완료 — ${uploaded.media.filename}`)
    return { ok: true, media: uploaded.media }
  }

  async function onRequestPublish(p: Post) {
    const sync = syncRef.current
    if (!sync) return

    const saved = await sync.saveToNas(p)

    if (!saved.ok) {
      handleSaveFailure(saved)
      return
    }

    setOpenPost(saved.post)
    upsertPost(saved.post)

    // fork가 발생했을 수 있으므로 저장 응답의 새 Post.id를 사용한다.
    const res = await sync.requestPublish(saved.post.id)
    const after = await sync.getDraft(saved.post.id)

    if (after) {
      setOpenPost(after.post)
      upsertPost(after.post)
    }

    if (res.ok) {
      flashNotice(
        res.queued
          ? '📥 오프라인 — 발행 대기 중(연결되면 자동 발행)'
          : '🚀 발행 완료 — GitHub에 반영됐어요',
      )
    } else {
      flashNotice('⚠️ 발행 실패 — ' + res.message)
    }
  }
  async function onSchedulePublish(p: Post, publishAt: string) {
    const sync = syncRef.current
    if (!sync) return

    const saved = await sync.saveToNas(p)

    if (!saved.ok) {
      handleSaveFailure(saved)
      return
    }

    setOpenPost(saved.post)
    upsertPost(saved.post)

    // fork가 발생했을 수 있으므로 저장 응답의 새 Post.id를 사용한다.
    const res = await sync.schedulePublish(saved.post.id, publishAt)
    const after = await sync.getDraft(saved.post.id)

    if (after) {
      setOpenPost(after.post)
      upsertPost(after.post)
    }

    if (res.ok) {
      flashNotice(
        res.queued
          ? '📥 오프라인 — 예약 요청 저장됨(연결되면 등록)'
          : '🗓 예약 등록 완료',
      )
    } else {
      flashNotice('⚠️ 예약 실패 — ' + res.message)
    }
  }

  // 삭제 — Lister 가 window.confirm 으로 확인한 뒤 id 만 넘겨준다.
  // slug 로 NAS 삭제 → 성공 시 목록/열린 글에서 제거. offline 은 sync 가 차단(메시지 반환).
  async function onDelete(id: string) {
    const sync = syncRef.current
    if (!sync) return
    // 목록의 해당 글에서 slug 확보(NAS 삭제는 slug 기준).
    const target = posts.find((x) => x.id === id) ?? (openPost?.id === id ? openPost : null)
    if (!target) return
    const res = await sync.deletePost(id, target.slug)
    if (res.ok) {
      setPosts((cur) => cur.filter((x) => x.id !== id)) // 목록에서 제거
      if (openPost?.id === id) {
        setOpenPost(null)
        setNotice(null)
      }
      flashNotice(res.unpublished ? '🗑 삭제 완료 — GitHub 에서도 제거됨' : '🗑 삭제 완료')
    } else {
      flashNotice('⚠️ ' + res.message)
    }
  }

  // 발행 취소 — 백엔드가 저장한 최신 Post와 rev를 즉시 UI에 반영한다.
  async function onUnpublish(p: Post) {
    const sync = syncRef.current
    if (!sync) return

    const res = await sync.unpublish(p.slug)

    if (res.ok) {
      setOpenPost(res.post)
      upsertPost(res.post)

      flashNotice(
        res.committed
          ? '↩️ 발행 취소 완료 — 블로그에서 내려가고 초안으로 남았어요'
          : '↩️ 발행 취소 완료 — Git 변경은 없고 초안으로 전환했어요',
      )
    } else {
      flashNotice('⚠️ ' + res.message)
    }
  }

  async function resolveOverwrite() {
    const sync = syncRef.current
    if (!sync || !conflict || !openPost) return

    const mine: Post = {
      ...openPost,
      rev: conflict.currentRev,
      updatedAt: new Date().toISOString(),
    }

    const res = await sync.resolveOverwrite(mine, conflict.currentRev)

    if (res.ok) {
      setOpenPost(res.post)
      upsertPost(res.post)
      setConflict(null)

      flashNotice(
        res.forkedFromId
          ? '🌱 발행된 원본은 보존하고 새 초안으로 전환했습니다.'
          : '💾 충돌을 확인하고 저장했습니다.',
      )
      return
    }

    handleSaveFailure(res)
  }

  // ── settings — NAS 설정/키/연결 (platform.http 직접, Sync 미경유) ──
  // Sync/NasClient 는 posts 전용이라 /api/settings·/api/secrets 를 모른다.
  // playground App.tsx 의 배선을 Shell 안으로 옮긴 것.
  async function loadNasSettings() {
    const res = await platform.http.request({ method: 'GET', url: '/api/settings' })
    if (res.status === 200 && res.body) {
      setNasSettings((cur) => ({ ...cur, ...(res.body as Partial<NasSettings>) }))
    }
  }

  function onSaveDevice(d: DeviceSettings) {
    // NAS 주소(nasBaseUrl) 변경은 저장만 됨. 즉시 재구성은 안 함(SPEC §7 ⚠️):
    // Shell/Sync 는 platform 변경 시 재구성을 지원하나, 주소를 쥔 껍데기가
    // platform 을 다시 만들어야 적용된다(desktop NAS 주소 동적변경 = AI_WORKFLOW §7).
    setDevice(d)
  }

  async function onSaveNas(part: Partial<NasSettings>) {
    setNasSettings((cur) => ({ ...cur, ...part }))
    await platform.http.request({ method: 'PUT', url: '/api/settings', body: part })
  }

  async function onSetSecret(kind: SecretKind, value: string) {
    const res = await platform.http.request({
      method: 'PUT',
      url: '/api/secrets',
      body: { kind, value },
    })
    // 응답은 set 여부 불린만 → nas 마스킹 상태 갱신 (키 원본은 보관 안 함)
    if (res.status === 200) {
      setNasSettings((cur) =>
        kind === 'github'
          ? { ...cur, github: { ...cur.github, tokenSet: true } }
          : { ...cur, ai: { ...cur.ai, keySet: true } },
      )
    }
  }

  async function onTestConnection() {
    // 결과(온라인 상태)는 Sync 의 health 폴링도 반영하지만,
    // 사용자가 버튼을 누른 즉시 결과를 보여줘야 하므로 notice 로 표시(SPEC §6).
    const res = await platform.http.request({ method: 'GET', url: '/api/health' })
    flashNotice(
      res.status === 200 ? '✅ 연결 성공 (NAS 응답 200)' : `⚠️ 연결 실패 (status ${res.status})`,
    )
  }

  // ── 렌더 ──────────────────────────────────────────────────
  const popup = mode === 'popup'
  return (
    <div className={'shell' + (popup ? ' shell--popup' : '')}>
      <header className="shell__top">
        <span className={'shell__dot ' + (online ? 'shell__dot--on' : 'shell__dot--off')} />
        <span className="shell__online">{online ? '온라인' : '오프라인'}</span>
        <span className="shell__spacer" />
        <button
          className={pane === 'settings' ? 'shell__btn shell__btn--on' : 'shell__btn'}
          onClick={() => {
            setPane('settings')
            void loadNasSettings()
          }}
        >
          설정
        </button>
      </header>

      {conflict && (
        <div className="shell__conflict" role="alert">
          ⚠️ 버전 충돌 — NAS rev {conflict.currentRev}. 자동 병합하지 않습니다.
          <button className="shell__btn" onClick={resolveOverwrite}>
            내 것으로 덮어쓰기
          </button>
          <button className="shell__btn shell__btn--ghost" onClick={() => setConflict(null)}>
            취소
          </button>
        </div>
      )}

      <div className="shell__body">
        {!popup && (
          <aside className="shell__side">
            <Lister
              posts={posts}
              loading={listLoading}
              query={listQuery}
              onQueryChange={setListQuery}
              onOpen={onOpen}
              onNew={onNew}
              onRefresh={refreshList}
              onDelete={onDelete}
            />
          </aside>
        )}

        <main className="shell__main">
          {pane === 'editor' && openPost && (
            <SplitView
              key={openPost.id + (fmtReady ? ':fmt-on' : ':fmt-off')}
              post={openPost}
              dictation={dictationRef.current ?? undefined}
              formatter={formatter}
              mediaUrl={platform.mediaUrl}
              slugSuggester={slugSuggester}
              authorOptions={authorOptions}
              onChange={onChange}
              onSave={onSave}
              defaultImageFormat={nasSettings.mediaPolicy.imageFormat ?? 'original'}
              onUploadImage={onUploadImage}
              onRequestPublish={onRequestPublish}
              onSchedulePublish={onSchedulePublish}
              onUnpublish={onUnpublish}
              defaultOpen={true}
            />
          )}
          {pane === 'editor' && !openPost && (
            <div className="shell__placeholder">
              {notice ?? '글을 선택하거나 새 글을 시작하세요.'}
            </div>
          )}
          {pane === 'settings' && (
            <div className="shell__settings">
              <Settings
                device={device}
                nas={nasSettings}
                onSaveDevice={onSaveDevice}
                onSaveNas={onSaveNas}
                onSetSecret={onSetSecret}
                onTestConnection={onTestConnection}
              />
            </div>
          )}
          {pane === 'prompter' && (
            <div className="shell__placeholder">쇼츠 — 준비 중 (prompter 모듈 슬롯)</div>
          )}
          {settingsNotice && <div className="shell__toast">{settingsNotice}</div>}
        </main>
      </div>
    </div>
  )
}

// 새 글 임시 slug — SPEC 형식(YYYY-MM-DD-이름). 정식 slug 는 추후 SlugSuggester 담당.
// 시각을 붙여 "새 글" 연타 시 충돌(덮어쓰기) 방지.
function makeTempSlug(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${date}-untitled-${Date.now().toString(36).slice(-5)}`
}
