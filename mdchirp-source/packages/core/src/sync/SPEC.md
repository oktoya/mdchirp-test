# sync (동기화) 서비스 SPEC

> UI 없는 서비스 레이어. 모든 모듈 밑에서 저장·동기화·NAS 통신을 담당한다.
> 상위: `packages/core/SPEC.md`

---

## 1. 목적 (Why)

**Local-first를 실현한다.**

작성/임시저장은 항상 기기 로컬에 먼저 기록한다.
온라인이면 NAS로 동기화하고, 오프라인이면 큐에 쌓아 복귀 시 재시도한다.
글쓰기와 텍스트 저장이 네트워크 상태와 무관하게 동작하게 한다.

단, 1차 이미지 바이너리 업로드는 현재 desktop storage가 localStorage이므로 online 전용이다.
이미지 Blob 오프라인 큐는 Dexie 전환 후 확장한다.

---

## 2. 책임 범위

**한다:**
- 로컬 임시저장 — 자동(디바운스) + 수동
- 동기화 큐: 오프라인 시 텍스트 저장·발행·예약 작업 적재, 온라인 복귀 시 순차 전송
- NAS API 클라이언트 (저장/조회/발행/삭제/발행취소/이미지 업로드)
- **버전 충돌 처리**: baseRev 동봉, 409 수신 시 에디터에 충돌 이벤트 전달
- 목록 캐시 제공, NAS 목록과 로컬 draft 결합
- 연결 상태 감지(`/api/health` 폴링) → shell에 온라인/오프라인 통지
- 이미지 바이너리를 `multipart/form-data`로 NAS에 업로드하고 구조화된 결과 반환(1차 online 전용)
- 발행 시 backend의 누락 이미지 오류를 사람이 읽을 수 있는 메시지로 변환

**안 한다 (경계):**
- UI를 그리지 않는다
- 발행 빌드/git/워터마크를 수행하지 않는다 (NAS가 담당)
- 충돌을 자동 해소하지 않는다 (선택은 사용자에게 위임)
- 이미지 변환·파일명 확정·실파일 검증을 하지 않는다 (NAS backend 책임)
- 이미지 Blob을 현재 localStorage 큐에 base64로 저장하지 않는다
- 업로드에 실패한 이미지의 Markdown 참조를 임의로 생성하지 않는다

---

## 3. 공개 인터페이스

```typescript
interface Sync {
  saveLocalDraft(patch: PostPatch): Promise<void>
  putLocalDraft(post: Post, baseRev?: number): Promise<void>

  saveToNas(post: Post): Promise<SaveResult>
  resolveOverwrite(post: Post, currentRev: number): Promise<SaveResult>

  requestPublish(postId: string): Promise<PublishResult>
  schedulePublish(postId: string, publishAt: string): Promise<PublishResult>

  deletePost(id: string, slug: string): Promise<DeleteResult>
  unpublish(slug: string): Promise<UnpublishResult>

  uploadMedia(
    slug: string,
    file: Blob,
    filename: string,
  ): Promise<MediaUploadResult>

  list(): Promise<Post[]>
  refreshGithub(): Promise<GitRefreshResponse>
  get(id: string): Promise<Post | null>
  getDraft(id: string): Promise<DraftEnvelope | null>

  openPost(id: string, slug?: string): Promise<OpenResult>
  adoptRemote(post: Post): Promise<void>

  pendingCount(): Promise<number>
  flushQueue(): Promise<void>

  checkConnectivity(): Promise<boolean>
  setOnline(next: boolean): void
  isOnline(): boolean

  onConflict(cb: (c: ConflictInfo) => void): void
  onConnectivity(cb: (online: boolean) => void): void

  dispose(): void
}

type SaveResult =
  | { ok: true; post: Post; forkedFromId?: string }
  | { ok: false; error: 'version_conflict'; conflict: ConflictInfo }
  | {
      ok: false
      error: 'slug_taken' | 'duplicate_post_id'
      message: string
    }

type OpenResult =
  | { kind: 'local'; post: Post }
  | { kind: 'loaded'; post: Post }
  | { kind: 'stale'; local: Post; remote: Post }
  | { kind: 'none' }

type PublishResult =
  | {
      ok: true
      queued: boolean
      githubPath?: string
      publishedAt?: string
      scheduledAt?: string
    }
  | { ok: false; message: string }

type DeleteResult =
  | { ok: true; unpublished: boolean }
  | { ok: false; offline?: boolean; message: string }

type UnpublishResult =
  | {
      ok: true
      post: Post
      committed: boolean
      pushedAt: string
    }
  | { ok: false; offline?: boolean; message: string }

type MediaUploadResult =
  | { ok: true; media: MediaFile }
  | { ok: false; offline?: boolean; message: string }

interface ConflictInfo {
  id: string
  currentRev: number
  currentPost: Post
}
```

