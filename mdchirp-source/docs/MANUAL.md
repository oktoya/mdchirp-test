# mdchirp 매뉴얼

> 이 문서는 **개발과 함께 자라는 매뉴얼**입니다.
> - 위쪽(파트 A)은 **사용자용 설명서** — "이걸로 어떻게 글을 쓰나".
> - 아래쪽(파트 B)은 **개발 일지 / 설계 의도** — 나중에 블로그 글로 옮길 재료.
>
> 새 기능을 만들 때마다 해당 절을 채워 넣습니다. 비어 있는 절(🚧)은 아직 미구현.

---
---

# 파트 A · 사용자 설명서

## A-0. mdchirp이 뭔가요?

손으로 마크다운(`# 제목`, `**굵게**` …)을 치지 않고도
**리치 에디터(워드처럼 보이는 화면)** 로 글을 쓰면,
자동으로 Jekyll Chirpy 블로그용 마크다운이 만들어지는 도구입니다.

데이터 흐름은 3단계입니다.

```
내 기기(작성)  →   NAS(보관·단일 진실원)   →   GitHub(발행)
   오프라인 OK        모든 토큰은 여기만           NAS만 커밋
```

> 지금 단계에서 완성된 건 **에디터(글 쓰는 화면)** 와 **NAS 백엔드(보관/발행 빌더)** 입니다.
> 이 둘을 잇는 동기화(sync)와 데스크톱 앱 껍데기(Tauri)는 다음 단계입니다.

---

## A-1. 에디터 화면 둘러보기

에디터는 두 칸으로 나뉩니다.

| 왼쪽 (리치) | 오른쪽 (Markdown) |
|---|---|
| 워드처럼 버튼/단축키로 서식을 주며 쓰는 곣. | **직접 편집 가능한 마크다운** 칸. 발행될 형식 그대로. |

### ✨ 양방향 편집

양쪽 어느 한 쪽을 고쳐도 반대쪽이 따라옵니다.

- 왼쪽(리치)에서 고치면 → 오른쪽 MD가 즉시 갱신.
- 오른쪽(MD)을 직접 타이핑하면 → 잠시 멈춘 뒤 왼쪽 리치에 반영(입력 중엔 커서가 튀지 않도록 약간 기다림).
- 규칙: **마지막에 만진 쪽이 기준**이 됩니다(서로 덮어쓰며 글이 망가지지 않도록 안전장치).

오른쪽 MD 칸은 상단의 **`◧ MD 편집 / 닫기`** 버튼으로 접고 펼 수 있습니다.

### 화면 구성: 위→아래 3층

분할뷰는 위에서 아래로 **3층**으로 정리되어 있습니다.

1. **(맨 위) 문서 액션 바** — `💾 저장` · `🚀 발행` (문서 전체에 대한 동작이라 맨 위).
2. **(에디터 바로 위) 편집 바** — `◧ MD 편집/닫기` + **공용 툴바** (한 줄). 편집 도구를 글 바로 위에 붙여 손이 가깝습니다.
3. **편집 영역** — 좌(리치) ↔ 우(MD).

> 이전엔 툴바와 에디터 사이에 저장/발행이 끼어 있었는데, 편집 도구는 글에 붙고 문서 액션은 위로 분리하는 게 더 자연스러워 이렇게 나눴습니다.

### 툴바 (리치/MD **공용** · 한 줄)

툴바는 **에디터 바로 위 한 줄**에 있으며, **리치 편집창과 MD 편집창 모두에서 공용**으로 작동합니다.
아이콘은 깔끔한 라인 스타일 + **드롭다운 메뉴**로 정리되어 있습니다.

| 그룹 | 형태 | 하는 일 |
|---|---|---|
| 문단 형식 | **드롭다운** (`본문 ▾`) | 본문 / 제목 1~4 중 선택 (현재 형식이 라벨에 표시됨) |
| 글자서식 | 아이콘 5개 | 굵게 / 기울임 / **밑줄** / 취소선 / 인라인 코드 |
| 색 | **드롭다운 2개** | **글자색** (7색 팔레트) / **형광펜** (6색, 다중색) |
| 블록 | 아이콘 2개 | 인용 / 코드블록 |
| 목록 | **드롭다운** | 글머리 목록 / 번호 목록 / 체크리스트 |
| 정렬 | **드롭다운** | 왼쪽 / 가운데 / 오른쪽 / 양쪽 |
| 🔗 링크 | **독립 아이콘** | 선택 글자에 하이퍼링크 (자주 써서 드롭다운 밖으로 뺌) |
| 미디어 삽입 | **드롭다운** | **이미지(외부 URL) / 유튜브·영상 임베드 / 파일** / 수평선 |
| AI | 아이콘 2개 (🎙 ✨) | 음성 받아쓰기 / LLM 서식 제안(아래 설명) |

> 제목·목록·정렬·미디어처럼 **여러 선택지가 있는 것은 드롭다운**으로 묶어 한 줄로 정리했습니다(TipTap 공식 에디터와 동일한 패턴).
> **링크 ≠ 미디어**: 일반 하이퍼링크는 자주 쓰므로 독립 버튼, 미디어 삽입 드롭다운은 외부 이미지/유튜브 임베드/파일 전용입니다.
> **유튜브**: 유튜브 URL을 넣으면 영상 id를 뽑아 Chirpy 임베드(`{% include embed/youtube.html id='…' %}`)로 삽입합니다.

### 이미지 첨부와 크기 조절

- 툴바의 이미지 버튼, Drag & Drop, 클립보드 붙여넣기로 이미지를 첨부할 수 있다.
- 업로드 전에 대체 텍스트, 저장 형식, 너비·높이와 원본 비율 유지를 설정할 수 있다.
- 저장 형식은 전역 설정을 따르며, 이미지마다 원본/WebP를 다시 선택할 수 있다.
- 리치 화면에서 이미지를 한 번 클릭하면 크기 조절 핸들이 나타난다.
- 핸들을 드래그하면 원본 비율을 유지하면서 크기가 변경된다.
- 리치 이미지를 더블클릭하면 기존 이미지 상세 편집 모달이 열린다.
- 상세 편집 모달에서 alt와 숫자 너비·높이를 수정할 수 있다.
- `원본 비율 유지`를 켜면 너비 또는 높이를 바꿀 때 반대쪽 크기가 자동 계산된다.
- `원본 크기 복원`은 이미지 노드의 width/height 속성만 제거한다. 이미지 파일은 다시 업로드하거나 변경하지 않는다.
- `본문에서 삭제`는 현재 글의 이미지 참조만 제거한다. NAS에 업로드된 이미지 파일은 삭제하지 않는다.
- MD 화면에서 이미지 파일명을 클릭하면 기존과 같이 이미지 미리보기가 열린다.
- 크기는 다음 Markdown 속성으로 저장되며 리치 화면과 왕복된다.

  `![설명](image.webp){: width="700" height="394" }`

- 상세 편집 결과는 리치와 MD에 즉시 반영된다.
- 저장 후 다른 글을 열었다 돌아오거나 앱을 재실행해도 alt와 크기가 유지된다.
- 너비와 높이는 모두 0보다 큰 숫자여야 하며, 한쪽만 입력하거나 잘못된 값을 입력하면 적용되지 않는다.

#### 리치/MD 공용은 어떻게 동작하나

같은 툴바 버튼이 **지금 작업 중인 패널**에 맞춰 다르게 작동합니다.

- **리치 편집창**에서 누르면 → 글의 **표현(서식)** 이 바뀝니다. (예: 선택 글자가 굵게 보임)
- **MD 편집창**에서 블록을 잡고 누르면 → **마크다운 코드**로 변환됩니다. (예: `**선택글자**`)

상단 바 우측의 **`적용 대상: 리치/MD`** 배지로 지금 어느 패널에 적용되는지 보여주고,
포커스가 있는 편집창에는 옅은 보라색 테두리(활성 패널 표시)가 들어옵니다.
포커스를 옮기면 적용 대상이 자동으로 따라갑니다.

> 밑줄·글자색·형광펜처럼 표준 마크다운에 없는 서식은 MD에서 제한된 HTML(`<u>`, `<mark>`, `<span style>`)·`==하이라이트==` 로 직렬화되며, 다시 불러와도 손실 없이 왕복(round-trip)됩니다.

### 맨 위 바: 저장 / 발행

`💾 저장` · `🚀 발행` 버튼은 **분할뷰 맨 위 액션 바 오른쪽**에 있습니다.
리치든 MD든 **어느 쪽에서 작업하든 공통**이기 때문에, 특정 편집창(리치)에 묶어두지 않고 분할뷰 레벨로 올렸습니다.
- `💾 저장` (또는 `Ctrl/Cmd+S`) → 저장 요청 (sync로 위임)
- `🚀 발행` → 누르면 **메뉴**가 열립니다:
  - **지금 발행** → 즉시 발행 (backend로 위임)
  - **예약 발행…** → 날짜·시간(`datetime-local`)을 골라 예약. 입력한 로컬 시각을 ISO(UTC)로 변환해 `schedulePublish`로 넘깁니다.
- `◧ MD 편집/닫기` 는 **편집 바(툴바 줄) 왼쪽**으로 옮겼습니다.

---

## A-2. 단축키

| 단축키 | 동작 |
|---|---|
| `Ctrl/Cmd + B` | 굵게 |
| `Ctrl/Cmd + I` | 기울임 |
| `Ctrl/Cmd + Shift + S` | 취소선 |
| `Ctrl/Cmd + S` | 저장 (실제 저장은 sync가 담당) |
| `- ` 입력 후 띄어쓰기 | 글머리 목록 시작 |
| `1. ` 입력 | 번호 목록 시작 |
| ``` ``` ``` 입력 | 코드블록 |
| `> ` 입력 | 인용 |
| `#`, `##`, `###` 입력 | 제목 1/2/3 |

> TipTap(에디터 엔진)의 기본 마크다운 단축키를 그대로 씁니다.

---

## A-3. 받아쓰기 (🎙)

- 버튼을 누르면 마이크로 말한 내용이 **커서 위치에 텍스트로 삽입**됩니다.
- 1차 버전은 브라우저 내장 음성인식(Web Speech API)을 씁니다 → **온라인 + 지원 브라우저**에서만 켜집니다.
- 오프라인이거나 지원하지 않는 환경이면 버튼이 **회색(비활성)** 으로 보입니다.
- 나중에 OS 받아쓰기 / 로컬 Whisper로 **엔진만 갈아끼울** 수 있습니다(어댑터 구조).

