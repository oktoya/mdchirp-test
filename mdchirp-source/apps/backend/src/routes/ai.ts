// /api/format, /api/slug 라우트 — NAS Gemini 프록시.
// 키는 NAS env 에만. 없으면 503(not_configured) → 프론트 버튼 비활성.
import { Hono } from 'hono'
import type {
  FormatSuggestRequest,
  FormatSuggestResponse,
  SlugSuggestRequest,
  SlugSuggestResponse,
} from '@mdchirp/shared'
import { isGeminiConfigured, suggestFormat, suggestSlug } from '../ai/gemini.js'

export const ai = new Hono()

// 서식 제안: { doc: { markdown } } → { suggestions: [...] }
ai.post('/format/suggest', async (c) => {
  if (!isGeminiConfigured()) {
    return c.json(
      { error: 'not_configured', message: 'Gemini API 키가 설정되지 않았습니다(NAS).' },
      503,
    )
  }
  let req: FormatSuggestRequest
  try {
    req = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  const markdown = extractMarkdown(req.doc)
  if (!markdown.trim()) return c.json({ suggestions: [] } satisfies FormatSuggestResponse)

  try {
    const suggestions = await suggestFormat(markdown)
    return c.json({ suggestions } satisfies FormatSuggestResponse)
  } catch (e: any) {
    return c.json({ error: 'gemini_failed', message: String(e?.message ?? e) }, 502)
  }
})

// slug 제안: { title } → { candidates: [...] } (영문 slug 후보)
ai.post('/slug/suggest', async (c) => {
  if (!isGeminiConfigured()) {
    return c.json(
      { error: 'not_configured', message: 'Gemini API 키가 설정되지 않았습니다(NAS).' },
      503,
    )
  }
  let req: SlugSuggestRequest
  try {
    req = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  const title = typeof req?.title === 'string' ? req.title.trim() : ''
  if (!title) return c.json({ candidates: [] } satisfies SlugSuggestResponse)

  try {
    const candidates = await suggestSlug(title)
    return c.json({ candidates } satisfies SlugSuggestResponse)
  } catch (e: any) {
    return c.json({ error: 'gemini_failed', message: String(e?.message ?? e) }, 502)
  }
})

function extractMarkdown(doc: unknown): string {
  if (typeof doc === 'string') return doc
  if (doc && typeof doc === 'object') {
    const d = doc as Record<string, unknown>
    if (typeof d.markdown === 'string') return d.markdown
    if (typeof d.text === 'string') return d.text
  }
  return ''
}
