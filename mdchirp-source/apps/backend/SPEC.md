# backend (NAS 백엔드) SPEC

> mdchirp의 허브. 동기화의 진실 공급원이자, 유일한 발행 주체이자, AI 키 보관소.
> 상위: `/SPEC.md` · 공유 타입: `packages/shared/SPEC.md`

---

## 1. 목적 (Why)

NAS에서 상시 구동되며 다음을 책임진다.
- 모든 기기의 글을 받아 **저장(진실 공급원)** 한다.
- **유일하게 GitHub에 커밋(발행)** 한다. 토큰은 여기에만 있다.
- 외부에서 GitHub에 직접 올린 글을 **감지**해 기기에 반영한다.
- 기기를 대신해 **LLM(서식 제안) 등 외부 API를 프록시** 한다. 키는 여기에만.
- (나중) 쇼츠 생성 같은 무거운 작업을 **작업 큐**로 처리한다.

한 문장: **"기기는 가볍게, 무겁고 위험한 건 전부 NAS가."**

---

## 2. 책임 범위 (What it does / does NOT)

**한다:**
- 글 CRUD 저장 (NAS 디스크의 글폴더 구조)
- 이미지 바이너리 업로드·검증·저장 및 에디터 미리보기용 이미지 조회
- 발행 빌더: 글폴더(작업공간) → Chirpy 표준구조로 변환 후 git commit & push
- git pull / GitHub API 폴링 → 외부 변경 감지 → 글 목록 갱신
- 토큰/키 보관 (GitHub PAT, Gemini API key 등) — `.env` 또는 암호화 저장
- LLM 프록시 (`/api/format/suggest` → Gemini)
- 예약발행 스케줄러 (status=scheduled, publishAt 도래 시 발행)
- (나중) 쇼츠 작업 큐 / 미디어 정책 엔진

**안 한다 (경계):**
- UI를 그리지 않는다 (순수 API 서버)
- 리치 편집을 하지 않는다 (tiptapJson은 그대로 보관만)
- 기기의 로컬 임시저장을 모른다 (기기가 "저장" 요청해야 비로소 관여)

---

## 3. 기술 / 배포

- Node + **Hono** (가볍고 빠름)
- **Docker** 컨테이너로 NAS에 배포 (Synology/Unraid 등)
- 디스크 볼륨 마운트: 글 데이터 + git 워킹카피
- 외부 접근: DDNS / VPN / Cloudflare Tunnel 중 택1 (배포 가이드는 docs)
- 이미지 검증·WebP 변환: **sharp** (구현 완료)

---

## 4. 디렉토리 (NAS 디스크)

```text
/data/mdchirp/
├── repo/                         # GitHub 레포의 워킹카피 (git clone)
│   ├── _posts/                   #   발행된 본문 (Chirpy 표준)
│   └── assets/img/posts/...      #   발행된 미디어
├── posts-src/                    # 글 작업공간 (글폴더 묶음, 커밋 안 됨)
│   └── 2026-06-19-hello/
│       ├── .source/tiptap.json
│       ├── post.md
│       ├── meta.json
│       ├── media/
│       └── .history/             #   충돌/덮어쓰기 시 이전본 (커밋 제외)
├── .trash/                       # 삭제된 글 보관(글폴더 통째 이동, 커밋 제외)
│   └── 2026-06-19-hello__20260708-153000/   # <slug>__<삭제시각>
├── media-store/                  # 📋 슬롯: 깃→NAS 오프로드된 미디어 / 외부링크 백업
└── secrets/                      # 토큰/키 (.env, 권한 600)
```

`repo/`의 `.gitignore`에 의해 `posts-src/`, `.source/`, `meta.json`은 절대 커밋되지 않는다.
(실제로는 posts-src를 repo 바깥에 두므로 자연히 분리됨)

---

## 5. API 계약 (Public API)

> 정식 타입은 `packages/shared`의 API contract와 공유.