---

## 4. 로컬 저장과 동기화 큐

### 4-0. 로컬 draft 봉투

로컬 저장소에는 Post만 저장하지 않고 NAS 합의 상태를 함께 보관한다.

```typescript
interface DraftEnvelope {
  post: Post
  baseRev: number
  dirty: boolean
  updatedAt: string
}
```

- `baseRev`: 마지막으로 NAS와 합의한 rev
- `dirty=true`: NAS에 아직 반영되지 않은 로컬 변경이 있음
- `dirty=false`: 현재 로컬 draft가 NAS와 합의된 상태
- 발행 상태는 `draft | scheduled | published`만 사용한다
- syncing/synced는 PostStatus로 사용하지 않는다

### 4-0-1. 큐 항목

```typescript
interface QueueItem {
  opId: string
  kind: 'save' | 'publish' | 'schedule'
  postId: string
  baseRev: number
  publishAt?: string
  enqueuedAt: string
}
```

이미지 바이너리 업로드는 현재 큐 종류에 포함하지 않는다.


#### ID 기준 큐 정합성 🚧

- 큐 항목은 변경될 수 있는 slug가 아니라 영구 정체성인 `postId`를 저장한다.
- 큐 flush 시 `postId`로 최신 `DraftEnvelope`를 찾고, 전송 직전에 `envelope.post.slug`를 사용한다.
- 같은 `postId`의 미전송 save가 여러 개면 최신 로컬 draft를 보내는 save 한 건으로 합친다.
- publish와 schedule은 save보다 뒤에서 실행하며, 해당 시점의 최신 Post slug를 사용한다.
- `requestPublish(postId)`와 `schedulePublish(postId, publishAt)`는 `postId`로 최신 로컬 봉투를 찾고, online 전송 직전에 현재 slug를 결정한다.
- 해당 `postId`의 로컬 봉투가 없으면 오래된 slug를 추측해 발행하지 않고 실패 결과를 반환한다.
- save 결과가 fork이면 `forkedFromId`를 참조하는 뒤쪽 큐 항목을 새 `post.id`로 바꾼다. 따라서 fork 직후 예약된 publish가 보존된 원본 글을 잘못 발행하지 않는다.
- 기존 slug만 저장한 레거시 큐 항목은 자동 추측으로 전송하지 않는다. 대응되는 로컬 draft를 안전하게 찾을 수 있을 때만 `postId` 형태로 이전하고, 찾지 못하면 큐에 보존한 채 사용자에게 재저장을 요청한다.

### 4-0-2. 저장 흐름

```text
저장 요청
  → post.id의 로컬 draft 즉시 기록(dirty=true)
  → 온라인?
     YES → 현재 slug와 post.id, baseRev를 NAS에 전송
           → 같은 ID 일반 저장/rename 성공:
             rev/baseRev 갱신, dirty=false
           → 발행 글 fork 성공:
             원본 ID의 편집 봉투 제거
             응답의 새 ID로 새 draft 봉투 저장
             새 글 rev/baseRev 갱신, dirty=false
           → 409 version_conflict:
             충돌 이벤트 발생, 로컬 draft 보존
           → 409 slug_taken/duplicate_post_id:
             자동 재시도·덮어쓰기 없이 로컬 draft 보존
     NO  → postId 기준 queue에 save 적재, dirty=true 유지

온라인 복귀
  → queue를 enqueuedAt 순서로 전송
  → 409가 발생한 글은 충돌 이벤트 발생
  → 나머지 큐 항목은 계속 처리
```

- 큐 항목은 로컬 저장소에 영속화한다.
- 같은 시점에 flush가 중복 실행되면 하나의 진행 Promise를 공유한다.
- 네트워크 오류가 발생하면 남은 큐를 보존하고 다음 온라인 복귀 때 재시도한다.
- 충돌은 예외가 아니라 정상적인 분기 결과로 취급한다.

