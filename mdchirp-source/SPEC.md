# mdchirp — 시스템 명세 (Root SPEC)

> 이 문서는 mdchirp 전체를 한눈에 이해하기 위한 최상위 명세입니다.
> 각 모듈의 상세는 해당 폴더의 `SPEC.md`를 참조하세요.
> 원칙: **이 문서만 읽어도 시스템 전체 그림과 경계가 이해되어야 한다.**

---

## 1. 목적 (Why)

GitHub Pages + Jekyll(Chirpy) 블로그에 글을 쓸 때 Markdown을 직접 손으로 다루는 번거로움을 없앤다.
**리치 에디터로 쓰고, 로컬에 저장하고, NAS로 동기화하고, NAS가 GitHub에 발행한다.**
나아가 글 내용으로 유튜브 쇼츠를 만들어 함께 예약발행하는 것까지 구조적으로 준비한다.

한 문장: **"내가 실제로 쓰는, 오프라인에서도 동작하는, 나만의 블로그 글쓰기 도구."**

---

## 2. 핵심 원칙 (Principles)

1. **Local-first** — 작성/임시저장은 항상 기기 로컬에서. 네트워크가 끊겨도 글쓰기·저장에 문제가 없어야 한다.
2. **Single source of truth = NAS** — 기기 간 동기화의 기준은 NAS다.
3. **발행은 NAS만** — GitHub 커밋 권한(토큰)은 NAS에만 둔다. 기기/팝업엔 없다. (공격 표면 최소화)
4. **One source, multi use** — 코어(React)를 한 번 만들고 데스크톱앱/모바일/블로그 팝업이 공유한다.
5. **모듈은 props in / events out** — 모듈은 인터페이스로만 소통. 저장·동기화·네트워크는 직접 하지 않고 서비스 레이어에 위임한다.
6. **AI는 어댑터로** — 받아쓰기(STT)·서식 제안(LLM)·쇼츠(TTS/영상) 같은 AI 기능은 코어에 박지 않고 교체 가능한 어댑터로 둔다.
7. **자동 적용 금지** — AI가 생성한 변경(서식 제안 등)은 절대 자동으로 원문을 덮어쓰지 않는다. 항상 제안 → diff 미리보기 → 사용자 수락.
8. **점진적 확장 (autonomy slider)** — 1차는 최소 코어만 동작시키고, 나머지는 인터페이스/슬롯만 비워둔다.

---

## 3. 데이터 흐름 (3-tier)

```
[작성/임시저장]        [글 저장]              [발행]
   기기 로컬     →      NAS 기록      →      GitHub 커밋
  (오프라인 OK)      (동기화 진실원)        (NAS만 수행)

┌─────────────────────────────────────────────┐
│  기기 (PC앱 / 모바일 / 블로그팝업) = 같은 코어  │
│  - TipTap 에디터 / 리스터 / 설정 / 프롬프터    │
│  - 로컬 임시저장 (IndexedDB, 오프라인 OK)      │
│  - 동기화 큐                                  │
└───────────────┬─────────────────────────────┘
                │ HTTP API (저장/조회/발행 요청)
                ▼
┌─────────────────────────────────────────────┐
│  NAS 백엔드 (Node+Hono, Docker) = 허브         │
│  - 글 데이터 저장 (글폴더 구조)                │
│  - 발행 빌더: 글폴더 → Chirpy 표준구조 변환     │
│  - GitHub 커밋/풀 (발행 & 외부변경 감지)        │
│  - 토큰 보관 (GitHub, Gemini 등)               │
│  - LLM 프록시 (서식 제안)                      │
│  - (나중) 쇼츠 작업 큐                          │
└───────────────┬─────────────────────────────┘
                │ git push / pull
                ▼
┌─────────────────────────────────────────────┐
│  GitHub (Jekyll Chirpy 레포) = 외부 공개        │
└─────────────────────────────────────────────┘

(선택) Cloudflare = 블로그→NAS 연결용 얇은 터널. 데이터 저장 안 함.
```

---

## 4. 저장 구조 (검증 완료)

