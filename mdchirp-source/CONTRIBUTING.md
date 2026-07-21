# mdchirp 기여 가이드

함께 만들어 주셔서 감사합니다. 이 문서는 **여러 명이 모듈을 나눠 개발**할 때
충돌 없이 협업하기 위한 최소 규칙입니다.

---

## 1. 시작하기 (Setup)

```bash
# Node 20 + pnpm 9 필요 (.nvmrc 참고)
nvm use            # → 20
corepack enable    # pnpm 9.15.9 자동 사용
pnpm install

# 전체 검사 한 방
pnpm check         # typecheck + lint + format:check + unit test
```

| 명령 | 하는 일 |
|------|---------|
| `pnpm typecheck` | 전 패키지 타입 검사 |
| `pnpm lint` | ESLint (에러만 차단 — CI 기준) |
| `pnpm lint:strict` | ESLint (경고 0 강제 — 성숙 후 목표) |
| `pnpm lint:fix` | 자동 수정 |
| `pnpm format` | Prettier 적용 |
| `pnpm test` | 단위 테스트 (백엔드 불필요) |
| `pnpm test:integration` | sync 통합 테스트 (**백엔드 8787 먼저 띄워야 함**) |
| `pnpm dev:backend` | NAS 백엔드 개발 서버 |
| `pnpm dev:playground` | 검증/데모 앱 |
| `pnpm check` | 위 정적 검사 + 단위 테스트 모두 |

> 통합 테스트는: 한 터미널에 `pnpm dev:backend`, 다른 터미널에 `pnpm test:integration`.

---

## 2. 아키텍처 한눈에 (어디에 코드를 짜나)

```
packages/
  shared/   ← 모든 모듈의 경계 = 타입 계약 (API + 도메인 + 어댑터 인터페이스)
  core/     ← UI/로직 본체 (플랫폼 비의존)
    editor/    ✅ 구현됨 — 에디터 + 공용 툴바 + 서식제안
    sync/      ✅ 구현됨 — 에디터 ↔ NAS 연결, 오프라인 큐
    lister/    ✅ 구현됨 — 글 목록/검색/필터/상태 배지
    prompter/  📋 빈 슬롯 — 쇼츠 생성
    settings/  ✅ 구현됨 — 기기/NAS/AI/에디터/이미지 설정
    shell/     ✅ 구현됨 — core 진입점/레이아웃 조립
apps/
  backend/    ✅ 구현됨 — NAS (저장/발행/Gemini 프록시). 토큰·키는 여기에만.
  playground/ ✅ 구현됨 — 브라우저 검증·데모 앱 (MVP 산출물 아님)
  desktop/    ✅ 구현됨 — Tauri 데스크톱 셸
  embed/      📋 빈 슬롯 — 블로그 팝업 임베드
```

**핵심 설계 원칙 (전 모듈 공통)** — 자세한 의도는 `docs/MANUAL.md` 파트 B.

1. **core는 네트워크/파일시스템을 직접 치지 않는다.** `HttpAdapter` / `LocalStorageAdapter`
   같은 인터페이스를 **주입받아** 쓴다. (테스트=메모리, 브라우저/Tauri=실제 구현)
2. **AI 기능은 어댑터.** `Formatter` / `SlugSuggester` / `DictationProvider`는 인터페이스이고,
   `isAvailable()===false`면 UI가 자동 비활성 → 오프라인에서도 앱이 안 죽는다.
3. **자동 적용 금지 (autonomy slider).** LLM 제안은 사람이 수락해야 반영.
4. **토큰/키는 NAS(backend)에만.** 프론트로 절대 전달하지 않는다.
5. **자동 병합/덮어쓰기 금지.** 충돌은 사람이 결정.

---

## 3. ⚠️ `packages/shared` = 공유 계약 (가장 중요)

`shared`의 타입은 **모든 모듈이 의존하는 경계**입니다. 여기를 바꾸면 다른 사람 코드가 깨집니다.

