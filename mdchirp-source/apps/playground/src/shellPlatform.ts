// shellPlatform.ts — playground 용 간이 PlatformAdapter.
// 실제 desktop/embed 껍데기가 할 일을 브라우저에서 흉내낸다(검증용).
//   http     = fetch 직접 구현(PlatformHttp 모양: {method,url,body}→{status,body})
//   storage  = localStorage 기반 PlatformStorage(get/put/delete/keys)
//   formatter= LlmFormatter(NAS 주소 주입) — 주소를 아는 주체가 구성해 주입
//   registerShortcut = DOM keydown 기반(mod+키)

import type { PlatformAdapter, PlatformHttp, PlatformStorage } from '@mdchirp/shared'
import { LlmFormatter, LlmSlugSuggester, BrowserDictation } from '@mdchirp/core'

function makeHttp(baseUrl: string): PlatformHttp {
  const base = baseUrl.replace(/\/$/, '')
  return {
    async request({ method, url, body, headers }) {
      const isFormData = body instanceof FormData
      const requestHeaders: Record<string, string> = { ...headers }

      if (!isFormData) {
        requestHeaders['content-type'] ??= 'application/json'
      }

      const res = await fetch(base + url, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      })
      let parsed: unknown = null
      const text = await res.text()
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = text
      }
      return { status: res.status, body: parsed }
    },
  }
}

function makeStorage(): PlatformStorage {
  const PREFIX = 'mdchirp-pg:'
  const k = (c: string, key: string) => `${PREFIX}${c}:${key}`
  const ls = typeof window !== 'undefined' ? window.localStorage : undefined
  const mem = new Map<string, string>()
  const read = (fk: string) => (ls ? ls.getItem(fk) : (mem.get(fk) ?? null))
  const write = (fk: string, v: string) => (ls ? ls.setItem(fk, v) : void mem.set(fk, v))
  const del = (fk: string) => (ls ? ls.removeItem(fk) : void mem.delete(fk))
  const allKeys = () => {
    if (ls) {
      const out: string[] = []
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i)
        if (key) out.push(key)
      }
      return out
    }
    return [...mem.keys()]
  }
  return {
    async get<T = unknown>(c: string, key: string): Promise<T | null> {
      const raw = read(k(c, key))
      if (raw == null) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        return null
      }
    },
    async put<T = unknown>(c: string, key: string, value: T): Promise<void> {
      write(k(c, key), JSON.stringify(value))
    },
    async delete(c: string, key: string): Promise<void> {
      del(k(c, key))
    },
    async keys(c: string): Promise<string[]> {
      const p = `${PREFIX}${c}:`
      return allKeys()
        .filter((fk) => fk.startsWith(p))
        .map((fk) => fk.slice(p.length))
    },
  }
}

// DOM 기반 단축키: combo 'mod+n' → (ctrl|meta)+n
function makeRegisterShortcut() {
  return (combo: string, handler: () => void): (() => void) => {
    const [mods, keyRaw] = parseCombo(combo)
    function onKey(e: KeyboardEvent) {
      if (mods.mod && !(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() !== keyRaw) return
      e.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }
}
function parseCombo(combo: string): [{ mod: boolean }, string] {
  const parts = combo.toLowerCase().split('+')
  return [{ mod: parts.includes('mod') }, parts[parts.length - 1]]
}

export function makePlaygroundPlatform(nasUrl: string): PlatformAdapter {
  const baseUrl = nasUrl.replace(/\/$/, '')

  return {
    kind: 'web',
    http: makeHttp(baseUrl),
    storage: makeStorage(),
    formatter: new LlmFormatter({ baseUrl }),
    slugSuggester: new LlmSlugSuggester({ baseUrl }),
    dictation: new BrowserDictation('ko-KR'),
    registerShortcut: makeRegisterShortcut(),
    openExternal: (url) => window.open(url, '_blank'),
    mediaUrl: (slug, filename) =>
      `${baseUrl}/api/posts/${encodeURIComponent(slug)}/media/${encodeURIComponent(filename)}`,
  }
}
