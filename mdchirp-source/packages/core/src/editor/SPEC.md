# editor 모듈 SPEC

> mdchirp의 심장. 글을 쓰는 곳.
> 상위: `/SPEC.md` · 공유 타입: `packages/shared/SPEC.md`

---

## 1. 목적 (Why)

TipTap 기반 리치 에디터로 Chirpy 블로그 글을 작성한다.
손으로 Markdown을 치지 않아도, 리치 편집 → MD 자동 변환이 되게 한다.

---

## 2. 책임 범위 (What it does / does NOT)

**한다:**
- 리치 텍스트 편집 (TipTap)
- 리치 ↔ Markdown 양방향 변환
- 리치 편집창 / MD 코드창을 각각 켜고 끄는 표시 토글
- 기본 서식: 글자서식(굵게/기울임/취소선/인라인코드), 정렬, 제목(섹션), 인용, 코드블록, 미디어 삽입, 링크, 문단, 목록(순서/비순서/체크)
- 대중적 단축키 (Cmd/Ctrl+B/I/U, 제목, 목록 등)
- 프론트매터 편집 패널 (Chirpy 필드 GUI)
- 받아쓰기 (DictationProvider 어댑터를 통해 텍스트 수신)
- 서식 제안 (Formatter 어댑터 호출 → diff 패널 → 수락)
- 영문 slug 제안 트리거 (SlugSuggester 호출 → 후보 표시 → 사용자 선택)
- 파일 선택·Drag & Drop·클립보드 이미지를 하나의 첨부 이벤트로 위임
- 이미지 업로드 성공 후 현재 활성 패널(리치/MD)의 커서 위치에 이미지 삽입
- 리치 에디터에서 로컬 이미지를 NAS 미디어 조회 URL로 표시하되 TipTap JSON/Markdown에는 파일명만 보존
- MD 편집기에서 이미지 파일명을 클릭하면 이미지 미리보기 표시
- 리치 이미지를 더블클릭하면 기존 이미지 상세 편집 모달 표시
- 기존 이미지의 alt, 숫자 너비·높이, 원본 비율 유지 설정 편집
- 이미지 노드의 width/height 제거를 통한 원본 크기 복원
- 본문의 이미지 노드 삭제
- 워터마크 미리보기만 (실제 합성은 backend 발행 빌더)
- 저장 충돌 다이얼로그 (409 Conflict 수신 시 사용자 선택 UI)

**안 한다 (경계):**
- 저장하지 않는다 → `onSave` 이벤트만 쏜다 (실제 저장은 sync)
- 네트워크를 직접 치지 않는다 → 받아쓰기/서식제안/slug 엔진 호출도 어댑터 경유
- 발행하지 않는다 → 발행은 backend
- 미디어를 직접 업로드하지 않는다 → `onUploadImage` 이벤트로 상위 shell/sync에 위임하고 결과만 받아 본문에 삽입한다
- NAS 주소를 직접 조합하지 않는다 → `resolveMediaUrl`로 표시용 URL을 주입받는다
- 본문에서 이미지 노드를 삭제해도 NAS 미디어 파일은 삭제하지 않는다
- 삭제된 본문 이미지의 미사용 미디어 탐지·정리는 하지 않는다
- 워터마크를 굽지 않는다 → 미리보기만, 합성은 backend
- 충돌을 해소하지 않는다 → 409를 받으면 선택지를 보여주고 결과를 sync에 위임

---

## 3. 공개 인터페이스 (Public API)

`EditorView`(리치 편집창)와 `SplitView`(양방향 편집 + 공통 상단 바)가 책임을 나눈다.

- `EditorView`는 리치 편집과 변경 통지만 담당한다.
- `SplitView`는 리치/MD 동기화, 공용 툴바, 프론트매터, 저장/발행 액션, 이미지 첨부 입력을 소유한다.
- 실제 저장·발행·이미지 업로드는 상위 shell/sync로 위임한다.

