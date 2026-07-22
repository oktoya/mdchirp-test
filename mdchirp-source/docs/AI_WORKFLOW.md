# AI 협업 워크플로우 (AI_WORKFLOW.md)

이 문서는 mdchirp를 AI 채팅(Claude, GPT 등 무엇이든)과 함께 개발할 때
**매 대화 시작 시 따라야 하는 루틴**을 정리한 것이다.
AI는 대화마다 기억이 초기화되므로, 새 모듈을 시작할 때마다
이 문서와 관련 명세를 먼저 주입해 "프로젝트의 일하는 방식"을 복원시킨다.

---

## 0. 프로젝트 한 줄 요약

- 깃허브 블로그(Chirpy) 작성용 마크다운 에디터.
- 단독 개발이지만 여러 PC / 여러 도구(웹·VS Code)에서 작업한다.
- 그래서 **명세(SPEC)와 절차가 협업 상대**다. 명세가 어긋나면 전부 무너진다.

---

## 1. 작업 원칙: Karpathy 가이드라인

모든 코딩·리뷰·리팩터링은 아래 4원칙을 따른다.

1. **Think Before Coding** — 가정을 명시한다. 모호하면 추측하지 말고 질문한다.
   해석이 여러 개면 모두 제시하고, 더 단순한 방법이 있으면 제안한다.
2. **Simplicity First** — 최소 코드만 작성한다. 불필요한 추상화·예외처리·기능 금지.
3. **Surgical Changes** — 요청된 부분만 수정한다. 기존 스타일·포맷을 유지하고,
   변경된 모든 라인은 요청과 직접 연결돼야 한다.
4. **Goal-Driven Execution** — 성공 기준을 먼저 정의하고, 검증될 때까지 반복한다.
   각 단계에 "어떻게 검증할지"를 붙인다.

---

## 2. 명세 업데이트 절차 (가장 중요)

> 이 프로젝트에서 명세(SPEC)는 **진실의 원천(single source of truth)**이다.

- **코드를 짜기 전에**, "수정될 명세 파일 · 수정 위치 · 수정 내용"을 먼저 제시하고
  사람의 합의를 받는다. 합의된 내용만 명세에 반영한다.
- 진행 중 항목은 `🚧`, 완료 항목은 `✅`로 표시한다.
- 모듈 명세에는 "왜 그렇게 결정했는지"(필드 매핑, 엣지 케이스 처리 등)를 남긴다.
- 구현이 끝나면 명세 상태(🚧 → ✅), MANUAL 변경 이력, README 구현 현황을 갱신한다.

---

## 3. 새 모듈 시작 루틴 (체크리스트)

1. **가이드 숙지** — AI에게 §1 Karpathy 가이드라인을 따르겠다는 확인을 받는다.
2. **전역 규칙 파일 제공** — 항상 필요한 컨텍스트:
   - `README.md` (프로젝트 개요 · 구현 현황)
   - `CONTRIBUTING.md` (협업 규칙 · PR/브랜치 · 명세 절차)
   - `SPEC.md` (루트, 아키텍처 · 모듈 지도 · 개발 순서)
   - `docs/MANUAL.md` (만드는 순서 · 설계 의도)
3. **모듈 명세 + 의존 계약 제공** — 추측을 없애기 위해:
   - `packages/core/src/<module>/SPEC.md`
   - `packages/shared/src/ui-contract.ts` (UI 경계 계약)
   - `packages/shared/src/types.ts` 또는 `packages/shared/SPEC.md` (도메인 타입)
   - 연결될 대상 파일 (예: `apps/playground/src/App.tsx`,
     `packages/core/src/index.ts`, 관련 sync 파일 등)
4. **명세 업데이트 합의** — §2 절차대로 구현 전에 명세 변경안을 먼저 확정한다.
5. **구현 → 검증 → 문서 갱신 → 커밋/푸시** (§4, §5 참조).

---

## 4. 개발 진행 방식

- 위험한/검증 안 된 부분을 먼저 한다(목표 주도). 순수 함수 → UI 연동 순서를 선호.
- 큰 작업은 청크로 나눈다. 예: ① 핵심 로직 + 테스트, ② UI 연동 + 플레이그라운드.
- 각 청크 끝에 검증(테스트 통과, `pnpm typecheck`, 플레이그라운드 확인)을 둔다.
- 테스트는 기존 스타일을 따른다(이 프로젝트는 tsx 직접 실행 + 자체 check 헬퍼,
  pass/fail 카운터, 실패 시 `process.exit(1)`). import는 `.js` 확장자 ESM 표기.

---

