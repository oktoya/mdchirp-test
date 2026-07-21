// FrontmatterPanel.tsx — Chirpy 프론트매터 GUI (접이식 가로 영역, SplitView 소유).
//
// 경계(SPEC §11): 저장/네트워크 안 함. controlled — form 을 받고 onChange 로 쏜다.
//   - title 변경은 Post.title 과 frontmatter.title 동기화 → SplitView 가 처리(여기선 form 만).
//   - slug 는 frontmatter 아님(Post.slug). slug/onSlugChange 로 따로 다룬다.
//   - slug 제안 버튼: slugSuggester 어댑터. 없거나 isAvailable()===false 면 비활성.
//     자동 적용 금지 — 후보를 보여주고 사람이 클릭해야 반영.
//
// SPEC: packages/core/src/editor/SPEC.md §11, §6-1

import { useState } from 'react'
import type { SlugSuggester } from '@mdchirp/shared'
import { slugify } from '@mdchirp/shared'
import { parseCsv } from './frontmatterForm.js'
import type { FrontmatterForm } from './frontmatterForm.js'

export interface FrontmatterPanelProps {
  form: FrontmatterForm
  onChange: (form: FrontmatterForm) => void
  slug: string
  onSlugChange: (slug: string) => void
  /** 영문 slug 제안 어댑터. 없거나 isAvailable()===false 면 제안 버튼 비활성. */
  slugSuggester?: SlugSuggester
  /** _data/authors.yml 기반 저자 목록(드롭다운용). 없거나 빈 배열이면 드롭다운 숨김, 자유 입력만. */
  authorOptions?: { key: string; name: string }[]
}

