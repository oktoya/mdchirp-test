import { useMemo, type MouseEvent } from 'react'
import type { ListerProps, ListQuery, PostStatus } from '@mdchirp/shared'
import { selectPosts } from './selectPosts.js'
import { statusBadge, extraBadges, type BadgeTone } from './statusBadge.js'

// ───────────────────────────────────────────────────────────
// Lister — controlled 글 목록 컴포넌트.
// query 를 소유하지 않고 onQueryChange 로 위에 올린다(SPEC §3).
// posts 를 직접 fetch 하지 않고 props 로만 받는다(SPEC §2).
// ───────────────────────────────────────────────────────────

const TONE_CLASS: Record<BadgeTone, string> = {
  gray: 'lister-badge--gray',
  yellow: 'lister-badge--yellow',
  blue: 'lister-badge--blue',
  purple: 'lister-badge--purple',
  green: 'lister-badge--green',
  orange: 'lister-badge--orange',
  red: 'lister-badge--red',
}

const STATUS_OPTIONS: { value: PostStatus; label: string }[] = [
  { value: 'draft', label: '초안' },
  { value: 'scheduled', label: '예약' },
  { value: 'published', label: '발행됨' },
]

const SORT_OPTIONS: { value: ListQuery['sort']['by']; label: string }[] = [
  { value: 'updatedAt', label: '수정일' },
  { value: 'publishedAt', label: '발행일' },
  { value: 'title', label: '제목' },
]