```typescript
// 리치 이미지 상세 편집을 위해 정확한 이미지 노드 위치와 현재 속성을 전달한다.
interface RichImageEditTarget {
  pos: number
  src: string
  alt: string
  width: number | null
  height: number | null
}

// EditorView — 리치 편집창. 편집 + 변경 통지만 담당.
interface EditorProps {
  post: Post
  readOnly?: boolean

  slugSuggester?: SlugSuggester

  // SplitView가 MD 편집 결과를 리치로 밀어넣을 때 사용.
  externalMarkdown?: string

  onChange?: (patch: PostPatch) => void
  onEditorReady?: (editor: Editor | null) => void
  onSelectionChange?: () => void

  // 리치 이미지 더블클릭 시 정확한 노드 위치와 현재 속성을 전달한다.
  // 상세 편집 모달은 EditorView가 아니라 SplitView가 소유한다.
  onImageEdit?: (image: RichImageEditTarget) => void
}

// SplitView — 양방향 편집, 공용 툴바, 문서 액션, 첨부 이벤트 소유.
interface SplitViewProps extends EditorProps {
  // 기존 호환 필드.
  // true면 처음에 리치+MD, false면 리치만 표시한다.
  // 이후에는 [리치] [MD] 버튼으로 각각 표시 여부를 바꾼다.
  defaultOpen?: boolean

  dictation?: DictationProvider
  formatter?: Formatter

  onSave?: (post: Post) => void
  onRequestPublish?: (post: Post) => void
  onSchedulePublish?: (post: Post, publishAt: string) => void
  onUnpublish?: (post: Post) => void
  onOpenSuggestions?: () => void

  // 파일 선택/Drag & Drop/클립보드 이미지가 모두 이 이벤트로 수렴한다.
  // 상위는 글 저장 → NAS 이미지 업로드를 수행하고 성공한 MediaFile을 반환한다.
  // null이면 offline/충돌/업로드 실패이므로 본문에 이미지 참조를 삽입하지 않는다.
  onUploadImage?: (post: Post, file: File) => Promise<MediaFile | null>

  // 로컬 파일명을 리치/MD 미리보기용 NAS URL로 변환하는 표시 전용 함수.
  // 반환 URL은 TipTap JSON/Markdown에 저장하지 않는다.
  resolveMediaUrl?: (slug: string, filename: string) => string

  authorOptions?: { key: string; name: string }[]
}

// 편집 중 부분 변경.
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

**사용 예(shell이 끼우는 법):**

```tsx
<SplitView
  post={current}
  dictation={platform.dictation}
  formatter={platform.formatter}
  slugSuggester={platform.slugSuggester}
  onChange={(patch) => sync.saveLocalDraft(patch)}
  onSave={(post) => sync.saveToNas(post)}
  onRequestPublish={(post) => sync.requestPublish(post.id)}
  onUploadImage={async (post, file) => {
    const saved = await sync.saveToNas(post)
    if (!saved.ok) return null

    const uploaded = await sync.uploadMedia(post.slug, file, file.name)
    return uploaded.ok ? uploaded.media : null
  }}
  resolveMediaUrl={(slug, filename) =>
    platform.mediaUrl?.(slug, filename) ?? filename
  }
/>
```

---

## 4. 하위 구성 (Sub-structure)

```text
editor/
├── EditorView.tsx          # 리치 편집 본체. props in/events out
├── Toolbar.tsx             # 리치/MD 공용 툴바. intent만 알고 EditorCommands에 위임
├── icons.tsx               # 인라인 SVG 아이콘 (외부 의존 없음)
├── commands/
│   ├── types.ts            # EditorCommands 인터페이스 + intent 타입
│   ├── RichCommands.ts     # TipTap editor.chain() 구현
│   └── MarkdownCommands.ts # textarea 선택영역 → MD 문법 구현
├── extensions/
│   ├── base.ts             # 기본 TipTap 확장 + 로컬 이미지 표시 URL 처리
│   ├── markdown.ts         # 리치 ↔ MD 변환
│   └── chirpy/             # 📋 슬롯: Chirpy 전용 문법
│       ├── promptBox.ts
│       ├── imageAttrs.ts
│       ├── codeFilename.ts
│       └── embed.ts
├── split/
│   ├── SplitView.tsx             # 양방향 편집, 리치/MD 표시 토글, 이미지 첨부 입력 수렴
│   └── MarkdownImagePreview.tsx  # MD 이미지 파일명 클릭 미리보기
├── frontmatter/
│   ├── FrontmatterPanel.tsx
│   ├── frontmatterForm.ts
│   └── frontmatter.test.ts
├── dictation/
│   ├── DictationProvider.ts
│   └── providers/
│       ├── BrowserDictation.ts
│       ├── OsDictation.ts
│       └── WhisperLocal.ts
└── formatter/
    ├── Formatter.ts
    ├── LlmFormatter.ts
    ├── RuleFormatter.ts
    └── SuggestionPanel.tsx
