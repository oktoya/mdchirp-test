# shell (본체) 모듈 SPEC

> 모듈을 담는 얇은 그릇. 로직을 거의 갖지 않는다.
> 상위: `packages/core/SPEC.md`

---

## 1. 목적 (Why)

editor/lister/settings/prompter를 **하나의 화면에 배치하고 전환**한다.
"무엇을 어디에 띄울지"만 결정한다.

---

## 2. 책임 범위

**한다:**
- 레이아웃 (사이드바=리스터, 메인=에디터, 패널=설정/프롬프터)
- 모듈 간 전환 (글 선택 → 에디터 열기 등)
- 전역 단축키 등록 (저장, 새 글, 분할뷰 토글, 받아쓰기, 서식제안)
- 전역 상태 표시 (NAS 연결상태, 동기화 진행, 오프라인 배지)
- 모듈에 sync/AI 어댑터를 연결(배선)
- 새 글 생성(`onNew`) — 빈 Post 와 임시 slug(`YYYY-MM-DD-untitled-xxxxx`) 발급.
  정식 slug(제목 기반)는 추후 SlugSuggester 담당. 발급한 slug 는 NAS/GitHub/media 에 일관되게 흐른다.
- 저장 결과가 발행 글의 slug fork이면 backend가 반환한 새 ID의 Post로 현재 편집 대상을 전환하고, 보존된 원본 ID는 목록에 유지한다. 🚧

**안 한다 (경계):**
- 에디터 내부 로직 모름, 저장/네트워크 직접 안 함(sync에 위임)
- rename/fork, 발행 이력, rev 충돌 같은 비즈니스 판정을 직접 하지 않는다. sync/backend 결과를 화면 상태에 반영할 뿐이다.
- NAS 본문 조회와 ID/slug 판정은 직접 하지 않는다. 글 열기는 `sync.openPost(id, slug?)`에 위임하고 `local`, `loaded`, `stale`, `none` 결과만 화면에 반영한다.

---

## 3. 공개 인터페이스

> ⚠️ `ShellProps`/`PlatformAdapter` 는 `@mdchirp/shared` 의 `ui-contract.ts` 에 정의됨.
> **shell/desktop/embed 가 공유하는 핵심 계약**이므로 절대 각자 새로 만들지 말 것.

```typescript
import type { ShellProps, PlatformAdapter, ShellMode, ShellPane } from '@mdchirp/shared'

// shared 에 정의됨 (요약):
//   ShellProps { platform: PlatformAdapter; mode?: 'full' | 'popup' }
//   PlatformAdapter { kind; storage; http; registerShortcut?; openExternal? }
//   ShellMode = 'full' | 'popup'
//   ShellPane = 'editor' | 'settings' | 'prompter'   // 메인 영역에 뭘 띄울지

export function Shell(props: ShellProps): JSX.Element { /* … */ }
```
- `mode='popup'`이면 리스터·설정을 접고 에디터 중심의 미니 레이아웃 (embed용).
- 같은 shell 코드, mode만 다름 → one source multi use.

**shell 이 내부에서 하는 배선(shell 책임, 외부 노출 안 함):**
- `platform.storage`/`platform.http` 로 `Sync` 인스턴스를 구성해 모듈에 주입.
- AI 어댑터(`Formatter`/`SlugSuggester`/`DictationProvider`)를 구성(settings 값 기반)해 editor 에 주입.
- (1차) 위 AI 어댑터 중 서식제안(`Formatter`)은 NAS 주소가 필요하므로, shell 이 직접 구성하지 않고 주소를 아는 껍데기(desktop/embed/playground)가 `platform.formatter` 로 실어 주입한다(sync/받아쓰기와 동일). 없으면 ✨ 비활성. (settings 값 기반 구성은 settings 모듈 완성 후 통합 예정.)
- lister 의 `onOpen(id)` → `sync.get(id)` → editor 로드. (각 모듈의 §Wiring contract 를 받는 쪽)
- `platform.registerShortcut` 로 전역 단축키 등록(저장/새글/분할뷰/받아쓰기/서식제안).
- `platform.http`/`platform.storage` 는 `Sync` 가 요구하는 `HttpAdapter`/`LocalStorageAdapter` 와
  시그니처가 다르므로(`url`↔`path`, `{status,body}`↔`{status,ok,data}`, `put/delete`↔`set/remove`,
  `all` 없음 등), shell 이 얇은 변환 어댑터 두 개를 내부에 둔다(`adaptPlatformHttp`/`adaptPlatformStorage`).
  `all` 은 `keys()+get()` 으로 합성, `ok` 는 2xx 계산. signal 은 미사용이라 무시 → `ui-contract.ts` 는 건드리지 않는다.