---

## A-4. 서식 제안 (✨) — NAS Gemini 프록시 연결됨 ✅

툴바의 **✨** 버튼을 누르면 오른쪽에 **제안 패널**이 열립니다.

- 본문 마크다운을 NAS 경유로 LLM(Gemini Flash)에 보내 **"이 부분은 코드블록이 좋겠다"**, **"여긴 제목으로"** 같은 **서식 제안**을 받습니다.
- 제안은 **diff 카드**(이전 → 이후 + 이유)로 보여주고, 당신이 카드마다 **✓ 수락 / ✗ 거절** 합니다.
- **절대 자동으로 바꾸지 않습니다.** 수락한 제안만 본문에 반영됩니다(자율성 슬라이더 원칙).
- 패널의 **다시(↻)** 버튼으로 재분석, **✕** 로 닫기.

### 키가 없으면 (B 모드 — 기본 상태)
- NAS에 Gemini 키가 설정돼 있지 않으면 **✨ 버튼이 회색(비활성)** 입니다.
- NAS `/api/health` 의 `features.formatter` 가 `"not_configured"` 면 프론트가 비활성으로 인식합니다.
- 키를 NAS의 `.dev.vars`(또는 환경변수)에 넣고 NAS만 재시작하면 **코드 변경 없이** 즉시 켜집니다.

### 키는 어디에 있나 (보안)
- **Gemini 키는 오직 NAS(백엔드)에만** 존재합니다. 프론트엔드(브라우저/데스크톱)로는 **절대 전달되지 않습니다.**
- 프론트는 마크다운을 보내고 → NAS가 Gemini를 호출하고 → 제안만 돌려받습니다. 키는 네트워크에 한 번도 노출되지 않습니다.

---

## A-4.5. 프론트매터 패널 (글 설정) ✅

맨 위 액션 바의 **`⚙ 필드 ▾`** 버튼을 누르면 **프론트매터 패널**이 접혔다 펴집니다.
Chirpy 블로그용 글 설정(YAML 머리말)을 손으로 치지 않고 칸을 채워 넣는 곳입니다.

- **제목 / slug** — 제목과 영문 주소(slug). slug 칸 옆 **`✨ slug 제안`** 버튼을 누르면
  제목을 바탕으로 영문 slug 후보가 칩으로 뜨고, 원하는 칩을 누르면 slug 칸에 들어갑니다(직접 입력도 가능).
  - 키가 있으면 Gemini가 **영문 번역** 후보를, 없으면 제목을 정리한 후보 1개를 줍니다. **자동으로 바꾸지 않습니다** — 당신이 골라야 반영됩니다.
  - **slug 자동 정리**: slug 칸을 벗어나면(포커스가 빠지면) 자동으로 **소문자·하이픈·영숫자**만 남도록 정리됩니다(공백→하이픈, 한글·특수문자 제거, 중복/양끝 하이픈 정리). 예: `My Post 한글!` → `my-post`. 입력 도중에는 그대로 두어 하이픈 타이핑을 방해하지 않고, 칸을 벗어날 때 한 번에 정리합니다. 발행 시 백엔드도 같은 규칙으로 파일명을 한 번 더 정리해(이중 방어선) 공백 있는 파일명이나 깨지는 URL이 생기지 않습니다.
- **카테고리(상위/하위)** — Chirpy는 카테고리를 최대 2단계까지 씁니다.
- **태그** — 콤마로 구분해 입력. 자동으로 소문자가 됩니다.
- **설명 / 저자 / 커버 이미지(경로·대체텍스트)**.
- **체크박스** — 고정(pin) / 수식(math) / mermaid / 목차(toc) / 댓글(comments) / render_with_liquid.
  - `pin`, `math`, `mermaid`는 기본적으로 꺼져 있습니다. 체크한 경우에만 frontmatter에 `true`가 기록되고, 체크를 해제하면 해당 필드는 생략됩니다.
  - `toc`, `comments`, `render_with_liquid`는 필드가 없을 때 기본적으로 켜진 상태로 표시됩니다.
  - 이 세 필드를 체크 해제하면 사이트 기능을 명시적으로 끄는 것이므로 `false`가 frontmatter에 기록됩니다.
  - 기존 글에 `toc: false`, `comments: false`, `render_with_liquid: false`가 있으면 패널을 열고 다시 저장해도 값이 유지됩니다.

### 저자(author) 입력

저자는 **드롭다운에서 골라서만** 넣습니다. 저자 칸에는 직접 타이핑할 수 없고(readOnly),
옆의 **드롭다운(저자 추가…)** 에서 `_data/authors.yml` 에 등록된 저자를 선택해 추가합니다.
여러 명이면 반복해서 골라 넣을 수 있고(콤마로 이어짐, 예: `oktoya, hong`), 옆의 **✕** 버튼으로 전체 지웁니다.

- 드롭다운에는 `authors.yml` 의 **키**(예: `oktoya`)가 들어가며, 발행 시 한 명이면 `author: oktoya`, 여러 명이면 `authors: [oktoya, hong]` 로 직렬화됩니다. 등록된 저자는 발행된 글에 **프로필 링크**가 걸립니다.
- **비워 두면** Chirpy 가 `_config.yml` 의 기본 저자(`social.name`)로 표시합니다.
- ⚠️ **왜 드롭다운 전용인가**: Chirpy 는 `authors.yml` 에 **없는** 이름을 저자로 쓰면 그 저자를 화면에 **아예 표시하지 않습니다**(빈칸). 오타 하나로 저자가 사라지는 사고를 막기 위해 자유 입력을 막고 등록된 저자만 고르게 했습니다. 새 저자를 쓰려면 먼저 저장소의 `_data/authors.yml` 에 추가하세요.
- `authors.yml` 이 비어 있거나 못 불러오면 드롭다운 대신 "등록된 저자가 없습니다…" 안내가 뜨고, 이때는 저자 없이(=기본 저자로) 발행됩니다.
- 설정 → GitHub 섹션에 `authors.yml` 사용 안내가 있습니다.

> 발행 날짜(date)와 이미지 기본 경로(media_subpath)는 여기서 다루지 않습니다 — 발행할 때 NAS가 자동으로 채웁니다.

### 발행 시각 기준 (설정)

설정 → GitHub 섹션의 **발행 시각 기준** 에서 발행 날짜의 시간대를 고릅니다.

- **NAS(서버) 시간대 기준** — 발행 서버(집에 있는 NAS)의 시간대로 날짜를 찍습니다. NAS 컨테이너는 한국 시간(`Asia/Seoul`)으로 설정돼 있어 `+0900` 이 됩니다.
- **발행한 기기의 현재 시간대 기준** — 발행 버튼을 누른 그 기기(PC/폰)의 시간대로 찍습니다. 해외에서 작성할 때 유용합니다.

---

## A-5. 외부에서 들어온 글

이미 블로그에 손으로 쓴 마크다운 글을 불러오면(=리치 원본이 없음),
에디터가 마크다운을 파싱해 리치로 보여주고 상단에 안내 배지가 뜹니다:

> *리치 원본 없음 — 외부에서 들어온 글입니다. 저장 시 리치 원본이 생성됩니다.*

저장하면 그때부터 리치 원본(`tiptapJson`)이 생기고, 이후엔 일반 글처럼 다룹니다.

---

## A-6. 저장 / 발행은 어떻게 되나 (sync 레이어 연결됨 ✅)

에디터는 **직접 저장하거나 발행하지 않습니다.** 버튼을 누르면 sync 레이어가 받아 NAS와 통신합니다.

- `💾 저장` → sync가 **로컬에 먼저 저장**(local-first, 오프라인 OK)한 뒤, 온라인이면 NAS로 전송.
  다른 기기가 그새 저장했으면 **버전 충돌(409) 안내**가 뜹니다 — 자동 병합하지 않고, "내 것으로 덮어쓰기 / 취소"를 사람이 고릅니다(유실 없음).
- `🚀 발행` → 먼저 최신 상태로 저장한 뒤 NAS 발행 빌더가 Chirpy 표준 형식으로 GitHub에 커밋.

### 온라인 / 오프라인 표시
- 화면 상단의 **🟢 온라인 / 🔴 오프라인** 점과 `rev N`(현재 버전 번호)을 항상 볼 수 있습니다.
- 오프라인일 때 저장하면 **동기화 큐**에 쌓이고, 온라인으로 돌아오면 **순서대로 자동 전송**됩니다.
- 연결 상태는 NAS의 `/api/health`를 주기적으로 확인해 자동 감지합니다.

### 버전 충돌이 뜨면
주황색 배너가 뜹니다. mdchirp은 절대 자동으로 덮어쓰지 않습니다.
- **내 것으로 덮어쓰기** — NAS 최신 버전 위에 내 글을 올립니다(이전 버전은 `.history/`에 보관).
- **취소** — 일단 닫고, NAS 글을 받아 비교한 뒤 다시 정할 수 있습니다.

> 이 분리가 mdchirp의 핵심 설계입니다(아래 파트 B-3, B-7 참고).

---

## A-7. 글 목록 (리스터) ✅

저장한 글들을 한 화면에서 찾고 상태를 구분합니다.

### 앱을 시작했을 때

1. 기기에 저장된 로컬 draft 목록을 먼저 표시합니다.
2. 백그라운드에서 NAS `/api/health` 연결을 확인합니다.
3. NAS가 연결되면 NAS의 최신 글 목록을 자동으로 다시 읽습니다.
4. NAS 목록과 로컬 draft는 제목이나 slug가 아니라 글의 영구 ID인 `Post.id`를 기준으로 합칩니다.
5. GitHub에서 가져온 글은 NAS의 `hasRichSource=false` 값을 유지하므로 외부 유입 글 표시가 사라지지 않습니다.
6. 앱 시작만으로 GitHub fetch를 실행하지 않습니다.

### 목록에서 할 수 있는 일

- **검색**: 제목·본문·태그·카테고리를 한 칸에서 검색(대소문자 무시).
- **필터**: 상태 칩(초안/예약/발행됨), "외부글만"(리치 원본 없는 글).
- **정렬**: 수정일/발행일/제목 + 오름/내림 토글. (발행일 정렬 시 미발행 글은 항상 맨 뒤.)
- **상태 배지**: 초안=회색, 예약=보라(발행 예정 시각 표시), 발행됨=초록. 발행 후 수정하면 발행됨 앞에 별표(`*발행됨`)가 붙고, 재발행하면 사라진다.
- **외부 유입 글**은 점선 테두리로 즉시 구분됩니다.
- 글을 클릭하면 열리고(`onOpen`), **\+ 새 글**로 빈 글을 시작합니다.