```

---

## 5. 받아쓰기 (Dictation)

```typescript
interface DictationProvider {
  id: string
  isAvailable(): boolean
  start(onText: (chunk: string, isFinal: boolean) => void): void
  stop(): void
}
```

- 에디터는 "텍스트 청크가 들어온다"만 안다. 엔진 종류는 모른다.
- 1차: `BrowserDictation` (Web Speech API) — 웹뷰 내장, 무료, 온라인.
- 받아쓴 텍스트는 현재 커서 위치에 삽입한다.
- `isFinal=false`는 중간결과, `true`면 확정 결과다.
- 오프라인이거나 `isAvailable()===false`면 받아쓰기 버튼을 비활성화한다.

---

## 6. 서식 제안 (Format Suggestion)

```typescript
interface FormatSuggestion {
  id: string
  range: { from: number; to: number }
  before: string
  after: string
  type: 'heading' | 'codeblock' | 'prompt' | 'list' | 'link' | 'quote' | string
  reason: string
}

interface Formatter {
  id: string
  isAvailable(): boolean
  suggest(doc: object, opts?: FormatOptions): Promise<FormatSuggestion[]>
}
```

**원칙:**
- `suggest()`는 제안만 반환한다. 문서를 직접 바꾸지 않는다.
- 제안은 `SuggestionPanel`에 diff로 표시한다.
- 사용자가 수락한 제안만 문서에 적용한다.
- 자동 적용하지 않는다.

**1차 구현 — LlmFormatter ✅:**
- Markdown을 NAS `/api/format/suggest`로 전송한다.
- NAS가 Gemini를 호출하며 키는 NAS에만 보관한다.
- range는 서버가 `markdown.indexOf(before)`로 계산한다.
- 키가 없거나 오프라인이면 formatter 버튼을 비활성화한다.

**SuggestionPanel ✅:**
- before/after/reason/type을 카드로 표시한다.
- 수락 시 range 우선, `indexOf` 폴백으로 적용한다.
- 현재 본문에서 대상을 찾지 못하면 적용하지 않는다.

**RuleFormatter 📋:**
- URL 자동링크, 목록 등 결정론적 오프라인 제안 슬롯.

---

## 6-1. 영문 slug 제안 (Slug Suggestion)

```typescript
interface SlugSuggester {
  id: string
  isAvailable(): boolean
  suggest(title: string): Promise<string[]>
}
```

- 한글 제목을 영문 slug 후보로 제안한다.
- 자동 적용하지 않고 후보를 사람이 선택한다.
- 1차는 `LlmSlugSuggester`로 NAS Gemini 프록시를 사용한다.
- 키가 없으면 제목을 `normalizeSlug`로 정리한 후보만 제공한다.
- 음역하지 않는다.
- 정리 결과가 비면 빈 배열을 반환해 사용자가 직접 입력하게 한다.

---


### 6-1-1. 기존 글의 slug 변경 UI 🚧

slug 입력은 Post의 정체성을 직접 바꾸지 않는다. `SplitView`는 편집 중인 Post의 기존 `id`를 유지한 채 변경된 slug를 `onSave(post)`로 전달하고, rename 또는 fork의 최종 판정은 NAS backend에 맡긴다.

#### 미발행 글

- slug 변경 저장은 같은 ID의 글폴더 rename으로 처리될 수 있음을 안내한다.
- 본문, 리치 원본, 미디어와 rev 계보가 같은 글에 유지된다.
- editor가 새 ID를 만들거나 미디어를 직접 복사하지 않는다.

#### 발행 이력이 있는 글

- slug 변경 저장 전에 “기존 발행 글은 보존되고 새 초안으로 복제됩니다”라는 확인을 표시한다.
- 사용자가 취소하면 저장·발행 요청을 보내지 않는다.
- 사용자가 승인하면 기존 ID를 유지한 요청을 보낸다. backend가 실제 발행 흔적과 rev를 검사한 뒤 새 ID를 발급한다.
- 성공 응답의 새 Post 전환은 shell/sync 책임이며 editor가 임의 ID를 생성하지 않는다.
- fork된 글은 draft이므로 사용자가 별도로 발행해야 한다.

#### date-only 재발행

- slug가 변하지 않고 front-matter date만 바뀐 경우 slug 변경 경고를 표시하지 않는다.
- editor는 변경된 date를 포함한 Post를 일반 저장·발행 경로로 전달한다.
- GitHub 파일명과 `githubPath` 재사용 여부는 backend가 결정한다.

UI에서 보는 `status`, `githubPath`, `publishedAt`, `publishedRev`, `publishedSlug`는 경고를 위한 힌트다. `publishedSlug`는 발행 취소 후에도 보존되는 마지막 실제 발행 slug이지만 그 자체로 fork 여부를 결정하지 않는다. 최종 rename/fork 판정의 진실원은 NAS에 저장된 최신 Post의 현재 `status`와 실제 rev다. `status='published'`이면 fork하고, 발행 취소되어 `status='draft'`이면 같은 ID로 rename한다.

---

## 6-2. 저장 충돌 다이얼로그 (Conflict)

- 저장 시 sync가 NAS에 `baseRev`를 동봉한다.
- NAS가 `409 version_conflict`를 반환하면 현재 NAS 글과 로컬 글을 구분해 사용자에게 선택지를 제공한다.
- 현재 NAS Post와 로컬 Post의 slug가 다르면 그 차이를 비교 정보로 표시하되, rev 증가 원인을 slug 변경으로 단정하지 않는다.
- 사용자가 “내 것으로 덮어쓰기”를 명시적으로 선택하면 로컬 본문·front-matter·slug 전체를 현재 NAS rev 기준으로 다시 저장한다.
- 자동으로 덮어쓰거나 병합하지 않는다.
- 밀려나는 내용은 backend `.history/`에 보관한다.
- `slug_taken`은 버전 덮어쓰기 선택으로 해결하지 않는다. 다른 slug를 입력하도록 안내한다.
- `duplicate_post_id`는 자동 복구하지 않고 NAS 데이터 점검이 필요하다고 안내한다.
- 실제 rev, 히스토리, rename/fork 판정은 sync/backend 책임이다.

---

## 7. MD 분할뷰 / 변환

- TipTap JSON ↔ Markdown 변환은 `extensions/markdown.ts`가 단일 책임이다.
- 리치와 MD 어느 쪽을 편집해도 반대쪽에 반영한다.

### 표시 토글

기존 `MD 편집/닫기` 단일 버튼을 `[리치] [MD]` 독립 토글로 교체한다.

- 리치만 표시할 수 있다.
- MD만 표시할 수 있다.
- 리치와 MD를 동시에 표시할 수 있다.
- 두 패널을 모두 끄는 것은 허용하지 않는다.
- 마지막으로 남은 패널의 버튼은 켜진 색을 유지하면서 클릭만 막는다.
- 버튼에는 `활성` 같은 상태 텍스트를 추가하지 않는다.
- 켜짐/꺼짐은 배경색·테두리·글자색과 `aria-pressed`로 구분한다.
- 둘 다 표시되면 기존 좌우 분할 레이아웃을 사용한다.
- 한쪽만 표시되면 해당 패널이 전체 편집 너비를 사용한다.
- 툴바 적용 대상은 보이는 패널 중 마지막으로 포커스한 패널을 따른다.
- 패널을 숨길 때 활성 대상이었다면 남아 있는 패널로 활성 대상을 옮긴다.
- 가능하면 패널을 unmount하지 않고 CSS로 숨겨 TipTap undo history, textarea 선택·스크롤을 보존한다.

### 양방향 편집 안전 규칙

1. **last-edited-side-wins** — 마지막으로 편집한 패널을 진실원으로 사용한다.
2. MD → 리치 반영은 디바운스한다.
3. 방금 생성한 변경을 되받아 다시 반영하지 않도록 에코 루프를 차단한다.
4. 변환기는 idempotent해야 한다.
5. Chirpy 확장 문법이 깨지지 않도록 round-trip 테스트를 유지한다.

### 외부 유입 글

`hasRichSource===false`인 글은 Markdown을 파싱해 리치로 표시한다.

상단에는 다음 안내를 표시한다.

> 리치 원본 없음 — 외부에서 들어온 글입니다. 저장 시 리치 원본이 생성됩니다.

---

## 7-1. 공용 툴바 (리치/MD) — 의도/실행 분리

툴바는 한 줄에 한 벌만 두고 리치·MD 두 패널에서 공용으로 사용한다.

```typescript
interface EditorCommands {
  readonly target: 'rich' | 'md'

