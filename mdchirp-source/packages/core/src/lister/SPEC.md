# lister (리스터) 모듈 SPEC

> 글 목록을 보여주고, 찾고, 상태를 한눈에 구분하게 한다.
> 상위: `packages/core/SPEC.md`

---

## 1. 목적 (Why)

NAS의 모든 글(내가 쓴 것 + 외부 유입)을 목록으로 보여주고,
검색·필터·정렬로 빠르게 찾고, **발행 상태를 시각적으로 구분**한다.

---

## 2. 책임 범위

**한다:**
- 글 목록 표시 (제목/날짜/카테고리/태그/상태)
- **검색**: 제목/본문/태그/카테고리
- **필터**: status별, `hasRichSource`(외부글만), 카테고리/태그, 예약발행만
- **정렬**: 수정일/발행일/제목
- **상태 배지** (아래 §4)
- 글 선택 → shell에 "이 글 열기" 이벤트
- 새 글 만들기 트리거

**안 한다 (경계):**
- 글을 편집/저장하지 않음 (선택만)
- 목록 데이터를 직접 fetch하지 않음 → **`posts: Post[]` 를 props 로 받기만** 한다.
  (상위(shell/playground)가 `sync.list()` 로 받아 내려줌. 아래 §5-1 참고)
- 발행/잠금 처리 안 함 (표시만)
- 필터링/정렬은 lister 내부에서(주어진 `posts` 배열을 `query` 로 가공). 검색도 클라이언트 측 필터.

## 2-1. 구현 결정 (필드 매핑 / 엣지케이스 합의)

> 카테고리/태그는 Post 최상위가 아니라 `frontmatter` 안에 있다(types.ts 확인).
> selectPosts 는 아래 매핑을 따른다:

- 검색(text): `title` + `markdown` + `frontmatter.tags` + `frontmatter.categories` 를
  대소문자 무시 includes 매칭. categories 는 `[string?, string?]` 튜플이라 `filter(Boolean)` 후 매칭.
- status 필터: `query.status?.includes(post.status)`
- onlyExternal: `post.hasRichSource === false`
- category 필터: `post.frontmatter.categories?.filter(Boolean).includes(query.category)`
- tags 필터: `query.tags` 의 모든 태그가 `post.frontmatter.tags` 에 포함(AND).
- 정렬: `updatedAt` / `publishedAt` / `title`.
  **publishedAt 정렬 시 값이 없는 글(draft/synced 등)은 항상 맨 뒤로** 보낸다.
- scheduled 배지의 시각: `post.schedule?.publishAt` (ISO8601) 를 표시.


---

## 3. 공개 인터페이스

> ⚠️ **props 타입을 새로 만들지 말 것.** `@mdchirp/shared` 의 `ui-contract.ts` 에
> 이미 정의되어 있으니 **import 만** 한다. (합칠 때 충돌 방지)

```typescript
import type { ListerProps, ListQuery, Post } from '@mdchirp/shared'
import { DEFAULT_LIST_QUERY } from '@mdchirp/shared'

// shared/ui-contract.ts 에 정의됨 (요약):
//   ListerProps  { posts, loading?, query, onQueryChange, onOpen, onNew, onRefresh? }
//   ListQuery    { text?, status?, onlyExternal?, category?, tags?, sort }
//   DEFAULT_LIST_QUERY  — 초기 query 기본값 (sort: updatedAt desc)

export function Lister(props: ListerProps): JSX.Element { /* … */ }
```

이 컴포넌트는 **제어 컴포넌트(controlled)** 다: `query` 를 소유하지 않고
`onQueryChange` 로 위에 올린다. 상태 소유는 상위(shell)가 한다.

---

## 4. 상태 배지 (시각 구분 — 핵심 요구)

| 상태/조건 | 배지 | 색상 의도 |
|-----------|------|-----------|
| `draft` | 초안 | 회색 |
| `scheduled` | 예약 (시각표시) | 보라 |
| `published` | 발행됨 | 초록 |
| `hasRichSource=false` | "리치원본 없음(외부)" | 점선 테두리 |
| `lockedBy` 존재 | "○○ 편집 중" | 주황 (📋 2차) |

→ "올라간 글 vs 발행전 글 구분"은 status 색상으로, "외부 직접 업로드 글"은 점선 테두리로 즉시 구분.

---

## 5. 의존성

- `packages/shared` (`ListerProps`/`ListQuery`/`Post`/`PostStatus`)
- **sync 직접 의존 없음** — lister 는 `posts` 를 props 로만 받는다(순수 UI).

## 5-1. 모듈간 이벤트 계약 (Wiring contract)

lister 는 아래 이벤트를 **위로 쏘기만** 한다. 받는 쪽(shell/playground)의 책임:

| lister 가 호출 | 의미 | 받는 쪽(shell)의 처리 |
|------------|------|----------------------|
| `onOpen(id)` | 이 글 열기 | `sync.get(id)` → editor 에 로드 |
| `onNew()` | 새 글 | 빈 editor 열기 |
| `onQueryChange(q)` | 필터/검색 변경 | query 상태 갱신 후 lister 에 다시 주입 |
| `onRefresh()` | 새로고침 | `sync.list()` 재호출 → `posts` 갱신 |

> 데이터 공급은 `sync.list(): Promise<Post[]>` 를 상위가 호출해 `posts` 로 내린다.
> (sync 에 구독/푸시 API 는 없다. 폴링 또는 저장/발행 후 `onRefresh` 호출로 갱신.)

---

## 6. 완료 기준 (Definition of Done)

- [x] `Lister(props: ListerProps)` 컴포넌트 export (`packages/core/src/index.ts` 에서)
- [x] 주어진 `posts` 를 `query`(검색/필터/정렬)로 가공해 렌더링
- [x] §4 상태 배지 전부 + external 점선 테두리 구현
- [x] `onOpen`/`onNew`/`onQueryChange`/`onRefresh` 이벤트 정상 발사 (§5-1)
- [x] 단위 테스트: 필터링/정렬 로직을 순수함수로 분리해 `lister.test.ts`
      (예: query 로 posts 가 올바르게 걸러지는지)
- [x] `pnpm check` 통과 + 이 SPEC §상태 갱신
- [x] (권장) playground 에 마운트해 눈으로 확인
- [x] 필터/정렬 = `selectPosts(posts, query)`, 배지 = `statusBadge(post)` 순수함수로 분리,
      `lister.test.ts` 에서 단위 테스트

---

## 7. 상태

- ✅ **1차 완료**: 목록/검색/필터/정렬 + status 배지 + external 점선.
  순수함수(`selectPosts`/`statusBadge`/`extraBadges`) + `lister.test.ts` 23케이스 통과,
  playground 마운트로 실제 NAS 데이터 검증.
- 📋 슬롯: lockedBy 편집중 배지(2차), 썸네일 미리보기


---

## 8. 미래 확장

- 가상 스크롤(글 많을 때), 폴더/카테고리 트리뷰, 휴지통, 일괄 작업(태그 변경 등)
