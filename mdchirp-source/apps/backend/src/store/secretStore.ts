// secretStore — 키(secrets) + NAS측 설정(settings) 파일 영속.
// 정식 명세: apps/backend/SPEC.md §5(설정/상태), §8(보안).
// 보안: 키는 secrets.json 에만, settings.json 엔 절대 키 원본을 넣지 않는다(마스킹 불린만).
// ⚠️ walking skeleton: 평문 저장(.dev.vars/.env 와 동일 수준). 암호화·권한600 은 §8 todo.
import fs from 'node:fs'
import path from 'node:path'
import type { NasSettings } from '@mdchirp/shared'
import { config } from '../config.js'

type SecretKind = 'github' | 'gemini'

const SECRETS_FILE = path.join(config.dataDir, 'secrets.json')
const SETTINGS_FILE = path.join(config.dataDir, 'settings.json')

// 설정 기본값 — 아직 저장된 게 없을 때.
function defaultSettings(): NasSettings {
  return {
    github: { repo: '', branch: 'main', tokenSet: false },
    ai: { provider: 'gemini', model: config.geminiModel, keySet: false },
    timezone: 'nas',
    // mediaPolicy 는 settings UI 슬롯(12번) — 최소 형태로 채움.
    mediaPolicy: {
      imageFormat: 'original',
      backupExternal: 'never',
      backupFilter: { types: [], maxSizeMB: 0 },
      offloadToNas: { enabled: false, afterDays: 0, types: [] },
      autoRestore: { enabled: false, checkIntervalDays: 0 },
      nasQuota: { maxTotalGB: 0, evictionPolicy: 'manual' },
      watermark: {
        enabled: false,
        type: 'text',
        content: '',
        position: 'br',
        opacity: 1,
        applyTo: [],
        skipIfExternal: true,
      },
    },
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
  // TODO(§8): 리눅스/Docker 배포 시 fs.chmodSync(file, 0o600)
}

// ── secrets (키 원본 — 절대 마스킹 없이 외부로 내보내지 않음) ──
type SecretBag = Partial<Record<SecretKind, string>>

export function setSecret(kind: SecretKind, value: string): void {
  const bag = readJson<SecretBag>(SECRETS_FILE, {})
  bag[kind] = value
  writeJson(SECRETS_FILE, bag)
  // gemini 키는 런타임 env 에도 주입 → isGeminiConfigured() 즉시 true (B 모드, 재시작 불필요).
  if (kind === 'gemini') {
    process.env.GEMINI_API_KEY = value
    config.geminiApiKey = value
  }
}

// 서버 기동 시 1회 호출 — secrets.json 에 저장된 gemini 키를 런타임 env/config 에 재주입한다.
// (컨테이너 Recreate 로 process.env 가 초기화돼도 볼륨의 secrets.json 은 보존되므로,
//  부팅 때 다시 읽어 features 가 not_configured 로 돌아가지 않게 한다. DEPLOY §12-6 참조.)
export function loadSecretsIntoEnv(): void {
  const bag = readJson<SecretBag>(SECRETS_FILE, {})
  const gemini = bag.gemini
  // env 에 이미 키가 있으면(.dev.vars/compose env) 그걸 우선한다. 없을 때만 파일 값으로 채움.
  if (gemini && !process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = gemini
    config.geminiApiKey = gemini
  }
}

export function isSecretSet(kind: SecretKind): boolean {
  const bag = readJson<SecretBag>(SECRETS_FILE, {})
  return typeof bag[kind] === 'string' && bag[kind]!.length > 0
}

// ⚠️ 서버 내부 전용 — 키 원본을 반환한다. 절대 API 응답/프론트로 내보내지 말 것.
// 발행(git push) 시 GitHub PAT 를 HTTPS URL 에 주입하기 위해서만 사용한다(SPEC §8).
export function getSecret(kind: SecretKind): string | null {
  const bag = readJson<SecretBag>(SECRETS_FILE, {})
  const v = bag[kind]
  return typeof v === 'string' && v.length > 0 ? v : null
}

// ── settings (마스킹된 NasSettings — 키 원본 없음) ──
export function getSettings(): NasSettings {
  const saved = readJson<NasSettings>(SETTINGS_FILE, defaultSettings())
  // 키 여부는 항상 secrets 파일에서 계산해 덮어쓴다(settings.json 의 불린을 신뢰하지 않음).
  saved.github.tokenSet = isSecretSet('github')
  saved.ai.keySet = isSecretSet('gemini')
  return saved
}

export function saveSettings(part: Partial<NasSettings>): NasSettings {
  const cur = getSettings()
  const next: NasSettings = {
    ...cur,
    ...part,
    github: { ...cur.github, ...(part.github ?? {}) },
    ai: { ...cur.ai, ...(part.ai ?? {}) },
    mediaPolicy: part.mediaPolicy ?? cur.mediaPolicy,
    timezone: part.timezone ?? cur.timezone,
  }
  // 마스킹 불린은 저장하되, 진실은 secrets 파일 → 저장 후에도 재계산.
  writeJson(SETTINGS_FILE, next)
  return getSettings()
}
