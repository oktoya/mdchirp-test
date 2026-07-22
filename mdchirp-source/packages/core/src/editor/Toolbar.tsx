// Toolbar.tsx — 리치/MD 공용 서식 도구 (TipTap 스타일).
//
// 핵심: 툴바는 "의도(intent)"만 안다. 실제 동작은 주입된 EditorCommands(rich|md)가 수행.
//   - 리치 활성 → 표현이 바뀜(TipTap)
//   - MD 활성   → 코드(마크다운 문법)가 바뀜(textarea 선택영역 가공)
// 한 줄 통합 툴바라 보기에도 깔끔하다.
//
// 구성: [문단형식▾] [B I U S̶ <>] [글자색▾ 형광펜▾] [인용 코드블록]
//       [목록▾] [정렬▾] [🔗링크] [삽입▾(이미지|유튜브/영상|파일|수평선)] [🎙 ✨]
//   - 링크는 자주 쓰므로 드롭다운 밖 독립 버튼.
//   - 삽입 드롭다운은 "미디어" 전용: 외부 이미지 URL / 유튜브 임베드 / 파일 / 수평선.
// 저장/발행은 여기 없음 — SplitView 상단 바가 소유.

import { useEffect, useRef, useState } from 'react'
import type { DictationProvider, Formatter } from '@mdchirp/shared'
import { Icon } from './icons.js'
import type { EditorCommands, ToggleIntent } from './commands/types.js'

export interface ToolbarProps {
  /** 현재 활성 패널의 명령 구현 (rich 또는 md) */
  commands: EditorCommands
  /** 상태(active) 재계산을 트리거하는 값 — 리치 선택/트랜잭션 변경 시 증가 */
  revision?: number
  dictation?: DictationProvider
  formatter?: Formatter
  imageUploading?: boolean
  onSelectImage?: (file: File) => void
  onOpenSuggestions?: () => void
}

// 미리 정의된 색상 팔레트
const TEXT_COLORS = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#0f172a']
const HL_COLORS = ['#fde68a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#e9d5ff', '#fed7aa']