- settings는 구현된 패널을 사용하고, prompter는 아직 빈 슬롯이므로,
  해당 pane 선택 시 "준비 중" placeholder 를 띄운다(컴포넌트가 생기면 교체).
  full 모드 메인 영역 전환 구조만 먼저 갖춘다.


---

## 4. 레이아웃

```
┌──────────────────────────────────────────┐
│ TopBar: NAS상태 · 동기화 · 새글 · 발행      │
├──────────┬───────────────────────────────┤
│ Lister   │  Editor (또는 Settings/Prompter)│
│ (검색/목록)│  (분할뷰: 리치 | MD)            │
│          │                                │
└──────────┴───────────────────────────────┘
```

---

## 5. 의존성

- 모든 코어 모듈(editor/lister/settings/prompter), `packages/shared`
- 런타임 주입: `PlatformAdapter`(껍데기가 줌). sync/AI 어댑터는 shell 이 platform 으로 구성.

## 5-1. 모듈간 계약 — shell 은 "받는 쪽"

shell 은 각 모듈이 위로 쏘는 이벤트를 받아 배선한다. 각 모듈 SPEC 의 §Wiring contract 참조:

- **lister** → `onOpen`/`onNew`/`onQueryChange`/`onRefresh` (lister SPEC §5-1)
- **settings** → `onSaveDevice`/`onSaveNas`/`onSetSecret`/`onTestConnection` (settings SPEC §5-1)
- **editor/SplitView** → `onSave`/`onRequestPublish`/`onSchedulePublish` 등 (editor SPEC)


### 5-2. ID·slug 저장 결과 배선 🚧

#### 같은 ID 저장 또는 미발행 rename 성공

- 응답 Post를 ID 기준으로 목록에 upsert한다.
- 현재 편집 중인 Post와 응답 Post의 ID가 같으면 현재 편집 내용을 응답 Post로 갱신한다.
- slug가 바뀌었으면 이전 slug 항목을 별도 글로 남기지 않는다.

#### 발행 글 fork 성공

- `SaveResult.forkedFromId`가 있으면 응답의 `post.id`는 새 글 ID다.
- 현재 편집 대상을 응답의 새 Post로 전환한다.
- 새 Post를 목록에 추가한다.
- `forkedFromId`에 해당하는 원본 글은 삭제하거나 새 slug로 덮어쓰지 않는다.
- fork 성공 후 NAS 목록을 다시 읽어 원본 글의 기존 ID·slug와 새 글의 새 ID·slug를 함께 반영한다.
- 목록 갱신에 실패해도 새 Post 전환을 되돌리지 않으며, 다음 수동 새로고침에서 원본 목록을 복구한다.
- 현재 로컬 편집 봉투 전환과 후속 오프라인 큐 remap은 sync 결과를 따른다.

#### 발행 취소 성공 처리

- `Sync.unpublish()` 성공 결과의 `post`를 열린 글과 목록에 즉시 반영한다.
- 별도의 재조회 결과로 오래된 로컬 draft를 다시 열지 않는다.
- 응답의 최신 `post.rev`와 동기화된 draft를 사용하여 발행 취소 직후 잘못된 충돌 안내가 나타나지 않게 한다.
- `committed:true`이면 GitHub 삭제 commit이 생성된 정상 발행 취소로 안내한다.
- `committed:false`이면 삭제할 Git 변경이 이미 없는 멱등 성공으로 안내한다.
- 두 경우 모두 NAS Post는 최신 `status:'draft'` 상태로 반영한다.

#### 오류 표시

- `version_conflict`: 기존 충돌 UI를 열고 원격 rev·Post를 표시한다.
- `slug_taken`: 요청한 slug가 이미 사용 중이며 자동 덮어쓰기나 suffix가 적용되지 않았음을 알린다.
- `duplicate_post_id`: NAS에서 같은 ID의 폴더가 여러 개 발견되었음을 알리고 자동 저장을 중단한다.

