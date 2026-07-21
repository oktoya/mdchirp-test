// NAS 백엔드 설정 — 환경변수 기반. 정식 명세: apps/backend/SPEC.md §4, §8
import path from 'node:path'
import fs from 'node:fs'

// .dev.vars (KEY=VALUE) 를 process.env 로 로드 — 로컬/NAS 개발용. git 에 안 올라감.
// 시크릿(GEMINI_API_KEY 등)을 코드/프론트에 두지 않기 위한 단일 진입점.
function loadDevVars(): void {
  const candidates = [
    path.resolve(process.cwd(), '.dev.vars'),
    path.resolve(process.cwd(), 'apps/backend/.dev.vars'),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
    break
  }
}
loadDevVars()

export interface Config {
  port: number
  dataDir: string // /data/mdchirp
  postsSrcDir: string // posts-src/  (글 작업공간)
  repoDir: string // repo/       (git 워킹카피)
  trashDir: string // .trash/     (삭제된 글 보관)
  version: string
  /** Gemini API 키 — NAS 환경변수에만 둔다. 없으면 서식제안/slug제안 비활성. */
  geminiApiKey: string | null
  /** 사용할 Gemini 모델 (기본: gemini-2.0-flash) */
  geminiModel: string
}

const DATA_DIR = process.env.MDCHIRP_DATA_DIR ?? path.resolve(process.cwd(), '.data')

export const config: Config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: DATA_DIR,
  postsSrcDir: path.join(DATA_DIR, 'posts-src'),
  repoDir: path.join(DATA_DIR, 'repo'),
  trashDir: path.join(DATA_DIR, '.trash'),
  version: '0.0.1',
  // 키는 코드/프론트에 절대 넣지 않는다. .dev.vars / NAS env 로만 주입.
  geminiApiKey: process.env.GEMINI_API_KEY ?? null,
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
}

// 글 작업폴더 내 약속된 파일명 (SPEC §4)
export const FILES = {
  postMd: 'post.md',
  meta: 'meta.json',
  source: '.source/tiptap.json',
  mediaDir: 'media',
  historyDir: '.history',
} as const