---

## 4-1. 로컬 draft 정합성 (list 청소)

`list()`는 online일 때 NAS 목록을 기준으로 로컬 draft를 결합한다.

- NAS Post와 로컬 `DraftEnvelope`는 slug가 아니라 `Post.id`로 먼저 결합한다.
- 같은 ID의 NAS slug와 로컬 slug가 달라도 목록에 두 글을 만들지 않는다.
- NAS 응답은 요약 데이터이므로 같은 ID의 로컬 draft 본문이 있으면 로컬 본문을 우선 사용한다.
- 같은 ID의 로컬 draft가 `dirty=false`이면 NAS의 최신 slug·rev·상태를 반영할 수 있다.
- 같은 ID의 로컬 draft가 `dirty=true`이면 NAS의 다른 slug로 자동 교체하지 않는다. 로컬 글을 유지하고 열기 또는 저장 과정에서 rev 충돌을 확인한다.
- NAS 목록에 없고 `dirty=false`인 로컬 draft는 삭제된 잔재로 보고 제거한다.
- NAS 목록에 없고 `dirty=true`인 로컬 draft는 미저장 새 초안일 수 있으므로 보존한다.
- NAS 목록 자체에서 같은 ID가 둘 이상 발견되면 하나를 임의 선택하지 않고 `duplicate_post_id` 상태로 취급한다.
- offline일 때는 NAS 목록을 신뢰할 수 없으므로 로컬 draft 청소를 하지 않는다.

---

## 4-2. GitHub 수동 새로고침 🚧

`list()`와 `refreshGithub()`는 역할이 다르다.

### `list()`

- 앱 시작 시 호출한다.
- 로컬 draft와 NAS `GET /api/posts` 결과만 결합한다.
- GitHub API나 Git fetch를 호출하지 않는다.
- NAS가 offline이면 로컬 draft 목록을 반환한다.

### `refreshGithub()`

- 사용자가 새로고침 버튼을 눌렀을 때만 호출한다.
- NAS의 `POST /api/git/refresh`를 호출한다.
- 성공하면 응답의 원격 관측과 진단을 shell에 반환한다.
- backend가 GitHub-only 글을 import한 뒤 `list()`를 다시 호출하여 NAS 목록을 갱신한다.
- 같은 시각의 중복 새로고침은 하나의 진행 Promise를 공유한다.
- 새로고침 중에는 기존 `posts` 상태를 비우지 않는다.
- 실패하면 기존 NAS·로컬 목록과 현재 편집 중인 글을 유지한다.
- 실패를 원격 글의 `missing` 상태로 변환하지 않는다.
- GitHub-only import 결과는 backend가 저장한 `Post.id`, `githubPath`, `rev`를 그대로 사용한다.
- sync는 제목·날짜·본문 유사도로 Post를 자동 연결하지 않는다.

흐름:

```text
사용자 새로고침
  → sync.refreshGithub()
  → POST /api/git/refresh
  → 성공:
       GitHub-only 글 NAS import 완료
       observations/diagnostics 수신
       sync.list()로 NAS 목록 다시 읽기
       shell이 observations를 ID 기준으로 결합
  → 실패:
       기존 목록 유지
       remote_refresh_failed 안내
```

앱 시작 흐름:

```text
Shell mount
  → sync.list()
  → 로컬 draft + NAS 목록
  → GitHub 요청 없음
```

## 4-3. 삭제 / 발행 취소

### 삭제

`deletePost(id, slug)`는 online 전용이다.

- NAS `DELETE /api/posts/:slug` 호출
- published 글이면 NAS가 GitHub 본문과 이미지 폴더도 제거
- NAS 글폴더는 `.trash`로 이동
- 성공 시 로컬 draft 제거
- offline에서는 파괴적 동작을 큐잉하지 않고 실패 결과 반환

### 발행 취소

`unpublish(slug)`는 online 전용이다.