export function Toolbar({
  commands,
  revision,
  dictation,
  formatter,
  imageUploading = false,
  onSelectImage,
  onOpenSuggestions,
}: ToolbarProps) {
  const [listening, setListening] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const isRich = commands.target === 'rich'

  function toggleDictation() {
    if (!dictation) return
    if (listening) {
      dictation.stop()
      setListening(false)
    } else {
      dictation.start((chunk, isFinal) => {
        if (isFinal) commands.insertText(chunk)
      })
      setListening(true)
    }
  }

  const dictationAvailable = !!dictation && dictation.isAvailable()
  const formatterAvailable = !!formatter && formatter.isAvailable()

  // 활성 상태 (리치에서만 의미. revision 으로 리렌더 동기화)
  void revision
  const ap = commands.activeParagraph()
  const headingLabel = ap === 'paragraph' ? '본문' : `제목 ${ap.replace('heading', '')}`
  const align = commands.activeAlign()
  const alignIcon =
    align === 'center'
      ? Icon.alignCenter
      : align === 'right'
        ? Icon.alignRight
        : align === 'justify'
          ? Icon.alignJustify
          : Icon.alignLeft
  const listIcon = commands.isActive('orderedList') ? (
    <Icon.orderedList />
  ) : commands.isActive('taskList') ? (
    <Icon.taskList />
  ) : (
    <Icon.bulletList />
  )

  const tog = (i: ToggleIntent) => () => commands.toggle(i)

  return (
    <div className="mdc-tb" role="toolbar" aria-label="서식 도구" data-target={commands.target}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) onSelectImage?.(file)
        }}
      />

      {/* 문단 형식 드롭다운 */}
      <Dropdown label={headingLabel} title="문단 형식" width={140}>
        {(close) => (
          <>
            <MenuItem
              active={isRich && ap === 'paragraph'}
              onClick={() => {
                commands.setParagraph('paragraph')
                close()
              }}
            >
              <span className="mdc-mi__t">본문</span>
            </MenuItem>
            {[1, 2, 3, 4].map((l) => (
              <MenuItem
                key={l}
                active={isRich && ap === `heading${l}`}
                onClick={() => {
                  commands.setParagraph(`heading${l}` as any)
                  close()
                }}
              >
                <span className={`mdc-mi__h mdc-mi__h--${l}`}>제목 {l}</span>
              </MenuItem>
            ))}
          </>
        )}
      </Dropdown>

      <Sep />

      {/* 글자 서식 */}
      <IconBtn title="굵게 (Ctrl/Cmd+B)" active={commands.isActive('bold')} onClick={tog('bold')}>
        <Icon.bold />
      </IconBtn>
      <IconBtn
        title="기울임 (Ctrl/Cmd+I)"
        active={commands.isActive('italic')}
        onClick={tog('italic')}
      >
        <Icon.italic />
      </IconBtn>
      <IconBtn
        title="밑줄 (Ctrl/Cmd+U)"
        active={commands.isActive('underline')}
        onClick={tog('underline')}
      >
        <Icon.underline />
      </IconBtn>
      <IconBtn
        title="취소선 (Ctrl/Cmd+Shift+S)"
        active={commands.isActive('strike')}
        onClick={tog('strike')}
      >
        <Icon.strike />
      </IconBtn>
      <IconBtn title="인라인 코드" active={commands.isActive('code')} onClick={tog('code')}>
        <Icon.code />
      </IconBtn>

      {/* 글자색 */}
      <ColorDropdown
        title="글자색"
        icon={<Icon.palette />}
        colors={TEXT_COLORS}
        onPick={(c) => commands.setTextColor({ color: c })}
        onClear={() => commands.setTextColor({ color: null })}
        clearLabel="색 없음"
      />
      {/* 형광펜 */}
      <ColorDropdown
        title="형광펜"
        icon={<Icon.highlight />}
        colors={HL_COLORS}
        swatchBg
        onPick={(c) => commands.setHighlightColor({ color: c })}
        onClear={() => commands.setHighlightColor({ color: null })}
        clearLabel="형광 제거"
        defaultBtn={{ label: '기본 형광', onClick: () => commands.toggle('highlight') }}
      />

      <Sep />

      {/* 블록 */}
      <IconBtn title="인용" active={commands.isActive('blockquote')} onClick={tog('blockquote')}>
        <Icon.quote />
      </IconBtn>
      <IconBtn title="코드 블록" active={commands.isActive('codeBlock')} onClick={tog('codeBlock')}>
        <Icon.codeBlock />
      </IconBtn>

      {/* 목록 드롭다운 */}
      <Dropdown icon={listIcon} title="목록" width={170}>
        {(close) => (
          <>
            <MenuItem
              active={commands.isActive('bulletList')}
              onClick={() => {
                commands.toggle('bulletList')
                close()
              }}
            >
              <Icon.bulletList />
              <span className="mdc-mi__t">글머리 목록</span>
            </MenuItem>
            <MenuItem
              active={commands.isActive('orderedList')}
              onClick={() => {
                commands.toggle('orderedList')
                close()
              }}
            >
              <Icon.orderedList />
              <span className="mdc-mi__t">번호 목록</span>
            </MenuItem>
            <MenuItem
              active={commands.isActive('taskList')}
              onClick={() => {
                commands.toggle('taskList')
                close()
              }}
            >
              <Icon.taskList />
              <span className="mdc-mi__t">체크리스트</span>
            </MenuItem>
          </>
        )}
      </Dropdown>

      {/* 정렬 드롭다운 */}
      <Dropdown icon={alignIcon()} title="정렬" width={150}>
        {(close) => (
          <>
            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
              <MenuItem
                key={a}
                active={isRich && align === a}
                onClick={() => {
                  commands.setAlign(a)
                  close()
                }}
              >
                {a === 'left' ? (
                  <Icon.alignLeft />
                ) : a === 'center' ? (
                  <Icon.alignCenter />
                ) : a === 'right' ? (
                  <Icon.alignRight />
                ) : (
                  <Icon.alignJustify />
                )}
                <span className="mdc-mi__t">
                  {a === 'left'
                    ? '왼쪽'
                    : a === 'center'
                      ? '가운데'
                      : a === 'right'
                        ? '오른쪽'
                        : '양쪽'}
                </span>
              </MenuItem>
            ))}
          </>
        )}
      </Dropdown>

      <Sep />

      {/* 일반 링크 — 자주 쓰므로 드롭다운 밖 독립 버튼 */}
      <IconBtn
        title="링크 (선택 글자에 링크 걸기)"
        active={commands.isLinkActive()}
        onClick={() => promptLink(commands)}
      >
        <Icon.link />
      </IconBtn>

      {/* 삽입(미디어) 드롭다운 — 외부 이미지/유튜브 임베드/파일/수평선 */}
      <Dropdown icon={<Icon.image />} title="미디어 삽입" width={180}>
        {(close) => (
          <>
            {onSelectImage && (
              <MenuItem
                onClick={() => {
                  if (!imageUploading) imageInputRef.current?.click()
                  close()
                }}
              >
                <Icon.image />
                <span className="mdc-mi__t">
                  {imageUploading ? '이미지 업로드 중…' : '이미지 파일 첨부'}
                </span>
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                promptImage(commands)
                close()
              }}
            >
              <Icon.image />
              <span className="mdc-mi__t">이미지 (외부 URL)</span>
            </MenuItem>
            <MenuItem
              onClick={() => {
                promptYoutube(commands)
                close()
              }}
            >
              <Icon.youtube />
              <span className="mdc-mi__t">유튜브 / 영상 임베드</span>
            </MenuItem>
            <MenuItem
              onClick={() => {
                promptMedia(commands, 'file')
                close()
              }}
            >
              <Icon.file />
              <span className="mdc-mi__t">파일</span>
            </MenuItem>
            <MenuItem
              onClick={() => {
                commands.insertHorizontalRule()
                close()
              }}
            >
              <Icon.hr />
              <span className="mdc-mi__t">수평선</span>
            </MenuItem>
          </>
        )}
      </Dropdown>

      <Sep />

      {/* AI */}
      <IconBtn
        title={dictationAvailable ? '받아쓰기' : '받아쓰기 사용 불가(오프라인/미지원)'}
        active={listening}
        disabled={!dictationAvailable}
        onClick={toggleDictation}
      >
        <Icon.mic />
      </IconBtn>
      <IconBtn
        title={formatterAvailable ? '서식 제안' : '서식 제안 사용 불가(NAS/키 미설정)'}
        disabled={!formatterAvailable}
        onClick={() => onOpenSuggestions?.()}
      >
        <Icon.sparkles />
      </IconBtn>
    </div>
  )
}