### 글 (Posts)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/posts` | 전체 글 목록 (status, hasRichSource 포함). 동기화/리스터용 |
| GET | `/api/posts/:id` | 글 1편 (tiptapJson + markdown + frontmatter + media) |
| PUT | `/api/posts/:slug` | 글 저장(업서트). URL slug는 요청 위치, body의 `post.id`는 글 정체성이다. ID로 NAS 최신본을 찾고 `baseRev`를 비교한 뒤 일반 저장·미발행 rename·발행 글 fork 중 하나를 수행한다. 버전 불일치 또는 slug 중복은 구조화된 **409** 결과로 반환 |
| DELETE | `/api/posts/:id` | 글 삭제. NAS 글폴더를 `.trash/<slug>__<시각>`로 이동 + status=published면 GitHub `_posts/<slug>.md`·`assets/img/posts/<slug>/` 제거 커밋+push. 응답 `{ok, unpublished, committed?, pushedAt?}`. git 실패 시 **502 `delete_failed`** |
| GET | `/api/posts/sync?since=ts` | 변경분만 (효율적 동기화) |
| POST | `/api/posts/:id/lock` | 소프트 잠금 설정 (lockedBy, 만료시간). 📋 2차 |
| DELETE | `/api/posts/:id/lock` | 잠금 해제 |
| GET | `/api/posts/:id/history` | 충돌/덮어쓰기 히스토리 목록 (.history/) |


#### 저장 정체성·slug 변경 규칙 (🚧 구현 예정)

**정체성:**

- `Post.id`가 글의 영구 정체성이다.
- `slug`는 `posts-src/<slug>/` 폴더와 API 경로를 가리키는 현재 locator다.
- 저장 요청을 받으면 URL slug의 폴더만 조회하지 않고, `post.id`로 NAS의 기존 글을 먼저 찾는다.
- 같은 ID가 여러 글폴더에서 발견되면 자동 복구하지 않고 `duplicate_post_id`로 중단한다.

**저장 순서:**

```text
PUT /api/posts/:slug  body: { post, baseRev }
  → post.id로 기존 NAS 글 검색
  → 기존 글 있음?
     ├─ YES: baseRev와 기존 rev 비교
     │        ├─ 불일치: 409 version_conflict (rename/fork 실행 안 함)
     │        └─ 일치: slug 변경 여부와 발행 이력 판정
     └─ NO: 신규 글 저장
```

**slug 변경의 rename/fork 판정:**

기존 GitHub 발행본을 보존하는 fork 여부는 저장 전 NAS Post의 현재 상태로 판정한다.

- `status === 'published'`: 기존 발행본을 보존하고 새 ID의 draft로 fork
- `status === 'draft'`: 같은 ID와 rev 계보를 유지한 채 전체 글폴더 rename

`publishedSlug`는 마지막으로 실제 발행된 slug이며 발행 성공 시 현재 slug로 기록한다. 이 값은 이력 정보이며 그 자체로 fork를 발생시키지 않는다.

발행 취소가 성공하면 `githubPath`, `publishedAt`, `publishedRev`는 제거하고 `publishedSlug`는 보존한다. 이후 Post가 `status === 'draft'`인 상태에서 slug를 변경하면 `publishedSlug`가 남아 있어도 fork가 아니라 rename으로 처리한다.

**미발행 글의 slug 변경:**

- 같은 ID와 rev 계보를 유지한다.
- 대상 새 slug가 비어 있는지 먼저 확인한다.
- 기존 글폴더 전체를 새 slug로 이동하므로 `.source/`, `media/`, `.history/`도 함께 이동한다.
- 이동 후 meta/post.md의 slug와 파생 경로를 새 slug 기준으로 저장한다.
- 중간 실패 시 기존 글폴더를 유실하지 않아야 한다.

**발행 이력이 있는 글의 slug 변경:**

- 기존 글·기존 NAS 폴더·기존 GitHub 파일을 변경하지 않는다.
- NAS가 새 ID를 발급하고 `posts-src/<새-slug>/`에 새 글을 만든다.
- 본문, frontmatter, `.source/tiptap.json`, `media/`와 `Post.media[]`를 복사한다.
- 로컬 미디어의 `nasPath`는 새 slug 기준으로 갱신하고, 새 글의 `gitPath`는 제거한다.
- `.history/`, `githubPath`, `publishedAt`, `publishedRev`, `publishedSlug`, 기존 schedule은 복사하지 않는다.
- 새 글은 `status=draft`, `rev=1`, 새 `createdAt/updatedAt`으로 시작한다.
- 보존된 원본 글은 기존 `publishedSlug`를 유지한다.
- 저장 응답은 새 ID가 포함된 Post를 반환한다. 즉시발행/예약 요청의 호출부는 이 새 Post의 ID와 slug를 사용한다.