## 5. 환경 · Git 워크플로우

- 저장소: `C:\mdchirp` (git clone 기반). 원격: github.com/oktoya/mdchirp
- 작업 시작: `git pull`
- 작업 종료: `git add -A` → `git commit -m "..."` → `git push`
- 단독 개발이라 main 브랜치에 직접 작업해도 무방(필요 시에만 브랜치/PR).
- **줄바꿈은 LF로 통일됨.** 루트에 `.gitattributes`(`* text=auto eol=lf`)가 있어
  커밋 시 자동으로 LF로 정규화된다. 에디터도 LF 저장 권장(VS Code: `"files.eol": "\n"`).
- 검증 명령:
  - `pnpm --filter @mdchirp/core test`
  - `pnpm --filter @mdchirp/core typecheck`
  - `pnpm check` (typecheck + lint + prettier 전체)
- 사람이 명령을 실행하는 환경은 **Windows PowerShell**이다.
- Git 조회 명령은 긴 출력이 pager에서 멈추지 않도록 `git --no-pager diff`, `git --no-pager log`, `git --no-pager show` 형태로 제공한다. 전역 Git 설정은 임의로 변경하지 않는다.
- PowerShell 실행 명령은 별도의 “실행할 명령” 코드 블록에만 넣고 예상 출력은 같은 블록에 넣지 않는다.
- 파일을 여는 `code <파일경로>` 명령은 사용하지 않는다. 필요한 파일 내용은 PowerShell로 읽어 사용자에게 요청한다.
- 작업 종료: `git add -A` → `git commit -m "..."` → `git push`
- **작업 완료 시 §7 "보류 중" 목록에서 해당 항목을 제거한다**(완료된 항목이 남아 새 세션을 헷갈리게 하지 않도록).

---

## 6. 개발 순서 (현재 계획)

- ✅ editor / sync (골격)
- ✅ lister (검색·필터·정렬·배지) — 2026-06-25 완료
- ✅ shell (조립 진입점: 레이아웃+배선+단축키, PlatformAdapter 주입) — 2026-06-25 완료
- ✅ settings (섹션 레지스트리 + backend secrets/settings 라우트) — 2026-06-27 완료
- ✅ slug 제안 (제목→영문 slug, Gemini + romanize 폴백) — 2026-06-27 완료
- ✅ 프론트매터 패널 + slug 제안 UI 배선 (Chirpy 필드 GUI, SplitView 소유 접이식) — 2026-06-27 완료
- ✅ desktop (Tauri 셸) — PlatformAdapter(Tauri) + Shell(full) 마운트, Windows 실행 확인 — 2026-06-29 완료
- ✅ Shell 에 settings/lister 정식 배선 — settings pane 실제 렌더, 마운트 시 목록 로드 — 2026-06-30 완료
- ✅ NAS 배포 가이드 (Docker/시놀로지, docs/DEPLOY.md) — 2026-06-30 완료
- ✅ NAS 원클릭 갱신 (deploy key + DSM 작업 스케줄러, nas-update.sh, DEPLOY.md §12) — 2026-07-01 완료
- ✅ GitHub 발행(git push) 실구현 — SimpleGitPublisher(child_process), routes/posts.ts 주입, PAT URL 1회 주입, repo/ 수동 clone(DEPLOY §13) — 2026-07-01 완료
- ✅ NAS 재시작 시 Gemini 키 자동 재로드 (부팅 시 secrets.json 로드, loadSecretsIntoEnv) — 2026-07-01 완료
- ✅ 저자 기능 — authors.yml 드롭다운 + 저자 단일 필드(콤마 복수) + publishBuilder author/authors 출력, 설정 안내 문구 — 2026-07-03 완료
- ✅ 발행 시각 기준(NAS/기기) 선택 + 서버 시간대 반영 (TZ=Asia/Seoul, serverOffset) — 2026-07-03 완료
- ✅ 발행 프론트매터 폼 기준 교체 · 저자 드롭다운 전용화 · slug 정규화(shared/slug.ts, 프론트 onBlur + 백엔드 resolveFilename) — 2026-07-03 완료
- ✅ YAML Frontmatter 이스케이프 누락(4번) 및 Windows Git 백슬래시 경로(6번) 핫픽스 적용 — 2026-07-09 완료
- ✅ 본문 이미지 경로 정규화 및 유실 이미지 발행 차단 구현 — 2026-07-09 완료
- ✅ 이미지 첨부·발행 안전망 — 파일 선택·Drag & Drop·클립보드,
  NAS 업로드·조회, 원본/WebP 설정, 실포맷 검증, 누락 이미지 발행 차단,
  한글 등 Unicode 파일명의 NFC 보존과 중복 suffix 처리
  — 2026-07-12 완료