### `↻` GitHub 수동 새로고침

목록의 `↻` 버튼은 단순한 NAS 목록 다시 읽기가 아니라 **GitHub → NAS 역방향 새로고침**입니다.

1. 현재 목록을 지우지 않고 새로고침 진행 상태를 표시합니다.
2. NAS backend가 설정된 GitHub branch를 fetch합니다.
3. `_posts/YYYY-MM-DD-<slug>.md` 형식의 표준 글을 검사합니다.
4. NAS에 없는 정상 GitHub-only 글을 `hasRichSource=false`, `status=published`인 글로 가져옵니다.
5. 글의 안전한 `media_subpath` 폴더가 있으면 이미지 등 일반 파일도 NAS 글의 `media/` 폴더로 가져옵니다.
6. NAS에 이미 있는 글은 `mdchirp_id`, `githubPath`, slug 충돌 규칙으로 연결 상태를 확인합니다.
7. 잘못된 frontmatter, 중복 ID, slug 충돌, 원격 파일 누락은 경고 또는 오류 배지로 표시합니다.
8. 날짜 형식이 아닌 비표준 `_posts/*.md` 파일은 자동으로 고치거나 가져오지 않고 제외 개수만 안내합니다.
9. 성공하면 NAS 목록을 다시 읽어 새 글과 최신 진단을 표시합니다.
10. 실패하거나 다른 새로고침이 이미 진행 중이면 기존 목록과 현재 편집 중인 글을 그대로 유지합니다.

> 리스터는 직접 저장/발행/네트워크를 하지 않습니다. 목록을 받아 보여주고 "이 글 열기" 또는 "새로고침 요청"을 위로 알릴 뿐(props in / events out). 실제 GitHub fetch와 NAS import는 sync와 backend가 담당합니다.

---

# 파트 B · 개발 일지 / 설계 의도

> 블로그 포스팅용 메모. "왜 이렇게 만들었나"를 적습니다.

## B-1. 만드는 순서 (걸어다니는 뼈대)

카파시 식으로, **제일 위험한 부분부터** 만들고 검증했습니다.

1. **백엔드 walking skeleton** (이전 단계) — 폴더-당-글 저장, rev 충돌 감지, 발행 빌더. 테스트+실제 HTTP로 검증.
2. **에디터의 마크다운 변환** (이번 단계의 첫 작업) — 여기가 깨지면 **글이 손상**되므로 가장 먼저.
3. 그 위에 에디터 UI(툴바/본문) → 분할뷰 → 플레이그라운드로 눈으로 확인.

## B-2. 왜 마크다운 변환을 제일 먼저 했나

리치 에디터의 진짜 위험은 **round-trip**입니다.
`마크다운 → 리치(JSON) → 마크다운` 을 돌렸을 때 원본과 달라지면, 외부 글을 한 번 열었다 저장하는 것만으로 글이 망가집니다.

그래서:

- 변환기(`markdown.ts`)를 **에디터 런타임과 분리**했습니다. ProseMirror/TipTap의 살아있는 스키마에 의존하지 않고, **순수 함수 두 개**(`jsonToMarkdown`, `markdownToJson`)로 만들어 단독 테스트가 가능하게.
- `markdown.test.ts`로 17개 round-trip 케이스(굵게/기울임/취소선/인라인코드/링크/제목/인용/목록/체크리스트/코드블록/이미지/한글 복합문서/중첩마크)를 통과시킨 뒤에야 UI를 올렸습니다.

> 교훈으로 적어둘 것: **"되는 것처럼 보이는 것"과 "안 깨지는 것"은 다르다.** 변환은 후자가 중요.

## B-3. 에디터는 "이벤트만 쏘는" 순수 컴포넌트

`EditorView`는 저장/네트워크/발행/업로드/워터마크/충돌해소를 **하지 않습니다.**
대신 props로 받고(`post`, `dictation`, `formatter`), 이벤트로 내보냅니다(`onChange`, `onSave`, `onRequestPublish`).

이유:
- **공격면(attack surface) 축소** — 에디터가 토큰을 모르면 토큰이 샐 길이 없다. 모든 키는 NAS만.
- **테스트/재사용 용이** — 블로그 팝업(embed)에서도 같은 에디터를 끼울 수 있다.
- **경계가 곧 문서** — "에디터가 뭘 안 하는지"를 SPEC에 명시(`editor/SPEC.md §2`).

플레이그라운드 우측의 **이벤트 로그**가 이 철학을 그대로 보여줍니다: 편집/저장/발행을 누르면 로그에 이벤트가 찍힐 뿐, 에디터는 아무 데도 저장하지 않습니다.

## B-4. AI 기능은 전부 "어댑터"

받아쓰기(`DictationProvider`), 서식제안(`Formatter`), slug제안(`SlugSuggester`)은 모두 **인터페이스**입니다.
- 1차 구현은 갈아끼울 수 있는 한 종류씩(받아쓰기=브라우저 음성, 서식제안=Gemini).
- `isAvailable()`이 false면 버튼이 자동 비활성 → **오프라인에서도 앱이 안 죽는다.**
- 자동 적용 금지(autonomy slider) — 제안은 사람이 수락해야 반영.

## B-5. 분할뷰 = 에디터를 감싸는 래퍼

`SplitView`는 `EditorView`를 감싸 `onChange`를 가로채 마크다운 미리보기를 갱신하고,
**양방향**(MD를 직접 고쳐도 리치에 반영)으로 동작합니다. 저장/발행 버튼도 SplitView가 소유합니다.

## B-6. 플레이그라운드는 왜 있나

Tauri 데스크톱 앱은 이 샌드박스에서 빌드/실행이 안 됩니다(사용자 로컬/NAS에서 빌드).
그래서 **검증·데모 전용** Vite 브라우저 앱(`apps/playground`)을 따로 뒀습니다.
- MVP 산출물 아님. 에디터를 실제로 띄워 눈으로 확인하고, 이벤트 흐름을 보여주는 용도.
- 데스크톱 셸이 준비되면 동일한 `<EditorView>`/`<SplitView>`를 그대로 마운트.
- 이제 플레이그라운드의 **저장/발행이 실제 NAS 백엔드로 갑니다** — 상단에서 NAS 주소·온라인 상태·rev를 확인.

## B-7. sync 레이어 — 첫 end-to-end 관통 (이번 단계)

에디터(이벤트만 쏨)와 NAS 백엔드(저장/발행) 사이를 잇는 **UI 없는 서비스 레이어**입니다.
드디어 "저장 버튼 → 실제 NAS 저장 → rev 증가"가 한 줄로 관통됩니다.

**왜 이렇게 짰나 (설계 결정)**

1. **플랫폼 분리 — 어댑터 주입.**
   core는 `fetch`나 IndexedDB를 직접 부르지 않습니다. 대신 `HttpAdapter`/`LocalStorageAdapter`
   두 인터페이스를 **주입받아** 씁니다. → 테스트는 메모리 어댑터, 브라우저/Tauri는 실제 어댑터.
   덕분에 core가 데스크톱·웹 어디서든 그대로 돕니다.

2. **409(충돌)는 예외가 아니라 "정상 흐름".**
   `NasClient`는 409를 throw하지 않고 `{ ok:false, conflict }` 결과로 돌려줍니다.
   충돌은 협업에서 **당연히 일어나는 일**이지 오류가 아니기 때문 — 그래서 try/catch가 아니라 분기로 다룹니다.

3. **Local-first.**
   저장은 항상 로컬에 먼저 기록(절대 실패 안 함) → 온라인이면 NAS 전송, 오프라인이면 **큐 적재**.
   온라인 복귀를 감지하면 큐를 **시간순으로 순차 전송**합니다. 전송 중 409가 나면 그 글만 보류(충돌 이벤트)하고 나머지는 계속.

4. **자동 병합 금지.**
   충돌을 sync가 마음대로 합치지 않습니다. `onConflict`로 알리기만 하고, 덮어쓸지/취소할지는 사람이 결정.
   "내 것으로 덮어쓰기"는 `resolveOverwrite(post, currentRev)`로 NAS 최신 rev를 baseRev로 재시도합니다.

**검증** — 라이브 백엔드를 띄우고 `sync.itest.ts`로 **18/18 통과**:
저장→rev1, 후속 저장→rev2, stale baseRev→409 충돌 이벤트, resolveOverwrite→성공,
발행→status=published, 오프라인 저장→큐 적재→복귀 시 flush. 마지막으로 브라우저(플레이그라운드)에서 실제 NAS 호출까지 확인.

## B-8. 공용 툴바 — "의도(intent)"와 "실행(command)"의 분리

리치에만 있던 툴바를 **리치/MD 공용**으로 확장하면서, sync 레이어와 똑같은 **어댑터 주입** 패턴을 또 한 번 썼습니다.

**핵심 아이디어**: 툴바는 *무엇을 하고 싶은지(intent)* 만 압니다 — `bold`, `heading2`, `bulletList`, `link` 같은 추상 명령. *그것을 어떻게 실행하는지(command)* 는 지금 활성 패널에 맞는 구현체가 주입됩니다.

```
Toolbar  ──(intent: 'bold')──▶  EditorCommands (주입됨)
                                  ├─ RichCommands      → editor.chain().toggleBold()  (TipTap 표현 변경)
                                  └─ MarkdownCommands  → 선택영역을 **…** 로 감쌈        (textarea 코드 변경)
```

- **`EditorCommands` 인터페이스** — `toggle/setParagraph/setAlign/setTextColor/insertLink/insertImage/insertMedia…` 등 의도만 정의.
- **`RichCommands`** — TipTap `editor.chain()`을 감싸 표현을 바꿈.
- **`MarkdownCommands`** — `MdTextareaHandle`(getValue/getSelection/apply/focus 추상)로 textarea 선택영역을 마크다운 문법으로 감싸거나 줄 접두사를 토글.
- **활성 패널 추적** — `SplitView`가 포커스(`onFocusCapture`/`onFocus`)를 보고 `activePanel`을 정하고, 그에 맞는 command 구현체를 `useMemo`로 골라 Toolbar에 주입.

