// 사용자가 누르는 수동 GitHub 새로고침 API.
// 앱 시작 시에는 호출되지 않으며, 동시에 하나의 요청만 실행한다.

import { Hono } from 'hono'
import type { GitRefreshResponse } from '@mdchirp/shared'
import { GitRefreshService } from '../git/gitRemoteScanner.js'

export interface GitRefreshRunner {
  refresh(): Promise<GitRefreshResponse>
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function createGitRoutes(runner: GitRefreshRunner = new GitRefreshService()): Hono {
  const routes = new Hono()
  let refreshInProgress = false

  routes.post('/refresh', async (c) => {
    if (refreshInProgress) {
      const response: GitRefreshResponse = {
        ok: false,
        checkedAt: new Date().toISOString(),
        importedPostIds: [],
        diagnostics: [],
        skippedNonstandardPaths: [],
        error: 'refresh_in_progress',
        detail: 'GitHub 새로고침이 이미 진행 중입니다.',
      }

      return c.json(response, 409)
    }

    refreshInProgress = true

    try {
      const response = await runner.refresh()
      return c.json(response)
    } catch (error) {
      const response: GitRefreshResponse = {
        ok: false,
        checkedAt: new Date().toISOString(),
        importedPostIds: [],
        diagnostics: [],
        skippedNonstandardPaths: [],
        error: 'remote_refresh_failed',
        detail: errorText(error),
      }

      return c.json(response, 502)
    } finally {
      refreshInProgress = false
    }
  })

  return routes
}

export const gitRoutes = createGitRoutes()