// ── 작은 UI 부품들 ──────────────────────────────────────────

function IconBtn(props: {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.active}
      className={'mdc-tb__btn' + (props.active ? ' is-active' : '')}
      disabled={props.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

function Sep() {
  return <span className="mdc-tb__sep" aria-hidden="true" />
}

function Dropdown(props: {
  label?: string
  icon?: React.ReactNode
  title: string
  width?: number
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <div className="mdc-tb__dd" ref={ref}>
      <button
        type="button"
        title={props.title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={'mdc-tb__btn mdc-tb__btn--dd' + (open ? ' is-open' : '')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        {props.icon ?? <span className="mdc-tb__ddlabel">{props.label}</span>}
        <span className="mdc-tb__chev">
          <Icon.chevron />
        </span>
      </button>
      {open && (
        <div className="mdc-tb__menu" role="menu" style={{ minWidth: props.width }}>
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function ColorDropdown(props: {
  title: string
  icon: React.ReactNode
  colors: string[]
  swatchBg?: boolean
  onPick: (c: string) => void
  onClear: () => void
  clearLabel: string
  defaultBtn?: { label: string; onClick: () => void }
}) {
  return (
    <Dropdown icon={props.icon} title={props.title} width={184}>
      {(close) => (
        <div className="mdc-colorpop">
          <div className="mdc-swatches">
            {props.colors.map((c) => (
              <button
                key={c}
                type="button"
                className="mdc-swatch"
                title={c}
                style={props.swatchBg ? { background: c } : { color: c, background: '#fff' }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  props.onPick(c)
                  close()
                }}
              >
                {props.swatchBg ? '' : 'A'}
              </button>
            ))}
          </div>
          {props.defaultBtn && (
            <button
              type="button"
              className="mdc-colorpop__row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                props.defaultBtn!.onClick()
                close()
              }}
            >
              {props.defaultBtn.label}
            </button>
          )}
          <button
            type="button"
            className="mdc-colorpop__row mdc-colorpop__clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              props.onClear()
              close()
            }}
          >
            {props.clearLabel}
          </button>
        </div>
      )}
    </Dropdown>
  )
}

function MenuItem(props: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={'mdc-mi' + (props.active ? ' is-active' : '')}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

// ── 삽입 프롬프트 (1차: 간단한 prompt; 미디어 단계에서 파일선택/업로드로 확장) ──

// 일반 하이퍼링크 — 자주 쓰는 기능. 선택 글자가 있으면 거기에 링크를 건다.
function promptLink(commands: EditorCommands) {
  const url = window.prompt('링크 URL', 'https://')
  if (!url) return
  commands.insertLink({ href: url, text: commands.selectedText() || undefined })
}

// 외부 이미지 — URL 로 이미지 삽입.
function promptImage(commands: EditorCommands) {
  const url = window.prompt('이미지 URL (외부 링크)', 'https://')
  if (!url) return
  const alt = window.prompt('대체 텍스트(alt)', '') ?? ''
  commands.insertImage({ src: url, alt })
}

// 유튜브/영상 임베드 — 유튜브 URL 이면 id 를 뽑아 Chirpy 임베드(liquid), 그 외 영상 URL 은 링크.
function promptYoutube(commands: EditorCommands) {
  const url = window.prompt('유튜브 또는 영상 URL', 'https://www.youtube.com/watch?v=')
  if (!url) return
  const id = extractYoutubeId(url)
  if (id) {
    // Chirpy 임베드(liquid). MD 직렬화 시 원문 그대로 보존됨.
    commands.insertText(`\n{% include embed/youtube.html id='${id}' %}\n`)
  } else {
    const label = window.prompt('표시할 이름', '영상') ?? undefined
    commands.insertMedia({ kind: 'video', src: url, label })
  }
}

// 파일 등 일반 미디어 링크.
function promptMedia(commands: EditorCommands, kind: 'video' | 'file') {
  const url = window.prompt(kind === 'video' ? '영상 URL' : '파일 URL', 'https://')
  if (!url) return
  const label = window.prompt('표시할 이름', kind === 'video' ? '영상' : '파일') ?? undefined
  commands.insertMedia({ kind, src: url, label })
}

// 유튜브 URL 에서 영상 id 추출 (watch?v= / youtu.be / embed/ / shorts/ 지원).
function extractYoutubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}