**왜 이렇게**
- **한 줄 툴바 = 보기 좋고, 코드도 하나.** 리치/MD 두 벌의 툴바를 따로 만들지 않습니다.
- **표준에 없는 서식(밑줄/글자색/형광펜)도 왕복 보장.** MD 직렬화는 `<u>`, `<span style="color:…">`, `==…==`/`<mark style="background-color:…">` 로 하고, markdown-it를 `html:true`로 켜서 다시 파싱 — `markdown.test.ts` 32/32 통과(왕복 + 멱등).
- **확장이 쉽다.** 새 서식은 intent 하나 추가 + 두 구현체에 매핑만 하면 끝.

## B-9. 서식 제안 — NAS Gemini 프록시 (B 모드)

AI 기능 중 첫 번째 실제 LLM 연동입니다. B-4의 "어댑터" 철학을 그대로 따르되, **키 보안**과 **점진적 활성화(B 모드)** 두 가지를 핵심 설계로 잡았습니다.

**핵심 결정 1 — 키는 NAS에만, 프론트는 마크다운만 주고받는다.**
```
프론트(LlmFormatter)  ──POST /api/format/suggest {doc:{markdown}}──▶  NAS(ai.ts)
                                                                        │ GEMINI_API_KEY (env/.dev.vars)
                                                                        ▼
                                                              Gemini REST (generateContent)
프론트  ◀──{suggestions:[{range,before,after,type,reason}]}──  NAS (제안만 반환)
```
- Gemini 키는 **NAS 백엔드에만** 존재. 프론트엔드 코드/네트워크에 **단 한 번도 노출되지 않음**.
- 3-tier 원칙(토큰은 NAS에만)을 LLM에도 동일 적용.

**핵심 결정 2 — B 모드: 키 없이 구조부터, 키는 나중에 코드 변경 0으로.**
- `isGeminiConfigured()`가 키 유무로 모든 걸 게이트.
- 키 없으면 `/api/health` → `features.formatter: "not_configured"`, `/api/format/suggest` → **503**.
- 프론트 `LlmFormatter.refresh()`가 health를 읽어 `isAvailable()` 캐시를 갱신 → 키 없으면 ✨ 버튼 비활성.
- 키를 `.dev.vars`에 넣고 NAS만 재시작하면 **즉시 활성화**(빌드/배포/코드 수정 불필요).

**핵심 결정 3 — range는 서버가 계산한다(LLM은 인덱스를 못 센다).**
- LLM에게 문자 위치를 세라고 하면 자주 틀립니다. 그래서 LLM은 `{before, after, type, reason}`만 주고,
  **서버가 `markdown.indexOf(before)`로 range를 계산**합니다. 본문에 없는(환각) `before`는 **버립니다**.

**핵심 결정 4 — 자동 적용 금지(자율성 슬라이더).**
- 제안은 `SuggestionPanel`이 **diff 카드**로 보여주고, 사람이 수락한 것만 `applySuggestion`이 `before→after`로 치환.
- 적용도 range 우선 → 못 찾으면 indexOf 폴백 → 그래도 없으면 **조용히 무시**(절대 엉뚱한 곳 덮어쓰지 않음).

**왜 `Formatter.isAvailable()`이 동기인데 health는 비동기인가**
- 인터페이스가 동기(`isAvailable(): boolean`)라서, 비동기 `refresh()`로 health를 읽어 **불린 캐시**에 저장.
- 플레이그라운드는 readiness가 바뀌면 `SplitView`에 `key`를 갈아 끼워(`fmt-on`/`fmt-off`) 강제 리렌더 → ✨ 버튼 상태가 즉시 반영.

**검증(B 모드)** — 키 없음: health `not_configured` + 503. 더미 키: health `ready` + 502(구글이 "API key not valid" 반환 → 우리 502 `gemini_failed`). 즉 **URL·요청형태·에러처리 경로가 전부 옳다**는 것을 실제 키 없이 증명. 실제 키는 코드 변경 0으로 드롭인.

## B-10. shell — 모듈을 조립하는 얇은 그릇

editor/lister/sync 를 한 화면에 배치·전환하고, 플랫폼 기능을 주입받아 배선하는 모듈. "얇다"는 건 로직이 얇다는 뜻이지 화면이 없다는 게 아니다(레이아웃 자체가 shell).

**핵심 결정 1 — PlatformAdapter 하나만 받고, 나머지는 다 내부 구성.**
`ShellProps` 는 `platform`(+`mode?`)만 받는다. Sync·받아쓰기·서식제안·pane 상태·글 목록을 전부 shell 이 platform 으로부터 조립한다. 껍데기(desktop/embed)는 platform 만 주면 된다 → one source multi use.

**핵심 결정 2 — PlatformAdapter ≠ sync 어댑터, 그래서 변환기.**
ui-contract 의 `PlatformHttp`/`PlatformStorage` 와 sync 의 `HttpAdapter`/`LocalStorageAdapter` 는 시그니처가 다르다(`url`↔`path`, `{status,body}`↔`{status,ok,data}`, `put/delete`↔`set/remove`, `all` 없음). shell 이 얇은 변환 어댑터 두 개(`adaptPlatformHttp`/`adaptPlatformStorage`)를 둬서 잇는다. `all` 은 `keys()+get()` 합성, `ok` 는 2xx 계산. → ui-contract 는 안 건드림. 이 변환기가 shell 에서 가장 위험한 부분이라 순수 함수로 떼어 메모리 어댑터로 먼저 테스트(B-2 패턴).

**핵심 결정 3 — AI 어댑터는 주입받지, 구성하지 않는다.**
서식제안(`LlmFormatter`)은 NAS 주소가 필요한데 shell 은 주소를 `platform.http` 뒤에 숨긴 채 받아 모른다. 그래서 주소를 아는 껍데기가 `platform.formatter` 로 실어 보낸다(sync/받아쓰기와 동일한 주입 철학). 이를 위해 ui-contract `PlatformAdapter` 에 `formatter?` 를 **추가**(변경/삭제가 아니라 추가라 협업 규칙상 자유).

**핵심 결정 4 — shell 은 NAS 본문을 로드하지 않는다.**
`onOpen(id)` 는 `sync.get(id)`(로컬 draft)만 연다. 로컬에 없는 글의 본문 fetch 는 sync 의 책임 → 추가되면 shell 은 코드 변경 없이 받는다(어댑터 철학).

**핵심 결정 5 — 새 글의 임시 slug.**
백엔드는 `PUT /api/posts/:slug` 로 slug 가 비면 404. 그래서 `onNew` 가 `YYYY-MM-DD-untitled-xxxxx` 임시 slug 를 발급한다(시각 suffix 로 연타 충돌 방지). 정식 slug 는 추후 SlugSuggester. 임시여도 그 값이 NAS/GitHub/media 세 곳에 **일관되게** 흐르므로 slug 일관성 원칙은 지켜진다.

**검증** — 변환 어댑터(왕복/`all` 합성/409 비예외) + Sync over adapters(local-first) + 단축키(등록/해제/no-op) 단위테스트 통과(shell.test.ts). playground 에 `Shell (조립)` 탭을 추가해(기존 데모 보존) 실제 NAS 로 목록·저장·발행·온라인표시까지 눈으로 확인. 컴포넌트 자체는 이 프로젝트 관례(렌더링 테스트 없음)에 따라 typecheck + playground 로 검증.

## B-11. desktop (Tauri 셸) — 1차 MVP 끝까지 관통

shell 까지 만든 core 를 **진짜 PC 앱**으로 띄운 단계. 1차 MVP("PC앱 → NAS저장 → GitHub발행")의 마지막 관문.

**핵심 결정 1 — desktop 은 PlatformAdapter 조립만 한다(로직 0).**
`apps/desktop/src/main.tsx` 는 `makeDesktopPlatform(nasUrl)` 로 어댑터를 만들어 `<Shell mode="full" />` 에 주입할 뿐이다. http(fetch)/storage(localStorage)/단축키(DOM)/openExternal(Tauri shell) 네 조각과 AI 어댑터(formatter/slug/dictation) 주입이 전부. playground 의 `shellPlatform.ts` 와 거의 같다 — 의도적으로 같게 두어 "참고 구현체 → 실제 껍데기"가 일대일 대응되게 했다(one source multi use 증거).

**핵심 결정 2 — AI 어댑터 주입 통로를 PlatformAdapter 에 정식으로 열었다.**
desktop 작업 전엔 `PlatformAdapter` 에 `formatter?` 만 있었고 Shell 이 받아쓰기를 내부 하드코딩했다. desktop 에서 slug 제안/받아쓰기를 쓰려면 통로가 필요해, `slugSuggester?`/`dictation?` 를 ui-contract 에 **추가**(변경 아님 → 협업 규칙상 자유)하고, Shell 이 `platform.dictation ?? BrowserDictation` 폴백으로 받아 SplitView 로 내리게 했다. 이로써 playground/desktop/embed/모바일이 **"platform 에 AI 어댑터를 실어 보낸다"는 한 가지 방식**으로 통일됐다.

**핵심 결정 3 — storage 는 1차 localStorage(길 A).**
SPEC 은 IndexedDB(Dexie) 를 목표로 했지만, MVP 관통이 목표라 가장 단순한 localStorage 로 시작했다(WebView2 도 브라우저라 그대로 동작). `PlatformStorage` 인터페이스는 그대로라 추후 Dexie 로 **구현체만 교체**하면 된다(slug/dictation 통로와 같은 어댑터 철학). Dexie 전환은 AI_WORKFLOW §7 보류목록에서 추적(~5MB 한계 때문에 글 많아지면 필요).

**핵심 결정 4 — 단축키/storage 는 Tauri 전용 API 대신 표준 웹 API.**
전역 단축키는 Tauri global-shortcut(OS 전역) 대신 DOM keydown(앱 포커스 내)으로 충분, storage 도 IndexedDB 대신 localStorage. → desktop 코드가 거의 순수 웹이라 embed/모바일이 그대로 재사용 가능. Tauri 고유 기능(openExternal=shell plugin)만 최소로 썼다.

**왜 이 샌드박스에서 못 만들고 너(로컬)가 빌드했나**
Tauri 는 Rust/네이티브 툴체인이 필요해 샌드박스에서 빌드 불가. 그래서 분담: **AI 가 소스 전부(엔트리·PlatformAdapter·src-tauri 설정) 작성 → 사용자가 로컬(Windows)에서 Rust 설치 + `tauri dev` 실행**. 프론트 배선은 Rust 없이 `dev:vite` 로 먼저 검증(브라우저에서 Shell 확인) → 그다음 네이티브.