- ✅ 이미지 설정·크기 편집 — alt·사용자 지정 크기·비율 유지, Markdown 크기 속성 왕복, 리치 이미지 리사이즈 핸들, 기존 이미지 더블클릭 상세 편집·원본 크기 복원·본문 노드 삭제, MD 이미지 미리보기, 리치/MD 독립 토글 — 2026-07-13 완료
- ✅ GitHub → NAS 수동 새로고침 — 사용자 `↻` 요청 시 원격 branch fetch, 표준 날짜형 GitHub-only 글 import, ID·경로 충돌 및 잘못된 frontmatter 진단, 비표준 파일 제외, `media_subpath` 미디어 NAS 가져오기 — 2026-07-22 완료
- ✅ 앱 시작 목록 복원 — 로컬 draft를 먼저 표시하고 NAS 연결 확인 후 NAS 목록 자동 갱신, `Post.id` 기준 결합과 NAS `hasRichSource` 보존 — 2026-07-22 완료
- ✅ 프론트매터 불린 보존 — `pin`/`math`/`mermaid`의 기본 비활성 생략 규칙과 `toc`/`comments`/`render_with_liquid`의 명시적 `false` 저장 규칙 반영 — 2026-07-22 완료
- 🚧 Post ID/slug 정합성과 date-only 재발행 경로 보강 — ID 우선 rev 검사, 미발행 slug rename, 발행 글 slug fork, `postId` 기반 목록·오프라인 큐, 안전한 `githubPath` 재사용, 즉시·예약 재발행의 기존 `_posts` 파일명 유지
- ⬜ prompter / embed

> 순서는 MANUAL의 "만드는 순서" 원칙(가장 위험한 부분부터)에 따라 조정될 수 있다.

---

## 7. 보류 중 (다음 작업에서 이어서 처리)

> 이전 세션에서 의도적으로 미뤄둔 항목. AI는 새 세션 시작 시 이 목록을 먼저 확인하고,
> 관련 작업을 할 때 함께 처리하거나 SPEC/MANUAL 에 반영한다.
> **완료한 항목은 체크만 하지 말고 이 목록에서 제거한다(§5).**

- [ ] secrets.json 암호화 — 현재 평문 저장(.env 동급). backend SPEC §8 참조.
- [ ] secrets.json 권한 600 — 리눅스/Docker 배포 시 적용(Windows 개발환경 제외). backend SPEC §8 참조.
- [ ] MANUAL 파트 A 사용자용 "설정 화면" 절 — 정식 UI(데스크톱 셸 / 리스터·설정 UI) 붙은 뒤 작성.
- [ ] OsDictation 구현 — 현재 BrowserDictation(Web Speech) 1종만. PlatformAdapter.dictation
      주입 통로는 열려 있음. OS받아쓰기/Whisper 어댑터를 구현해 desktop platform 에서 교체.
      desktop/SPEC §7 슬롯 · 루트 SPEC §7 AI 어댑터 표 참조.
- [ ] desktop storage = IndexedDB(Dexie) — 현재 localStorage(길 A, ~5MB 한계). PlatformStorage
      인터페이스 그대로라 구현체만 교체하면 됨(apps/desktop/src/platform/storage.ts).
      desktop/SPEC §7 슬롯 참조.
- [ ] desktop NAS 주소 동적 변경 — Shell·Sync 는 platform prop 변경 시 재구성을 이미 지원함
      (Shell.tsx 의 Sync useEffect 의존성에 platform 포함). 막힌 곳은 desktop/main.tsx 가
      makeDesktopPlatform(NAS_URL) 을 1회만 호출하고 NAS_URL 이 고정 const 라는 점뿐.
      할 일: main.tsx(또는 얇은 래퍼)에서 NAS_URL 을 React state 로 올리고, settings 의
      onSaveDevice(device.nasBaseUrl 변경)를 받아 setState → platform 재생성 → Shell 자동 재구성.
      Shell/Sync/settings 는 손대지 않음(한 파일 변경). playground App.tsx 의 nasUrl state 패턴 참고.
- [ ] desktop 전역 단축키(OS 레벨) — 현재 DOM keydown(앱 포커스 내)만. Tauri global-shortcut
      플러그인으로 OS 전역 단축키는 슬롯. desktop/SPEC §3 참조.