**slug 중복:**

- 대상 slug가 다른 ID의 글에 사용 중이면 `409 slug_taken`을 반환한다.
- 자동 덮어쓰기, 자동 삭제, 자동 suffix 부여를 하지 않는다.

### 미디어 (Media) ✅

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/posts/:slug/media` | 이미지 바이너리 업로드(`multipart/form-data`, 필드명 `file`). 글이 NAS에 먼저 저장돼 있어야 한다. JPEG/PNG/WebP/GIF를 허용하고, 설정에 따라 원본 유지 또는 WebP로 변환한 뒤 `posts-src/<slug>/media/`에 저장한다. 성공 시 `{ ok:true, media: MediaFile }` 반환 |
| GET | `/api/posts/:slug/media/:filename` | NAS 글폴더의 로컬 이미지를 리치 에디터·MD 미리보기에 제공. 올바른 `Content-Type`으로 반환하고 파일이 없으면 404 |

**업로드 규칙:**
- 1차 업로드는 **online 전용**이다. 현재 기기 로컬 저장소가 localStorage라 Blob 오프라인 큐를 안전하게 보관할 수 없기 때문이다. Dexie 전환 후 오프라인 미디어 큐를 확장한다.
- 파일 선택·Drag & Drop·클립보드 붙여넣기는 모두 같은 업로드 API로 수렴한다.
- 허용 형식은 JPEG/PNG/WebP/GIF다. 요청의 MIME 문자열만 믿지 않고 서버가 실제 이미지 포맷을 검사한다.
- 기본 최대 크기는 파일당 20 MiB다.
- 비정상적으로 큰 이미지와 애니메이션으로 인한 메모리 고갈을 막기 위해 픽셀 수와 애니메이션 프레임 수도 제한한다.
- 파일명은 서버가 NFC로 정규화한다. 한글을 포함한 Unicode 문자·숫자·결합문자와 `.`·`_`·`-`는 보존하고, 공백 및 위험 문자는 `-`로 치환한다.
- 경로 구분자, 상위 경로 참조, 제어문자 등은 최종 단일 파일명에 포함하지 않는다.
- 같은 이름이 이미 있으면 덮어쓰지 않고 `-2`, `-3` 등의 suffix를 붙인다.
- WebP 변환 시 정규화된 basename은 유지하고 확장자만 `.webp`로 변경한다.
- 업로드 API는 파일만 저장하며 `meta.json`과 `rev`를 직접 변경하지 않는다. 업로드 응답의 `MediaFile`은 이후 일반 글 저장 경로로 `Post.media[]`에 반영한다.
- 설정이 `original`이면 JPEG/PNG/WebP/GIF 원본 형식을 유지한다.
- 설정이 `webp`이면 JPEG/PNG/정적 GIF를 WebP로, 애니메이션 GIF를 애니메이션 WebP로 변환한다.
- 애니메이션 GIF 변환 시 전체 프레임을 보존한다. 첫 프레임만 남은 정지 이미지로 변환되면 성공으로 처리하지 않는다.
- WebP 변환에 실패하면 원본으로 조용히 폴백하지 않고 업로드 실패를 반환한다.

**오류 응답:**
- `404 post_not_found` — 먼저 저장된 글이 없음
- `400 media_required` — multipart의 `file` 필드가 없음
- `400 unsupported_media_type` — 허용하지 않는 이미지 형식
- `413 media_too_large` — 파일 크기 제한 초과
- `422 invalid_image` — 이미지 디코딩·검증·WebP 변환 실패
- `500 media_upload_failed` — NAS 파일 저장 실패

### 발행 (Publish)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/posts/:id/publish` | 즉시 발행. 발행 빌더 실행 → commit & push → status: published. 이미지 누락 시 **400 `missing_images`** 반환 |
| POST | `/api/posts/:id/schedule` | 예약발행. `{ publishAt }` → status: scheduled |
| POST | `/api/posts/:id/unpublish` | ✅ 발행 취소. GitHub `_posts/<slug>.md`·`assets/img/posts/<slug>/` 제거 커밋+push. NAS 글폴더·로컬 draft 보존, status→draft, githubPath/publishedAt/publishedRev 비움. 마지막 실제 발행 slug인 `publishedSlug`는 이력 정보로 보존하지만 이후 slug 변경의 fork 판정에는 사용하지 않는다. 저장 성공 응답은 최신 rev를 가진 `{ok:true, status:'draft', committed, pushedAt, post}`를 반환한다. 삭제할 Git 변경이 이미 없으면 멱등 성공으로 `committed:false`를 반환한다. 실제 git 실패 시 **502 `unpublish_failed`** |

