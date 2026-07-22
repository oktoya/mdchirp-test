// walking skeleton 통합 테스트 — 시크릿 저장/조회/마스킹, 설정 저장/병합 검증.
// 실행: pnpm --filter @mdchirp/backend test
import assert from 'node:assert'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// 임시 데이터 디렉토리로 격리 (config 가 import 시점에 dataDir 를 읽으므로 그 전에 env 설정)
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mdchirp-secret-test-'))
process.env.MDCHIRP_DATA_DIR = tmp

const { config } = await import('../config.js')
const { setSecret, isSecretSet, getSettings, saveSettings } = await import('./secretStore.js')

let pass = 0
const ok = (name: string) => {
  console.log(`  ✓ ${name}`)
  pass++
}

console.log('mdchirp secretStore walking skeleton test')
console.log('data dir:', tmp)

// 1. 초기 상태: 어떤 시크릿도 설정 안 됨
{
  assert(isSecretSet('github') === false, 'github not set initially')
  assert(isSecretSet('gemini') === false, 'gemini not set initially')
  ok('초기 상태: github/gemini 둘 다 미설정')
}

// 2. github 시크릿 저장 → isSecretSet=true, secrets.json 에 평문 보관
{
  setSecret('github', 'ghp_realtoken123')
  assert(isSecretSet('github') === true, 'github set after save')
  assert(isSecretSet('gemini') === false, 'gemini still not set')
  const raw = JSON.parse(await fs.readFile(path.join(config.dataDir, 'secrets.json'), 'utf8'))
  assert(raw.github === 'ghp_realtoken123', 'github value persisted to secrets.json')
  ok('github 저장: isSecretSet=true, secrets.json 에 보관')
}

// 3. gemini 시크릿 저장 → process.env/config 즉시 반영
{
  setSecret('gemini', 'AIza_realkey456')
  assert(isSecretSet('gemini') === true, 'gemini set after save')
  assert(process.env.GEMINI_API_KEY === 'AIza_realkey456', 'env injected for immediate use')
  assert(config.geminiApiKey === 'AIza_realkey456', 'config updated for immediate use')
  ok('gemini 저장: isSecretSet=true + env/config 즉시 주입')
}

// 4. 시크릿 덮어쓰기: 같은 kind 재저장 → 값 갱신
{
  setSecret('github', 'ghp_updated789')
  const raw = JSON.parse(await fs.readFile(path.join(config.dataDir, 'secrets.json'), 'utf8'))
  assert(raw.github === 'ghp_updated789', 'github value overwritten')
  assert(isSecretSet('github') === true, 'still set after overwrite')
  ok('덮어쓰기: 같은 kind 재저장 시 값 갱신')
}

// 5. getSettings: 시크릿 평문 미노출, tokenSet/keySet 불리언만 반영
{
  const s = getSettings()
  assert(s.github.tokenSet === true, 'github.tokenSet reflects stored secret')
  assert(s.ai.keySet === true, 'ai.keySet reflects stored secret')
  // 평문이 새어나가면 안 됨
  const json = JSON.stringify(s)
  assert(!json.includes('ghp_updated789'), 'github token not leaked in settings')
  assert(!json.includes('AIza_realkey456'), 'gemini key not leaked in settings')
  ok('getSettings: 시크릿 평문 미노출, tokenSet/keySet 만 마스킹 반영')
}

// 6. saveSettings: 부분 설정 병합 + 기존 값 보존 + 영속화
{
  saveSettings({ github: { repo: 'me/blog', branch: 'main', tokenSet: false } })
  const s1 = getSettings()
  assert(s1.github.repo === 'me/blog', 'github.repo merged')
  assert(s1.github.branch === 'main', 'github.branch merged')
  // settings 의 불린을 신뢰하지 않고 secrets 에서 재계산하므로 여전히 true 여야 함
  assert(s1.github.tokenSet === true, 'tokenSet recomputed from secrets, not settings.json')

  // 다른 그룹 부분 저장 → 기존 github 설정 유지
  saveSettings({ ai: { provider: 'gemini', model: 'gemini-2.5-flash', keySet: false } })
  const s2 = getSettings()
  assert(s2.ai.model === 'gemini-2.5-flash', 'ai.model merged')
  assert(s2.github.repo === 'me/blog', 'previous github.repo preserved')
  ok('saveSettings: 부분 병합 + 기존 값 보존 + 마스킹 재계산')
}

console.log(`\n✅ ${pass} checks passed`)
await fs.rm(tmp, { recursive: true, force: true })