> ⚠️ 의존 방향: **shell → 모듈** (shell 이 모듈을 알지, 모듈은 shell 을 모른다).
> 모듈은 props 콜백으로만 소통 → 모듈을 단독 테스트/임베드 가능.

---

## 6. 완료 기준 (Definition of Done)

- [x] `Shell(props: ShellProps)` export, `mode='full'` 레이아웃(§4) 동작
- [x] `PlatformAdapter` 주입만으로 sync/AI 어댑터 구성(직접 fetch/IndexedDB 호출 0)
- [x] lister↔editor 전환(글 선택 → 열기), settings/prompter 패널 전환
- [x] 전역 단축키 등록 + 해제(cleanup) — `platform.registerShortcut` 사용
- [x] 전역 상태 표시(NAS 연결/동기화/오프라인)
- [x] 단위 테스트: 메모리 PlatformAdapter 주입 시 마운트/전환 동작 (sync 불필요한 수준)
- [x] `pnpm check` 통과 + 이 SPEC §상태 갱신
- [x] `mode='popup'` 은 슬롯이어도, full 과 분기 지점은 코드에 자리만 마련

---

## 7. 상태

- ✅ 1차 완료: full 모드 레이아웃 + 단축키(등록/해제) + lister↔editor 전환 + 상태표시(온라인/충돌)
  + PlatformAdapter→sync 변환 어댑터 + 서식제안(platform.formatter) 주입 + 새 글(임시 slug).
- ✅ settings/lister 정식 배선: 마운트 시 목록 자동 로드(refreshList), settings pane 에
  실제 `<Settings>` 렌더. device/nas 상태를 Shell 이 소유하고, NAS 설정/키/연결테스트는
  `platform.http` 직접 호출(/api/settings·/api/secrets·/api/health — Sync 미경유, posts 전용이라).
  키 입력은 onSetSecret 후 마스킹 불린만 보관(원본 미보유).
- ⚠️ NAS 주소(device.nasBaseUrl) 변경: settings 에서 저장은 되나 즉시 재구성은 안 함
  (저장만, 적용은 재시작/재마운트). Shell·Sync 는 platform 변경 시 재구성을 이미 지원하므로,
  desktop/main.tsx 가 NAS_URL 을 state 로 올려 settings 변경 시 갱신하면 끝(AI_WORKFLOW §7).
- 🚧 ID/slug 저장 결과 배선 구현 예정:
  - 같은 ID rename 시 목록 중복 제거
  - fork 성공 시 새 ID 편집 화면 전환
  - 보존된 원본 ID 목록 유지
  - `version_conflict` / `slug_taken` / `duplicate_post_id`별 UI
- 📋 슬롯: popup 모드(embed용), prompter pane(현재 placeholder)
- ✅ `Sync.openPost()`로 NAS 전용 글 본문 로드와 로컬 캐시 저장.
- ✅ NAS rev가 더 최신이면 자동 덮어쓰지 않고 사용자 확인 후 `adoptRemote()` 적용.

---

## 8. 미래 확장

- popup 모드 정교화, 단축키 커스터마이즈, 테마(다크/라이트)

## 🚧 shell의 포괄적 충돌 표시

- shell이 `version_conflict`를 받으면 기본 메시지로 `다른 기기에서 변경이 있었습니다.`를 표시한다.
- shell은 rev 증가가 본문 수정, 날짜 변경, slug rename, slug fork 또는 상태 변경 중 무엇 때문인지 판정하거나 추측하지 않는다.
- 충돌 응답의 `currentPost`와 로컬 편집본을 editor에 전달할 수 있지만 별도의 `lastMutation` 또는 변경 사유 코드를 요구하지 않는다.
- fork 성공 시에는 반환된 새 Post로 편집 대상을 전환하고 NAS 목록을 다시 읽는다.
- 목록 새로고침 실패는 이미 성공한 fork를 롤백하지 않으며, 사용자에게 목록 갱신 실패를 별도로 알린다.
- 이 절의 포괄적 메시지 정책은 앞선 절의 변경 원인을 특정하는 예시 문구보다 우선한다.