**함정 기록(다음 세션 주의)**
- `Cargo.toml` 에 `[lib]` 를 넣으면 `src/lib.rs` 를 요구한다. main.rs 하나만 쓸 거면 `[lib]` 섹션을 빼라.
- ⚠️ **Windows 는 `tauri dev` 에도 `icons/icon.ico` 가 필수**(리소스 파일 생성). 다른 OS 와 달리 빈 아이콘 배열로는 dev 가 안 된다. `pnpm tauri icon <원본.png>` 로 먼저 생성.
- `pnpm tauri ...` 는 desktop 폴더(또는 `--filter @mdchirp/desktop`)에서, `pnpm dev:desktop` 은 루트에서. 스크립트 위치가 다르다.
- 새 껍데기(desktop/embed)는 core 의 `editor.css` 를 **반드시 import** 해야 한다(`@mdchirp/core/src/editor/editor.css`).
  빠뜨리면 툴바가 한 줄로 안 서고 세로로 쌓이는 등 레이아웃이 깨진다. settings/lister/shell/frontmatter css 와 함께 main 엔트리에서 불러올 것.

**검증** — typecheck 5/6 프로젝트 통과(desktop 포함), `dev:vite` 로 브라우저에서 Shell 확인(Rust 전), Rust 설치 후 `tauri dev` 로 네이티브 창 + NAS 온라인 + 리스터 실제 글 + 저장/발행 관통.

## B-12. GitHub 발행(git push) 실구현 — 1차 MVP 마지막 관문

발행 빌더의 7~9단계(git add/commit/push)를 실제로 채운 단계. 이걸로 "PC앱 → NAS저장 →
GitHub발행" 이 처음부터 끝까지 진짜로 관통했다.

**핵심 결정 1 — build(1~6)는 안 건드리고, GitPublisher 구현체만 갈아끼운다.**
`publishBuilder.ts` 는 애초에 git 을 `GitPublisher` 인터페이스로 분리해두고
`NoopGitPublisher`(아무것도 안 함)만 주입돼 있었다. 그래서 이번엔 `SimpleGitPublisher`
새 파일 하나 + `routes/posts.ts` 의 주입 한 줄 교체로 끝났다(수술적 변경). 발행 빌더 본체는
한 줄도 수정하지 않았다 — 경계를 미리 그어둔 설계의 배당금.

**핵심 결정 2 — git 은 child_process 로 직접 호출(새 의존성 0).**
호출이 add/commit/push 몇 개뿐이라 `simple-git` 같은 라이브러리를 새로 넣지 않고
`node:child_process` 로 git 바이너리를 직접 실행했다(이미지에 git 설치됨, Dockerfile).
단순함 우선.

**핵심 결정 3 — 토큰은 push URL 에 1회만 주입, 디스크에 안 남긴다.**
GitHub PAT 를 remote 에 영구 저장하면 `.git/config` 에 평문으로 남는다. 그래서 remote 는
토큰 없는 URL 로 두고, push 할 때만 `https://x-access-token:<PAT>@github.com/<repo>.git`
형태로 URL 인자에 실어 보낸다. 토큰은 `secrets.json` 에서 서버 내부 함수(`getSecret`)로만
읽고, API/프론트로는 절대 안 나간다(3-tier 키 원칙).

**핵심 결정 4 — 대상 레포는 settings 에서, 커밋 저자는 커밋 단위 주입.**
발행 대상은 `settings.json` 의 `github.repo`("owner/name")/`branch`. → 테스트 레포에서
검증 후 실블로그로 바꿀 때 **앱 설정의 repo 값만** 바꾸면 되고 코드는 불변. 커밋 저자는
`git -c user.name=mdchirp -c user.email=mdchirp@localhost commit` 으로 커밋 단위 주입 →
NAS 전역 git config 를 오염시키지 않는다.

**핵심 결정 5 — repo/ 워킹카피는 수동 clone(자동 안 함).**
서버 기동 시 자동 clone 을 넣으면 인증·네트워크·실패 경로가 많아져 walking skeleton 정신에
안 맞는다. 그래서 최초 1회는 사람이 SSH 로 clone(DEPLOY §13), `SimpleGitPublisher` 는
`repo/.git` 존재만 확인해 없으면 **명확한 에러**(clone 안내)를 던진다.

**핵심 결정 6 — 발행 실패는 502 로 명확히 전달.**
git 실패(토큰 없음/repo 미설정/clone 안 됨/네트워크)는 발행 라우트에서 try/catch 로 잡아
`502 { error:'publish_failed', message }` 로 돌려준다. 실패 시 status 를 published 로
바꾸지 않아 재시도가 자연스럽다. 내용이 이전과 같으면 git 이 "nothing to commit" →
`committed:false`(에러 아님, 정상).

**검증** — 테스트 레포(`mdchirp-publish-test`)에 앱 발행 → `_posts/<slug>.md` 반영 확인.
직접 `curl .../publish` 와 앱 UI 발행 둘 다 성공. (Container Manager 로그는 자동 갱신이
안 돼 처음엔 "요청이 안 온다" 고 착각 — 새로고침하니 `POST .../publish 200` 확인.)

> 발행 결과는 성공·실패 토스트로 표시한다. 백엔드 응답의
> `committed`, `pushedAt`, 오류 메시지를 사용자가 확인할 수 있다.

## B-99. 변경 이력 (개발 타임라인)

- **(이전)** 백엔드 walking skeleton 완료 — 저장/rev충돌/발행빌더, 테스트+HTTP 검증, commit `95a5552`.
- **(이번)** 에디터 1차 완료:
  - `@mdchirp/core` 패키지 세팅 (React + TipTap + shared).
  - `markdown.ts` 양방향 변환 + `markdown.test.ts` 17 케이스 통과.
  - `base.ts`(기본 서식 확장), `EditorView.tsx`(이벤트만 쏘는 본체), `Toolbar.tsx`, `SplitView.tsx`.
  - `BrowserDictation`(Web Speech) 어댑터.
  - `apps/playground`(Vite 검증앱) — 빌드 성공, 브라우저 로드 무에러 확인.
  - 이 매뉴얼 시작.
- **(이번 추가)** MD 칸을 **양방향 편집**으로 승격 + 취소선 버튼 명확화:
  - MD 칸을 읽기전용 `<pre>` → **편집 가능한 `<textarea>`** 로 교체.
  - `EditorView`에 `externalMarkdown` prop 추가 → 값 변경 시 `setContent(json, false)`로 리치 반영.
  - `SplitView`가 양쪽 편집 조율: *last-edited-side-wins* + MD→리치 디바운스(500ms) + 에코 루프 차단.
  - 변환기 **idempotent** 검증 추가(두 번 돌려도 동일) → 핑퐁 발산 방지. 테스트 17→**24 케이스** 통과.
  - 취소선 버튼: 라벨 `S̶` + 단축키 힌트(`Ctrl/Cmd+Shift+S`)로 명확화(기능은 이미 있었음).
- **(이번 추가 2)** 저장/발행 위치 정리 + 툴바 세련화:
  - **저장/발행을 분할뷰 상단 바로 이동.** 리치 전용이 아니라 리치/MD 공통 동작이므로 `EditorView`에서 빼고 `SplitView`가 소유. `SplitView`가 현재 문서 상태(markdown+tiptapJson)를 들고 있다가 저장/발행 시 조립. `Ctrl/Cmd+S`도 분할뷰 레벨로.
  - **EditorView 경계 더 순수해짐** — 이제 편집 + onChange만. 저장/발행/단축키 책임 없음.
  - **툴바 TipTap 스타일로 재설계** — 제목/목록/정렬을 **드롭다운 메뉴**로, 글자서식·블록·삽입·AI는 **인라인 SVG 아이콘**(`icons.tsx`, 외부 의존 없음). 구분선/호버/활성 상태 정리.
  - 24 테스트 유지, typecheck 통과, 빌드+브라우저 무에러.
- **(이번 추가 3)** **sync 레이어 — 에디터 ↔ NAS 백엔드 실제 연결 (첫 end-to-end 관통):**
  - `adapters.ts` — `HttpAdapter`/`LocalStorageAdapter` 인터페이스로 플랫폼 분리(주입식).
  - `NasClient.ts` — `/api/posts/*` 타입드 래퍼. **409를 예외 아닌 결과**로 반환(정상 흐름 분기).
  - `Sync.ts` — 본체: `saveLocalDraft`/`saveToNas`(baseRev→409)/`requestPublish`/`schedulePublish`/`list`/`get`,
    **오프라인 큐**(적재→복귀 시 순차 flush), `onConflict`/`onConnectivity`, `resolveOverwrite`.
  - 구체 어댑터 `impl/FetchHttpAdapter`(fetch, status 그대로 노출) + `impl/MemoryStorageAdapter`(메모리/localStorage, Dexie 슬롯).
  - 통합테스트 `sync.itest.ts` — 라이브 백엔드 대상 **18/18 통과**(저장→rev증가, stale→409, 덮어쓰기, 발행, 오프라인 큐→flush).
  - 플레이그라운드를 실제 sync로 배선: 상단에 **온라인 상태·rev·NAS 주소**, 충돌 시 **주황 배너(덮어쓰기/취소)**, 이벤트 로그가 NAS 왕복을 표시.
  - 전 패키지 typecheck 통과, 빌드 성공, 브라우저에서 백엔드 public URL 도달 확인.
- **(이번 추가 4)** **공용 툴바 — 리치/MD 한 줄 통합 + 밑줄/색/미디어 삽입:**
  - **툴바를 리치/MD 공용으로 확장** — `EditorCommands` 인터페이스(intent) + `RichCommands`/`MarkdownCommands`(실행) 주입. `SplitView`가 포커스로 활성 패널을 추적해 맞는 구현체를 고름. 같은 버튼이 리치=표현, MD=마크다운 코드로 작동. 상단 바에 `적용 대상` 배지 + 활성 패널 테두리.
  - **새 서식**: 밑줄(`<u>`), 글자색(7색, `<span style>`), 형광펜(6색 다중, `==…==`/`<mark>`). markdown-it `html:true`로 왕복 파싱. `markdown.test.ts` 24→**32 케이스** 통과(왕복+멱등).
  - **미디어 삽입 드롭다운**: 이미지 / 영상 / 링크 / 파일 / 수평선 (1차는 prompt 입력, 추후 업로드로 확장).
  - `EditorView`가 `onEditorReady`/`onSelectionChange`로 editor 인스턴스를 위로 노출(툴바가 분할뷰 소유라서). 전 패키지 typecheck 통과, 빌드+브라우저 무에러.
