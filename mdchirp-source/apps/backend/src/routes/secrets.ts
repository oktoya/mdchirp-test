// /api/secrets 라우트 — 키 write-only 저장. 정식 명세: apps/backend/SPEC.md §5, §8
import { Hono } from 'hono'
import type { SetSecretRequest } from '@mdchirp/shared'
import { setSecret, isSecretSet } from '../store/secretStore.js'

export const secrets = new Hono()

// 키 저장 (write-only). 응답은 set 여부 불린만 — 키 원본은 절대 반환하지 않는다.
secrets.put('/', async (c) => {
  const body = await c.req.json<SetSecretRequest>()
  if (!body?.kind || typeof body.value !== 'string') {
    return c.json({ error: 'bad_request', detail: 'kind & value required' }, 400)
  }
  if (body.kind !== 'github' && body.kind !== 'gemini') {
    return c.json({ error: 'bad_request', detail: 'unknown kind' }, 400)
  }
  setSecret(body.kind, body.value)
  return c.json({
    ok: true,
    githubSet: isSecretSet('github'),
    geminiSet: isSecretSet('gemini'),
  })
})
