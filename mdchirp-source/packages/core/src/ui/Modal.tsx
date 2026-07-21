// Modal.tsx — 재사용 공용 모달 (ESC / 바깥클릭 / X 버튼으로 닫기).
//
// 다른 곳에서도 쓰는 UI 공용 컴포넌트(예: SplitView 미래 날짜 확인).
// controlled — open 을 받고 onClose 로만 닫힌다. 데이터/네트워크 없음.
//   - ESC 키: 열려 있을 때 window 리스너로 닫기(전역 단축키 요구 반영).
//   - 바깥(backdrop) 클릭: 카드 밖을 누르면 닫기.
//   - X 버튼: 우상단 닫기.
// 레이아웃 3분할: title(헤더) + children(본문) + footer(버튼 영역).
//
// SPEC: packages/core/src/editor/SPEC.md §11(UI 경계 — 저장/네트워크 안 함)

import { useEffect } from 'react'
import type { ReactNode } from 'react'

export interface ModalProps {
  /** 열림 여부. false 면 아무것도 렌더링하지 않음. */
  open: boolean
  /** 닫기 요청(ESC / 바깥클릭 / X). 실제 open 제어는 부모 책임. */
  onClose: () => void
  /** 헤더 제목(선택). */
  title?: string
  /** 하단 버튼 영역(선택). */
  footer?: ReactNode
  /** 본문. */
  children?: ReactNode
}

export function Modal(props: ModalProps) {
  const { open, onClose, title, footer, children } = props

  // ESC 로 닫기 — 열려 있을 때만 리스너 부착(전역 단축키).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="mdc-modal__backdrop"
      onMouseDown={(e) => {
        // 카드 밖(backdrop 자체)을 눌렀을 때만 닫기. 카드 내부 클릭은 무시.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mdc-modal__card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mdc-modal__head">
          {title && <div className="mdc-modal__title">{title}</div>}
          <button
            type="button"
            className="mdc-modal__x"
            onClick={onClose}
            aria-label="닫기"
            title="닫기 (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="mdc-modal__body">{children}</div>
        {footer && <div className="mdc-modal__foot">{footer}</div>}
      </div>
    </div>
  )
}
