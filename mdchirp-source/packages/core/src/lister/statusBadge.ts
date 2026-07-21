import type { Post, PostStatus } from '@mdchirp/shared'

// ───────────────────────────────────────────────────────────
// statusBadge — 글 하나의 시각 배지 "데이터"를 반환하는 순수함수.
// 실제 JSX 렌더는 Lister 컴포넌트(덩어리 2)가 담당. 여기선 라벨/스타일키만.
// 근거: lister/SPEC.md §4 상태 배지.
// ───────────────────────────────────────────────────────────

/** 스타일키 — 색상 의도(SPEC §4). 실제 CSS 는 컴포넌트가 매핑. */
export type BadgeTone = 'gray' | 'yellow' | 'blue' | 'purple' | 'green' | 'orange'

export interface Badge {
  key: string // 식별/테스트용 안정 키
  label: string
  tone: BadgeTone
  spinner?: boolean // syncing 표시용
}

const STATUS_BADGE: Record<PostStatus, Omit<Badge, 'label'> & { label: string }> = {
  draft: { key: 'draft', label: '초안', tone: 'gray' },
  scheduled: { key: 'scheduled', label: '예약', tone: 'purple' },
  published: { key: 'published', label: '발행됨', tone: 'green' },
}

/** scheduled 글의 라벨에 발행 예정 시각을 덧붙인다 (SPEC §2-1: schedule.publishAt). */
function scheduledLabel(post: Post): string {
  const at = post.schedule?.publishAt
  if (!at) return '예약'
  // 표시는 컴포넌트에서 로케일 포맷할 수도 있으나, 순수함수 단계에선 ISO 를 그대로 노출.
  return `예약 (${at})`
}

/** 발행 후 수정 여부 — 마지막 발행 시점 rev 보다 현재 rev 가 크면 "발행 후 수정"(별표). */
function isPublishedDirty(post: Post): boolean {
  return post.status === 'published' && post.publishedRev != null && post.rev > post.publishedRev
}

/** 글의 주 상태 배지 하나를 반환 */
export function statusBadge(post: Post): Badge {
  const base = STATUS_BADGE[post.status]
  if (post.status === 'scheduled') {
    return { ...base, label: scheduledLabel(post) }
  }
  if (isPublishedDirty(post)) {
    return { ...base, label: '*' + base.label } // "발행됨" → "*발행됨"
  }
  return base
}

/**
 * 부가 배지들 — 상태와 별개로 동시에 붙을 수 있는 표식.
 * external(외부 유입, 점선 테두리)은 status 와 독립이라 별도 반환.
 * lockedBy 는 SPEC §7 의 2차 슬롯 → 모델만 있고 1차에선 미표시(주석으로 자리만 남김).
 */
export function extraBadges(post: Post): Badge[] {
  const badges: Badge[] = []
  if (post.hasRichSource === false) {
    badges.push({ key: 'external', label: '리치원본 없음(외부)', tone: 'gray' })
  }
  // 2차 슬롯: if (post.lockedBy) badges.push({ key:'locked', label:`${post.lockedBy.deviceName} 편집 중`, tone:'orange' })
  return badges
}