- **(이번 추가 5)** **레이아웃 재배치 + 발행 메뉴(지금/예약) + 링크·미디어 분리:**
  - **3층 레이아웃**: (위) 저장/발행 액션 바 → (에디터 바로 위) `MD 편집` + 공용 툴바 한 줄 → 편집 영역. 저장/발행이 툴바와 에디터 사이에 끼던 문제 해소.
  - **발행 버튼 = 메뉴**: 누르면 `지금 발행` / `예약 발행…`(`datetime-local`) 선택. 예약은 로컬 시각→ISO 변환 후 `sync.schedulePublish(slug, publishAt)` → backend `/api/posts/:slug/schedule`.
  - **링크 분리**: 일반 하이퍼링크 🔗를 드롭다운 밖 독립 버튼으로(자주 씀). 미디어 삽입 드롭다운은 **이미지(외부 URL)/유튜브 임베드/파일/수평선** 전용.
  - **유튜브 임베드**: URL에서 영상 id 추출(watch/youtu.be/embed/shorts) → Chirpy `{% include embed/youtube.html id='…' %}` 삽입.
  - 전 패키지 typecheck 통과, 빌드+브라우저 무에러.
- **(이번 추가 6)** **서식 제안 패널 + NAS Gemini 프록시 (B 모드):**
  - **백엔드**: `ai/gemini.ts`(Gemini REST 프록시, `isGeminiConfigured`, `suggestFormat` — **range를 서버가 `indexOf`로 계산**, 환각 `before`는 폐기), `routes/ai.ts`(`/api/format/suggest` — 키 없으면 503, 실패 시 502; `/api/slug/suggest`는 501 스텁), `config.ts`에 `geminiApiKey`/`geminiModel` + `.dev.vars` dotenv 로더, `/api/health`에 `features.formatter` 플래그.
  - **키 보안**: Gemini 키는 **NAS에만**. 프론트는 마크다운만 전송, 제안만 수신. `.dev.vars`는 gitignore.
  - **core**: `LlmFormatter`(어댑터 — `refresh()`로 health 읽어 `isAvailable()` 캐시), `SuggestionPanel`(diff 카드, ✓수락/✗거절, 자동 실행, **자동 적용 금지**). `SplitView`에 `applySuggestion`(range 우선→indexOf 폴백→없으면 무시) + `toggleSuggestions`.
  - **B 모드**: 키 없으면 ✨ 비활성(health `not_configured`/503). 키 드롭인 시 코드 변경 0으로 활성화.
  - 검증: 키 없음→`not_configured`+503, 더미 키→`ready`+502(구글 "API key not valid") = 전체 경로 옳음 확인. 전 패키지 typecheck 통과, 빌드+브라우저 무에러.
- **(이번 추가 7)** **lister 모듈 — 글 목록/검색/필터/정렬 + 상태 배지 (첫 협업 분담 모듈):**
  - **순수함수 우선(B-2 패턴)**: `selectPosts(posts, query)`(검색/필터/정렬)와
    `statusBadge`/`extraBadges`(배지 데이터)를 런타임/JSX와 분리해 먼저 작성.
    `lister.test.ts` 23케이스 통과(검색·status·onlyExternal·category·tags(AND)·정렬·배지).
  - **계약 준수**: props 를 새로 만들지 않고 `shared/ui-contract.ts` 의 `ListerProps` 를
    그대로 import. controlled(query 미소유) + posts 직접 fetch 안 함(SPEC §2/§3).
  - **필드 매핑 결정(SPEC §2-1)**: 카테고리/태그는 Post 최상위가 아니라 `frontmatter` 안.
    publishedAt 정렬 시 값 없는 글은 asc/desc 무관하게 항상 맨 뒤. scheduled 라벨은 `schedule.publishAt`.
  - `Lister.tsx`(controlled UI) + `lister.css`, `core/index.ts` 에서 export, playground 에
    목록/에디터 탭으로 마운트 → 실제 NAS `sync.list()` 데이터로 배지·점선·필터 눈으로 검증.
- **(이번 추가 7-fix)** **sync 버그 수정 — FetchHttpAdapter `this` 바인딩:**
  - 브라우저에서 `this.f(url)` 형태 호출 시 `fetch` 의 `this` 가 window 가 아니어서
    `Illegal invocation` 으로 health 요청이 네트워크에 나가기 전에 죽던 문제.
    `fetch.bind(globalThis)` 로 수정. (Node 통합테스트에선 안 드러나고 playground 에서 발견.)
- **(이번 추가 8)** **shell 모듈 — 모듈 배치/전환 그릇 (조립 진입점):**
  - `platformAdapters.ts`(PlatformAdapter→sync 어댑터 변환: url↔path, ok 계산, all=keys+get 합성),
    `shortcuts.ts`(단축키 등록/해제 순수함수), `Shell.tsx`(레이아웃+배선: Sync 구성, lister↔editor 전환,
    onConflict 배너, formatter 주입+가용성 key 리렌더, onNew 임시 slug).
  - ui-contract `PlatformAdapter` 에 `formatter?` 추가(주입 철학). core `index.ts` 에서 Shell export.
  - playground 에 간이 `makePlaygroundPlatform`(fetch http + localStorage storage + LlmFormatter) + `Shell (조립)` 탭.
  - shell.test.ts 19 케이스 통과(변환 어댑터+Sync over adapters+단축키), 전 패키지 typecheck, playground 에서 NAS 왕복 확인.
  - **(이번 추가 9)** **settings 모듈 — 연결/키/정책 설정 (섹션 레지스트리 방식):**
  - **섹션 레지스트리**: SPEC §4 표를 `sections.ts`(SECTIONS 배열)로 옮겨 UI 의 단일 소스로. 각 섹션이 `status: ready|partial|slot`. 새 기능 = 배열에 한 줄 추가(기존 불변).
  - **status 3단계로 "죽은 버튼" 방지**: ready=실동작, partial=값만 저장(소비처 연결 후 효과), slot=🚧 비활성 자리표시자(todo 로 시야에 남김). backend 슬롯 컨벤션과 동일.
  - **순수함수 우선(B-2 패턴)**: `mergeDevice`(editor 중첩 안전 병합) / `buildNasPatch`(변경 그룹만) / `normalizeIdleMin`(0=끔) / `submitSecret`(올바른 호출+입력 비움). `settings.test.ts` 통과.
  - **secret 보안**: 키는 props `nas`(마스킹 불린)로만 받고, 입력 state 는 저장 즉시 `''` 로 비움(메모리 미보유, SPEC §5-1). `submitSecret` 이 이를 순수하게 보장 → 화면 없이 테스트로 검증.
  - **계약 준수**: props 를 새로 만들지 않고 `ui-contract.ts` 의 `SettingsProps` 그대로 import. 직접 네트워크 안 함(콜백 위임).
  - playground 에 `설정` 탭 마운트(섹션 12개 표시). ⚠️ backend `/api/secrets`·`/api/settings` 미구현이라 ready 섹션 end-to-end 는 backend 작업에서 완결 예정.
  - playground 에 `설정` 탭 마운트(섹션 12개 표시). ready 섹션 end-to-end 는 추가 10(backend secrets/settings)에서 완결.
- **(이번 추가 10)** **backend secrets/settings 라우트 — settings 모듈 end-to-end 완결:**
  - **추가 9 의 ⚠️ 해소**: ready 섹션(연결/GitHub/AI 키)이 실제 NAS 까지 관통.
    키 입력 → `onSetSecret` → `PUT /api/secrets` → NAS 파일, 응답은 마스킹 불린만.
  - `store/secretStore.ts` — 키(secrets.json)와 설정(settings.json)을 분리 영속.
    **키 원본은 secrets.json 에만**, settings.json 엔 절대 안 넣음. `getSettings()` 가
    `github.tokenSet`/`ai.keySet` 을 **항상 secrets 파일에서 재계산**(settings.json 의 불린 불신).
  - `routes/secrets.ts`(`PUT /api/secrets`, write-only) + `routes/settings.ts`(`GET/PUT /api/settings`, 마스킹),
    `server.ts` 에 `ai` 라우트 아래로 등록. shared `SetSecretRequest`/`GetSettingsResponse` 그대로 사용(타입 추가 0).
  - **gemini 키 즉시 활성(B 모드)**: 키 저장 시 `process.env.GEMINI_API_KEY`/`config.geminiApiKey` 런타임 주입
    → 재시작 없이 `isGeminiConfigured()` true, ✨ formatter ready 전환(B-9 와 동일 철학).
  - **walking skeleton 한계(SPEC §8 todo)**: secrets.json 평문 저장(.env 동급), 권한 600 은 리눅스/Docker 배포 시 적용.
  - **검증**: `secretStore.test.ts` 6 checks(초기상태/저장/env 주입/덮어쓰기/마스킹 미노출/병합 재계산),
    플레이그라운드 E2E — 연결테스트 200, GitHub·AI 키 저장 200 + 입력 즉시 비움 + `설정됨 ✓`. 전 패키지 `pnpm check` 통과.
- **(이번 추가 11)** **slug 제안 — 제목→영문 slug 후보 (서식제안과 같은 Gemini 인프라):**
  - **백엔드**: `gemini.ts` 에 `suggestSlug(title)` + `normalizeSlug`(소문자/하이픈/영숫자 정규화, 단일 규칙 함수) 추가. `routes/ai.ts` 의 501 스텁 → 실제 호출(키 없으면 503, 실패 502, 빈 제목이면 빈 배열).
  - **core**: `LlmSlugSuggester` 어댑터(`LlmFormatter` 골격 복제 — health `features.slug` 로 가용성 캐시). 키 있으면 Gemini 가 영문 번역 slug 후보 제공. 키 없거나 오프라인이면 **음역하지 않고** 작성자 제목을 `normalizeSlug` 로 정리해 후보 1개로 씀(못 만들면 빈 배열 → 직접 입력). 자동 적용 금지(후보 제시 → 사람 선택).
  - **검증**: `slug.test.ts`(normalizeSlug 10케이스). 키 없음→503, 더미 키→502 로 전체 경로 확인(B-9 와 동일 방식).
