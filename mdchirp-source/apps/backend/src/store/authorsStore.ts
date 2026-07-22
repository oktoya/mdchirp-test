// _data/authors.yml 읽기 — Chirpy 저자 목록을 [{ key, name }] 로 파싱.
// authors.yml 은 블로그 저장소(repoDir)에 있으며 없을 수 있다. 정식 명세: apps/backend/SPEC.md §5
import path from 'node:path'
import fs from 'node:fs'
import { parse } from 'yaml'
import { config } from '../config.js'

export interface AuthorEntry {
  /** 프론트매터 author/authors 에 들어가는 키 (authors.yml 최상위 키) */
  key: string
  /** 화면 표시용 이름 (authors.yml 의 name; 없으면 key 로 대체) */
  name: string
}

/** repo/_data/authors.yml 을 파싱해 저자 목록 반환. 파일 없거나 파싱 실패 시 빈 배열. */
export function listAuthors(): AuthorEntry[] {
  const file = path.join(config.repoDir, '_data', 'authors.yml')
  if (!fs.existsSync(file)) return []

  let raw: unknown
  try {
    raw = parse(fs.readFileSync(file, 'utf8'))
  } catch {
    // 손상된 YAML 이어도 앱 전체가 죽지 않도록 빈 목록으로 폴백
    return []
  }
  if (!raw || typeof raw !== 'object') return []

  const out: AuthorEntry[] = []
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue
    const name =
      val && typeof val === 'object' && typeof (val as { name?: unknown }).name === 'string'
        ? (val as { name: string }).name
        : key
    out.push({ key, name })
  }
  return out
}
