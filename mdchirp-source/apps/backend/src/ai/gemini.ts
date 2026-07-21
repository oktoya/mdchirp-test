// gemini.ts — NAS 전용 Gemini 프록시. 키는 config(env)에서만 읽는다.
//
// 설계(B 방식 / Karpathy식):
//   - 키 없으면 isConfigured()=false → 라우트가 503(not_configured) 반환, 프론트는 버튼 비활성.
//   - 키 있으면 실제 Gemini REST(generateContent) 호출.
//   - 모델 응답은 "제안 목록 JSON" 으로 강제(responseMimeType=application/json).
//   - 절대 자동 적용 금지: 여기서는 "제안"만 만든다. 적용은 프론트(사람)가.
//
// 키/프롬프트/응답은 전부 서버에만 머문다. 프론트로 키가 새지 않는다.

import { config } from '../config.js'

export function isGeminiConfigured(): boolean {
  return !!config.geminiApiKey
}

export interface RawSuggestion {
  id: string
  range: { from: number; to: number }
  before: string
  after: string
  type: string
  reason: string
}

const SYSTEM_PROMPT = `당신은 한국어 기술 블로그(Jekyll/Chirpy, Markdown) 글의 "서식 교정 도우미"입니다.
주어진 마크다운 본문을 읽고, 서식을 더 좋게 만들 수 있는 부분을 제안하세요.

규칙:
- 글의 "의미/문장"은 바꾸지 마세요. 오직 마크다운 "서식"만 제안합니다.
- 제안 종류(type): "heading"(제목으로), "codeblock"(코드블록으로), "list"(목록으로), "quote"(인용으로), "link"(링크로), "prompt"(Chirpy 프롬프트 박스로).
- 각 제안은 원문 일부("before")와 바뀐 형태("after")를 함께 주세요.
- before 는 본문에 실제로 존재하는 연속된 텍스트 조각이어야 합니다(그대로 찾을 수 있게).
- 확실하지 않으면 제안하지 마세요. 과한 제안보다 적은 제안이 낫습니다. 최대 8개.
- reason 은 한국어 한 문장으로 짧게.

반드시 아래 JSON 스키마로만 응답하세요:
{ "suggestions": [ { "before": string, "after": string, "type": string, "reason": string } ] }`

interface GeminiPart {
  text?: string
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] }
}
interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

/**
 * 마크다운 본문 → 서식 제안 목록.
 * range 는 before 문자열을 본문에서 찾아 채운다(LLM 이 인덱스를 잘 못 세므로 서버가 계산).
 */
export async function suggestFormat(markdown: string): Promise<RawSuggestion[]> {
  if (!config.geminiApiKey) throw new Error('gemini_not_configured')

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent` +
    `?key=${config.geminiApiKey}`

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      { role: 'user', parts: [{ text: '다음 마크다운 본문을 검토하세요:\n\n' + markdown }] },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    throw new Error(`gemini_http_${resp.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await resp.json()) as GeminiResponse
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  const parsed = safeParseSuggestions(text)

  // before 를 본문에서 찾아 range 계산. 못 찾으면 버린다(환각 방지).
  const out: RawSuggestion[] = []
  for (let i = 0; i < parsed.length; i++) {
    const s = parsed[i]
    if (!s.before || typeof s.before !== 'string') continue
    const from = markdown.indexOf(s.before)
    if (from < 0) continue
    out.push({
      id: `fmt-${Date.now()}-${i}`,
      range: { from, to: from + s.before.length },
      before: s.before,
      after: typeof s.after === 'string' ? s.after : s.before,
      type: typeof s.type === 'string' ? s.type : 'format',
      reason: typeof s.reason === 'string' ? s.reason : '',
    })
  }
  return out
}

interface LooseSuggestion {
  before?: unknown
  after?: unknown
  type?: unknown
  reason?: unknown
}

function safeParseSuggestions(text: string): LooseSuggestion[] {
  // responseMimeType=json 이라도 방어적으로 파싱.
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    const obj = JSON.parse(trimmed)
    if (Array.isArray(obj)) return obj as LooseSuggestion[]
    if (obj && Array.isArray(obj.suggestions)) return obj.suggestions as LooseSuggestion[]
  } catch {
    // 무시 — 빈 목록 반환
  }
  return []
}

// ───────────────────────────────────────────────────────────
// slug 제안 — 제목 → 영문 slug 후보. suggestFormat 과 같은 Gemini 패턴.
// ───────────────────────────────────────────────────────────

const SLUG_SYSTEM_PROMPT = `당신은 블로그 글 제목을 URL용 영문 slug 로 바꾸는 도우미입니다.
주어진 (보통 한국어) 제목의 의미를 살린 짧은 영문 slug 후보를 3~5개 제안하세요.

규칙:
- slug 는 소문자 영문/숫자/하이픈(-)만 사용합니다. 공백·특수문자·한글 금지.
- 짧고 의미가 분명하게(보통 2~5단어). 관사(a, the)는 생략 가능.
- 제목의 핵심 의미를 영어로 옮깁니다(음역이 아니라 번역 우선).
- 후보끼리 서로 달라야 합니다.

반드시 아래 JSON 스키마로만 응답하세요:
{ "candidates": ["my-first-post", "hello-world"] }`

/** slug 정규화 — 소문자/하이픈/영숫자만. 단일 규칙 함수. */
export function normalizeSlug(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-') // 공백·언더스코어 → 하이픈
    .replace(/[^a-z0-9-]/g, '') // 영숫자·하이픈 외 제거
    .replace(/-+/g, '-') // 연속 하이픈 축약
    .replace(/^-+|-+$/g, '') // 양끝 하이픈 제거
}

/** 제목 → 영문 slug 후보 목록. range 계산 없음(단순 후보). */
export async function suggestSlug(title: string): Promise<string[]> {
  if (!config.geminiApiKey) throw new Error('gemini_not_configured')

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent` +
    `?key=${config.geminiApiKey}`

  const body = {
    systemInstruction: { parts: [{ text: SLUG_SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: '제목: ' + title }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    throw new Error(`gemini_http_${resp.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await resp.json()) as GeminiResponse
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  const parsed = safeParseSlugs(text)

  // 정규화 + 빈 값/중복 제거
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of parsed) {
    const slug = normalizeSlug(c)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(slug)
  }
  return out
}

function safeParseSlugs(text: string): string[] {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    const obj = JSON.parse(trimmed)
    if (Array.isArray(obj)) return obj.filter((x) => typeof x === 'string')
    if (obj && Array.isArray(obj.candidates)) {
      return obj.candidates.filter((x: unknown) => typeof x === 'string')
    }
  } catch {
    // 무시 — 빈 목록
  }
  return []
}