> Chirpy에서 실제 테스트로 확정: 글 본문은 `_posts/*.md`에 두고 `media_subpath`로 이미지를 `assets/`에서 불러온다.
> 글폴더 묶음은 **NAS 작업공간에서만** 유지하고, 발행 시 표준 구조로 펼친다.

```
[NAS 작업공간 — 사람이 보기 편한 글폴더 묶음]
posts-src/2026-06-19-hello/
├── .source/tiptap.json          ← 리치 원본 (커밋 제외)
├── post.md                       ← 본문 (작업용)
├── meta.json                     ← 상태/예약/미디어정책
└── media/
    ├── cover.png
    └── sample.png

         │ NAS 발행 빌더가 커밋 시 펼침(변환)
         ▼
[GitHub — Chirpy 표준 구조]
_posts/2026-06-19-hello.md         ← 본문만 (media_subpath 주입됨)
assets/img/posts/2026-06-19-hello/ ← 미디어
├── cover.png
└── sample.png
```

**slug·발행 경로 규칙:**

- `Post.slug`는 NAS 작업폴더명과 미디어 폴더명에 사용한다.
- NAS의 source slug에는 날짜 접두사가 없어도 된다.
  - 예: `hope-mother-fucker`
  - NAS 작업폴더: `posts-src/hope-mother-fucker/`
  - 미디어 경로: `/assets/img/posts/hope-mother-fucker/`
- GitHub에 처음 발행할 때는 발행 날짜를 붙여 Chirpy 표준 파일명을 만든다.
  - 예: `_posts/2026-07-17-hope-mother-fucker.md`
- 이미 발행된 글은 안전하고 표준 날짜형인 기존 `githubPath`를 재사용한다.
- frontmatter의 `date`만 변경하여 재발행해도 기존 `githubPath`는 자동 변경하지 않는다.
- `_posts/hope-mother-fucker.md`처럼 날짜 접두사가 없는 GitHub 파일은 정상 포스트 자동 병합 대상에서 제외한다.

**커밋 제외:** `.source/`(리치 원본), `meta.json`은 GitHub에 올라가지 않는다.
리치 원본(`.source/tiptap.json`)의 존재 여부가 곧 `hasRichSource` 판정 기준이다.

### 글 정체성과 slug 변경 (🚧 구현 예정)

- `Post.id`는 글의 영구 정체성이고, `slug`는 그 글의 현재 NAS 작업폴더 위치이자 공개 URL 이름이다.
- 저장·목록 결합·오프라인 큐·동시 수정 판정은 `id`를 우선하고, `slug`는 현재 위치를 찾는 locator로 사용한다.
- **발행 이력이 없는 글의 slug 변경**은 같은 글의 이름 변경이다.
  - `id`와 `rev` 계보를 유지한다.
  - `posts-src/<기존-slug>/` 글폴더 전체를 `posts-src/<새-slug>/`로 이동한다.
  - 본문, `.source/`, `media/`, `.history/`도 함께 이동한다.
- **현재 발행 중인 글의 slug 변경**은 기존 발행본을 보존한 새 글 fork다.
  - fork 판정은 저장 전 NAS Post의 `status === 'published'` 여부를 기준으로 한다.
  - 기존 ID·NAS 글폴더·GitHub 파일은 변경하지 않는다.
  - 새 ID와 새 글폴더를 만들고 본문·리치 원본·미디어를 복사한다.
  - 새 글은 `githubPath`/`publishedAt`/`publishedRev`/`publishedSlug`/기존 예약을 물려받지 않는 draft로 시작한다.