### 외부 동기화 (Git)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/git/pull` | 수동 pull 트리거 (보통은 백그라운드 폴링) |
| GET | `/api/git/status` | 마지막 pull/push 시각, 미동기 변경 |

### AI 프록시 (키는 NAS에만, 기기는 호출만)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/format/suggest` | ✅ `{ doc:{markdown} }` → Gemini 호출 → `{suggestions:[{id,range,before,after,type,reason}]}`. 키 없으면 **503**, 실패 시 **502**. range는 서버가 `indexOf`로 계산 |
| POST | `/api/slug/suggest` | ✅ `{ title }` → Gemini → `{ candidates: string[] }`(영문 slug 후보). 키 없으면 **503**, 실패 시 **502**. 서버가 `normalizeSlug`로 정규화 |

> 키는 `GEMINI_API_KEY`(env 또는 `.dev.vars`, gitignore). `isGeminiConfigured()`가 모든 걸 게이트. **B 모드**: 키 없어도 구조 동작, 키 드롭인 시 코드 변경 0으로 활성화.

### 설정/상태

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | ✅ 헬스체크 + features(formatter/slug 키 설정 여부) |
| GET | `/api/authors` | ✅ `repo/_data/authors.yml` 파싱 → `[{key,name}]`. 파일 없거나 파싱 실패 시 `[]`. 프론트매터 저자 드롭다운용 |
| GET | `/api/settings` | ✅ NAS측 설정(NasSettings) 조회. 키는 마스킹(tokenSet/keySet 불린만). secrets 존재 여부로 계산 |
| PUT | `/api/settings` | ✅ NAS측 설정 부분 저장(github/ai/mediaPolicy). settings.json 영속 |
| PUT | `/api/secrets` | ✅ `{ kind, value }` write-only 저장(secrets.json, 평문). 응답은 set 불린만. gemini 키는 process.env에도 주입해 즉시 활성(B 모드) |

---

## 6. 발행 빌더 (Publish Builder) — 핵심 엔진

### 6-0. 이미지 업로드 경로 ✅

에디터에서 첨부한 이미지는 발행 전에 다음 경로로 저장된다.

```text
파일 선택 / Drag & Drop / 클립보드
  → POST /api/posts/:slug/media
  → 실제 이미지 포맷·크기 검증
  → 원본 유지 또는 WebP 변환
  → posts-src/<slug>/media/<filename>
  → 에디터 본문에는 ![alt](<filename>) 삽입
```

- `Post.media[]`는 이미지 메타데이터와 향후 정책 UI를 위한 목록이다.
- 발행 시 실제 진실원은 **Markdown 이미지 참조 + NAS 디스크의 실파일**이다.
- `Post.media[]`에 항목이 있어도 실파일이 없으면 발행하지 않는다.
- 반대로 NAS에 파일이 있어도 Markdown 본문이 참조하지 않으면 이번 발행의 복사 대상에 넣지 않는다.
- 업로드 API는 파일만 저장하고 `meta.json`과 `rev`를 직접 변경하지 않는다.
- 업로드 응답의 `MediaFile`은 에디터가 `Post.media[]`에 추가하고 다음 일반 글 저장에서 영속한다.
- 리치 에디터와 MD 미리보기는 `GET /api/posts/:slug/media/:filename`으로 NAS 원본을 표시한다.
- 본문에는 NAS 전체 URL이 아니라 파일명만 보존한다. 발행 시 `media_subpath`가 GitHub 경로를 해석하기 때문이다.

### 6-1. 발행 단계

기기의 글폴더(작업공간)를 Chirpy 표준구조로 변환하는 단계:

```text
입력: posts-src/2026-06-19-hello/  (post.md, meta.json, media/, .source/)

1. slug 확정         : 폴더명 = 2026-06-19-hello
2. 프론트매터 처리   : meta/frontmatter 병합, media_subpath 자동 주입
                       → media_subpath: /assets/img/posts/2026-06-19-hello/
                       저자: author(1명) 또는 authors(여럿) 직렬화. 비면 생략(Chirpy social.name fallback)
                       date: 시간대 오프셋 형식(YYYY-MM-DD HH:MM:SS +0900)으로 정규화
                       ★ YAML 안전망: categories, tags, author, authors는 YAML 파싱 오류를 막기 위해 JSON 직렬화(따옴표 감싸기)를 거침.
2-2. 이미지 스캔/검증: 본문 마크다운에서 외부 URL을 제외한 로컬 이미지 경로를 파싱합니다.
                       - 글 로컬 미디어 폴더(`posts-src/<slug>/media/`)에 실존하는 파일 ➡️ 순수 파일명만 남기는 정규화 및 복사 목록 추가.
                       - 깃 리포지토리(`repo/`) 내에 이미 보관된 공용 이미지 ➡️ 경로 그대로 보존 및 복사 제외.
                       - 둘 다 존재하지 않는 파일 ➡️ 유실 이미지로 분류하고, 하나라도 있을 시 **MissingImagesError**를 발생시켜 발행 프로세스 즉시 차단(Block).
3. 본문 배치         : post.md → repo/_posts/2026-06-19-hello.md
                       ★ 경로 정규화: Windows 백슬래시('\')로 인한 Git 오류 방지를 위해 파일 상대 경로를 슬래시('/')로 통일.
4. 미디어 배치       : 검증을 거친 복사 대상 미디어들 ➡️ repo/assets/img/posts/2026-06-19-hello/* 로 복사.
                       (단, .source/, meta.json, .history/ 는 제외. 본문 배치와 마찬가지로 Git 경로를 슬래시('/')로 통일)
5. 워터마크 합성     : 원본 보존, 사본에만 워터마크 합성 (WatermarkPolicy)
                       skipIfExternal=true 면 외부링크는 건드리지 않음 (📋 슬롯)
6. (선택) 미디어 정책: 외부링크 백업/오프로드 규칙 적용 (📋 슬롯)
7. git add/commit    : "publish: 2026-06-19-hello" (또는 update)
8. git push          : main 브랜치
9. 상태 갱신         : status → published, githubPath 기록, publishedAt, publishedSlug에 현재 slug 기록, rev+1
```

**재발행(수정 발행, 🚧 경로 규칙 보강 예정):**

- 안전한 기존 `githubPath`가 있으면 같은 ID의 기존 발행 파일 경로를 재사용한다.
- date만 변경해도 `_posts` 파일명은 유지하고, Markdown frontmatter의 date만 새 값으로 렌더링한다.
- `githubPath`가 없으면 기존 `resolveFilename(slug, publishDate)` 규칙으로 새 파일명을 계산한다.
- 기존 경로 재사용과 무관하게 `media_subpath`와 발행 미디어 폴더는 현재 Post의 slug를 기준으로 한다.
- slug 변경은 저장 단계에서 미발행 rename 또는 발행 글 fork로 먼저 정리되므로, 새 fork Post는 기존 `githubPath`를 물려받지 않는다.
- 이번 범위에서는 Git rename, 기존 중복 파일 자동 삭제, 저장소 전체 `_posts` 스캔을 하지 않는다.

**`githubPath` 안전성:**

