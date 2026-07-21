// /api/settings 라우트 — NAS측 설정 조회/저장(키 마스킹). 정식 명세: apps/backend/SPEC.md §5
import { Hono } from 'hono'
import type { NasSettings } from '@mdchirp/shared'
import { getSettings, saveSettings } from '../store/secretStore.js'

export const settings = new Hono()

// 조회 — 키는 마스킹(tokenSet/keySet 불린만, secrets 존재 여부로 계산).
settings.get('/', (c) => {
  return c.json(getSettings())
})

// 부분 저장 — 받은 그룹만 병합. 키 원본은 여기서 다루지 않는다(secrets 라우트 전용).
settings.put('/', async (c) => {
  const part = await c.req.json<Partial<NasSettings>>()
  const saved = saveSettings(part ?? {})
  return c.json(saved)
})