- 발행 성공 시 현재 slug를 `publishedSlug`에 기록한다.
- 발행 취소 시 `githubPath`/`publishedAt`/`publishedRev`는 제거하지만 마지막 실제 발행 slug인 `publishedSlug`는 이력 정보로 보존한다.
- 발행 취소 응답은 저장 후 최신 NAS `Post`를 포함한다. 클라이언트는 응답의 최신 `rev`로 로컬 `post.rev`와 `baseRev`를 즉시 동기화하여 다시 열 때 잘못된 stale/conflict가 발생하지 않게 한다.
- Git 삭제 대상이 이미 없어 commit할 변경이 없는 경우에도 발행 취소는 멱등 성공이며 `committed:false`로 반환한다.
- 발행 취소되어 `status === 'draft'`가 된 글의 slug 변경은 `publishedSlug`가 남아 있어도 같은 ID와 rev 계보를 유지한 폴더 rename으로 처리한다.
- 새 slug가 다른 글에 사용 중이면 자동 덮어쓰기나 suffix 부여 없이 `slug_taken`으로 중단한다.
- slug 변경 전에 ID로 NAS 최신본을 찾고 `baseRev`를 비교한다. 다른 기기의 저장이 먼저 반영됐으면 rename/fork하지 않고 `409 version_conflict`를 반환한다.
- **date만 변경하는 재발행**은 같은 ID·slug·NAS 글폴더·`githubPath`를 유지한다. Markdown frontmatter의 date만 갱신하며 새 날짜의 `_posts` 파일을 만들지 않는다.

### 목록 시작과 GitHub 수동 새로고침 🚧

**앱 시작:**

- 앱 시작 시에는 로컬 draft와 NAS `posts-src` 목록만 읽는다.
- 앱 시작 과정에서는 GitHub fetch, pull, API 조회를 실행하지 않는다.
- GitHub 네트워크 장애가 앱 시작이나 NAS 글 편집을 막아서는 안 된다.

**사용자 수동 새로고침:**

- GitHub 동기화는 사용자가 목록의 새로고침 버튼을 눌렀을 때만 실행한다.
- NAS backend는 원격 branch를 fetch한 뒤 fetch된 원격 commit tree의 `_posts`를 읽는다.
- 새로고침은 repo 작업 트리를 checkout, pull 또는 rebase하지 않는다.
- 정상 날짜형 GitHub-only 포스트는 NAS 작업공간으로 가져온다.
- 가져온 글에는 `Post.id`, `githubPath`, `rev`를 기록한다.
- GitHub-only 글에 `mdchirp_id`가 있으면 해당 문자열을 `Post.id`로 사용한다.
- `mdchirp_id`가 없으면 새 UUID를 생성하고 다음 발행 시 frontmatter에 기록한다.
- GitHub refresh 실패 시 기존 NAS·로컬 목록을 유지하며 원격 글을 `missing`으로 오판하지 않는다.
- 같은 GitHub commit을 다시 새로고침해도 동일한 NAS 글폴더를 중복 생성하지 않는다.

**GitHub 포스트 파일 판별:**

- 자동 병합 대상은 `_posts/YYYY-MM-DD-<slug>.md` 형식의 파일이다.
- 날짜형 파일은 UTF-8 BOM을 제거한 뒤 첫 frontmatter 경계와 YAML을 검사한다.
- 날짜 형식이 아닌 `_posts/*.md` 파일은 일반 목록과 자동 import에서 제외하고 별도 진단 목록에만 기록한다.
- 비표준 파일은 새로고침 중 내용을 읽거나 자동 rename·commit·delete하지 않는다.
- 날짜형이지만 frontmatter가 잘못된 파일은 자동 import하지 않고 빨간 오류 진단 행으로 표시한다.

**자동 매칭 우선순위:**

1. `mdchirp_id` 일치
2. 기존 NAS `githubPath`와 원격 경로 일치
3. 둘 다 일치하지 않으면 GitHub-only
4. 제목·날짜·본문 유사도는 자동 연결에 사용하지 않음

---

## 5. 모듈 지도 (Module Map)

| 모듈 | 위치 | 역할 | 1차 상태 |
|------|------|------|:-------:|
| **shell** (본체) | `packages/core/src/shell` | 모듈을 담는 레이아웃. 얇다. | ✅ |
| **editor** (에디터) | `packages/core/src/editor` | TipTap 리치에디터 + MD 분할뷰 + 받아쓰기 + 서식제안 | ✅ |
| **lister** (리스터) | `packages/core/src/lister` | 글 목록/검색/상태 표시 | ✅ |
| **settings** (설정) | `packages/core/src/settings` | NAS 연결, 토큰/키, 미디어 정책 등 | ✅ |
| **prompter** (프롬프터) | `packages/core/src/prompter` | 쇼츠 생성(대본→TTS→영상→예약발행) | 📋 슬롯 |
| **sync** (동기화) | `packages/core/src/sync` | 로컬저장 + 동기화 큐 + NAS API 클라이언트 (UI 없음) | ✅ |
| **shared** (공유) | `packages/shared` | Post/Frontmatter 등 타입, API 계약 | ✅ |

