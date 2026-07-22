// LlmSlugSuggester.ts — [1차] NAS Gemini 프록시 기반 영문 slug 제안 어댑터.
//
// 철학(어댑터): LlmFormatter 와 동일.
//   - 키는 NAS 에만. 프론트는 제목만 보내고 후보만 받는다.
//   - 키 있으면 Gemini 가 "영문 번역" slug 후보를 만든다.
//   - 키 없거나 오프라인이면: 음역(romanize) 하지 않는다. 작성자가 정한 제목을
//     slug 규칙으로 정리(normalizeSlug)해 그대로 후보 1개로 쓴다. 못 만들면 빈 배열.
//   - 자동 적용 금지: suggest() 는 후보 목록만 반환. 선택은 사람이.
//
// isAvailable() 는 동기여야 하므로(인터페이스), NAS health 의 features.slug 를
// refresh() 로 미리 받아 캐시한다.
//
// SPEC: packages/core/src/editor/SPEC.md §6

import type { SlugSuggester } from '@mdchirp/shared'

export interface LlmSlugSuggesterOptions {
  /** NAS 베이스 URL (예: http://localhost:8787) */
  baseUrl: string
  fetchImpl?: typeof fetch
}

/** slug 정규화 — 소문자/하이픈/영숫자만. (백엔드 normalizeSlug 과 동일 규칙) */
export function normalizeSlug(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export class LlmSlugSuggester implements SlugSuggester {
  readonly id = 'llm-gemini-slug'
  private ready = false
  private base: string
  private fetchImpl: typeof fetch

  constructor(opts: LlmSlugSuggesterOptions) {
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
      const data = (await res.json()) as { features?: { slug?: string } }
      this.ready = data.features?.slug === 'ready'
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

  /** 폴백(제목 정리)이 늘 가능하므로 true. 키 유무는 suggest 내부에서 분기. */
  isAvailable(): boolean {
    return true
  }

  /** 제목 → 영문 slug 후보. 키 있으면 Gemini, 없거나 실패하면 제목 정리 폴백. */
  async suggest(title: string): Promise<string[]> {
    // 키가 준비됐을 때만 NAS 호출 시도
    if (this.ready) {
      try {
        const res = await this.fetchImpl(`${this.base}/api/slug/suggest`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title }),
        })
        if (res.status === 503) {
          this.ready = false // 키 미설정 → 폴백으로
        } else if (res.ok) {
          const data = (await res.json()) as { candidates?: string[] }
          const list = (data.candidates ?? [])
            .map((c) => normalizeSlug(c))
            .filter((c) => c.length > 0)
          if (list.length > 0) return dedupe(list)
          // 빈 결과면 폴백으로 진행
        }
        // 그 외 응답(502 등)도 폴백으로
      } catch {
        // 네트워크 실패 → 폴백으로
      }
    }

    // 폴백: 작성자 제목을 slug 규칙으로 정리해 1개 후보. 못 만들면 빈 배열.
    const fromTitle = normalizeSlug(title)
    return fromTitle ? [fromTitle] : []
  }
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of list) {
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}
