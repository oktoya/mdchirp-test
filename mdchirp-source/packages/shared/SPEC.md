# shared 패키지 SPEC

> 모든 모듈/앱이 참조하는 타입·계약의 단일 진실원.
> 상위: `/SPEC.md` · 구현: `packages/shared/src/types.ts`, `api-contract.ts`, `ui-contract.ts`

---

## 1. 목적 (Why)

코어·백엔드·앱이 **같은 타입과 API 계약**을 공유하게 한다.
타입 불일치로 인한 버그를 컴파일 타임에 잡는다.

---

## 2. 책임 범위

**한다:** 도메인 타입 정의, API 요청/응답 계약, UI·플랫폼 경계 계약, 상수.
**안 한다:** 로직 없음(순수 타입+상수만), UI 없음, 네트워크 없음.

---

## 3. 주요 타입

| 타입 | 설명 |
|------|------|
| `Post` | 글 한 편. `id`는 영구 정체성, `slug`는 현재 NAS 폴더·공개 URL 위치, `rev`는 같은 ID의 저장 버전, `githubPath`는 현재 ID에 귀속된 GitHub 발행 파일 경로다. `publishedSlug?: string`은 마지막으로 실제 발행된 slug이며 발행 취소 후에도 이력 정보로 보존하지만 fork 판정에는 사용하지 않는다. |
| `PostPatch` | 편집 중 부분 갱신. 이미지 업로드 성공 후 `media?`로 첨부 목록 갱신 |
| `PostStatus` | `draft` / `scheduled` / `published` |
| `Schedule` | 예약발행 (publishAt, shortsJobId 슬롯) |
| `EditLock`, `HistoryEntry` | 동시 수정 대비 |
| `ChirpyFrontmatter`, `ChirpyImage` | Chirpy 공식 필드 |
| `MediaFile`, `MediaPolicy`, `WatermarkPolicy` | 미디어 메타데이터와 정책 |
| `DictationProvider`, `Formatter`, `FormatSuggestion`, `SlugSuggester`, `Linter` | AI 어댑터 |
| `DeviceSettings`, `NasSettings` | 설정 (기기/NAS 분리, 키 마스킹) |

### 3-1. 이미지 첨부 관련 추가 계약 ✅

`PostPatch`에 이미지 업로드 결과를 로컬 draft로 반영하는 선택 필드를 추가한다.

```typescript
interface PostPatch {
  id: string
  tiptapJson?: object
  markdown?: string
  title?: string
  slug?: string
  frontmatter?: Partial<ChirpyFrontmatter>
  media?: MediaFile[]
  updatedAt: string
}
```

`Post.media[]`는 첨부 메타데이터와 향후 미디어 정책 UI를 위한 목록이다.

발행 가능 여부는 `Post.media[]`만 믿지 않는다. backend가 발행 직전에 다음 두 가지를 다시 검사한다.

1. Markdown 본문이 참조하는 이미지 경로
2. NAS `posts-src/<slug>/media/`의 실제 파일

### 3-2. 이미지 저장 형식

`MediaPolicy`에 다음 선택 필드를 추가한다.

```typescript
interface MediaPolicy {
  imageFormat?: 'original' | 'webp'

  // 기존 필드 유지
}
```

- 필드가 없으면 `original`로 해석해 기존 `settings.json`과 호환한다.
- `original`: JPEG/PNG/WebP/GIF 원본 형식 유지
- `webp`: JPEG/PNG/정적 GIF를 WebP로, 애니메이션 GIF를 애니메이션 WebP로 변환
- 변환 실패 시 원본으로 조용히 폴백하지 않는다.

---

## 4. API 계약

백엔드 API 경로/요청/응답 스키마는 `apps/backend/SPEC.md`와
`packages/shared/src/api-contract.ts`가 공유한다.

핵심 규칙:

- 저장 `PUT /api/posts/:slug`는 `baseRev` 필수이며, URL의 `slug`는 요청한 NAS 위치이고 body의 `post.id`는 글 정체성이다.
- backend는 `post.id`로 기존 글을 먼저 찾고, `baseRev`를 확인한 뒤 slug 유지·rename·fork를 결정한다.
- 같은 ID의 최신 rev와 다르면 `409 version_conflict`와 `currentRev`, `currentPost`를 반환한다.
- 요청한 slug를 다른 ID가 사용 중이면 `409 slug_taken`을 반환한다. 자동 덮어쓰기나 suffix 추가는 하지 않는다.
- 둘 이상의 NAS 폴더에서 같은 ID가 발견되면 `409 duplicate_post_id`를 반환하고 자동 복구하지 않는다.
- 키 관련 응답은 항상 마스킹(`tokenSet`, `keySet`)
- 이미지 누락 발행 오류는 `400 { error:'missing_images', details:string[] }`

### 4-0. GitHub 새로고침 계약 🚧