**배포 타겟 (얇은 껍데기):**

| 타겟 | 위치 | 역할 | 1차 상태 |
|------|------|------|:-------:|
| **desktop** | `apps/desktop` | Tauri 2.0 앱 (1차 PC) | ✅ |
| **backend** | `apps/backend` | NAS 백엔드 (Node+Hono, 발행 빌더, LLM 프록시) | ✅ |
| **embed** | `apps/embed` | 블로그 팝업 위젯 (단축키 w) | 📋 슬롯 |

범례: ✅ 구현·검증 완료 / 🚧 구현 진행 중 / 📋 슬롯만 준비

---

## 6. 핵심 데이터 모델 (요약)

> 정식 정의는 `packages/shared/SPEC.md` 및 `packages/shared/src/types.ts`.

- **Post** — 글 한 편. **`id`(영구 정체성)**, `slug`(현재 NAS 폴더/URL 위치), `tiptapJson`(리치 원본), `markdown`(발행용), `frontmatter`(Chirpy), `media[]`, `status`, `hasRichSource`, **`rev`(같은 ID의 버전)**, `githubPath`(그 ID의 기존 GitHub 발행 파일), `publishedSlug`(발행 취소 후에도 보존되는 마지막 실제 발행 slug), **`lockedBy`(소프트 잠금)**.
- **ChirpyFrontmatter** — title/date/categories(≤2)/tags(소문자)/description/author(s)/pin/math/mermaid/toc/comments/image/media_subpath/render_with_liquid.
- **PostStatus** — `draft` / `scheduled` / `published`. (syncing/synced 는 §추가19에서 제거)
- **MediaFile** — type/origin(local|external)/externalUrl/nasPath/gitPath/isBroken.
- **MediaPolicy** — 이미지 원본/WebP 저장 형식과 Unicode 파일명 보존을 구현 완료했다. 한글을 포함한 Unicode 문자·숫자는 NFC로 정규화해 보존하고, 위험 문자만 안전하게 치환하며, 중복 파일명에는 suffix를 붙인다.
  외부링크 백업, Git→NAS 오프로드, 깨진 링크 복원, NAS 쿼터,
  워터마크와 미사용 이미지 정리는 후속 슬롯.
- **EditLock / HistoryEntry** — 동시 수정 대비 (8절 참조).

## 6-1. 동시 수정 정책 (Concurrent Editing)

> 혼자 쓰는 도구라도 여러 기기를 오가므로 충돌은 발생한다. 모델은 **지금 박고**, 구현은 단계적.
> 원칙: 잠금이 아니라 **버전 충돌 감지**가 1차 방어선 (오프라인에서도 깨지지 않음).

- **1차 (구현):** **rev 버전 충돌 감지 + 히스토리 보관**
  - 글 열 때 `rev` 기억 → 저장 시 `baseRev` 동봉 → NAS의 현재 rev와 다르면 `409 Conflict`.
  - 충돌 시 패자 내용을 `.history/`에 보관(절대 유실 X) 후, 사용자가 "최신 불러오기 / 덮어쓰기 / 병합보기" 선택.
  - 🚧 slug가 변경돼도 같은 글은 `id`로 NAS 최신본을 찾은 뒤 rev를 비교한다. 예전 slug를 가진 다른 기기의 저장이 새 글로 부활하면 안 된다.
  - 🚧 원격과 로컬 slug가 다른 충돌에서 "내 것으로 덮어쓰기"를 선택하면 로컬 slug까지 포함해 전체 Post를 덮어쓰며, 실행 전에 NAS 폴더가 로컬 slug로 돌아간다는 경고를 표시한다.
  - 🚧 같은 ID가 여러 NAS 글폴더에서 발견되면 임의로 하나를 선택하지 않고 `duplicate_post_id`로 중단한다.
