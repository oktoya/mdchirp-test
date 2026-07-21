// FetchHttpAdapter — fetch 기반 HttpAdapter 구현 (브라우저/Node18+/Tauri 공통).
// 상태코드를 throw 하지 않고 그대로 노출 → sync 가 409 등을 정상 분기.

import type { HttpAdapter, HttpRequest, HttpResponse } from '../adapters.js'

export interface FetchHttpOptions {
  baseUrl: string // 예: "http://localhost:8787"
  headers?: Record<string, string> // 공통 헤더 (인증 토큰 등)
  fetchImpl?: typeof fetch // 테스트 주입용
}

export class FetchHttpAdapter implements HttpAdapter {
  private baseUrl: string
  private commonHeaders: Record<string, string>
  private f: typeof fetch

  constructor(opts: FetchHttpOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.commonHeaders = opts.headers ?? {}
    this.f = opts.fetchImpl ?? fetch.bind(globalThis)
  }

  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    const url = this.baseUrl + req.path
    const isFormData = req.body instanceof FormData
    const headers: Record<string, string> = {
      ...this.commonHeaders,
      ...(req.headers ?? {}),
    }

    if (isFormData) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-type') delete headers[key]
      }
    } else {
      const hasContentType = Object.keys(headers).some(
        (key) => key.toLowerCase() === 'content-type',
      )
      if (!hasContentType) headers['Content-Type'] = 'application/json'
    }

    const init: RequestInit = {
      method: req.method,
      headers,
      signal: req.signal,
    }

    if (req.body instanceof FormData) {
      init.body = req.body
    } else if (req.body !== undefined) {
      init.body = JSON.stringify(req.body)
    }

    const res = await this.f(url, init)
    let data: unknown = null
    const text = await res.text()
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    return { status: res.status, ok: res.ok, data: data as T }
  }
}