  toggle(intent: ToggleIntent): void
  isActive(intent: ToggleIntent): boolean

  setParagraph(intent: ParagraphIntent): void
  activeParagraph(): ParagraphIntent

  setAlign(intent: AlignIntent): void
  activeAlign(): AlignIntent

  setTextColor(args: { color: string | null }): void
  setHighlightColor(args: { color: string | null }): void

  insertLink(args: InsertLinkArgs): void
  isLinkActive(): boolean

  insertImage(args: InsertImageArgs): void
  insertMedia(args: InsertMediaArgs): void
  insertHorizontalRule(): void
  insertText(text: string): void

  selectedText(): string
}
```

- `Toolbar`는 intent만 알고 실행은 `EditorCommands`에 위임한다.
- `RichCommands`는 TipTap 명령으로 표현을 변경한다.
- `MarkdownCommands`는 textarea 선택영역을 Markdown 문법으로 변경한다.
- `SplitView`가 포커스를 보고 현재 활성 패널에 맞는 구현체를 선택한다.
- `적용 대상: 리치/MD` 배지와 활성 패널 테두리를 유지한다.
- 밑줄은 `<u>`, 글자색은 `<span style>`, 형광펜은 `==...==` 또는 `<mark>`로 직렬화한다.

### 미디어 메뉴

미디어 드롭다운은 다음 항목을 제공한다.

1. **이미지 첨부…** — 로컬 파일 선택 → NAS 업로드
2. **이미지 (외부 URL)** — 기존 URL prompt
3. **유튜브 / 영상 임베드**
4. **파일**
5. **수평선**

로컬 이미지 첨부와 외부 URL 이미지는 별도 메뉴로 유지한다.

---

## 7-2. 이미지 첨부·표시·MD 미리보기 ✅

### 첨부 입력

다음 세 입력은 모두 `SplitView`의 단일 `onUploadImage(post, file)` 이벤트로 수렴한다.

1. 툴바의 `이미지 첨부…` 파일 선택
2. 리치 또는 MD 편집 영역으로 이미지 Drag & Drop
3. 클립보드에 복사된 이미지 붙여넣기

지원 형식:

- JPEG
- PNG
- WebP
- GIF
- 애니메이션 GIF

클라이언트의 `accept` 속성은 사용자 편의를 위한 1차 필터다.
실제 형식·크기·프레임 검증은 backend가 담당한다.

### 업로드 순서

```text
사용자가 이미지 선택/드롭/붙여넣기
  → SplitView가 현재 완성형 Post를 조립
  → onUploadImage(post, file)
  → shell이 Sync.saveToNas(post) 실행
  → 저장 성공 시 Sync.uploadMedia(...)
  → backend가 파일 저장/변환 후 MediaFile 반환
  → SplitView가 Post.media[]에 추가
  → 현재 활성 패널 커서에 이미지 삽입