GitHub 원격 상태는 NAS의 로컬 작업 상태인 `Post.status`와 분리한다.

```typescript
type RemotePostState =
  | 'present'
  | 'missing'
  | 'diverged'
  | 'unknown'
  | 'not_applicable'

type PostIssueSeverity = 'warning' | 'error'

type PostIssueCode =
  | 'missing_post_id'
  | 'invalid_post_id'
  | 'invalid_frontmatter'
  | 'duplicate_post_id'
  | 'slug_conflict'
  | 'remote_slug_diverged'
  | 'remote_post_missing'
  | 'remote_refresh_failed'
  | 'incomplete_nas_post'

interface PostIssue {
  code: PostIssueCode
  severity: PostIssueSeverity
  message: string
  path?: string
}

interface RemotePostObservation {
  postId: string
  githubPath?: string
  state: RemotePostState
  issues: PostIssue[]
}

interface RemotePostDiagnostic {
  key: string
  path: string
  title: string
  issues: PostIssue[]
}

type GitRefreshResponse =
  | {
      ok: true
      checkedAt: string
      remoteCommit: string
      importedPostIds: string[]
      observations: RemotePostObservation[]
      diagnostics: RemotePostDiagnostic[]
      skippedNonstandardPaths: string[]
    }
  | {
      ok: false
      error: 'remote_refresh_failed'
      message: string
    }
```

규칙:

- `Post.status`는 NAS의 로컬 작업 상태이며 GitHub 원격 존재 여부로 자동 변경하지 않는다.
- `RemotePostState`는 이번 수동 새로고침에서 관측한 GitHub 상태다.
- GitHub 조회가 실패하면 기존 NAS 목록을 유지하고 `missing`으로 오판하지 않는다.
- `PostSummary`는 `githubPath`를 포함하여 클라이언트가 원격 관측 결과를 같은 Post에 결합할 수 있게 한다.
- 정상 GitHub-only 글을 import하면 NAS `Post.rev`는 `1`로 시작한다.
- 원격 Git commit hash는 `Post.rev`가 아니라 `GitRefreshResponse.remoteCommit`으로 반환한다.
- 날짜형이지만 frontmatter가 잘못된 파일은 `diagnostics`에 포함한다.
- 날짜 형식이 아닌 파일은 내용을 읽지 않고 `skippedNonstandardPaths`에만 포함한다.
- 원격 관측과 진단은 목록 화면의 표시 데이터다. 편집 저장의 rev를 증가시키지 않는다.

Lister에는 일반 Post 목록과 별도로 원격 진단 행을 전달한다.

```typescript
interface ListerProps {
  posts: Post[]
  diagnostics?: RemotePostDiagnostic[]

  // 기존 필드 유지
}
```

- 일반 Post 행은 `onOpen(id)`로 연다.
- `invalid_frontmatter` 같은 원격 진단 행은 일반 Post가 아니므로 자동으로 에디터를 열지 않는다.
- 앱을 다시 시작했을 때는 NAS 목록만 읽으므로 새 GitHub 진단을 만들지 않는다.
- 수동 새로고침 성공 후 shell이 응답의 진단과 관측 결과를 목록에 결합한다.

### 4-1. ID·slug 저장 결과 계약 🚧

일반 저장과 미발행 글의 slug rename이 성공하면 저장된 Post를 반환한다.

발행 이력이 있는 글의 slug 변경은 기존 글을 수정하지 않고 새 ID의 draft를 생성한다. 이 경우 응답의 `post`는 새 글이며, `forkedFromId`는 보존된 원본 글의 ID다.

```typescript
type SavePostResponse = {
  ok: true
  post: Post
  forkedFromId?: string
}

type SavePostConflict =
  | {
      error: 'version_conflict'
      currentRev: number
      currentPost: Post
    }
  | {
      error: 'slug_taken'
      slug: string
    }
  | {
      error: 'duplicate_post_id'
      id: string
      slugs: string[]
    }
```

- `forkedFromId`가 없으면 같은 ID의 일반 저장 또는 현재 `status='draft'`인 글의 slug rename이다.
- `forkedFromId`가 있으면 `post.id !== forkedFromId`여야 한다.
- 발행 성공 시 `Post.publishedSlug`에 현재 `Post.slug`를 기록한다.
- 발행 취소 시 `githubPath`, `publishedAt`, `publishedRev`는 제거하지만 `publishedSlug`는 이력 정보로 보존한다.
- `publishedSlug`는 그 자체로 fork 여부를 결정하지 않는다. slug 변경의 fork 여부는 저장 전 NAS Post의 `status === 'published'` 여부로 판정한다.
- 발행 취소되어 `status='draft'`가 된 Post의 slug 변경은 `publishedSlug`가 남아 있어도 같은 ID로 rename한다.
- fork로 생성된 `post`는 `status='draft'`, `rev=1`이며 `githubPath`, `publishedAt`, `publishedRev`, `publishedSlug`, 예약발행 정보를 상속하지 않는다.
- fork 후 보존된 원본 Post는 기존 `publishedSlug`를 유지한다.
- `version_conflict`, `slug_taken`, `duplicate_post_id`는 서로 다른 사용자 대응이 필요하므로 하나의 일반 충돌 문자열로 합치지 않는다.

