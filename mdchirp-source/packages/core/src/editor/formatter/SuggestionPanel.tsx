// SuggestionPanel.tsx — 서식 제안 패널 (diff 미리보기 → 수락/거절).
//
// 절대 규칙(autonomy slider): 자동 적용 금지. 제안은 보여주기만, 적용은 사람이.
//   - 패널이 열리면 현재 마크다운을 Formatter(NAS Gemini)로 보내 제안을 받는다.
//   - 각 제안을 before→after diff 카드로 표시. ✓수락 / ✗거절.
//   - 수락하면 onApply(suggestion) 로 부모(SplitView)에 위임 → 부모가 본문 텍스트를 교체.
//   - 거절/수락한 카드는 목록에서 사라진다.
//
// SPEC: packages/core/src/editor/SPEC.md §6

import { useEffect, useState } from 'react'
import type { Formatter, FormatSuggestion } from '@mdchirp/shared'
import { Icon } from '../icons.js'

export interface SuggestionPanelProps {
  formatter?: Formatter
  /** 검토 대상 마크다운 본문 */
  markdown: string
  /** 수락 시: 부모가 실제 텍스트 교체를 수행 */
  onApply: (s: FormatSuggestion) => void
  /** 패널 닫기 */
  onClose: () => void
}

type LoadState = 'idle' | 'loading' | 'done' | 'error' | 'unavailable'

export function SuggestionPanel({ formatter, markdown, onApply, onClose }: SuggestionPanelProps) {
  const [state, setState] = useState<LoadState>('idle')
  const [items, setItems] = useState<FormatSuggestion[]>([])
  const [error, setError] = useState<string>('')

  async function run() {
    if (!formatter || !formatter.isAvailable()) {
      setState('unavailable')
      return
    }
    setState('loading')
    setError('')
    try {
      const res = await formatter.suggest({ markdown })
      setItems(res)
      setState('done')
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setState('error')
    }
  }

  // 패널이 뜨면 자동으로 한 번 분석
  useEffect(() => {
    run() /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  function accept(s: FormatSuggestion) {
    onApply(s)
    setItems((prev) => prev.filter((x) => x.id !== s.id))
  }
  function reject(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  return (
    <aside className="mdc-sg" aria-label="서식 제안">
      <header className="mdc-sg__head">
        <span className="mdc-sg__title">
          <Icon.sparkles /> 서식 제안
        </span>
        <div className="mdc-sg__headbtns">
          <button
            type="button"
            className="mdc-sg__refresh"
            title="다시 분석"
            disabled={state === 'loading'}
            onClick={run}
          >
            다시 분석
          </button>
          <button type="button" className="mdc-sg__close" title="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>

      <div className="mdc-sg__body">
        {state === 'unavailable' && (
          <p className="mdc-sg__msg">
            서식 제안을 쓸 수 없습니다. <b>NAS에 Gemini 키</b>가 설정되어야 합니다.
          </p>
        )}
        {state === 'loading' && <p className="mdc-sg__msg">본문을 분석하는 중…</p>}
        {state === 'error' && <p className="mdc-sg__msg mdc-sg__msg--err">분석 실패: {error}</p>}
        {state === 'done' && items.length === 0 && (
          <p className="mdc-sg__msg">제안할 서식 변경이 없습니다. 👍</p>
        )}

        <ul className="mdc-sg__list">
          {items.map((s) => (
            <li key={s.id} className="mdc-sg__card">
              <div className="mdc-sg__cardhead">
                <span className={'mdc-sg__type mdc-sg__type--' + s.type}>{typeLabel(s.type)}</span>
                <span className="mdc-sg__reason">{s.reason}</span>
              </div>
              <div className="mdc-sg__diff">
                <div className="mdc-sg__before">
                  <span className="mdc-sg__diffl">이전</span>
                  <code>{s.before}</code>
                </div>
                <div className="mdc-sg__after">
                  <span className="mdc-sg__diffl">이후</span>
                  <code>{s.after}</code>
                </div>
              </div>
              <div className="mdc-sg__actions">
                <button type="button" className="mdc-sg__reject" onClick={() => reject(s.id)}>
                  ✗ 거절
                </button>
                <button type="button" className="mdc-sg__accept" onClick={() => accept(s)}>
                  ✓ 수락
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

function typeLabel(type: string): string {
  switch (type) {
    case 'heading':
      return '제목'
    case 'codeblock':
      return '코드블록'
    case 'list':
      return '목록'
    case 'quote':
      return '인용'
    case 'link':
      return '링크'
    case 'prompt':
      return '프롬프트박스'
    default:
      return '서식'
  }
}
