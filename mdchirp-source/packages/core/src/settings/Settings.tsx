import { useEffect, useState } from 'react'
import type { SettingsProps, DeviceSettings } from '@mdchirp/shared'
import { SECTIONS, type SectionDef } from './sections.js'
import { mergeDevice, buildNasPatch, normalizeIdleMin, submitSecret } from './payload.js'

// ───────────────────────────────────────────────────────────
// Settings — controlled 설정 컴포넌트.
// device/nas 를 props 로 받아 편집 → onSave*/onSetSecret 로 위에 쏜다(SPEC §2).
// 직접 네트워크 안 함. SECTIONS(레지스트리)를 순회해 섹션을 그린다.
// ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<SectionDef['status'], { label: string; cls: string }> = {
  ready: { label: '동작', cls: 'set-badge--ready' },
  partial: { label: '🚧 값만 저장', cls: 'set-badge--partial' },
  slot: { label: '📋 준비 중', cls: 'set-badge--slot' },
}

export function Settings(props: SettingsProps): JSX.Element {
  const { device, nas, onSaveDevice, onSaveNas, onSetSecret, onTestConnection } = props

  return (
    <div className="set">
      <h2 className="set__title">설정</h2>
      {SECTIONS.map((s) => (
        <section key={s.id} className={'set-sec set-sec--' + s.status}>
          <header className="set-sec__head">
            <span className="set-sec__num">{s.num}</span>
            <h3 className="set-sec__label">{s.label}</h3>
            <span className={'set-badge ' + STATUS_BADGE[s.status].cls}>
              {STATUS_BADGE[s.status].label}
            </span>
          </header>
          {s.note && s.status !== 'ready' && <p className="set-sec__note">{s.note}</p>}
          <div className="set-sec__body">
            {renderSection(s.id, {
              device,
              nas,
              onSaveDevice,
              onSaveNas,
              onSetSecret,
              onTestConnection,
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// 섹션 id → 본문 컴포넌트 매핑. slot 은 본문 없음(헤더 배지만).
function renderSection(id: string, p: SettingsProps): JSX.Element | null {
  switch (id) {
    case 'connection':
      return <SectionConnection {...p} />
    case 'github':
      return <SectionGithub {...p} />
    case 'ai':
      return <SectionAi {...p} />
    case 'editor':
      return <SectionEditor {...p} />
    case 'dictation':
      return <SectionDictation {...p} />
    case 'suggestions':
      return <SectionSuggestions {...p} />
    case 'image':
      return <SectionImage {...p} />
    default:
      return <div className="set-slot">아직 구현되지 않은 기능입니다.</div>
  }
}

// ── 공통 작은 조각 ─────────────────────────────────────────
function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="set-field">
      <span className="set-field__label">{props.label}</span>
      {props.children}
    </label>
  )
}

function SaveBtn(props: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" className="set-save" onClick={props.onClick}>
      {props.children ?? '저장'}
    </button>
  )
}

// ── 1. 연결(NAS) — ready ──────────────────────────────────
function SectionConnection(p: SettingsProps) {
  const [name, setName] = useState(p.device.deviceName)
  const [url, setUrl] = useState(p.device.nasBaseUrl)
  const [token, setToken] = useState(p.device.nasToken ?? '')

  function save() {
    const next: DeviceSettings = mergeDevice(p.device, {
      deviceName: name,
      nasBaseUrl: url,
      nasToken: token || undefined,
    })
    p.onSaveDevice(next)
  }

  return (
    <>
      <Field label="기기 이름">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="NAS 주소">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          placeholder="http://localhost:8787"
        />
      </Field>
      <Field label="기기 인증 토큰">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          spellCheck={false}
          placeholder="(선택)"
        />
      </Field>
      <div className="set-actions">
        <SaveBtn onClick={save} />
        {p.onTestConnection && (
          <button type="button" className="set-test" onClick={p.onTestConnection}>
            연결 테스트
          </button>
        )}
      </div>
    </>
  )
}

// ── 2. GitHub — ready ─────────────────────────────────────
function SectionGithub(p: SettingsProps) {
  const [repo, setRepo] = useState(p.nas.github.repo)
  const [branch, setBranch] = useState(p.nas.github.branch)
  const [pat, setPat] = useState('') // secret: 메모리에 안 들고 있음(저장 후 비움)
  const [tz, setTz] = useState<'nas' | 'device'>(p.nas.timezone ?? 'nas')

  function saveRepo() {
    p.onSaveNas(buildNasPatch({ github: { repo, branch, tokenSet: p.nas.github.tokenSet } }))
  }
  function saveTz() {
    p.onSaveNas(buildNasPatch({ timezone: tz }))
  }
  function savePat() {
    const { call, nextInput } = submitSecret('github', pat)
    p.onSetSecret(call.kind, call.value)
    setPat(nextInput)
  }

  return (
    <>
      <Field label="저장소 (user/blog)">
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          spellCheck={false}
          placeholder="me/blog"
        />
      </Field>
      <Field label="브랜치">
        <input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          spellCheck={false}
          placeholder="main"
        />
      </Field>
      <Field label="발행 시각 기준">
        <select value={tz} onChange={(e) => setTz(e.target.value as 'nas' | 'device')}>
          <option value="nas">NAS(서버) 시간대 기준</option>
          <option value="device">발행한 기기의 현재 시간대 기준</option>
        </select>
      </Field>
      <div className="set-actions">
        <SaveBtn onClick={saveRepo}>저장소 저장</SaveBtn>
        <SaveBtn onClick={saveTz}>시간대 저장</SaveBtn>
      </div>
      <Field label={'GitHub 토큰(PAT)' + (p.nas.github.tokenSet ? ' — 설정됨 ✓' : '')}>
        <input
          type="password"
          value={pat}
          onChange={(e) => setPat(e.target.value)}
          spellCheck={false}
          placeholder={p.nas.github.tokenSet ? '••••••• (재입력 시 교체)' : 'ghp_…'}
        />
      </Field>
      <div className="set-actions">
        <SaveBtn onClick={savePat}>토큰 저장(NAS로)</SaveBtn>
      </div>

      <div className="set-help">
        <p className="set-help__title">저자 설정 (authors.yml)</p>
        <p>
          블로그 저장소의 <code>_data/authors.yml</code> 파일에 저자를 정의하면, 글 작성 시 저자
          칸의 드롭다운에서 골라 넣을 수 있고 발행된 글에 프로필 링크가 걸립니다.
        </p>
        <pre className="set-help__code">{`okto:
  name: Okto Kim
  twitter: oktoya
  url: https://oktoya.net`}</pre>
        <ul className="set-help__list">
          <li>
            저자 칸에는 <code>authors.yml</code>의 <b>키</b>(예: <code>oktoya</code>)를 입력합니다.
          </li>
          <li>
            여러 명은 콤마로 구분합니다. 예: <code>oktoya, hong</code>
          </li>
          <li>
            비워 두면 <code>_config.yml</code>의 기본 저자(<code>social.name</code>)로 표시됩니다.
          </li>
          <li>
            <code>authors.yml</code>에 없는 이름을 직접 입력하면 표시는 되지만 프로필 링크는 걸리지
            않습니다.
          </li>
        </ul>
      </div>
    </>
  )
}

// ── 3. AI 키/모델 — ready ─────────────────────────────────
function SectionAi(p: SettingsProps) {
  const [model, setModel] = useState(p.nas.ai.model)
  const [key, setKey] = useState('') // secret

  function saveModel() {
    p.onSaveNas(
      buildNasPatch({
        ai: { provider: 'gemini', model, keySet: p.nas.ai.keySet },
      }),
    )
  }
  function saveKey() {
    const { call, nextInput } = submitSecret('gemini', key)
    p.onSetSecret(call.kind, call.value)
    setKey(nextInput)
  }

  return (
    <>
      <Field label="제공자">
        <input value="gemini" disabled />
      </Field>
      <Field label="모델">
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          spellCheck={false}
          placeholder="gemini-2.0-flash"
        />
      </Field>
      <div className="set-actions">
        <SaveBtn onClick={saveModel}>모델 저장</SaveBtn>
      </div>
      <Field label={'Gemini API 키' + (p.nas.ai.keySet ? ' — 설정됨 ✓' : '')}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          spellCheck={false}
          placeholder={p.nas.ai.keySet ? '••••••• (재입력 시 교체)' : 'AIza…'}
        />
      </Field>
      <div className="set-actions">
        <SaveBtn onClick={saveKey}>키 저장(NAS로)</SaveBtn>
      </div>
    </>
  )
}

// ── 4. 에디터 동작 — partial ──────────────────────────────
function SectionEditor(p: SettingsProps) {
  const e0 = p.device.editor
  const [splitView, setSplitView] = useState(e0.splitView)
  const [spellLang, setSpellLang] = useState(e0.spellcheckLang)
  const [idle, setIdle] = useState(String(e0.autosave?.idleMin ?? 0))
  const [mode, setMode] = useState<'rich' | 'md'>(e0.defaultMode ?? 'rich')
  const [codeStyle, setCodeStyle] = useState<'fenced' | 'indented'>(e0.codeBlockStyle ?? 'fenced')

  function save() {
    const next = mergeDevice(p.device, {
      editor: {
        splitView,
        spellcheckLang: spellLang,
        autosave: { idleMin: normalizeIdleMin(idle) },
        defaultMode: mode,
        codeBlockStyle: codeStyle,
      },
    })
    p.onSaveDevice(next)
  }

  return (
    <>
      <Field label="분할뷰 기본 열기">
        <input
          type="checkbox"
          checked={splitView}
          onChange={(e) => setSplitView(e.target.checked)}
        />
      </Field>
      <Field label="맞춤법 검사 언어">
        <input
          value={spellLang}
          onChange={(e) => setSpellLang(e.target.value)}
          spellCheck={false}
          placeholder="ko"
        />
      </Field>
      <Field label="자동저장 간격(분, 0=끔)">
        <input type="number" min={0} value={idle} onChange={(e) => setIdle(e.target.value)} />
      </Field>
      <Field label="기본 에디터 모드">
        <select value={mode} onChange={(e) => setMode(e.target.value as 'rich' | 'md')}>
          <option value="rich">리치</option>
          <option value="md">마크다운</option>
        </select>
      </Field>
      <Field label="코드블록 형식">
        <select
          value={codeStyle}
          onChange={(e) => setCodeStyle(e.target.value as 'fenced' | 'indented')}
        >
          <option value="fenced">``` (펜스)</option>
          <option value="indented">4칸 들여쓰기</option>
        </select>
      </Field>
      <div className="set-actions">
        <SaveBtn onClick={save} />
      </div>
    </>
  )
}

// ── 5. 받아쓰기 — partial ─────────────────────────────────
function SectionDictation(p: SettingsProps) {
  const d0 = p.device.editor.dictation
  const [provider, setProvider] = useState(d0?.provider ?? 'browser')
  const [lang, setLang] = useState(d0?.lang ?? 'ko-KR')

  function save() {
    const next = mergeDevice(p.device, { editor: { dictation: { provider, lang } } })
    p.onSaveDevice(next)
  }

  return (
    <>
      <Field label="받아쓰기 엔진">
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="browser">브라우저 음성인식 (Web Speech)</option>
        </select>
      </Field>
      <Field label="인식 언어">
        <input
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          spellCheck={false}
          placeholder="ko-KR"
        />
      </Field>
      <div className="set-actions">
        <SaveBtn onClick={save} />
      </div>
    </>
  )
}

// ── 6. 서식·slug 제안 — partial ───────────────────────────
const SUGGEST_TYPES: {
  value: 'heading' | 'codeblock' | 'prompt' | 'list' | 'link'
  label: string
}[] = [
  { value: 'heading', label: '제목' },
  { value: 'codeblock', label: '코드블록' },
  { value: 'prompt', label: '프롬프트' },
  { value: 'list', label: '목록' },
  { value: 'link', label: '링크' },
]

function SectionSuggestions(p: SettingsProps) {
  const s0 = p.nas.ai.suggestions
  const sl0 = p.nas.ai.slug
  const [enabled, setEnabled] = useState(s0?.enabled ?? false)
  const [types, setTypes] = useState<(typeof SUGGEST_TYPES)[number]['value'][]>(s0?.types ?? [])
  const [slugEnabled, setSlugEnabled] = useState(sl0?.enabled ?? false)
  const [offlineFallback, setOfflineFallback] = useState(sl0?.offlineFallback ?? false)

  function toggleType(t: (typeof SUGGEST_TYPES)[number]['value']) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  }

  function save() {
    p.onSaveNas(
      buildNasPatch({
        ai: {
          provider: 'gemini',
          model: p.nas.ai.model,
          keySet: p.nas.ai.keySet,
          suggestions: { enabled, types },
          slug: { enabled: slugEnabled, offlineFallback },
        },
      }),
    )
  }

  return (
    <>
      <Field label="서식 제안 사용">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      </Field>
      <div className="set-types">
        {SUGGEST_TYPES.map((t) => (
          <label key={t.value} className="set-type">
            <input
              type="checkbox"
              checked={types.includes(t.value)}
              onChange={() => toggleType(t.value)}
              disabled={!enabled}
            />
            {t.label}
          </label>
        ))}
      </div>
      <Field label="slug 제안 사용">
        <input
          type="checkbox"
          checked={slugEnabled}
          onChange={(e) => setSlugEnabled(e.target.checked)}
        />
      </Field>
      <Field label="오프라인 음역 폴백">
        <input
          type="checkbox"
          checked={offlineFallback}
          onChange={(e) => setOfflineFallback(e.target.checked)}
          disabled={!slugEnabled}
        />
      </Field>
      <div className="set-actions">
        <SaveBtn onClick={save} />
      </div>
    </>
  )
}

// ── 7. 이미지 저장 형식 — ready ────────────────────────────
type ImageFormatSetting = 'original' | 'webp'

function SectionImage(p: SettingsProps) {
  const savedFormat = p.nas.mediaPolicy.imageFormat ?? 'original'
  const [imageFormat, setImageFormat] = useState<ImageFormatSetting>(savedFormat)

  // 설정 화면이 먼저 열린 뒤 NAS 설정 응답이 도착해도 선택값을 맞춘다.
  useEffect(() => {
    setImageFormat(p.nas.mediaPolicy.imageFormat ?? 'original')
  }, [p.nas.mediaPolicy.imageFormat])

  function save() {
    p.onSaveNas(
      buildNasPatch({
        mediaPolicy: {
          ...p.nas.mediaPolicy,
          imageFormat,
        },
      }),
    )
  }

  return (
    <>
      <Field label="기본 이미지 저장 형식">
        <select
          value={imageFormat}
          onChange={(e) => setImageFormat(e.target.value as ImageFormatSetting)}
        >
          <option value="original">원본 유지</option>
          <option value="webp">WebP로 변환</option>
        </select>
      </Field>

      <div className="set-help">
        <p>
          이미지 첨부 시 기본으로 사용할 저장 형식입니다. 이미지 첨부 창에서 파일별로 원본 유지 또는
          WebP 변환을 따로 선택할 수 있습니다.
        </p>
        <p>
          움직이는 GIF는 WebP 변환 시 애니메이션이 유지되지 않을 수 있으므로 원본 유지를 권장합니다.
        </p>
      </div>

      <div className="set-actions">
        <SaveBtn onClick={save}>이미지 설정 저장</SaveBtn>
      </div>
    </>
  )
}
