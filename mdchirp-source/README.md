# mdchirp

GitHub Pages + Jekyll(Chirpy) 블로그를 위한 **로컬 우선(local-first) 리치 에디터 + 발행 도구**.

> 현재 단계: **1차 MVP 관통 완료.** PC 데스크톱 앱에서 글 작성 → NAS 저장 →
> GitHub 실발행(git push)까지 실제 동작. 이후는 UX 개선·확장(슬롯) 단계.

## 개요
- **목표**: Markdown을 손으로 다루지 않고 리치 에디터로 블로그 글을 쓰고, NAS로 동기화하고, NAS가 GitHub에 발행한다.
- **데이터 흐름**: 기기(작성/임시저장) → NAS(저장/진실원) → GitHub(발행)
- **원소스 멀티유즈**: React 코어를 Tauri 데스크톱앱 / 블로그 팝업이 공유.

## 핵심 결정 (확정)
- 데이터 모델: 하이브리드 3-tier, 진실원 = NAS, 발행 주체 = NAS만
- 스택: React+TS+Vite+TipTap / Tauri 2.0 / Node+Hono(Docker) / IndexedDB(Dexie)
- 저장 구조: NAS는 글폴더 묶음, 발행 시 Chirpy 표준(`_posts/*.md` + `media_subpath`)으로 변환 (검증됨)
- 동시 수정: rev 버전 충돌 감지 + `.history` 보관(1차), 소프트 잠금 배지(2차), CRDT(먼 미래)
- AI: 서식제안/slug제안/받아쓰기 = 어댑터, 키는 NAS에만(프록시)

## 문서 지도
- `SPEC.md` — 전체 시스템 (원칙/흐름/저장구조/모듈지도/MVP)
- `CONTRIBUTING.md` — **기여 가이드**(셋업/아키텍처/모듈 시작 절차/PR 규칙). **협업 시작 전 필독.**
- `docs/MANUAL.md` — **매뉴얼**(사용자 설명서 + 개발 일지/설계 의도). 개발과 함께 갱신.
- `packages/shared/` — 공유 타입(`src/types.ts`) + SPEC
- `packages/core/` — 코어 개요 + 모듈들
  - `src/editor/SPEC.md` 에디터 · `src/lister/SPEC.md` 리스터 · `src/settings/SPEC.md` 설정
  - `src/sync/SPEC.md` 동기화 · `src/shell/SPEC.md` 본체 · `src/prompter/SPEC.md` 쇼츠(슬롯)
- `apps/desktop/SPEC.md` — Tauri 앱(1차) · `apps/backend/SPEC.md` — NAS 백엔드 · `apps/embed/SPEC.md` — 팝업(슬롯)
- `apps/playground/` — 에디터 검증·데모용 Vite 앱(MVP 산출물 아님). `pnpm dev:playground`

## 구현 현황
- ✅ **백엔드 walking skeleton** (`@mdchirp/backend`) — 폴더-당-글 저장, rev 충돌(409), 발행 빌더. 테스트+HTTP 검증.
- ✅ **에디터 1차** (`@mdchirp/core`) — TipTap 기본 서식, MD **양방향 편집**(round-trip+idempotent 24케이스 통과), TipTap풍 툴바(드롭다운), 분할뷰(저장/발행 소유), BrowserDictation. 플레이그라운드로 검증.
- ✅ **이미지 첨부·편집** — 파일 선택·Drag & Drop·클립보드 붙여넣기를 단일 업로드 흐름으로 통합.
  NAS 원본/WebP 저장, 이미지별 형식 선택, 삽입 전 alt·크기·비율 설정, Markdown 크기 속성 왕복,
  리치 이미지 비율 유지 리사이즈 핸들, 더블클릭 상세 편집, 기존 이미지 alt·숫자 크기 수정,
  원본 크기 복원, 본문 이미지 노드 삭제, MD 이미지 미리보기, 발행 전 누락 이미지 차단까지 검증.