- [ ] NAS 재빌드 없이 갱신 — 현재 원클릭 갱신은 매번 docker compose 재빌드(--build).
      코드만 바뀌면 캐시로 빠르지만, 소스 폴더를 컨테이너에 볼륨 마운트하고 tsx 가
      직접 실행하게 바꾸면 재빌드 없이 재시작만으로 반영 가능. Dockerfile/compose 구조
      변경이라 별도 판단 필요. docs/DEPLOY.md §11/§12 참조.
- [ ] 발행 성공 피드백 UI (프론트) — 백엔드 발행은 `{ ok, status, committed, pushedAt }`
      를 반환하지만, 데스크톱 앱에서 "발행" 을 눌러도 성공/실패 표시(토스트·상태 갱신)가
      없어 눌렸는지 체감이 안 된다. 기능은 정상(GitHub 반영됨). editor/shell UX 과제 —
      발행 응답을 받아 토스트/상태 배지로 표시. (백엔드 변경 불필요)
      · 진행: ✅ 발행/저장/예약 토스트 · ✅ 발행/예약 후 배지 즉시 반영 · ✅ 상태 3종 축소(synced/syncing 제거) · ✅ 발행 후 수정 별표(*발행됨, publishedRev 비교)
      · 초안 별표: 도입하지 않기로 결정(2026-07-07) — 저장 안 한 초안은 리스트에 없는 것이 정상 동작. 표시할 자리(에디터 제목 영역)도 없고, dirty 는 sync 내부 메타로만 유지.
      · 남음: 편집 이탈 저장 확인 다이얼로그
- [ ] 발행 후 GitHub Actions 배포 상태 추적 — push 성공 후에도 Pages 배포(Actions)가 간헐
      실패("Deployment failed, try again later")하는 경우가 있음. 앱이 GitHub API로 최근
      워크플로 run status(success/failure)를 조회 → 실패 시 "블로그 반영 실패, 재실행 필요"
      표시(+가능하면 재실행 트리거). push 자체 실패(첫째 방어선)는 "발행 성공 피드백 UI"
      에서 다루고, 이 항목은 push 이후 인프라 실패(둘째)를 다룸.

- [ ] 프론트매터 패널 날짜 입력 칸 — 발행 빌더의 date 정규화(`normalizePublishDate`,
      `+0900` 직렬화)와 시간대 선택(NAS/기기)은 완료됨. 남은 것은 프론트매터 패널에서
      사용자가 발행 날짜를 **직접 지정**하는 UI(비우면 발행 시각 자동, 지정 시 그 값 사용).
      패널에서 받은 값도 발행 빌더가 시간대 규칙대로 직렬화. 예약발행 publishAt 과 연결.
      관련: FrontmatterPanel / frontmatterForm.

- [ ] 예약발행 스케줄러 실구현 (정규화 선행 필요) — 현재 `POST /api/posts/:slug/schedule`
      은 status=scheduled + publishAt 저장만 하고, **때가 되면 자동 발행하는 로직이 없음**
      (SPEC §5/§10 슬롯). 예약해도 시각이 지나도 영영 안 뜬다("되는 척"). 설계:
      · **공통 함수 `publishDueScheduled()`** — scheduled 글 중 publishAt 이 지난 것을
        발행 빌더로 넘김. 아래 세 경로가 전부 이 함수 1개를 호출(어댑터 철학).
      · **A/B 모드 선택(설정)** — NasSettings 에 `scheduler.mode: 'internal'|'external'`
        추가, **기본 internal**(추가 설정 없이 바로 동작). internal=백엔드 내부 타이머
        (setInterval)로 주기 실행. external=타이머 OFF, DSM 등 외부 스케줄러가
        **`POST /api/publish/due`** 를 주기 호출(QNAP/unraid/일반서버 이식성 위해 A 유지).
        due 엔드포인트는 두 모드 다 열어둠(수동 트리거 겸용). 외부 노출 주의(localhost
        제한 또는 토큰).
      · **★ 부팅 시 밀린 예약 훑기** — 컨테이너 재시작 공백(예: 2:58 재시작→3:05 기동)에
        예약 시각(3:00)이 끼면 단순 타이머는 영영 못 잡는다. 그래서 타이머 켜기 전에
        `publishDueScheduled()` 를 1회 실행해 "이미 지난 것" 을 회수(loadSecretsIntoEnv
        와 같은 부팅 로직 위치). external 모드도 다음 DSM 호출 때 자동 회수됨.
      · **중복 발행 방지** — 발행 성공 즉시 status scheduled→published 로 전환하면 다음
        스캔에서 제외돼 자연 해결. 실행 겹침이 걱정되면 간단한 락 추가(walking skeleton
        단계엔 status 전환으로 충분).
      전제: 예약발행도 즉시발행과 동일한 안전한 `githubPath` 재사용 및 date-only 파일명
      유지 규칙을 사용해야 한다. 예약발행 스케줄러 자체 구현은 별도 작업으로 유지한다.