```

- 업로드 성공 전에는 본문에 로컬 파일명을 삽입하지 않는다.
- 저장 충돌, offline, 업로드 실패 시 본문을 변경하지 않는다.
- 같은 파일 선택/드롭 이벤트가 중복 실행되지 않도록 업로드 중에는 추가 첨부를 막는다.
- 1차는 한 장씩 처리한다.
- Blob 오프라인 큐는 Dexie 전환 후 슬롯으로 남긴다.
- 업로드 성공 후 서버가 확정한 `media.filename`을 사용한다.
- 서버가 반환한 한글 등 Unicode 파일명을 그대로 본문과 TipTap JSON에 보존한다.
- 클라이언트에서 Unicode 파일명을 ASCII 전용 문자열로 다시 정규화하거나 `_.webp`처럼 변경하지 않는다.
- 클립보드 이미지에 이름이 없으면 클라이언트가 임시 이름을 붙이고, 최종 이름은 서버가 확정한다.
- 대체 텍스트는 첨부 시 입력받거나 빈 문자열로 시작할 수 있다.

### Post.media 반영

업로드 성공 응답의 `MediaFile`을 현재 Post의 `media[]`에 추가한다.

```typescript
onChange({
  id: post.id,
  media: nextMedia,
  updatedAt: new Date().toISOString(),
})
```

- `Post.media[]`는 UI와 향후 정책을 위한 메타데이터다.
- 실제 발행 가능 여부는 backend가 Markdown 참조와 NAS 실파일을 다시 검사한다.
- 업로드 API는 `meta.json`과 rev를 직접 변경하지 않는다.
- media 배열은 다음 일반 저장에서 meta.json에 반영된다.

### 리치 에디터 표시

본문과 TipTap JSON에는 로컬 파일명만 보존한다.

```md
![설명](photo.webp)
```

표시할 때만 다음처럼 NAS 조회 URL로 해석한다.

```text
photo.webp
  → resolveMediaUrl(post.slug, "photo.webp")
  → http://NAS/api/posts/<slug>/media/photo.webp
