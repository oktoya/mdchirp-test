// sync 어댑터 인터페이스 — core를 플랫폼(Tauri/브라우저)에서 분리하는 경계.
// 정식 명세: packages/core/SPEC.md (PlatformAdapter), packages/core/src/sync/SPEC.md §5
//
// core 는 fetch/IndexedDB 를 직접 부르지 않는다. 대신 아래 두 인터페이스를
// 주입받아 쓴다. → 테스트에선 메모리 구현, 브라우저/Tauri 에선 실제 구현 주입.

// ───────────────────────────────────────────────────────────
// HttpAdapter — NAS 백엔드와의 HTTP 통신 (fetch 추상화)
// ───────────────────────────────────────────────────────────

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string // baseUrl 기준 상대경로. 예: "/api/posts/2026-..-hello"
  body?: unknown // JSON 직렬화될 객체
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface HttpResponse<T = unknown> {
  status: number // HTTP 상태코드 (200, 409, 404 ...)
  ok: boolean // 2xx 여부
  data: T // 파싱된 JSON 바디 (실패 시 그대로)
}

export interface HttpAdapter {
  // 단일 진입점. 상태코드를 그대로 노출해 sync 가 409 등을 직접 분기하게 한다.
  // (throw 가 아니라 status 로 구분 → 409 같은 "정상 흐름"을 예외로 만들지 않음)
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>
}

// ───────────────────────────────────────────────────────────
// LocalStorageAdapter — 로컬 영속 저장 (IndexedDB/Dexie 슬롯)
// ───────────────────────────────────────────────────────────
//
// key-value 형태로 단순화. sync 가 네임스페이스(컬렉션)와 키를 직접 관리한다.
// 1차: 메모리/localStorage 구현. 추후 Dexie 구현으로 교체(인터페이스 동일).

export interface LocalStorageAdapter {
  get<T = unknown>(collection: string, key: string): Promise<T | null>
  set<T = unknown>(collection: string, key: string, value: T): Promise<void>
  remove(collection: string, key: string): Promise<void>
  // 한 컬렉션의 모든 값 (목록 캐시/큐 순회용)
  all<T = unknown>(collection: string): Promise<T[]>
  keys(collection: string): Promise<string[]>
}

// sync 가 쓰는 컬렉션 이름 (오타 방지용 상수)
export const COLLECTIONS = {
  drafts: 'drafts', // 로컬 초안 (Post 전체, slug 키)
  queue: 'queue', // 동기화 큐 (QueueItem, opId 키)
} as const