- **2차 (슬롯):** **소프트 잠금 배지** — 글 열면 `lockedBy` 설정, 다른 기기는 "○○ 편집 중" 배지 표시(강제 차단 X, 만료시간 有).
- **3차 (먼 미래):** 실시간 협업(CRDT) — 단독 사용 시 사실상 불필요.

---

## 7. AI 어댑터 계층 (교체 가능)

| 어댑터 | 인터페이스 | 1차 구현 | 슬롯 |
|--------|-----------|----------|------|
| 받아쓰기 | `DictationProvider` | Web Speech API | OS받아쓰기 / Whisper로컬 / 클라우드STT |
| 서식 제안 | `Formatter` | LlmFormatter(Gemini Flash, NAS 프록시) | RuleFormatter(오프라인 폴백) / OpenAI |
| 영문 slug 제안 | `SlugSuggester` | LlmSlugSuggester(Gemini, NAS 프록시) | 오프라인 음역(romanize) 폴백 |
| 문법검사(다국어) | `Linter` | — | 클라우드/로컬 문법검사 (슬롯) |
| 쇼츠 | (prompter SPEC) | — | TTS(ElevenLabs) / 영상생성 / 예약발행 |

> 워터마크는 AI 어댑터가 아니라 **발행 후처리**다. 원본(media/)은 보존하고, NAS 발행 빌더가 사본에 합성한다. 정책은 settings, 실행은 backend.

**키 보관 원칙:** 모든 외부 API 키(GitHub, Gemini 등)는 **NAS에만** 저장. 기기는 NAS를 프록시로 호출.

---

## 8. 기술 스택

| 레이어 | 선택 |
|--------|------|
| 코어 UI | React + TypeScript + Vite |
| 에디터 | TipTap (ProseMirror) |
| 데스크톱/모바일 | Tauri 2.0 |
| 로컬 저장 | IndexedDB (Dexie) |
| NAS 백엔드 | Node + Hono, Docker |
| 모노레포 | pnpm workspace |
| 블로그 팝업 | 코어를 IIFE 번들로 임베드 (나중) |

---

## 9. 1차 MVP 범위 (Walking Skeleton)

**목표: PC 데스크톱 앱에서 글을 써서 → NAS 저장 → GitHub 발행까지 한 번 관통한다.**

포함:
- TipTap 에디터로 글 작성 (기본 서식/목록/인용/코드블록/링크/이미지)
- MD 분할뷰 (리치 ↔ MD 동시 확인)
- 로컬 임시저장 (IndexedDB) + 오프라인 동작
- NAS 저장 (동기화 큐)
- 리스터: 글 목록 + 상태 배지(발행됨/발행전 구분)
- 설정: NAS 주소, GitHub 토큰(NAS에 저장)
- 발행: NAS가 글폴더 → Chirpy 구조로 펼쳐 커밋
- 외부 변경 감지: NAS가 git pull → 리스터에 반영
- 받아쓰기: Web Speech API 1종
- 서식 제안: LlmFormatter(Gemini) + diff 수락 UI

제외(슬롯만):
- 모바일 빌드 / 블로그 팝업(embed) / 쇼츠(prompter)
- 미디어 정책 엔진(백업/오프로드/복원) — 인터페이스만
- 다국어 문법검사 — 인터페이스만(서식제안과 유사 계층)

---

## 10. 미래 확장 (Future)

- 모바일 빌드 (Tauri mobile)
- 블로그 팝업 위젯 + 단축키(w) + Cloudflare 터널
- 쇼츠 파이프라인: 대본 → TTS(ElevenLabs) → 영상 → 쇼츠 예약발행 → 본문에 링크 삽입 후 포스트 예약발행
- 미디어 정책 엔진 (깃 용량 관리, 깨진 링크 복원)
- 다국어 문법 검사
- 추가 LLM/STT 프로바이더
- 반응형(모바일): 좁은 화면에서 Lister 사이드를 햄버거로 접고/펴기 + TopBar 에 로그/패널 토글.
  `mode` 분기 아님 — CSS 미디어쿼리 + 토글 상태로 처리(§2.5 "로직 분기 최소화"). shell 내부 책임이라 모듈 계약 불변.
- (editor 과제, shell 아님) SplitView 의 듀얼 편집창 모바일 대응(위아래 스택 또는 탭 전환).
