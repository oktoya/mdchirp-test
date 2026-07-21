// PlatformAdapter(ui-contract) → sync 어댑터 변환.
// SPEC: packages/core/src/shell/SPEC.md §3 (변환 어댑터)
//
// 왜 필요한가: ShellProps 는 PlatformAdapter 만 받지만 Sync 는 HttpAdapter/
// LocalStorageAdapter 를 요구한다. 시그니처가 다르므로(아래) 얇게 변환한다.
//   http:    url↔path, {status,body}↔{status,ok,data}          (ok 는 2xx 계산)
//   storage: put/delete↔set/remove, all 없음 → keys()+get() 합성, signal 미사용
// → ui-contract.ts 는 건드리지 않는다.

import type { PlatformHttp, PlatformStorage } from '@mdchirp/shared'
import type { HttpAdapter, HttpRequest, HttpResponse, LocalStorageAdapter } from '../sync/index.js'

/** PlatformHttp → sync HttpAdapter. ok 는 status 로 계산, body→data, path→url. */
export function adaptPlatformHttp(http: PlatformHttp): HttpAdapter {
  return {
    async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
      const { status, body } = await http.request({
        method: req.method,
        url: req.path,
        body: req.body,
        headers: req.headers,
      })
      return { status, ok: status >= 200 && status < 300, data: body as T }
    },
  }
}

/** PlatformStorage → sync LocalStorageAdapter. set/remove 매핑 + all 합성. */
export function adaptPlatformStorage(storage: PlatformStorage): LocalStorageAdapter {
  return {
    get<T = unknown>(collection: string, key: string): Promise<T | null> {
      return storage.get<T>(collection, key)
    },
    set<T = unknown>(collection: string, key: string, value: T): Promise<void> {
      return storage.put<T>(collection, key, value)
    },
    remove(collection: string, key: string): Promise<void> {
      return storage.delete(collection, key)
    },
    keys(collection: string): Promise<string[]> {
      return storage.keys(collection)
    },
    async all<T = unknown>(collection: string): Promise<T[]> {
      const ks = await storage.keys(collection)
      const vals = await Promise.all(ks.map((k) => storage.get<T>(collection, k)))
      return vals.filter((v) => v !== null) as T[]
    },
  }
}