- [ ] UI 테마 시스템 + 노턴 커맨더풍 블로그 연동 테마 — 참고 블로그:
      https://oktoya.net (누락 금지). 현재 디자인을 즉시 교체하지 않고 이미지 첨부 작업
      완료 후 별도 UX 작업으로 진행한다. 색상·폰트·간격·테두리를 CSS 디자인 토큰으로
      정의하고 `data-theme` 또는 최상위 class로 전환 가능하게 한다. 방향은 짙은 남색/검정
      배경, 청록·파랑 포인트, 고대비 텍스트, 모노스페이스 및 좌우 패널 구성이며,
      접근성·반응형을 유지한다. 구현 순서는 레퍼런스 수집 → 디자인 토큰 정의 →
      기존 하드코딩 색상 이전 → Shell → editor → lister → settings → modal/toast 적용 →
      Windows Tauri 및 좁은 화면 검증이다.

- [ ] 소프트 잠금 — "다른 기기에서 편집 중" 배지 (root SPEC §6-1 2차). NAS 본문 로드(완료,
      B-99 추가 23)는 열 때 rev 를 대조해 "저장된 새 버전"을 확인시키지만, rev 는 저장돼야
      오르므로 "지금 누가 열어서 편집 중"인지는 감지 못 한다. 글 열 때 NAS 에 lockedBy 를
      찍고 만료시간을 두어, 다른 기기가 열 때 "○○에서 편집 중" 배지(강제 차단 X)를 띄우는
      기능. backend lock 라우트 + Post.lockedBy 필요.

- [ ] Post ID/slug 정합성과 date-only 재발행 경로 보강 — `Post.id`는 영구 정체성,
      `slug`는 현재 NAS 폴더·공개 URL 위치, `rev`는 같은 ID의 저장 버전,
      `githubPath`는 해당 ID에 귀속된 마지막 GitHub 발행 파일 경로로 취급한다.
      `publishedSlug`는 마지막으로 실제 발행된 slug이며 발행 취소 후에도 이력 정보로 보존한다.
      · date만 변경: 같은 ID·slug·NAS 폴더·githubPath를 유지하고 기존 `_posts` 파일의
        front-matter date를 갱신한다. 새 `_posts` 파일을 만들지 않는다.
      · 현재 `status='draft'`인 글의 slug 변경: ID와 rev 계보를 유지하고
        `posts-src/<old-slug>/` 전체를 새 slug 폴더로 이동한다.
      · 현재 `status='published'`인 글의 slug 변경: rev 검사를 먼저 통과한 뒤 기존
        ID·NAS 폴더·GitHub 파일을 보존하며, 새 ID의 draft 폴더로 본문·`.source`·media를
        복사한다. 새 fork는 `publishedSlug`를 상속하지 않고, 보존된 원본은 기존
        `publishedSlug`를 유지한다.
      · 발행 취소: `githubPath`·`publishedAt`·`publishedRev`는 제거하되 `publishedSlug`는
        이력 정보로 보존한다. 저장 후 최신 Post를 응답으로 반환하고, 클라이언트는 최신 rev로
        로컬 `post.rev`와 `baseRev`를 즉시 동기화한다. Git 삭제 변경이 이미 없으면
        `committed:false`인 멱등 성공으로 처리한다. 이후 `status='draft'` 상태에서 slug를
        변경하면 같은 ID로 rename한다.
      · 새 slug를 다른 ID가 사용 중이면 `slug_taken`, 같은 ID가 여러 폴더에 있으면
        `duplicate_post_id`로 중단한다.
      · 목록 결합·글 열기·오프라인 큐는 slug가 아니라 ID를 우선하며, 큐는 `postId`로
        최신 봉투와 현재 slug를 찾는다.
      · 기존 `githubPath`는 Windows 백슬래시를 `/`로 정규화한 뒤 `_posts` 아래의 단일
        Markdown 파일인지 검증한다. 절대경로·경로 탈출·하위 디렉터리는 거부하고
        검증 실패 또는 경로 부재 시에만 `resolveFilename(slug, date)`로 계산한다.
      · 즉시발행과 예약발행은 같은 파일명 결정 규칙을 사용한다.
- [ ] 이미지 회귀 테스트 확대 — 리치↔MD 왕복, 새로고침 후 크기 유지,
      GIF 원본/WebP, 오프라인 첨부 실패, 잘못된 형식 거부를 자동 검증.

---