- **(이번 추가 12)** **프론트매터 패널(FrontmatterPanel) + slug 제안 UI 배선:**
  - **순수함수 우선(B-2 패턴)**: `frontmatter/frontmatterForm.ts`(폼 ↔ ChirpyFrontmatter 변환 — tags 소문자/콤마 파싱, categories ≤2 튜플, authors 파싱, 빈값 키 생략, date/media_subpath 불간섭) + `frontmatter.test.ts` 28 케이스 통과 후 UI.
  - **FrontmatterPanel.tsx (controlled)**: 자기 상태 없이 `form`/`slug` 받고 `onChange`/`onSlugChange` 로 쏨. Chirpy 전 필드 GUI(title/slug/categories/tags/description/author(s)/image/pin·math·mermaid·toc·comments·render_with_liquid).
  - **소유/위치 결정**: 듀얼뷰에서 중복 안 되게 **SplitView 가 소유**, 맨 위 액션 바 아래 **접이식 가로 영역**(`⚙ 필드 ▾`). 프론트매터는 리치/MD 공통 "글 전체 메타"라 본문 옆이 아니라 위.
  - **slug 제안 버튼**: `LlmSlugSuggester` 어댑터(지난 세션 산출물) 주입. 누르면 후보 칩 → 사람이 클릭해야 반영(**자동 적용 금지**, §6-1). 키 있으면 Gemini 영문 번역, 없으면 제목 정리 폴백.
  - **계약 추가(변경 아님)**: `PostPatch` 에 `slug?` 추가(types.ts), `EditorProps` 에 `slugSuggester?` 추가. SplitView 가 frontmatter/title/slug 상태를 소유하고 `buildPost`/`onChange` 에 반영(title 은 Post.title↔frontmatter.title 동기화, 미편집 필드는 기존 frontmatter 보존).
  - 검증: `frontmatter.test.ts` 28, 전 패키지 `pnpm check` 통과, playground 에디터 탭에서 패널 펼침 + 제목→후보→선택 NAS 왕복 눈 확인.
- **(이번 추가 13)** **desktop (Tauri 셸) — 1차 MVP 끝까지 관통:**
  - ui-contract `PlatformAdapter` 에 `slugSuggester?`/`dictation?` **추가**(변경 아님). Shell 이 `platform.dictation ?? BrowserDictation` 폴백으로 받아 SplitView 로 내림. playground `shellPlatform.ts` 도 slug/dictation 주입하게 갱신.
  - `apps/desktop/` scaffold: `main.tsx`(Shell 마운트) + `platform/`(http=fetch·storage=localStorage·shortcut=DOM·openExternal=Tauri shell + AI 어댑터 주입) + `src-tauri/`(Cargo.toml·main.rs·tauri.conf.json·build.rs). 루트 build 에서 desktop 제외, `dev:desktop` 추가.
  - storage 1차 localStorage(길 A) — Dexie 는 슬롯(§7). Windows 실행 확인(Rust 로컬 빌드). 함정(아이콘·[lib]·스크립트 위치) MANUAL B-11 에 기록.
- **(이번 추가 14)** **GitHub 발행(git push) 실구현 + 부팅 시 Gemini 키 자동 재로드:**
  - `apps/backend/src/publisher/simpleGitPublisher.ts` 신규 — `GitPublisher` 실구현체
    (child_process 로 git add/commit/push). PAT 를 push URL 에 1회 주입, 커밋 저자
    `mdchirp`/`mdchirp@localhost` 를 `-c` 로 주입, `repo/.git` 없으면 명확한 에러.
  - `routes/posts.ts` — `NoopGitPublisher` → `SimpleGitPublisher` 주입, 발행 라우트에
    try/catch(실패 시 502 `publish_failed`). `store/secretStore.ts` — 서버 내부 전용
    `getSecret`(키 원본 읽기) 추가.
  - **부팅 시 키 재로드**: `secretStore.loadSecretsIntoEnv()` 추가 + `server.ts` 기동 시
    1회 호출 → 컨테이너 Recreate 로 process.env 가 비어도 secrets.json 의 gemini 키를
    재주입(features 가 not_configured 로 안 돌아감). `server.ts` 의 라우트 중복 등록도 정리.
  - repo/ 워킹카피는 수동 clone(DEPLOY §13). 검증: 앱 발행 → 테스트 레포 `_posts/` 반영.
- **(이번 추가 15)** **저자 기능 통합 + authors.yml 드롭다운:**
  - **저자 단일 필드**: 프론트매터 패널의 author/authors 두 칸을 **한 칸**으로 통합(콤마로 복수 입력). `frontmatterForm` 이 한 명이면 `author`, 여럿이면 `authors` 배열로 직렬화. `frontmatter.test.ts` 로 단수/복수/왕복 검증.
  - **publishBuilder 저자 출력**: `renderWithSubpath` 가 author/authors 를 프론트매터에 출력(비면 생략 → Chirpy `social.name` fallback). 이전엔 저자를 안 써서 항상 기본 저자로 표시되던 버그 해소.
  - **authors.yml 드롭다운**: `GET /api/authors`(백엔드)가 `repo/_data/authors.yml` 을 yaml 파서로 읽어 `[{key,name}]` 반환. FrontmatterPanel 이 드롭다운으로 표시, 선택 시 키를 저자 칸에 삽입. authors.yml 키와 일치해야 Chirpy 프로필 링크가 걸림.
  - **설정 안내**: 설정 → GitHub 섹션에 authors.yml 사용법·fallback·수동 입력 안내 문구 추가.
- **(이번 추가 16)** **발행 시각 기준(NAS/기기) 선택 + 서버 시간대 반영:**
  - **모드 선택**: `NasSettings.timezone` = `'nas'`(기본) | `'device'`. 설정 → GitHub 섹션 드롭다운으로 고름. nas=서버(집 NAS) 시간대, device=발행한 기기의 현재 시간대.
  - **서버 실제 시간대 사용**: nas 모드는 하드코딩이 아니라 컨테이너의 실제 오프셋을 읽음(`serverOffset()`). Dockerfile 에 `tzdata` 설치 + `TZ=Asia/Seoul`(compose 에도) 설정해 컨테이너가 한국 시간(+0900)을 정확히 반환.
  - **기기 오프셋 전달**: 프론트(`NasClient.publish`)가 항상 기기 오프셋(`new Date().getTimezoneOffset()` → `+0900` 형식)을 요청 body 에 실어 보내고, 사용 여부는 백엔드가 모드로 결정. `normalizePublishDate` 가 이 오프셋으로 date 직렬화.
  - 전 패키지 typecheck + core test(143) 통과.
- **(이번 추가 17)** **발행 프론트매터 폼 기준 교체 + 저자 드롭다운 전용화 + slug 정규화:**
  - **buildPost 폼 기준 교체**: 저장/발행 시 `...post.frontmatter` 로 기존 값을 통째로 병합하던 걸 멈추고, 시스템 필드(`media_subpath`)만 보존한 뒤 폼 값으로 교체(`{...preserved, ...fm, title}`). 이전엔 UI에서 날짜를 비워도 예전 `date` 가, 저자를 바꿔도 예전 `author` 가 파일에 그대로 남던 버그(폼 값이 발행에 반영 안 됨)를 해소. slug 전달·slug 변경 경고·새 글 생성 로직은 건드리지 않음(frontmatter 한 줄만 변경).
  - **date 선택 필드화**: `ChirpyFrontmatter.date: string` → `date?: string`. "비우면 백엔드가 발행 시각으로 채운다"는 설계와 타입을 일치시킴(빈 date 를 강제로 넣던 타입 불일치 제거). core/backend typecheck 통과.
  - **저자 드롭다운 전용화**: FrontmatterPanel 저자 칸을 `readOnly` 로 만들어 자유 입력을 막고, 드롭다운(authors.yml 키)으로만 추가 + ✕ 버튼으로 전체 지움. Chirpy 는 authors.yml 에 **없는** 이름을 저자로 쓰면 화면에 **아예 표시 안 함**(빈칸)을 실발행으로 확인 → 오타로 저자가 사라지는 사고를 원천 차단. 한글 키(`옥토`)도 authors.yml 에 등록돼 있으면 정상 작동함을 실발행으로 검증(By Okto Kim). ✕ 버튼은 세로로 접히던 텍스트 버튼을 정사각형 아이콘으로 정리(`.mdc-fm__authorclear`).
  - **slug 정규화(2중 방어선)**: `packages/shared/src/slug.ts` 신규 — `slugify`(소문자/공백·언더스코어→하이픈/영숫자+하이픈만 허용/중복·양끝 하이픈 정리, **한글 제거**). 프론트는 FrontmatterPanel slug 입력의 **onBlur** 에서 정규화(입력 중엔 하이픈이 지워지지 않도록 즉시 정규화는 안 함 — 즉시 정규화 시 방금 친 `-` 를 양끝 하이픈으로 보고 지우는 문제 때문). 백엔드는 `dateSlug.ts` 의 `resolveFilename` 에서 slug 부분에 `slugify` 적용(날짜 접두사는 보존). → 공백 파일명(`2026-07-03-final test.md`)·깨지는 URL 방지.
  - 검증: core test 143 유지, core/backend typecheck 통과. 앱 실발행으로 date 자동 채움(현재 KST)·저자 정상 표시·slug 정리 확인. 커밋 `07f35dc`.
- **(이번 추가 18)** **발행/저장 피드백 토스트:**
  - 발행·예약·저장의 성공/실패를 Shell 토스트(`shell__toast` 재사용)로 표시. 눌러도 반응이 없어 성공/실패를 체감 못 하던 문제 해소(기능은 정상이었음).
  - `Sync.requestPublish`/`schedulePublish` 반환을 `void`→`PublishResult`(`ok`/`queued`/`message`/`githubPath`/`publishedAt`/`scheduledAt`)로 교체해 결과를 위로 전달(409 를 결과로 다루는 철학과 동일). `NasClient` 가 던지는 `NasError` 는 Sync 내부 try/catch 로 결과 객체로 변환.
  - `Shell.onSave`/`onRequestPublish`/`onSchedulePublish` 가 결과를 받아 토스트: 발행 완료 / 발행 실패(+메시지) / 예약 등록 완료 / 오프라인 대기 / 저장됨. `onSave` 는 충돌 시 배너도 뜨게 보강(이전엔 무처리).
  - **문구 결정**: 발행 완료 = git push 성공(둘째 층). 예약은 "발행 완료"가 아니라 "**등록 완료**"로 표기 — 스케줄러 등록일 뿐 블로그 반영이 아니므로 오해 방지.
  - 백엔드 무변경(순수 프론트). 검증: core test 유지, `pnpm check` 통과, 앱에서 저장·발행성공·발행실패(502) 토스트 + GitHub `_posts/` 실반영 확인.