- ✅ **sync 레이어** (`@mdchirp/core/sync`) — 에디터 ↔ NAS 실제 연결. `HttpAdapter`/`LocalStorageAdapter` 주입식, `NasClient`(409=결과), `Sync`(local-first + 오프라인 큐 + 충돌/연결 이벤트). 라이브 백엔드 통합테스트 18/18. 플레이그라운드 저장/발행이 실제 NAS로 감.
- ✅ **서식제안 + NAS Gemini 프록시** (B 모드) — 키 없으면 비활성, 키 드롭인 시 코드 변경 0으로 활성화. 제안은 diff 카드로 사람이 수락(자동 적용 금지).
- ✅ **협업 인프라** — ESLint/Prettier, 표준 `pnpm check`, GitHub Actions CI(typecheck/lint/format/unit + 통합), CONTRIBUTING/PR 템플릿, MIT 라이선스.
- ✅ **lister 모듈** (`@mdchirp/core/lister`) — 글 목록/검색/필터/정렬 + 상태 배지(5종)
  + external 점선. 순수함수(selectPosts/statusBadge) 23 테스트, playground 검증.
- ✅ **shell 모듈** (`@mdchirp/core/shell`) — 모듈 배치/전환 그릇. `PlatformAdapter` 주입만으로
  sync/받아쓰기/서식제안 구성(변환 어댑터 경유, core 가 fetch/IndexedDB 직접 호출 0), lister↔editor 전환,
  전역 단축키(등록/해제), 온라인·충돌 상태표시. 변환 어댑터+단축키 단위테스트, playground 에 Shell 탭으로 검증.
- ✅ **settings 모듈** (`@mdchirp/core/settings`) — 연결/GitHub/AI키/에디터/받아쓰기/제안 설정 +
  섹션 레지스트리(ready/partial/slot 3단계). 순수함수(mergeDevice/buildNasPatch/normalizeIdleMin/submitSecret)
  테스트, playground `설정` 탭 검증. backend secrets/settings 라우트와 이미지 저장 형식 설정의 실제 소비까지 연결.
- ✅ **slug 제안** (`@mdchirp/core` + backend) — 제목→영문 slug 후보(Gemini, 영문 번역), `normalizeSlug` 정규화 + 키 없으면 제목을 정리해 그대로 사용(음역 안 함).
- ✅ **프론트매터 패널** (`@mdchirp/core/editor/frontmatter`) — Chirpy 전 필드 GUI(접이식 가로 영역, SplitView 소유) + 영문 slug 제안 버튼(후보 제시→사람 선택). 순수변환(frontmatterForm) 28 테스트, playground 검증.
- ✅ **desktop 셸** (`@mdchirp/desktop`) — Tauri 2.0 PC 앱. core `<Shell mode="full" />` 마운트 +
  Tauri용 PlatformAdapter(storage=localStorage/http=fetch/단축키=DOM/formatter·slug·dictation 주입).
  비즈니스 로직 0(전부 core). Windows 실행 확인. (storage Dexie·OS받아쓰기·OS전역단축키는 슬롯)
- ✅ **GitHub 발행(git push)** (`@mdchirp/backend`) — `SimpleGitPublisher`(child_process 로
  git add/commit/push). PAT 는 push URL 에 1회 주입(디스크 미저장), 대상 레포/브랜치는
  settings, 커밋 저자는 `-c` 주입. `repo/` 최초 1회 수동 clone(DEPLOY §13). 앱 발행으로
  실제 GitHub 반영 검증. **1차 MVP(PC앱→NAS저장→GitHub발행) 관통 완료.**
- 🚧 빈 슬롯(협업 분담): prompter · embed.

### 로컬 실행 / 검증 (표준 명령)
```bash
nvm use && corepack enable && pnpm install   # Node 20 + pnpm 9
pnpm check                                   # typecheck + lint + format + 단위테스트 (한 방)
pnpm dev:backend                             # NAS 백엔드(8787)
pnpm test:integration                        # sync 통합테스트 18케이스 (백엔드 먼저 띄울 것)
pnpm dev:playground                          # 브라우저 데모(3000)
```
자세한 명령·절차는 `CONTRIBUTING.md` 참고.

## 1차 MVP 범위
PC앱에서 글 작성 → NAS 저장 → GitHub 발행 한 흐름 관통.
포함: 에디터/MD분할뷰/로컬저장·오프라인/리스터·검색/설정/발행빌더/외부변경감지/받아쓰기(WebSpeech)/서식제안(Gemini).
슬롯: 모바일/팝업/쇼츠/고급 미디어정책(외부링크 백업·오프로드·워터마크·미사용 이미지 정리)/문법검사.

## 다음 단계
1차 MVP와 이미지 첨부·기존 이미지 상세 편집 흐름은 완료됐다. 다음 단계는
예약발행 스케줄러, 외부 글 가져오기, 미사용 이미지 정리, 고급 미디어 정책,
prompter/embed 등 후속 UX·확장 작업이다.