- Windows legacy 경로의 `\`는 `/`로 정규화한 뒤 검사한다.
- `_posts/<단일 안전 파일명>.md` 형태만 허용한다.
- 절대경로, `.`/`..`, 하위 디렉터리, `.md` 이외 확장자는 허용하지 않는다.
- 검증에 실패한 경로를 파일시스템 경로로 사용하지 않고 기존 안전한 파일명 계산으로 fallback한다.
- 모든 BuildResult와 Git 상대경로는 `/` 구분자로 통일한다.

**예약발행:** 스케줄러가 publishAt 도래 시 같은 발행 빌더를 실행하므로 위 경로 재사용 규칙을 공통 적용한다.

**구현 현황 (2026-07-01):** 1~6단계는 `publishBuilder.ts`에서 완성. 7~9단계(git
add/commit/push)는 `GitPublisher` 인터페이스로 분리돼 있고, 실구현체
`SimpleGitPublisher`(`publisher/simpleGitPublisher.ts`)가 주입되어 **실제 git push 동작**한다.

- git 호출: `node:child_process`로 git 바이너리 직접 실행(새 의존성 없음).
- 인증: `secrets.json`의 GitHub PAT를 push URL(`x-access-token`)에 **1회 주입**
  (remote에 영구 저장 안 함 → `.git/config`에 토큰 미노출).
- 대상: `settings.json`의 `github.repo`("owner/name")/`branch`.
- 커밋 저자: `mdchirp`/`mdchirp@localhost`를 `-c`로 커밋 단위 주입(전역 config 불변).
- 전제: `repo/`가 git 워킹카피여야 함(최초 1회 수동 clone — DEPLOY §13). 없으면 명확한 에러.
- 변경 없음이면 git "nothing to commit" → `committed:false`(정상, push 생략).
- 발행 라우트는 git 실패 시 **502 `publish_failed`** 반환(status는 published로 안 바꿈).

**저자·시간대 (2026-07-03):**
- **저자**: 프론트매터 패널의 저자 단일 필드(콤마로 복수)를 `frontmatterForm`이 한 명이면
  `author`, 여럿이면 `authors` 배열로 변환. `publishBuilder.renderWithSubpath`가 이를
  프론트매터에 출력(둘 다 비면 생략 → Chirpy가 `_config.yml` `social.name` fallback).
  `GET /api/authors`가 `repo/_data/authors.yml`을 읽어 드롭다운 후보(key/name) 제공
  (yaml 파서 사용). authors.yml 키와 일치해야 Chirpy 프로필 링크가 걸림.
- **발행 시각 기준**: `NasSettings.timezone` = `'nas'`(기본) | `'device'`.
  `'nas'`면 서버(NAS 컨테이너) 실제 시간대 오프셋(`serverOffset()`, 컨테이너 `TZ=Asia/Seoul`),
  `'device'`면 발행 요청 body의 기기 오프셋을 사용. 프론트(`NasClient.publish`)는 항상
  기기 오프셋을 실어 보내고, 사용 여부는 백엔드가 설정 모드로 결정. `normalizePublishDate`
  가 이 오프셋으로 date를 직렬화.

**발행/발행취소/삭제 공통:** 세 동작은 SimpleGitPublisher의 공통 커밋 흐름
(commit → pull --rebase(+충돌 시 abort 자가치유) → push)을 공유한다. 발행은 파일을 쓰고 add,
발행취소·삭제는 `git rm -r --ignore-unmatch`로 본문+이미지폴더를 제거한 뒤 같은 흐름을 탄다.

---

## 6-2. 동시 수정 처리 (Concurrency)

> 모델: `Post.rev`, `Post.lockedBy`, `.history/`. 정식 타입은 `packages/shared/src/types.ts`.

**버전 충돌 감지 (기존 구현 + 🚧 ID/slug 정합성 보강):**

```text
PUT /api/posts/:slug  body: { post, baseRev: 5 }
1. post.id로 현재 저장된 글과 실제 폴더 slug를 찾는다.
2. 같은 ID가 여러 폴더에 있으면 duplicate_post_id로 중단한다.
3. 기존 글이 있으면 baseRev와 현재 post.rev를 비교한다.
4. baseRev === post.rev ?
   - YES → slug 동일: 일반 저장, rev+1
           slug 변경 + 미발행: 글폴더 rename 후 rev+1
           slug 변경 + 발행 이력 있음: 기존 글 보존 + 새 ID의 draft fork
   - NO  → NAS 현재 rev와 요청의 baseRev가 불일치함
           → 들어온 내용을 현재 글의 .history/에 보관
           → rename/fork는 실행하지 않음
           → 409 version_conflict + { currentRev, currentPost } 반환
