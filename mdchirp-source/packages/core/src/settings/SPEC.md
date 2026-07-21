# settings (설정) 모듈 SPEC

> 연결·키·정책·어댑터 구성을 한곳에서 관리한다.
> 상위: `packages/core/SPEC.md`

---

## 1. 목적 (Why)

NAS 연결, 외부 API 키(NAS 저장), 미디어/워터마크 정책, AI 어댑터 선택을 설정한다.
**키는 기기에 저장하지 않고 NAS에 보낸다** (마스킹된 상태로만 다시 조회).

---

## 2. 책임 범위

**한다:**
- 기기 설정(DeviceSettings): NAS 주소, 기기 이름, 에디터 옵션(분할뷰 기본/문법검사 언어)
- NAS 설정(NasSettings) 조회/수정: GitHub repo·branch, AI provider·model, 미디어 정책
- 키 입력 → NAS로 전송(`PUT /api/secrets`), 응답은 `tokenSet`/`keySet` 불린만
- 이미지 저장 형식 선택: 원본 유지 또는 WebP 변환
- 워터마크 정책 편집
- AI 어댑터 구성 후 다른 모듈에 주입(Dictation/Formatter/SlugSuggester)

**안 한다 (경계):**
- 키를 기기 로컬에 저장하지 않음 (NAS에만)
- 외부 API 직접 호출 안 함 (NAS 프록시)
- 이미지를 직접 변환하지 않음 (실제 검증·WebP 변환은 backend)
- 미사용 이미지 정리를 직접 실행하지 않음 (미디어 정책 엔진 슬롯)

---

## 3. 공개 인터페이스

> ⚠️ **props 타입을 새로 만들지 말 것.** `@mdchirp/shared`의 `ui-contract.ts`에서 import.

```typescript
import type { SettingsProps, SecretKind } from '@mdchirp/shared'

// shared에 정의됨:
// SettingsProps {
//   device,
//   nas,
//   onSaveDevice,
//   onSaveNas,
//   onSetSecret(kind, value),
//   onTestConnection?
// }

export function Settings(props: SettingsProps): JSX.Element {
  // ...
}
```

`device`/`nas`를 소유하지 않고 props로 받아 편집한 뒤 `onSave*`로 위에 올리는
**제어 컴포넌트**다.

NAS 응답의 키는 항상 마스킹된 상태(`tokenSet`/`keySet` 불린)다.

---

## 4. 설정 섹션 레지스트리 (Section Registry)

> settings는 "섹션의 집합"이다. 새 기능 = 새 섹션 추가 또는 기존 슬롯 승격.
>
> 각 섹션은 status를 가진다.
>
> - `ready` — ✅ 지금 확실히 동작
> - `partial` — 🚧 값은 저장되나 소비처 연결이 덜 됨
> - `slot` — 📋 UI 자리표시자만

backend가 받쳐주는 것:

- `/api/settings` GET/PUT
- `/api/secrets` PUT
- `/api/health`
- `/api/format/suggest`
- `/api/slug/suggest`

| # | 섹션 | status | 소속(값/소비) | shared 필드 | backend API |
|---|------|:------:|------|------|------|
| 1 | **연결(NAS)** | ready | settings값 → sync 재구성 | `DeviceSettings`(nasBaseUrl/deviceName/nasToken) | `/api/health` |
| 2 | **GitHub** | ready | settings값 → backend | `NasSettings.github`(repo/branch) + secret(github) | `/api/settings`·`/api/secrets` |
| 3 | **AI 키/모델** | ready | settings값 → backend(프록시) | `NasSettings.ai`(provider/model) + secret(gemini) | `/api/settings`·`/api/secrets` |
| 4 | **에디터 동작** | partial | settings값 → editor/split/markdown | `DeviceSettings.editor`(splitView/spellcheckLang + autosave/defaultMode/codeBlockStyle) | 없음 |
| 5 | **받아쓰기** | partial | settings값 → editor dictation | `DeviceSettings.editor.dictation`(provider/lang) | 없음 |
| 6 | **서식·slug 제안 토글** | partial | settings값 → editor formatter/slug | `NasSettings.ai`(suggestions[]/slug) | `/api/format/suggest`·`/api/slug/suggest` |
| 7 | **이미지 저장 형식** | ready ✅ | settings값 → backend 이미지 업로드 | `NasSettings.mediaPolicy.imageFormat` | `/api/settings`·`POST /api/posts/:slug/media` |
| 8 | **헤더이미지 자동생성/검색** | slot | AI 어댑터 + settings on/off | 미정 | 미정 |
| 9 | **유튜브 계정 연결** | slot | secret/OAuth → backend | 미정 | 미정 |
| 10 | **단축키/단축어** | slot | settings값 → shell registerShortcut | 미정 | 없음 |
| 11 | **GitHub 테마별 문법** | slot | settings값 → editor | 미정 | 없음 |
| 12 | **미디어 정책·워터마크** | slot | settings값 → backend 발행빌더 | `NasSettings.mediaPolicy`/`WatermarkPolicy` | `/api/settings` |

> 7번 이미지 저장 형식은 구현·검증을 완료했으며, 코드 레지스트리도 `slot`에서 `ready`로 승격했다.
>
> 미사용 이미지 정리, 외부링크 백업, 오프로드, 워터마크는 7번에 섞지 않고 12번 미디어 정책 엔진 슬롯으로 유지한다.
>
> 머릿말/꼬릿말/태그 제안은 editor 모듈 소속이다.

---

## 4-1. 이미지 저장 형식 ✅

