// sync 레이어 공개 진입점.
export type { HttpAdapter, HttpRequest, HttpResponse, LocalStorageAdapter } from './adapters.js'
export { COLLECTIONS } from './adapters.js'

export { NasClient, NasError } from './NasClient.js'
export type { NasSaveResult } from './NasClient.js'

export { Sync } from './Sync.js'
export type {
  SyncOptions,
  SaveResult,
  OpenResult,
  ConflictInfo,
  DraftEnvelope,
  QueueItem,
  MediaUploadResult,
} from './Sync.js'

export { FetchHttpAdapter } from './impl/FetchHttpAdapter.js'
export type { FetchHttpOptions } from './impl/FetchHttpAdapter.js'
export { MemoryStorageAdapter } from './impl/MemoryStorageAdapter.js'