### 4-2. 발행 취소 응답

```typescript
interface UnpublishResponse {
  ok: true
  status: 'draft'
  committed: boolean
  pushedAt: string
  post: Post
}
```

- `post`는 발행 취소 상태를 NAS에 저장한 후의 최신 Post다.
- `post.status`는 `draft`이며 최신 `rev`를 포함한다.
- `githubPath`, `publishedAt`, `publishedRev`는 제거된다.
- `publishedSlug`는 마지막 실제 발행 slug 이력으로 보존된다.
- Git 저장소에 삭제할 변경이 이미 없다면 멱등 성공으로 `committed:false`를 반환한다.
- 클라이언트는 응답의 `post`를 사용하여 로컬 `post.rev`와 `baseRev`를 동기화한다.

### 4-3. 이미지 업로드 응답 ✅

```typescript
interface UploadMediaResponse {
  ok: true
  media: MediaFile
}
```

요청은 JSON이 아니라 multipart다.

```text
POST /api/posts/:slug/media
Content-Type: multipart/form-data
필드명: file
```

성공 시 backend가 확정한 최종 파일명을 `media.filename`으로 반환한다.
에디터는 클라이언트의 원래 파일명이 아니라 이 최종 파일명을 본문에 삽입한다.

최종 파일명은 NFC로 정규화하며 한글을 포함한 Unicode 문자·숫자·결합문자를 보존한다. 공백 및 안전하지 않은 문자는 `-`로 치환하고, 중복 파일명에는 `-2`, `-3` suffix를 붙인다. WebP 변환 시 basename은 보존하고 확장자만 `.webp`로 변경한다.

주요 오류 코드:

- `post_not_found`
- `media_required`
- `unsupported_media_type`
- `media_too_large`
- `invalid_image`
- `media_upload_failed`

### 4-4. 미디어 조회

```text
GET /api/posts/:slug/media/:filename
```

이미지 바이너리를 올바른 `Content-Type`으로 반환한다.
리치 에디터 표시와 MD 파일명 클릭 미리보기에 사용한다.

---

## 5. UI·플랫폼 경계 계약

`packages/shared/src/ui-contract.ts`의 `PlatformAdapter`에 선택 필드를 추가한다.

```typescript
interface PlatformAdapter {
  // 기존 필드 유지

  mediaUrl?: (slug: string, filename: string) => string
}
```

- NAS base URL을 아는 desktop/playground 껍데기가 구현한다.
- core editor는 NAS 주소를 직접 조합하지 않는다.
- 반환된 URL은 화면 표시용이며 TipTap JSON/Markdown에 저장하지 않는다.
- 선택 필드이므로 기존 플랫폼 구현을 즉시 깨뜨리지 않는다.

`PlatformHttp.body`의 기존 타입은 `unknown`을 유지한다.

- 일반 객체는 JSON으로 직렬화한다.
- body가 `FormData`면 그대로 fetch에 전달한다.
- FormData에는 `Content-Type`을 직접 지정하지 않는다. 브라우저가 multipart boundary를 생성한다.

---

## 6. 의존성

- 없음
- 모든 패키지가 shared에 의존한다.
- shared는 core/backend/desktop에 의존하지 않는다.

---

## 7. 상태

- ✅ `types.ts` — 도메인 타입
- ✅ `api-contract.ts` — 기기↔NAS API 계약
- ✅ `ui-contract.ts` — UI props·PlatformAdapter 계약
- ✅ 이미지 첨부 계약 완료:
  - `PostPatch.media?`
  - `MediaPolicy.imageFormat?`
  - `UploadMediaResponse`
  - `PlatformAdapter.mediaUrl?`
  - binary/FormData HTTP body 지원
- 🚧 ID/slug 저장 계약 구현 예정:
  - ID 우선 rev 검사
  - `version_conflict` / `slug_taken` / `duplicate_post_id` 구분
  - 발행 글 fork 성공 시 새 Post와 `forkedFromId` 반환
- 📋 슬롯: 쇼츠·다중 블로그·다중 사용자 확장 타입

---

## 8. 미래 확장

- 이미지 여러 장 일괄 업로드 응답
- 업로드 진행률·취소 계약
- 미사용 미디어 정리 계약
- `ShortsJob`, `ScriptDraft`, `VoiceTrack` 등 쇼츠 파이프라인 타입
- 다중 블로그/다중 사용자 타입