```

규칙:

- `http://`, `https://`, `//` 외부 URL은 원래 src를 사용한다.
- `data:` URL은 원래 src를 사용한다.
- 로컬 파일명만 `resolveMediaUrl`로 변환한다.
- 표시용 NAS URL을 TipTap JSON이나 Markdown에 다시 저장하지 않는다.
- URL resolver가 없으면 원래 src를 사용한다.

### MD 파일명 클릭 미리보기

MD 편집기는 `<textarea>`이므로 내부 문자열 일부를 실제 링크 DOM으로 만들지 않는다.
폰트·배율·자동 줄바꿈에 취약한 좌표 역산도 사용하지 않는다.

동작:

1. 사용자가 MD textarea의 이미지 파일명을 클릭한다.
2. 브라우저가 제공하는 `selectionStart`로 정확한 문자 위치를 얻는다.
3. 해당 문자 위치가 `![alt](path)`의 path 범위 안인지 확인한다.
4. 로컬 파일명이면 `resolveMediaUrl`, 외부 URL이면 원래 주소를 사용한다.
5. 클릭 위치 주변 또는 MD 패널 내부의 고정된 위치에 이미지 미리보기를 표시한다.
6. 다른 위치 클릭, 입력, 패널 이탈, Escape 입력 시 미리보기를 닫는다.

클릭 이벤트의 화면 좌표는 팝업 표시 위치에만 사용할 수 있다.
어떤 파일을 미리볼지 판정하는 데는 사용하지 않는다.

지원 문법:

```md
![설명](photo.webp)
![설명](https://example.com/photo.png)
```

1차 제외:

```md
![설명](photo.webp "title")
![설명][image-ref]
<img src="photo.webp">
```

미리보기 이미지 로드 실패는 편집·저장·발행을 막지 않는다.

---

## 7-3. 기존 리치 이미지 상세 편집 ✅

### 열기와 기존 동작 유지

- 리치 이미지를 한 번 클릭하면 기존과 같이 이미지 노드 선택과 네 방향 리사이즈 핸들을 표시한다.
- 리사이즈 핸들 드래그는 기존과 같이 이미지 비율을 유지한다.
- 리치 이미지를 더블클릭하면 해당 이미지 노드의 상세 편집 모달을 연다.
- 상세 편집 대상은 React NodeView의 `getPos()`로 얻은 정확한 이미지 노드 위치로 식별한다.
- 모달에서 적용하거나 삭제하기 직전에 해당 위치의 노드가 여전히 같은 이미지인지 확인한다.
- MD 이미지 파일명 클릭 미리보기 동작은 유지한다.

### 편집 필드

- 모달에는 현재 이미지 미리보기, 원본 `src`, alt, width, height를 표시한다.
- alt는 빈 문자열을 허용한다.
- width와 height가 모두 비어 있으면 명시적인 사용자 크기가 없는 것으로 처리한다.
- width와 height는 모두 양수인 유한 숫자일 때만 적용하고 정수로 반올림한다.
- 한쪽 크기만 입력했거나 값이 `0`, 음수, `NaN`, 무한대이면 적용하지 않고 안내한다.
- 원본 비율 유지를 켜면 너비 또는 높이 변경 시 반대쪽 값을 자동 계산한다.
- 비율 계산은 로드된 이미지의 자연 너비·높이를 우선 사용한다.
- 자연 크기를 알 수 없으면 현재 노드의 유효한 width/height 비율을 사용한다.
- 두 비율을 모두 알 수 없으면 자동 계산하지 않고 사용자가 너비와 높이를 모두 입력하게 한다.

### 원본 크기 복원

- “원본 크기 복원”은 이미지 파일을 다시 업로드하거나 변경하지 않는다.
- 이미지 노드의 `width`와 `height` 속성을 `null`로 갱신하여 명시적인 크기를 제거한다.
- 원본 크기 복원 후 Markdown의 `{: width="..." height="..." }` 속성도 제거한다.
- alt와 src는 원본 크기 복원 시 변경하지 않는다.

