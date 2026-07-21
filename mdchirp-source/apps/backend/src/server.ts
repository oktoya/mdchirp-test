// mdchirp NAS 백엔드 진입점 (Node + Hono). 정식 명세: apps/backend/SPEC.md
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { HealthResponse } from '@mdchirp/shared'
import { config } from './config.js'
import { posts } from './routes/posts.js'
import { ai } from './routes/ai.js'
import { settings } from './routes/settings.js'
import { secrets } from './routes/secrets.js'
import { authors } from './routes/authors.js' // ← 추가
import { isGeminiConfigured } from './ai/gemini.js'
import { loadSecretsIntoEnv } from './store/secretStore.js'

// 부팅 시 secrets.json 의 gemini 키를 런타임 env 에 재주입(컨테이너 Recreate 대비). DEPLOY §12-6.
loadSecretsIntoEnv()

export const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors())

app.get('/api/health', (c) => {
  const ready = isGeminiConfigured()
  const res: HealthResponse = {
    ok: true,
    version: config.version,
    serverTime: new Date().toISOString(),
    features: {
      formatter: ready ? 'ready' : 'not_configured',
      slug: ready ? 'ready' : 'not_configured',
    },
  }
  return c.json(res)
})

app.route('/api/posts', posts)

// AI 프록시 (Gemini, NAS 전용). 키 없으면 라우트가 503 반환.
app.route('/api', ai)

// 설정/시크릿 (NAS측 설정 저장, 키 보관·마스킹)
app.route('/api/settings', settings)
app.route('/api/secrets', secrets)
app.route('/api/authors', authors)

// 직접 실행 시 서버 기동 (테스트 import 시엔 기동 안 함)
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`mdchirp backend on http://localhost:${info.port}  (data: ${config.dataDir})`)
  })
}