5. 대상 slug가 다른 ID에 사용 중이면 409 slug_taken을 반환한다.
6. 기기는 version_conflict와 slug_taken을 구분한다.
```

- `version_conflict`는 기존처럼 최신 불러오기 또는 내 것으로 덮어쓰기를 사람이 선택한다.
- 원격과 로컬 slug가 다를 때 내 것으로 덮어쓰면 로컬 slug까지 적용되어 NAS 폴더가 다시 이동한다는 경고를 표시한다.
- `slug_taken`에는 덮어쓰기를 제공하지 않고 다른 slug를 선택하게 한다.
- slug 변경과 폴더 이동은 반드시 rev 검사를 통과한 뒤 실행한다.

**히스토리 (.history/):**
- 충돌로 밀려난 내용, 덮어쓰기 직전 내용을 `rev+기기+시각`으로 스냅샷 보관.
- `GET /api/posts/:id/history`로 열람. 커밋 제외(GitHub에 안 올라감).

**소프트 잠금 (📋 2차 슬롯):**
- 글 열면 `POST /lock` → `lockedBy{deviceId, deviceName, since, expiresAt}`.
- 다른 기기는 `GET /api/posts` 시 `lockedBy` 보고 "○○ 편집 중" 배지(리스터/에디터).
- 강제 차단 아님. 만료시간 지나면 자동 해제(죽은 잠금 방지).

---

## 7. 외부 변경 감지 (External Change Detection)

```text
백그라운드 (주기적, 예: 5분):
1. git pull (또는 GitHub API로 _posts 변경 확인)
2. _posts 의 새/변경 .md 발견
3. posts-src 에 대응 글폴더 없음 → 외부 유입 글
   → markdown 파싱해 Post 생성, hasRichSource=false, status=published