export function FrontmatterPanel(props: FrontmatterPanelProps) {
  const { form, onChange, slug, onSlugChange, slugSuggester, authorOptions } = props

  // 한 필드만 바꿔 onChange (controlled)
  function set<K extends keyof FrontmatterForm>(key: K, value: FrontmatterForm[K]) {
    onChange({ ...form, [key]: value })
  }

  // ── slug 제안 상태 (패널 로컬 UI 상태 — 데이터 아님) ──
  const [candidates, setCandidates] = useState<string[] | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const slugReady = !!slugSuggester && slugSuggester.isAvailable()

  async function suggestSlug() {
    if (!slugSuggester) return
    setSuggesting(true)
    setCandidates(null)
    try {
      const list = await slugSuggester.suggest(form.title)
      setCandidates(list)
    } catch {
      setCandidates([])
    } finally {
      setSuggesting(false)
    }
  }

  function pickCandidate(c: string) {
    onSlugChange(slugify(c)) // 제안 후보도 정규화(안전망). 사람이 클릭해야 여기 옴
    setCandidates(null)
  }

  // 드롭다운에서 저자 선택 → 현재 author 필드에 키를 콤마로 이어붙임(중복은 무시).
  function addAuthor(key: string) {
    const current = parseCsv(form.author)
    if (current.includes(key)) return
    set('author', [...current, key].join(', '))
  }

  return (
    <div className="mdc-fm">
      {/* 1행: 제목 + slug(+제안) */}
      <div className="mdc-fm__row">
        <label className="mdc-fm__field mdc-fm__field--grow">
          <span className="mdc-fm__label">제목</span>
          <input
            className="mdc-fm__input"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="글 제목"
          />
        </label>

        <div className="mdc-fm__field mdc-fm__field--grow">
          <span className="mdc-fm__label">slug (영문)</span>
          <div className="mdc-fm__slugrow">
            <input
              className="mdc-fm__input"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              onBlur={(e) => {
                const normalized = slugify(e.target.value)
                if (normalized !== e.target.value) onSlugChange(normalized)
              }}
              placeholder="my-post-slug"
              spellCheck={false}
            />
            <button
              type="button"
              className="mdc-btn mdc-btn--ghost mdc-fm__suggest"
              onClick={suggestSlug}
              disabled={!slugReady || suggesting}
              title={
                slugReady ? '제목으로 영문 slug 후보 제안' : 'slug 제안 사용 불가 (오프라인/미설정)'
              }
            >
              {suggesting ? '제안 중…' : '✨ slug 제안'}
            </button>
          </div>
          {candidates && (
            <div className="mdc-fm__cands">
              {candidates.length === 0 ? (
                <span className="mdc-fm__candempty">후보 없음 — 직접 입력하세요</span>
              ) : (
                candidates.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="mdc-fm__cand"
                    onClick={() => pickCandidate(c)}
                    title="이 후보로 slug 설정"
                  >
                    {c}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* 1.5행: 발행 날짜 (비우면 발행 시점 자동) */}
      <div className="mdc-fm__row">
        <label className="mdc-fm__field mdc-fm__field--grow">
          <span className="mdc-fm__label">발행 날짜 (비우면 발행 시점 자동)</span>
          <input
            type="datetime-local"
            className="mdc-fm__input"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            title="비우면 발행할 때의 시각으로 자동 설정됩니다. 미래로 지정하면 예약 발행할 수 있습니다."
          />
        </label>
      </div>

      {/* 2행: 카테고리(TOP/SUB) + 태그 */}
      <div className="mdc-fm__row">
        <label className="mdc-fm__field">
          <span className="mdc-fm__label">카테고리 (상위)</span>
          <input
            className="mdc-fm__input"
            value={form.categoryTop}
            onChange={(e) => set('categoryTop', e.target.value)}
            placeholder="예: Dev"
          />
        </label>
        <label className="mdc-fm__field">
          <span className="mdc-fm__label">카테고리 (하위)</span>
          <input
            className="mdc-fm__input"
            value={form.categorySub}
            onChange={(e) => set('categorySub', e.target.value)}
            placeholder="예: Web"
          />
        </label>
        <label className="mdc-fm__field mdc-fm__field--grow">
          <span className="mdc-fm__label">태그 (콤마 구분 · 소문자)</span>
          <input
            className="mdc-fm__input"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="react, typescript"
          />
        </label>
      </div>

      {/* 3행: 설명 */}
      <div className="mdc-fm__row">
        <label className="mdc-fm__field mdc-fm__field--grow">
          <span className="mdc-fm__label">설명 (description)</span>
          <textarea
            className="mdc-fm__textarea"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="글 요약 (검색/미리보기용)"
            rows={2}
          />
        </label>
      </div>

      {/* 4행: author (드롭다운 선택 전용 · authors.yml 등록 저자만 · 오타 방지) */}
      {/* Chirpy 는 authors.yml 에 없는 이름을 넣으면 저자가 통째로 사라진다(빈칸).
          그래서 자유 타이핑을 막고(readOnly) 드롭다운 선택만 허용한다.
          비워두면 _config.yml 의 social.name(블로그 기본 저자)으로 표시된다. */}
      <div className="mdc-fm__row">
        <label className="mdc-fm__field mdc-fm__field--grow">
          <span className="mdc-fm__label">저자 (등록된 저자만 선택 · 비우면 블로그 기본 저자)</span>
          {authorOptions && authorOptions.length > 0 ? (
            <div className="mdc-fm__slugrow">
              <input
                className="mdc-fm__input"
                value={form.author}
                readOnly
                placeholder="아래에서 저자를 선택하세요"
                title="저자는 authors.yml 에 등록된 사람만 선택할 수 있습니다"
                spellCheck={false}
              />
              <select
                className="mdc-fm__input mdc-fm__authorpick"
                value=""
                onChange={(e) => {
                  if (e.target.value) addAuthor(e.target.value)
                  e.target.value = '' // 선택 후 초기화(삽입 도우미)
                }}
                title="authors.yml 에 정의된 저자를 골라 추가"
              >
                <option value="">저자 추가…</option>
                {authorOptions.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.name} ({a.key})
                  </option>
                ))}
              </select>
              {form.author && (
                <button
                  type="button"
                  className="mdc-fm__authorclear"
                  onClick={() => set('author', '')}
                  title="선택한 저자 모두 지우기"
                  aria-label="저자 지우기"
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <div className="mdc-fm__authorempty">
              등록된 저자가 없습니다. 저장소의 <code>_data/authors.yml</code> 에 저자를 먼저
              추가하세요. 비워두면 블로그 기본 저자(<code>_config.yml</code> 의{' '}
              <code>social.name</code>)로 발행됩니다.
            </div>
          )}
        </label>
      </div>

      {/* 5행: 커버 이미지 */}
      <div className="mdc-fm__row">
        <label className="mdc-fm__field mdc-fm__field--grow">
          <span className="mdc-fm__label">커버 이미지 경로</span>
          <input
            className="mdc-fm__input"
            value={form.imagePath}
            onChange={(e) => set('imagePath', e.target.value)}
            placeholder="/assets/img/posts/.../cover.png"
            spellCheck={false}
          />
        </label>
        <label className="mdc-fm__field mdc-fm__field--grow">
          <span className="mdc-fm__label">이미지 대체텍스트 (alt)</span>
          <input
            className="mdc-fm__input"
            value={form.imageAlt}
            onChange={(e) => set('imageAlt', e.target.value)}
            placeholder="커버 설명"
          />
        </label>
      </div>

      {/* 6행: 불린 토글 */}
      <div className="mdc-fm__row mdc-fm__row--checks">
        <Toggle label="고정(pin)" checked={form.pin} onChange={(v) => set('pin', v)} />
        <Toggle label="수식(math)" checked={form.math} onChange={(v) => set('math', v)} />
        <Toggle label="mermaid" checked={form.mermaid} onChange={(v) => set('mermaid', v)} />
        <Toggle label="목차(toc)" checked={form.toc} onChange={(v) => set('toc', v)} />
        <Toggle
          label="댓글(comments)"
          checked={form.comments}
          onChange={(v) => set('comments', v)}
        />
        <Toggle
          label="render_with_liquid"
          checked={form.renderWithLiquid}
          onChange={(v) => set('renderWithLiquid', v)}
        />
      </div>
    </div>
  )
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mdc-fm__check">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  )
}