- `shared` 공개 타입(`Post`, `*Request/*Response`, `Formatter` 등)을 **바꾸려면 PR 전에 합의**하세요.
  (이슈로 제안 → 영향받는 모듈 담당자 동의 → 변경)
- `shared` 는 두 종류로 나뉩니다:
  - **`types.ts`** — 도메인 타입(`Post`, `PostStatus`, `Schedule`, `ShortsJob` 등) + API 계약
  - **`ui-contract.ts`** — **UI 경계 계약**: 컴포넌트 props(`ListerProps`/`SettingsProps`/`ShellProps`)
    + **`PlatformAdapter`**(shell/desktop/embed 공유). 모듈 간 배선의 경계.
- 새 모듈을 시작할 때, **자기 props 타입을 새로 만들지 말고** `ui-contract.ts` 에서 import 하세요.
  - 예) lister=`ListerProps`/`ListQuery`, settings=`SettingsProps`, shell/desktop/embed=`ShellProps`/`PlatformAdapter`.
  - 이미 정의돼 있어 **시그니처가 강제로 일치** → 각자 개발해도 합칠 때 충돌이 없습니다.
- 계약을 **추가**(기존 것 유지)하는 건 자유롭습니다. **변경/삭제**만 합의 대상입니다.

---

## 4. 빈 슬롯 모듈을 시작하는 절차

새 모듈(예: `lister`)을 맡았다면:

1. **해당 `SPEC.md`를 먼저 읽는다** (예: `packages/core/src/lister/SPEC.md`).
   - SPEC이 그 모듈의 **계약**입니다. 공개 API / 책임 범위 / "하지 않는 것"이 적혀 있습니다.
2. SPEC이 모호하면 **코드보다 SPEC을 먼저 PR**로 다듬어 합의합니다. (협업에선 SPEC이 진실의 원천)
3. 구현 시작 — `shared`의 기존 타입을 재사용. 네트워크가 필요하면 어댑터 주입 패턴 사용.
4. 단위 테스트 추가 (`*.test.ts`, `tsx`로 실행). 가능하면 `playground`에 마운트해 눈으로 확인.
5. 해당 SPEC의 **§Status를 갱신**하고 PR.

> **Definition of Done (모듈 완료 기준)**: ① SPEC의 공개 API를 모두 export ②
> `isAvailable()` 같은 가용성 게이트가 있으면 false 경로가 동작(앱이 안 죽음) ③
> 단위 테스트 존재 ④ `pnpm check` 통과 ⑤ SPEC §Status 갱신.

---

## 5. 브랜치 & PR

- 브랜치: `main`은 항상 초록(CI 통과). 직접 push 금지, **PR로만 머지**.
- 브랜치 이름: `feat/lister-search`, `fix/sync-409-retry`, `docs/manual-update` 식.
- 커밋 메시지: 명령형 한 줄 요약 + 필요 시 본문. (예: `Add lister search/filter UI`)
- PR 전 **반드시 `pnpm check` 통과**. CI가 동일 검사를 다시 돌립니다.
- PR마다 **관련 SPEC.md 업데이트**를 포함하세요. (코드와 SPEC이 어긋나면 협업이 깨집니다)

---

## 6. 코드 스타일

- 포맷은 **Prettier가 결정**(`.prettierrc.json`). 손으로 맞추지 말고 `pnpm format`.
- Lint는 ESLint flat config(`eslint.config.js`). CI는 **에러만 차단**, 경고(`any` 등)는
  협업 초기 허용 — 줄여나가는 게 목표(`pnpm lint:strict`로 점검).
- 문서(`*.md`)는 Prettier 대상에서 제외 — 표/한글 줄바꿈을 사람이 관리합니다.
- 들여쓰기/개행은 `.editorconfig` 따름.

---

## 7. 도움이 필요하면

- 설계 의도: `docs/MANUAL.md` 파트 B (왜 이렇게 만들었나)
- 모듈별 계약: 각 디렉터리의 `SPEC.md`
- 전체 그림: 루트 `SPEC.md`, `README.md`
- AI 협업 시작 루틴: `docs/AI_WORKFLOW.md`