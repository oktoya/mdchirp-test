// LlmFormatter.ts — [1차] NAS Gemini 프록시 기반 서식 제안 어댑터.
//
// 철학(어댑터):
//   에디터/툴바는 Formatter 인터페이스만 안다. 엔진(Gemini)·네트워크는 여기 캡슐화.
//   - 키는 NAS 에만 → 프론트는 키를 모른다. 본문만 NAS 로 보내고 제안만 받는다.
//   - 절대 자동 적용 금지: suggest() 는 "제안 목록"만 반환. 적용은 SuggestionPanel(사람)이.
//
// isAvailable() 는 동기여야 하므로(인터페이스), NAS health 의 features.formatter 를
// refresh() 로 미리 받아 캐시한다. 앱은 연결확인 시점에 refresh() 를 호출.
//
// SPEC: packages/core/src/editor/SPEC.md §6

import type { Formatter, FormatSuggestion } from '@mdchirp/shared'

export interface LlmFormatterOptions {
  /** NAS 베이스 URL (예: http://localhost:8787) */
  baseUrl: string
  fetchImpl?: typeof fetch
}

export class LlmFormatter implements Formatter {
  readonly id = 'llm-gemini'
  private ready = false
  private base: string
  private fetchImpl: typeof fetch

  constructor(opts: LlmFormatterOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '')
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis)
  }

  /** NAS health 를 조회해 사용 가능 여부를 캐시. 앱이 연결확인 때 부른다. */
  async refresh(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.base}/api/health`)
      if (!res.ok) {
        this.ready = false
        return false
      }
      const data = (await res.json()) as { features?: { formatter?: string } }
      this.ready = data.features?.formatter === 'ready'
      return this.ready
    } catch {
      this.ready = false
      return false
    }
  }

  /** NAS 주소가 바뀌면 갱신 */
  setBaseUrl(url: string) {
    this.base = url.replace(/\/$/, '')
  }

  isAvailable(): boolean {
    return this.ready
  }

  /**
   * 본문(마크다운)을 NAS 로 보내 서식 제안을 받는다.
   * doc 은 { markdown: string } 형태를 기대(없으면 문자열/text 도 허용).
   */
  async suggest(doc: object, _opts?: Record<string, unknown>): Promise<FormatSuggestion[]> {
    const res = await this.fetchImpl(`${this.base}/api/format/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc }),
    })
    if (res.status === 503) {
      // 키 미설정 — 사용 불가로 표시하고 빈 목록
      this.ready = false
      return []
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`format_suggest_failed_${res.status}: ${detail.slice(0, 200)}`)
    }
    const data = (await res.json()) as { suggestions?: FormatSuggestion[] }
    return data.suggestions ?? []
  }
}