### 본문 이미지 삭제

- 이미지 삭제는 현재 글 본문의 TipTap 이미지 노드만 제거한다.
- 삭제 결과는 Markdown 이미지 참조에도 즉시 반영한다.
- NAS 미디어 파일은 삭제하지 않는다.
- `Post.media[]`도 이번 작업에서는 정리하지 않는다.
- 미사용 미디어 탐지·삭제는 별도 후속 작업으로 남긴다.

### 동기화와 지속성

- 상세 편집 적용, 원본 크기 복원, 이미지 삭제 직후 현재 TipTap JSON과 Markdown을 함께 갱신한다.
- 상세 편집 직후 바로 저장해도 최신 이미지 속성 또는 삭제 결과가 저장되어야 한다.
- 저장된 `tiptapJson`과 Markdown을 통해 다른 글을 열었다 돌아와도 수정 결과가 유지되어야 한다.
- 앱을 재실행하고 저장된 글을 다시 열어도 alt, width, height 및 원본 크기 복원 결과가 유지되어야 한다.
- JSON → Markdown → JSON 왕복에서 alt와 유효한 width/height를 보존한다.
- 원본 크기 복원 후에는 왕복 과정에서 width/height가 다시 생성되지 않아야 한다.

---

## 7-4. 프론트매터 불린 필드 저장 규칙 ✅

프론트매터 체크박스는 기능별 Chirpy 기본 동작이 다르므로 모두 같은 방식으로 생략하지 않는다.

### 기본 비활성 필드

- `pin`
- `math`
- `mermaid`

프론트매터에 필드가 없으면 패널에서 체크 해제 상태로 표시한다.
저장할 때는 체크된 경우에만 `true`를 기록하고, 체크 해제된 `false`는 필드를 생략한다.

### 기본 활성 또는 전역 설정 상속 필드

- `toc`
- `comments`
- `render_with_liquid`

프론트매터에 필드가 없으면 패널에서 체크된 상태로 표시한다.
체크 해제는 사이트 동작을 명시적으로 끄는 의미가 있으므로 저장할 때 `false`를 생략하지 않는다.
세 필드는 저장 시 항상 boolean으로 기록한다.

```typescript
out.toc = form.toc
out.comments = form.comments
out.render_with_liquid = form.renderWithLiquid
```

따라서 기존 문서의 `toc: false`, `comments: false`, `render_with_liquid: false`는 패널을 열고 다시 저장해도 `true`로 바뀌거나 필드가 사라지지 않는다.

## 8. 의존성 (Depends on)

- `@tiptap/*`
- `packages/shared` (`Post`, `PostPatch`, `MediaFile`, `ChirpyFrontmatter`)
- 런타임 주입:
  - `DictationProvider`
  - `Formatter`
  - `SlugSuggester`
  - `onUploadImage`
  - `resolveMediaUrl`
- **직접 의존하지 않음:**
  - sync
  - backend
  - fetch
  - NAS 주소
  - 파일시스템

---

## 9. 상태 (Status)

- ✅ 기본 편집 / 양방향 MD 편집 / BrowserDictation
- ✅ **공용 툴바(리치/MD)** — `EditorCommands` + Rich/Markdown 구현체 주입, 활성 패널 추적
- ✅ **밑줄/글자색/형광펜** 마크 + **미디어 삽입**(외부 이미지/영상/링크/파일/수평선)
- ✅ **LlmFormatter + SuggestionPanel(diff UI)** — NAS Gemini 프록시, 자동 적용 금지
- ✅ **LlmSlugSuggester** — 제목→영문 slug 후보, 자동 적용 금지
- ✅ **프론트매터 패널** — Chirpy 필드 GUI + slug 제안
- ✅ 발행 전 이미지 경로 정규화·누락 차단은 backend에 구현됨
- ✅ **이미지 첨부·설정·미리보기 완료**
  - 툴바 파일 선택, Drag & Drop, 클립보드 이미지 붙여넣기
  - 세 입력을 단일 업로드 흐름으로 통합
  - 오프라인 첨부 차단 및 업로드 실패 시 본문 참조 삽입 방지
  - 이미지 삽입 전 alt, 원본/WebP, 너비·높이, 원본 비율 유지 설정
  - Markdown 이미지 크기 속성 파싱·직렬화
  - MD 파일명 클릭 미리보기, 외부 클릭과 Escape로 닫기