- NAS `POST /api/posts/:slug/unpublish` 호출
- GitHub에서 본문과 이미지 제거
- NAS 글폴더와 로컬 draft는 보존
- backend가 저장 후 최신 `Post`를 응답의 `post`로 반환
- 응답의 최신 Post를 로컬 draft에 캐시하고 `post.rev`와 `baseRev`를 같은 값으로 동기화
- 응답의 `post.status`는 `draft`
- `githubPath`, `publishedAt`, `publishedRev` 제거
- 마지막으로 실제 발행된 slug인 `publishedSlug`는 로컬 draft와 NAS Post에 이력 정보로 보존
- Git 삭제 변경이 이미 없다면 `committed:false`인 멱등 성공으로 처리
- 발행 취소 후 글을 다시 열어도 이전 `baseRev` 때문에 stale 또는 conflict를 발생시키지 않음
- 발행 취소 후 `status='draft'`인 글의 slug 변경은 `publishedSlug`가 남아 있어도 같은 Post.id를 유지한 rename으로 처리
- offline에서는 실행하지 않음

---

## 4-3. 글 열기 — NAS 본문 로드 + rev 대조

`get(id)`는 로컬 draft만 조회한다.

다른 기기나 재설치 환경에서 로컬에 본문이 없는 글을 열 때는
`openPost(id, slug?)`를 사용한다.


#### 다른 기기의 slug 변경 대응 🚧

- 전달받은 `slug`는 마지막으로 알려진 위치일 수 있으므로 글 정체성으로 신뢰하지 않는다.
- online이면 NAS 목록에서 `id`가 일치하는 현재 summary를 먼저 확인하고 그 summary의 slug로 본문을 요청한다.
- 전달받은 slug에서 Post를 읽었더라도 응답의 `post.id`가 요청한 `id`와 다르면 해당 Post를 열지 않는다.
- 같은 ID의 NAS slug가 변경되었고 로컬 draft가 `dirty=false`이면 최신 원격 slug를 반영한다.
- 로컬 draft가 `dirty=true`이면 자동으로 slug를 바꾸지 않고 `stale` 또는 저장 충돌 흐름으로 보낸다.
- 이전 slug가 사라졌다는 이유만으로 같은 ID의 새 slug 글을 별도 글로 생성하지 않는다.

### 로컬 draft 없음

```text
online + slug 있음
  → NasClient.get(slug)
  → NAS Post를 로컬에 캐시
  → baseRev=post.rev, dirty=false
  → loaded 반환
```

slug가 없거나 offline이거나 NAS에 글이 없으면 `none`.

### 로컬 draft 있음 + offline

NAS와 대조할 수 없으므로 `local` 반환.

### 로컬 draft 있음 + online

NAS 현재 rev를 확인한다.

- `remote.rev <= draft.baseRev` → `local`
- `remote.rev > draft.baseRev` → `stale`

`stale`은 로컬과 원격 Post를 모두 반환하고 자동 교체하지 않는다.

사용자가 최신본 불러오기를 선택하면 `adoptRemote(remote)`로 확정한다.
취소하면 로컬 draft를 유지한다.

### 두 관문

1. 글을 열 때 rev 대조
2. 저장할 때 baseRev 409 대조

열 때 최신본 불러오기를 거부해도 저장 시 409가 다시 발생하므로 자동 덮어쓰기가 일어나지 않는다.

소프트 잠금은 별도 슬롯이다. rev는 저장돼야 증가하므로 현재 누가 글을 열어 편집 중인지는 감지하지 못한다.

---

## 4-4. 이미지 업로드 (online 전용) ✅

### 호출 순서

Shell은 이미지 업로드 전에 현재 글을 일반 저장 경로로 NAS와 먼저 합의한다.

```text
SplitView onUploadImage(post, file)
  → Sync.saveToNas(post)
      ├─ 409: 충돌 이벤트 + 업로드 중단
      ├─ offline: 업로드 중단
      └─ 성공: rev/baseRev 합의
  → Sync.uploadMedia(slug, file, filename)
  → NasClient.uploadMedia()
  → POST /api/posts/:slug/media
  → multipart/form-data의 file 필드로 전송
  → backend가 검증·변환·저장
  → Unicode 파일명을 NFC로 정규화하되 한글 문자·숫자는 보존
  → 공백·위험 문자 치환 및 중복 suffix 확정
  → { ok:true, media: MediaFile }
  → SplitView가 Post.media[]와 본문 이미지 참조 갱신
```

업로드를 글 저장보다 먼저 하지 않는다.

이유:
- 현재 slug의 글폴더가 NAS에 존재하는지 보장한다.
- 저장 충돌이 있는 상태에서 파일만 업로드되는 것을 막는다.
- 업로드 직후 프론트가 가진 baseRev가 스스로 낡아지는 것을 방지한다.