export function Lister(props: ListerProps): JSX.Element {
  const {
    posts,
    loading,
    refreshing,
    remoteDiagnostics,
    query,
    onQueryChange,
    onOpen,
    onNew,
    onRefresh,
    onDelete,
  } = props

  const visible = useMemo(() => selectPosts(posts, query), [posts, query])

  // NAS Post와 연결되지 못한 GitHub 파일만 별도 진단 행으로 표시한다.
  // 연결된 글의 오류는 Post.issues 배지로 이미 표시되므로 중복 렌더링하지 않는다.
  const standaloneDiagnostics = useMemo(() => {
    const postPaths = new Set(
      posts.map((post) => post.githubPath).filter((value): value is string => Boolean(value)),
    )

    return (remoteDiagnostics ?? []).filter(
      (diagnostic) => diagnostic.state === 'invalid' || !postPaths.has(diagnostic.githubPath),
    )
  }, [posts, remoteDiagnostics])

  function patch(part: Partial<ListQuery>) {
    onQueryChange({ ...query, ...part })
  }

  function toggleStatus(s: PostStatus) {
    const cur = query.status ?? []
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
    patch({ status: next.length > 0 ? next : undefined })
  }

  // 삭제 — 항목 클릭(=열기)과 겹치지 않게 stopPropagation. status 로 확인 문구 분기.
  function handleDelete(e: MouseEvent, id: string, title: string, status: PostStatus) {
    e.stopPropagation()
    const name = title || '(제목 없음)'
    const msg =
      status === 'published'
        ? `"${name}" 을(를) 삭제할까요?\n\nGitHub 에서 글·이미지가 제거되고(블로그에서 사라짐), NAS 는 휴지통으로 이동합니다.`
        : `"${name}" 을(를) 삭제할까요?\n\nNAS 휴지통으로 이동합니다.`
    if (window.confirm(msg)) onDelete?.(id)
  }

  return (
    <div className="lister">
      <div className="lister__bar">
        <input
          className="lister__search"
          type="search"
          placeholder="제목·본문·태그 검색…"
          value={query.text ?? ''}
          onChange={(e) => patch({ text: e.target.value || undefined })}
          spellCheck={false}
        />

        <label className="lister__sort">
          정렬&nbsp;
          <select
            value={query.sort.by}
            onChange={(e) =>
              patch({ sort: { ...query.sort, by: e.target.value as ListQuery['sort']['by'] } })
            }
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="lister__dir"
            title={query.sort.dir === 'desc' ? '내림차순' : '오름차순'}
            onClick={() =>
              patch({ sort: { ...query.sort, dir: query.sort.dir === 'desc' ? 'asc' : 'desc' } })
            }
          >
            {query.sort.dir === 'desc' ? '▼' : '▲'}
          </button>
        </label>

        <label className="lister__external">
          <input
            type="checkbox"
            checked={query.onlyExternal ?? false}
            onChange={(e) => patch({ onlyExternal: e.target.checked || undefined })}
          />
          외부글만
        </label>

        {onRefresh && (
          <button
            type="button"
            className={'lister__refresh' + (refreshing ? ' lister__refresh--active' : '')}
            onClick={() => void onRefresh()}
            title={refreshing ? 'GitHub와 동기화하는 중입니다.' : 'NAS와 GitHub 수동 새로고침'}
            aria-label="NAS와 GitHub 새로고침"
            disabled={refreshing}
          >
            ↻
          </button>
        )}
        <button type="button" className="lister__new" onClick={onNew}>
          + 새 글
        </button>
      </div>

      <div className="lister__filters">
        {STATUS_OPTIONS.map((o) => {
          const active = (query.status ?? []).includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              className={'lister__chip' + (active ? ' lister__chip--on' : '')}
              onClick={() => toggleStatus(o.value)}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      {loading && <div className="lister__loading">불러오는 중…</div>}

      {!loading && visible.length === 0 && standaloneDiagnostics.length === 0 && (
        <div className="lister__empty">표시할 글이 없습니다.</div>
      )}

      <ul className="lister__list">
        {visible.map((p) => {
          const badge = statusBadge(p)
          const extras = extraBadges(p)
          const external = extras.some((b) => b.key === 'external')
          const hasError = p.issues?.some((entry) => entry.severity === 'error')
          const hasWarning = !hasError && p.issues?.some((entry) => entry.severity === 'warning')

          const itemClass = [
            'lister__item',
            external ? 'lister__item--external' : '',
            hasError ? 'lister__item--error' : '',
            hasWarning ? 'lister__item--warning' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <li
              key={p.id}
              className={itemClass}
              onClick={() => onOpen(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(p.id)
                }
              }}
            >
              <div className="lister__title">{p.title || '(제목 없음)'}</div>
              <div className="lister__meta">
                <span className={'lister-badge ' + TONE_CLASS[badge.tone]}>
                  {badge.spinner && <span className="lister-badge__spin" />}
                  {badge.label}
                </span>
                {extras.map((b) => (
                  <span
                    key={b.key}
                    className={'lister-badge ' + TONE_CLASS[b.tone]}
                    title={b.title ?? b.label}
                  >
                    {b.label}
                  </span>
                ))}
                <span className="lister__date">{p.updatedAt.slice(0, 10)}</span>
                {onDelete && (
                  <button
                    type="button"
                    className="lister__delete"
                    title="삭제"
                    aria-label="삭제"
                    onClick={(e) => handleDelete(e, p.id, p.title, p.status)}
                  >
                    🗑
                  </button>
                )}
              </div>
            </li>
          )
        })}

        {standaloneDiagnostics.map((diagnostic) => {
          const hasError = diagnostic.issues.some((entry) => entry.severity === 'error')

          return (
            <li
              key={`remote:${diagnostic.githubPath}`}
              className={
                'lister__item lister__item--diagnostic ' +
                (hasError ? 'lister__item--error' : 'lister__item--warning')
              }
              title="이 파일은 NAS 글로 가져오지 못해 열 수 없습니다."
            >
              <div className="lister__title">{diagnostic.title || '(제목 확인 불가)'}</div>
              <div className="lister__path">{diagnostic.githubPath}</div>
              <div className="lister__meta">
                {diagnostic.issues.map((diagnosticIssue, index) => (
                  <span
                    key={`${diagnosticIssue.code}-${index}`}
                    className={
                      'lister-badge ' +
                      TONE_CLASS[diagnosticIssue.severity === 'error' ? 'red' : 'orange']
                    }
                    title={[diagnosticIssue.message, diagnosticIssue.detail]
                      .filter(Boolean)
                      .join('\n')}
                  >
                    {diagnosticIssue.severity === 'error' ? '⛔' : '⚠'} {diagnosticIssue.message}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
