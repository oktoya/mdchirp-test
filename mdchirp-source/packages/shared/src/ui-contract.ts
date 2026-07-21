// ───────────────────────────────────────────────────────────
// UI 경계 계약 (UI boundary contracts)
//
// 여러 모듈이 공유하는 "컴포넌트 props" 와 "플랫폼 어댑터" 계약.
// 도메인 타입(types.ts)과 달리, 이건 모듈 간 배선(wiring)의 경계다.
//
// ⚠️ 협업 규칙: 이 파일의 타입을 바꾸면 lister/settings/shell/desktop/embed 중
//    하나 이상이 깨진다. 변경/삭제는 사전 합의(이슈) 필요. 추가는 자유.
//
// 빈 슬롯 모듈을 맡은 사람은 자기 props 를 새로 만들지 말고 여기서 import 한다.
// → 시그니처가 강제로 일치하므로 나중에 합칠 때 충돌이 없다.
// ───────────────────────────────────────────────────────────

import type {
  Post,
  PostStatus,
  DeviceSettings,
  NasSettings,
  Formatter,
  SlugSuggester,
  DictationProvider,
} from './types.js'
import type { RemotePostDiagnostic } from './api-contract.js'

// ───────────────────────────────────────────────────────────
// PlatformAdapter — shell/desktop/embed 가 공유하는 핵심 계약
//
// core 는 OS/브라우저 기능을 직접 부르지 않고 이 어댑터를 주입받아 쓴다.
//   - desktop(Tauri): storage=IndexedDB, http=fetch, 전역 단축키=Tauri API
//   - embed(브라우저):  storage=IndexedDB, http=NAS(터널), 단축키=DOM
//   - 테스트:          전부 메모리 구현
// ───────────────────────────────────────────────────────────

/** 플랫폼 종류 — UI 가 분기할 때 참고 (로직 분기는 최소화) */
export type PlatformKind = 'desktop' | 'embed' | 'web'

/** 키-값 영속 저장 (IndexedDB/메모리 등으로 구현) */
export interface PlatformStorage {
  get<T = unknown>(collection: string, key: string): Promise<T | null>
  put<T = unknown>(collection: string, key: string, value: T): Promise<void>
  delete(collection: string, key: string): Promise<void>
  keys(collection: string): Promise<string[]>
}

/** HTTP 호출 (NAS 통신). status 를 그대로 노출(409 등을 결과로 다루기 위함). */
export interface PlatformHttp {
  request(opts: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    url: string
    body?: unknown
    headers?: Record<string, string>
  }): Promise<{ status: number; body: unknown }>
}

/** 전역 단축키 등록. 반환값은 해제 함수(cleanup). */
export type RegisterShortcut = (combo: string, handler: () => void) => () => void

/**
 * 플랫폼 어댑터 — 껍데기(desktop/embed)가 구성해서 Shell 에 주입한다.
 * core 는 이 인터페이스에만 의존하므로 어떤 플랫폼에서도 그대로 동작한다.
 */
export interface PlatformAdapter {
  kind: PlatformKind
  storage: PlatformStorage
  http: PlatformHttp
  /** 전역 단축키 등록(있으면). 없는 플랫폼이면 생략 가능. */
  registerShortcut?: RegisterShortcut
  /** 외부 링크 열기(OS 브라우저 등). 없으면 window.open 폴백. */
  openExternal?: (url: string) => void
  /** 글별 NAS 미디어 파일의 조회 URL을 생성한다. 외부 URL에는 사용하지 않는다. */
  mediaUrl?: (slug: string, filename: string) => string
  /** AI 서식 제안 어댑터(껍데기가 NAS 주소를 알고 구성해 주입). 없으면 ✨ 비활성. */
  formatter?: Formatter
  /** slug 제안 어댑터(껍데기가 NAS 주소를 알고 구성해 주입). 없으면 ✨ slug 버튼 비활성. */
  slugSuggester?: SlugSuggester
  /**
   * 받아쓰기 어댑터(껍데기가 주입). 없으면 shell 이 기본 BrowserDictation 으로 폴백.
   * 1차: BrowserDictation(Web Speech). OS받아쓰기/Whisper 는 슬롯(AI_WORKFLOW §7).
   */
  dictation?: DictationProvider
}

// ───────────────────────────────────────────────────────────
// lister — 글 목록/검색/필터
// ───────────────────────────────────────────────────────────

export interface ListQuery {
  text?: string
  status?: PostStatus[]
  onlyExternal?: boolean // hasRichSource === false 인 글만
  category?: string
  tags?: string[]
  sort: { by: 'updatedAt' | 'publishedAt' | 'title'; dir: 'asc' | 'desc' }
}

/** ListQuery 의 안전한 기본값 — 협업자는 이걸 초기 상태로 쓰면 된다. */
export const DEFAULT_LIST_QUERY: ListQuery = {
  sort: { by: 'updatedAt', dir: 'desc' },
}

export interface ListerProps {
  /** sync.list() 로 받은 글 목록 (로컬 캐시 우선). lister 는 직접 fetch 하지 않는다. */
  posts: Post[]
  /** NAS 목록을 읽는 중인지 */
  loading?: boolean
  /** 사용자가 요청한 GitHub 수동 새로고침이 진행 중인지 */
  refreshing?: boolean
  /**
   * 원격 파일 진단 결과.
   * 프론트매터 오류 등 NAS Post로 가져올 수 없는 파일도 목록에 표시하기 위해 사용한다.
   */
  remoteDiagnostics?: RemotePostDiagnostic[]
  query: ListQuery
  onQueryChange: (q: ListQuery) => void
  /** 글 선택 → shell 이 받아 editor 를 연다 (이벤트 계약) */
  onOpen: (id: string) => void
  /** 새 글 만들기 → shell 이 받아 빈 editor 를 연다 */
  onNew: () => void
  /**
   * 사용자가 누르는 수동 새로고침.
   * shell이 GitHub refresh를 실행한 뒤 NAS 목록을 다시 읽는다.
   */
  onRefresh?: () => void | Promise<void>
  /** 글 삭제 요청 → shell 이 받아 sync.deletePost 위임. 확인은 Lister 가 window.confirm 으로. */
  onDelete?: (id: string) => void
}

// ───────────────────────────────────────────────────────────
// settings — 연결/키/정책/어댑터 구성
// ───────────────────────────────────────────────────────────

export type SecretKind = 'github' | 'gemini'

export interface SettingsProps {
  device: DeviceSettings
  nas: NasSettings // 키는 마스킹된 상태(tokenSet/keySet 불린만)
  onSaveDevice: (d: DeviceSettings) => void
  onSaveNas: (n: Partial<NasSettings>) => void
  /** 키 입력 → NAS 로 write-only 전송. 응답은 set 여부 불린만. */
  onSetSecret: (kind: SecretKind, value: string) => void
  /** 연결 테스트(/api/health) 트리거. 결과는 nas 갱신으로 반영. */
  onTestConnection?: () => void
}

// ───────────────────────────────────────────────────────────
// shell — 모듈 배치/전환 그릇
// ───────────────────────────────────────────────────────────

export type ShellMode = 'full' | 'popup'

/** shell 메인 영역에 무엇을 띄울지 */
export type ShellPane = 'editor' | 'settings' | 'prompter'

export interface ShellProps {
  /** 껍데기(desktop/embed)가 주입 */
  platform: PlatformAdapter
  /** full=앱, popup=블로그 모달(embed, 축소 레이아웃). 기본 full. */
  mode?: ShellMode
}