- **(이번 추가 19)** **상태 3종 축소(synced/syncing 제거):**
  - `PostStatus` 를 draft / scheduled / published 3종으로 축소. syncing(동기화중)·synced(저장됨) 제거.
  - 미발행 글은 로컬/NAS 구분 없이 전부 **초안(draft)**. NAS 저장 성공 여부는 토스트로 알림.
  - 오프라인으로 로컬에만 대기중인 상태는 status 가 아니라 draft envelope 의 `dirty=true` 로만 유지(sync 내부 메타). 초안 별표 UI 는 도입하지 않기로 결정(아래 추가 21).
  - `Sync.saveToNas`/`resolveOverwrite` 의 오프라인 분기에서 status 조작(`status:'syncing'`) 제거 → 원래 post 를 그대로 반환.
  - 영향: types.ts(PostStatus), statusBadge.ts(배지 매핑), Lister.tsx(필터 칩), Sync.ts(오프라인 분기), lister.test.ts·sync.itest.ts(테스트) 정리. `pnpm check` 통과.
- **(이번 추가 20)** **발행 후 수정 별표(*발행됨):**
  - 발행된 글을 고쳐 저장하면 리스트 배지가 "발행됨" → "*발행됨" 으로 바뀌고, 재발행하면 별표가 사라진다.
  - `Post.publishedRev`(마지막 발행 시점 rev) 필드 추가. 발행 라우트에서 save 직전 `post.publishedRev = post.rev + 1` 로 기록(save 가 rev 를 +1 올리므로 발행 직후엔 rev == publishedRev → 별표 없음).
  - `statusBadge` 에서 published + `rev > publishedRev` 일 때 라벨 앞에 `*` 부착.
  - 영향: types.ts(publishedRev), posts.ts(발행 라우트 1줄), statusBadge.ts(별표 조건), lister.test.ts(별표 케이스 2건). 백엔드 변경이라 NAS 재빌드 필요. `pnpm check` 통과.
- **(이번 추가 21)** **발행 별표 전파 버그픽스 + 초안 별표 도입 취소:**
  - **버그**: 발행 후 수정해도 리스트에 별표가 안 뜨거나, 재발행해도 별표가 안 사라짐. 원인은 `publishedRev` 가 "서버 meta.json → 목록 요약 → 프론트 로컬 draft" 로 흐르는 경로 중 여러 곳에서 누락된 것.
  - **수정 4곳**: `PostSummary`·`PublishResponse`(api-contract.ts)에 `publishedRev` 추가, 백엔드 `toSummary`·발행 응답(posts.ts)에 `publishedRev` 실어 보냄, `postStore` 의 save 가 일반 저장 시 기존 `publishedRev` 보존(`incoming.publishedRev ?? existing?.publishedRev`), `Sync.summaryToPost`·`bumpDraftAfterPublish` 가 `publishedRev` 를 받아 로컬 draft 에 반영.
  - **초안 별표 취소**: "저장 안 한 초안은 리스트에 없는 것"을 정상 동작으로 확정. 표시할 자리(에디터에 제목 헤더 영역이 없음)도 없어 초안 별표 UI 는 도입하지 않기로 결정. `dirty` 는 오프라인 대기·미반영 추적용 sync 내부 메타로만 유지(별표로 노출하지 않음).
  - 검증: `pnpm check` 통과(에러 0), 앱 실발행으로 *발행됨 표시·재발행 시 별표 제거 확인. 백엔드 변경이라 NAS 재빌드 필요.
- **(이번 추가 22)** **글 삭제 / 발행 취소 (GitHub·NAS·로컬 3곳 일치):**
  - **삭제**: `DELETE /api/posts/:slug` 확장 — published 면 GitHub 본문(_posts/<slug>.md)+
    이미지폴더(assets/img/posts/<slug>/)를 git rm 커밋+push, NAS 글폴더는 `.trash/<slug>__<시각>`
    로 이동(완전 삭제 아님, 복원 여지), 로컬 draft 는 프론트가 제거. draft/scheduled 는 git 없이
    trash 이동만. 응답 `{ok, unpublished, committed?, pushedAt?}`, git 실패 502 `delete_failed`.
  - **발행 취소**: `POST /api/posts/:slug/unpublish` 신규 — GitHub 에서 본문+이미지만 제거,
    NAS 글폴더·로컬 draft 는 보존, status→draft(배지 발행됨→초안, 다시 발행하면 복귀).
  - **git 흐름 공유**: `simpleGitPublisher` 의 commit→pull --rebase(+abort 자가치유)→push 를
    private `commitPullPush` 로 추출, `commitAndPush`(add)와 새 `removePaths`(git rm -r
    --ignore-unmatch)가 공유. 삭제 커밋에도 자가치유 자동 적용. `GitPublisher` 인터페이스에
    `removePaths` 추가(Noop 도 no-op 구현).
  - **삭제 대상 경로 = 저장된 githubPath**: slug 만으로 재구성하면 날짜 접두사(resolveFilename)
    때문에 어긋나 "안 지워짐" 이 되므로, 발행이 실제로 만든 `post.githubPath` 를 진실로 삼음
    (없는 예전 데이터만 재계산 폴백). meta.json 이 가리키는 현재 발행본만 제거(slug/date 바꿔
    갈라진 옛 파일은 별개 글이라 안 건드림).
  - **로컬 draft 정합성(list 청소)**: online 에서 NAS 목록에 없고 dirty=false 인 로컬 draft 는
    삭제 잔재로 보고 청소, dirty=true(미저장 초안)는 보존. 다른 기기/웹에서 지운 글의 잔재 자동 정리.
  - **offline 차단**: 삭제/발행취소는 파괴적 git 동작이라 큐잉하지 않고 online 에서만.
  - **UI**: Lister 항목 hover 시 🗑 버튼(window.confirm, status 로 문구 분기), SplitView 발행
    메뉴에 published 글일 때만 "발행 취소" 항목. Shell 이 배선(토스트 피드백).
  - 검증: 전 패키지 typecheck + core test 143 통과, playground 에서 초안삭제·발행글삭제·발행취소
    (GitHub 반영·배지 초안 전환·재발행 복귀)·offline 차단 확인.
- **(이번 추가 23)** **NAS 본문 로드 + 열 때 rev 대조 (다른 기기/재설치 후 글 열기):**
  - **문제**: A 기기에서 만들어 NAS 에 저장한 글을 B 기기(또는 재설치)에서 목록으로는 보이나
    클릭해 열지 못했다. `onOpen` 이 `sync.get`(로컬 draft) 만 봤기 때문("로컬 본문이 없는 글").
  - **`Sync.openPost(id, slug?)` 신설(선택 B — get 은 그대로)**: 열 때 로컬 draft 와 NAS rev 를
    맞춰 `OpenResult`(`local`/`loaded`/`stale`/`none`)로 반환. 로컬 없으면 `NasClient.get(slug)`
    로 로드해 캐시(`baseRev=rev, dirty=false`)→loaded. 로컬 있고 NAS 가 더 최신이면 **자동
    교체하지 않고** stale 로 넘겨 사람이 고름(`adoptRemote` 로 확정). 새 private `cacheFromNas`.
  - **두 관문 설계**: 열 때 rev 대조(1관문)는 "최신본 받고 시작할래?", 저장 시 baseRev 409(2관문,
    기존 유지)는 "편집하는 동안 또 바뀌었는데 밀어낼래?". 열 때 갱신을 거부하고 저장하면 baseRev
    를 건드리지 않으므로 저장 시 409 로 다시 사람이 고른다(열고~저장 사이 변경까지 잡음). 자동
    덮어쓰기 금지 원칙(§7) 준수.
  - **Shell 배선**: `onOpen` 이 목록(posts)에서 slug 를 찾아 `openPost` 호출. stale 이면
    `window.confirm`("다른 기기에서 새 버전이 저장됨, 불러올까요?") → 불러오기=adoptRemote+열기,
    취소=로컬 열기. none 이면 online/offline 문구 분기. playground `openFromList` 는 결과를
    로그로 표시(실제 열기는 Shell 탭 검증).
  - **소프트 잠금은 별개 슬롯**: rev 는 저장돼야 오르므로 "지금 편집 중"은 감지 못 함 →
    root SPEC §6-1 2차(lockedBy 배지)로 AI_WORKFLOW §7 에 남김.
  - **backend 무변경**(NasClient.get 이 이미 전체 Post 반환) → NAS 재빌드 불필요.
  - 검증: `sync.itest.ts` 에 openPost 8케이스 추가 → NAS 대상 **27/27 통과**(loaded/slug일치/
    캐시/baseRev=rev/dirty=false/local/stale/adopt 후 local). `pnpm check` 통과.
- **완료:** 이미지 첨부·조회·원본/WebP 저장, 발행 전 누락 이미지 차단,
  이미지 설정 모달, Markdown 크기 속성 왕복, 리치 이미지 리사이즈,
  MD 이미지 미리보기와 리치/MD 표시 토글.
- **완료:** 기존 리치 이미지 상세 편집:
  - React NodeView의 `getPos()`로 더블클릭한 이미지 노드를 정확히 식별한다.
  - alt와 숫자 너비·높이 편집, 자연 크기 기준 원본 비율 유지 기능을 제공한다.
  - 원본 크기 복원은 TipTap 이미지 노드의 width/height를 `null`로 바꾸고 Markdown 크기 속성을 제거한다.
  - 본문 이미지 삭제는 TipTap 노드와 Markdown 참조만 제거하며 NAS 파일과 `Post.media[]`는 유지한다.
  - 적용·복원·삭제 직후 TipTap JSON과 Markdown을 함께 갱신하여 바로 저장해도 최신 상태를 보존한다.
  - 크기 검증 순수 함수 테스트 25개와 이미지 속성 저장·재열기 Markdown 테스트를 추가했다.
  - `pnpm check`, 실제 앱의 다른 글 왕복 및 앱 재실행 검증을 통과했다.
- **다음 예정:** 미사용 이미지 정리, 고급 미디어 정책,
  prompter/embed, Chirpy 확장 문법.