4. 리스터가 GET /api/posts 시 함께 노출 (배지: "리치 원본 없음")
5. 그 글을 mdchirp에서 열어 저장하면 → .source/tiptap.json 생성 → hasRichSource=true 승격
```

---

## 8. 보안 (Security)

- 모든 외부 API 키(GitHub PAT, Gemini)는 `/data/mdchirp/secrets`에만. 응답에서 항상 마스킹.
- 기기↔NAS 통신 인증: 토큰/패스키 (1차는 단순 bearer, 추후 강화).
- LLM 프록시는 NAS가 대신 호출 → 키가 기기/브라우저에 절대 노출 안 됨.
- 발행 권한은 NAS만 → 기기 분실/팝업 탈취되어도 GitHub 쓰기 불가.
- **이미지 업로드 안전망(✅):**
  - URL의 `slug`와 `filename`을 파일시스템 경로로 그대로 신뢰하지 않는다.
  - `path.basename` 및 안전한 파일명 정규화로 `../`, 절대경로, Windows 백슬래시 등의 path traversal을 차단한다.
  - 요청의 MIME 문자열만 믿지 않고 이미지 디코더가 판별한 실제 포맷을 허용 목록(JPEG/PNG/WebP/GIF)과 대조한다.
  - 파일 크기·픽셀 수·애니메이션 프레임 수를 제한해 과도한 메모리 사용을 막는다.
  - 임시 파일에 먼저 쓴 뒤 검증·변환이 끝났을 때만 최종 파일명으로 이동한다. 실패한 중간 파일은 제거한다.
  - 미디어 조회 API도 정규화된 단일 파일명만 허용하며 `posts-src/<slug>/media/` 바깥 파일을 반환하지 않는다.
- 🚧 **(todo) 키 암호화**: 현재 walking skeleton은 secrets.json에 **평문** 저장(`.dev.vars`/`.env`와 동일 수준). NAS 디스크 접근자에게 노출됨 → 추후 암호화(SPEC §2 "암호화 저장").
- 🚧 **(todo) 파일 권한 600**: 리눅스/Docker 배포 시 secrets.json 권한을 소유자 전용으로. (Windows 개발환경에선 미적용)

---

## 9. 의존성 (Depends on)

- `hono`
- git 바이너리
- `sharp` — ✅ 이미지 실포맷 검증, GIF 프레임 판별, WebP 변환
- `packages/shared` (Post/Frontmatter/MediaFile/API contract 타입 공유)

---

## 10. 상태 (Status)

- ✅ 1차: posts CRUD / 발행 빌더 / **git push 실발행(SimpleGitPublisher)** / git pull 감지 / LLM 프록시(서식+slug) / 헬스체크 / **설정·토큰 보관(secrets·settings 라우트, 파일 영속, 키 마스킹)** / **부팅 시 Gemini 키 자동 재로드** / **저자(authors.yml 드롭다운 + author/authors 출력)** / **발행 시각 기준(NAS/기기 시간대)** / **글 삭제·발행취소(GitHub·NAS·로컬 3곳 일치, .trash 보관)**
- ✅ 발행 이미지 안전망: Markdown 이미지 경로 정규화 / NAS 로컬·GitHub 공용 이미지 판정 / 누락 이미지 발행 차단 / 로컬 이미지를 `assets/img/posts/<slug>/`로 복사
- ✅ 이미지 첨부 구현 완료:
  - `POST /api/posts/:slug/media` 업로드
  - `GET /api/posts/:slug/media/:filename` 조회
  - JPEG/PNG/WebP/GIF 실제 형식 검증
  - 원본/WebP 저장 정책
  - 애니메이션 GIF 전체 프레임 보존
  - 한글 등 Unicode 파일명을 NFC로 보존하는 안전한 파일명 정규화
  - 중복 파일명의 `-2`, `-3` suffix 처리
  - 파일 크기·픽셀·프레임 제한
  - 잘못된 이미지 요청 거부
  - 발행 전 누락 이미지 차단
  - Markdown 경로 정규화와 GitHub 미디어 복사
- 🚧 ID/slug 정합성과 date-only 재발행 경로 보강:
  - ID 우선 조회 후 rev 충돌 검사
  - 미발행 글폴더 rename / 발행 글 새 ID fork
  - fork 시 본문·리치 원본·미디어 복사, 기존 발행 이력 제거
  - slug 중복 `slug_taken` 차단
  - 안전한 기존 `githubPath` 재사용
  - date만 변경한 재발행에서 기존 `_posts` 파일명 유지
- 📋 슬롯: 예약발행 스케줄러(인터페이스만) / 미디어 정책 엔진(외부링크 백업·오프로드·워터마크·미사용 파일 정리) / 쇼츠 작업 큐
- 🚧 보안 강화 todo: secrets 평문→암호화, 파일 권한 600 (§8)

---

## 11. 미래 확장 (Future)

- 예약발행 스케줄러 실구현 (쇼츠 예약발행과 통합)
- 이미지 업로드 Blob 오프라인 큐 (desktop storage를 Dexie로 전환한 뒤)
- 미사용 이미지 탐지·정리
- 미디어 정책 엔진: 외부링크 백업 / 깃→NAS 오프로드(용량) / 깨진 링크 자동 복원 / NAS 쿼터
- 쇼츠 작업 큐: 대본생성 → TTS(ElevenLabs) → 영상생성 → 쇼츠 발행 → 본문 링크 삽입 후 포스트 예약발행
- 다중 사용자/다중 블로그 레포 지원
- 충돌 해결(같은 글을 여러 기기서 동시 수정) 정교화

## 🚧 ID 단위 저장 직렬화와 포괄적 충돌 정책

- `Post.id` 조회, 중복 ID 검사, `baseRev` 비교, slug 충돌 검사, 저장·rename·fork 완료까지는 같은 ID에 대해 하나의 직렬화된 저장 작업으로 처리한다.
- rev 검사와 실제 파일 작업 사이에 다른 요청이 끼어들어 두 요청이 모두 같은 rev를 통과하지 않도록 ID 단위 잠금 또는 그와 동등한 직렬화 수단을 사용한다.
- 첫 번째 published-slug fork가 성공하면 원본 글의 본문, slug, NAS 폴더와 GitHub 파일은 그대로 유지한다.
- 이때 원본 글은 `rev`를 1 증가시키고 `publishedRev`를 증가한 `rev`와 맞추며 `updatedAt`을 갱신한다. 원본 내용이 바뀌지 않았으므로 잘못된 “발행 후 수정” 상태가 생기지 않아야 한다.
- fork로 생성된 글은 새 UUID, `rev = 1`, `status = 'draft'`로 시작한다. `githubPath`, `publishedAt`, `publishedRev`, `publishedSlug` 및 예약 발행 정보는 갖지 않는다.
- fork 후 보존된 원본 글은 기존 `publishedSlug`를 유지한다.
- 첫 fork 이후 이전 `baseRev`를 가진 다른 기기의 요청은 `409 version_conflict`로 거절한다.
- rev는 본문, 날짜, front-matter, slug rename, slug fork 및 상태 변경을 포함한 모든 변경을 동일하게 나타낸다.
- 서버와 클라이언트는 rev 증가 이유를 추측하기 위한 `lastMutation` 또는 변경 사유 코드를 추가하지 않는다.
- `version_conflict`의 기본 사용자 메시지는 `다른 기기에서 변경이 있었습니다.`로 통일한다.
- 자동 덮어쓰기나 자동 병합은 하지 않으며, 사용자가 최신본 불러오기 또는 명시적인 덮어쓰기 절차를 선택한다.