### 업로드 API와 rev

업로드 API는 파일만 저장하고 `meta.json`이나 rev를 직접 변경하지 않는다.

- 업로드 성공 응답의 `MediaFile`을 `Post.media[]`에 추가한다.
- `PostPatch.media`로 로컬 draft에 반영한다.
- 다음 일반 저장에서 meta.json에 영속한다.
- 실제 발행 가능 여부는 backend가 Markdown 참조와 NAS 디스크의 실파일을 기준으로 다시 검사한다.

### online 전용 이유

현재 desktop의 로컬 영속 저장은 localStorage다.

localStorage에 이미지 Blob을 base64로 저장하면 다음 문제가 있다.

- 약 5MB 용량 제한
- base64 변환에 따른 용량 증가
- 큰 문서·이미지에서 저장 실패 가능
- 큐 flush 중 메모리 사용 증가

따라서 1차 동작은 다음과 같다.

- offline이면 `{ ok:false, offline:true, message }` 반환
- 이미지 본문 참조를 먼저 삽입하지 않음
- 텍스트 편집과 기존 오프라인 저장 큐는 계속 정상 동작
- Dexie 전환 후 Blob 저장소와 미디어 업로드 큐를 추가

### HTTP 경계

업로드 요청 body는 `FormData`다.

```typescript
const form = new FormData()
form.append('file', file, filename)
```

기존 HTTP 인터페이스의 `body?: unknown`을 유지한다.

- body가 FormData면 `JSON.stringify()`하지 않는다.
- FormData 요청에는 `Content-Type`을 직접 지정하지 않는다.
- 브라우저 fetch가 multipart boundary가 포함된 Content-Type을 자동 생성한다.
- FormData가 아니면 기존과 동일하게 JSON으로 직렬화하고 `application/json`을 사용한다.
- PlatformHttp → HttpAdapter 변환기는 body를 변경하지 않고 그대로 전달한다.

### 업로드 결과

성공:

```typescript
{
  ok: true,
  media: {
    id: string,
    type: 'image',
    origin: 'local',
    filename: string,
    nasPath: string,
    sizeBytes: number
  }
}
```

실패:

```typescript
{
  ok: false,
  offline?: boolean,
  message: string
}
```

backend 오류 코드는 사람이 읽을 수 있는 메시지로 변환한다.

- `post_not_found` → 글을 먼저 저장해야 함
- `media_required` → 업로드 파일이 없음
- `unsupported_media_type` → 지원하지 않는 이미지 형식
- `media_too_large` → 파일 크기 제한 초과
- `invalid_image` → 이미지 디코딩 또는 WebP 변환 실패
- 기타 오류 → NAS 업로드 실패 상태와 메시지 표시

---

## 4-5. 발행 전 누락 이미지 오류

backend는 발행 직전에 Markdown 이미지 참조를 검사한다.

누락 이미지가 있으면 다음 오류를 반환한다.

```json
{
  "error": "missing_images",
  "details": ["photo.webp", "diagram.png"]
}
```

`Sync.errorMessage()`는 이를 다음과 같은 사용자 메시지로 변환한다.

```text
누락된 이미지 파일이 있어 발행할 수 없습니다: photo.webp, diagram.png
```

- 누락 이미지는 발행을 강제 차단한다.
- 확인 후 강행 기능을 제공하지 않는다.
- 외부 `http(s)://` 이미지는 누락 검사 대상에서 제외한다.
- git push와 published 상태 변경은 실행하지 않는다.

---

## 5. 어댑터 경계

### HttpAdapter

```typescript
interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

interface HttpResponse<T = unknown> {
  status: number
  ok: boolean
  data: T
}

interface HttpAdapter {
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>
}
```

- HTTP 상태코드를 그대로 노출한다.
- 409를 예외로 바꾸지 않는다.
- JSON과 FormData body를 모두 전달할 수 있다.
- JSON/FormData의 실제 직렬화는 플랫폼 fetch 구현 책임이다.

### LocalStorageAdapter

```typescript
interface LocalStorageAdapter {
  get<T>(collection: string, key: string): Promise<T | null>
  set<T>(collection: string, key: string, value: T): Promise<void>
  remove(collection: string, key: string): Promise<void>
  all<T>(collection: string): Promise<T[]>
  keys(collection: string): Promise<string[]>
}
```