- ✅ **리치 이미지 크기 편집 완료**
  - 한 번 클릭하면 이미지 선택과 네 방향 조절 핸들 표시
  - 핸들 드래그 시 원본 비율을 유지하며 크기 변경
  - 변경된 width/height를 문서와 Markdown에 저장
  - 빈 영역 클릭 시 선택과 핸들 해제

- ✅ **기존 리치 이미지 상세 편집**
  - 더블클릭 상세 편집 모달
  - alt와 숫자 너비·높이 편집
  - 원본 비율 유지
  - width/height 제거 방식의 원본 크기 복원
  - 본문의 이미지 노드 삭제
  - NAS 미디어 파일은 삭제하지 않음
  - 적용·복원·삭제 직후 리치와 Markdown 동기화
  - 저장 후 다른 글 이동 및 앱 재실행 후에도 수정값 유지

- ✅ **리치 | MD 표시 토글 완료**
  - `[리치]`, `[MD]` 독립 토글
  - 최소 한 패널 유지
  - 한 패널만 열면 전체 너비 사용
  - 양쪽을 열면 분할 보기
- 🚧 slug 변경 UI 구현 예정:
  - 미발행 글은 같은 ID rename 안내
  - 발행 글은 원본 보존·새 draft fork 확인
  - date-only 변경은 slug 경고 제외
  - `version_conflict`, `slug_taken`, `duplicate_post_id`별 안내
  - fork 성공 후 새 Post 전환은 shell/sync에 위임
- 📋 슬롯: Chirpy 확장 문법(promptBox/imageAttrs/...), RuleFormatter, OS/Whisper 받아쓰기

---

## 10. 프론트매터 패널 (FrontmatterPanel)

Chirpy 프론트매터를 GUI로 편집한다. 손으로 YAML을 치지 않게 한다.

**소유/위치:**
- `SplitView`가 소유한다.
- 맨 위 액션 바 아래 접이식 가로 영역으로 표시한다.
- 프론트매터는 리치/MD 공통 문서 메타이므로 한 번만 표시한다.

**필드 매핑:**
- `title` — `Post.title`과 `frontmatter.title`을 함께 갱신
- `slug` — `Post.slug`
- `categories` — 최대 2단계
- `tags` — 콤마 구분, 소문자화
- `description`
- `author` / `authors`
- `pin`
- `math`
- `mermaid`
- `toc`
- `comments`
- `render_with_liquid`
- `image.path`
- `image.alt`

**시스템 소유 필드:**
- `media_subpath`는 발행 빌더가 자동으로 주입한다.
- 기존 시스템 필드는 폼이 관리하는 값과 분리해 보존한다.

**slug 제안:**
- `SlugSuggester`가 후보만 반환한다.
- 후보를 자동 적용하지 않는다.
- 사용자가 후보를 클릭해야 반영한다.
- slug 입력은 포커스를 벗어날 때 정규화한다.

---

## 11. 미래 확장 (Future)

- MD 편집기를 CodeMirror 등 decoration 지원 에디터로 교체할 경우 이미지 경로의 진짜 hover 미리보기 제공
- 이미지 여러 장 동시 업로드
- 이미지 첨부 Blob 오프라인 큐(Dexie 전환 후)
- 업로드된 미사용 이미지 탐지·삭제
- Chirpy 이미지 추가 속성(alignment/caption)
- Chirpy 확장 문법 풀세트
- 다국어 문법 검사
- 쇼츠 연동
- 협업/버전 히스토리

## 🚧 저장 충돌의 포괄적 안내

- `version_conflict` 다이얼로그의 기본 문구는 `다른 기기에서 변경이 있었습니다.`로 통일한다.
- 본문, 날짜, front-matter, slug, fork 또는 상태 중 무엇이 rev를 증가시켰는지 추측하거나 충돌 원인으로 단정하지 않는다.
- 로컬 글과 `currentPost`의 slug가 다르더라도 “다른 기기에서 slug를 변경했다”고 단정하지 않고 비교 정보로만 표시한다.
- 별도의 `lastMutation` 필드나 변경 사유 코드를 요구하지 않는다.
- 사용자는 최신본 불러오기, 취소 또는 명시적인 덮어쓰기 절차를 선택할 수 있으며 자동 덮어쓰기·자동 병합은 하지 않는다.
- 이 절의 포괄적 메시지 정책은 앞선 절의 변경 원인을 특정하는 예시 문구보다 우선한다.