설정 섹션 7번에서 NAS 공통 이미지 저장 형식을 선택한다.

```typescript
type ImageFormat = 'original' | 'webp'
```

실제 저장 필드:

```typescript
NasSettings.mediaPolicy.imageFormat
```

### 원본 유지

```text
JPEG → JPEG
PNG  → PNG
WebP → WebP
GIF  → GIF
```

- 애니메이션 GIF의 전체 프레임을 유지한다.
- backend는 실제 이미지 형식과 안전 제한을 검사한 뒤 저장한다.

### WebP 변환

```text
JPEG           → WebP
PNG            → WebP
정적 GIF       → WebP
애니메이션 GIF → 애니메이션 WebP
WebP           → WebP
```

- 애니메이션 GIF는 정지 이미지로 바꾸지 않고 전체 프레임을 유지한다.
- 변환 실패 시 원본으로 조용히 폴백하지 않고 업로드 실패를 반환한다.
- 기존 WebP는 불필요한 재인코딩을 피할 수 있다.

### 기본값과 호환성

- `imageFormat`이 없는 기존 `settings.json`은 `original`로 해석한다.
- UI 초기값도 `p.nas.mediaPolicy.imageFormat ?? 'original'`을 사용한다.
- 저장 시 기존 mediaPolicy 필드를 삭제하지 않고 `imageFormat`만 병합한다.

예:

```typescript
p.onSaveNas({
  mediaPolicy: {
    ...p.nas.mediaPolicy,
    imageFormat,
  },
})
```

### UI

섹션 7번에는 다음 선택 UI를 제공한다.

```text
이미지 저장 형식

[ 원본 형식 유지 ]
[ 모두 WebP로 변환 ]
```

설명 문구:

- 원본 유지: JPEG/PNG/WebP/GIF 원본 형식을 유지
- WebP: JPEG/PNG/GIF를 WebP로 변환하며 애니메이션 GIF도 움직임 유지
- 실제 변환은 NAS backend가 수행

설정 저장은 기존 `onSaveNas()`를 사용한다.
settings 컴포넌트는 직접 네트워크 호출을 하지 않는다.

---

## 5. 의존성

- `packages/shared`
  - `SettingsProps`
  - `SecretKind`
  - `DeviceSettings`
  - `NasSettings`
  - `MediaPolicy`
- settings는 직접 네트워크를 호출하지 않는다.
- 모든 저장/조회는 props 콜백으로 위임한다.

---

## 5-1. 모듈 간 이벤트 계약 (Wiring contract)

| settings가 호출 | 받는 쪽 처리 |
|----------------|-------------|
| `onSaveDevice(d)` | 기기 설정 영속화 + NAS 주소 변경 시 platform/sync 재구성 |
| `onSaveNas(partial)` | `PUT /api/settings` |
| `onSetSecret(kind, value)` | `PUT /api/secrets` |
| `onTestConnection()` | `GET /api/health` |

이미지 저장 형식은 다음처럼 전달한다.

```typescript
onSaveNas({
  mediaPolicy: {
    ...nas.mediaPolicy,
    imageFormat: 'webp',
  },
})
```

backend 업로드 API가 다음 이미지 업로드부터 이 설정을 읽어 적용한다.

> 키는 절대 기기에 저장하지 않는다. `onSetSecret`으로 NAS에 보내고 이후에는 마스킹된 불린만 받는다.

---

## 6. 완료 기준 (Definition of Done)

### 기존 1차

- [x] `Settings(props: SettingsProps)` 컴포넌트 export
- [x] ready 섹션(1·2·3) 실제 동작
- [x] partial 섹션(4·5·6) UI 동작
- [x] slot 섹션 비활성 표시
- [x] secret 입력 저장 후 입력값 비움
- [x] 연결 테스트 동작
- [x] 단위 테스트 존재
- [x] `pnpm check` 통과

### 이미지 저장 형식

- [x] shared `MediaPolicy.imageFormat?: 'original' | 'webp'` 추가
- [x] 섹션 7번을 `slot`에서 `ready`로 승격
- [x] 원본 유지/WebP 선택 UI
- [x] 기존 mediaPolicy의 다른 필드를 보존한 저장 payload
- [x] `imageFormat`이 없을 때 `original` 기본값
- [x] 설정 저장 후 backend `GET /api/settings`에서 값 확인
- [x] backend 업로드가 저장된 설정을 실제로 소비
- [x] 애니메이션 GIF의 원본 유지/WebP 변환 검증
- [x] settings 단위 테스트의 ready/slot 불변식 갱신

---

## 7. 상태

- ✅ 1차 완료: 섹션 레지스트리 + ready(연결/GitHub/AI키) + partial(에디터/받아쓰기/제안토글) + slot 자리표시자
- ✅ backend `/api/secrets`·`/api/settings` 라우트 연결 및 NAS 파일 영속
- ✅ 이미지 저장 형식 구현 완료:
  - `MediaPolicy.imageFormat`
  - 원본 유지/WebP 선택 UI
  - 섹션 7번 `slot → ready`
  - backend 업로드 소비 연결
- 📋 슬롯:
  - 헤더이미지 생성
  - 유튜브
  - 단축키
  - 테마 문법
  - 외부링크 백업
  - 오프로드
  - 미사용 이미지 정리
  - 워터마크

---

## 8. 미래 확장

- 이미지 WebP 품질 설정
- 이미지 최대 가로·세로 크기 설정
- 미사용 이미지 검색·정리
- 외부 이미지 NAS 백업
- 다중 블로그 프로필
- 단축키 커스터마이즈
- 테마
- 백업/복원