현재 구현은 메모리/localStorage이며, IndexedDB/Dexie로 교체 가능한 경계다.

---

## 6. 의존성

- `packages/shared`
- 런타임 주입:
  - `HttpAdapter`
  - `LocalStorageAdapter`
- 브라우저 표준:
  - `Blob`
  - `FormData`
  - `AbortSignal`
- 직접 의존하지 않음:
  - React
  - TipTap
  - Node 파일시스템
  - git
  - sharp

---

## 7. 상태

- 🚧 ID/slug 동기화 정합성 구현 예정:
  - ID 우선 목록 결합과 원격 slug 탐색
  - `postId` 기반 오프라인 큐
  - 같은 ID의 save 큐 최신 한 건 합치기
  - fork 성공 시 새 ID 봉투 전환과 후속 큐 remap
  - `version_conflict` / `slug_taken` / `duplicate_post_id` 분리 처리
- ✅ 1차 구현 완료: 로컬 저장 + 큐 + NAS 클라이언트 + 409 충돌 이벤트 + 연결 감지
- ✅ 발행/예약 요청 결과를 예외가 아닌 `PublishResult`로 전달
- ✅ 삭제/발행취소: online 전용 + list 삭제 잔재 청소
- ✅ NAS 본문 로드 + rev 대조: `openPost`/`adoptRemote`
- ✅ 발행 전 누락 이미지 400 오류를 한글 상세 메시지로 전달
- ✅ 이미지 업로드 구현 완료:
  - `NasClient.uploadMedia`
  - `Sync.uploadMedia`
  - multipart FormData 전송
  - 온라인 전용 업로드
  - 오프라인 상태의 명시적 오류
  - NAS 응답의 filename/url/format/width/height 전달
  - 실패 시 본문에 잘못된 이미지 참조를 삽입하지 않음
- 📋 슬롯:
  - 미디어 Blob 오프라인 큐(Dexie 전환 후)
  - 소프트 잠금
  - 증분 동기화(`/sync?since`)
  - Dexie storage adapter

### 7-1. 구현 파일

| 파일 | 역할 |
|------|------|
| `adapters.ts` | `HttpAdapter`/`LocalStorageAdapter` 인터페이스 |
| `NasClient.ts` | `/api/posts/*` 타입드 래퍼 |
| `Sync.ts` | local-first 저장, 큐, 발행, 삭제, 업로드 결과 처리 |
| `impl/FetchHttpAdapter.ts` | fetch 기반 HTTP 구현 |
| `impl/MemoryStorageAdapter.ts` | 메모리/localStorage 저장 |
| `sync.itest.ts` | 라이브 backend 통합테스트 |

> backend의 글·미디어 경로 파라미터는 `:slug`다.
> 저장은 `PUT /api/posts/:slug`, 업로드는 `POST /api/posts/:slug/media`,
> 미디어 조회는 `GET /api/posts/:slug/media/:filename`을 사용한다.

---

## 8. 미래 확장

- desktop storage를 IndexedDB/Dexie로 교체
- 이미지 Blob 오프라인 저장 및 업로드 큐
- 백그라운드 동기화
- 증분 동기화
- 충돌 비교·병합 보조
- 업로드 진행률과 취소
- 여러 이미지 동시 업로드

## 🚧 포괄적 version_conflict 처리

- `rev`는 변경 종류를 구분하지 않는다. 본문, 날짜, front-matter, slug rename, slug fork 및 상태 변경은 모두 동일한 변경으로 취급한다.
- NAS 최신 rev와 로컬 `baseRev`가 다르면 `version_conflict`로 처리하며 기본 메시지는 `다른 기기에서 변경이 있었습니다.`로 한다.
- sync는 rev가 증가한 이유를 본문 수정이나 slug 변경 등으로 추측하지 않는다.
- `stale` 감지와 저장 중 받은 `409 version_conflict`는 같은 포괄적 안내 원칙을 사용한다.
- `currentPost`와 로컬 편집본은 충돌 해결에 제공할 수 있지만 `lastMutation` 또는 변경 사유 코드는 요구하지 않는다.
- 자동 덮어쓰기·자동 병합은 하지 않는다. 사용자가 최신본을 불러오거나 명시적인 덮어쓰기 절차를 선택해야 한다.
- fork 성공 응답을 받은 경우에만 `forkedFromId`를 사용해 새 ID의 편집 봉투로 전환한다.
