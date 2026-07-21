// MemoryStorageAdapter — 메모리/localStorage 기반 LocalStorageAdapter 구현.
// 1차(walking skeleton)용. 추후 Dexie(IndexedDB) 구현으로 교체(인터페이스 동일).
//
// backend: 옵션으로 Web Storage(localStorage) 주입 가능 → 새로고침에도 유지.
// 미주입 시 순수 메모리(테스트/Node).

import type { LocalStorageAdapter } from '../adapters.js'

interface KVLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = 'mdchirp:'

export class MemoryStorageAdapter implements LocalStorageAdapter {
  // backend 미주입 시 사용하는 인메모리 맵
  private mem = new Map<string, string>()
  private backend?: KVLike

  // backend 에 window.localStorage 를 주입하면 영속, 없으면 메모리.
  constructor(backend?: KVLike) {
    this.backend = backend
  }

  private k(collection: string, key: string): string {
    return `${PREFIX}${collection}:${key}`
  }
  private prefix(collection: string): string {
    return `${PREFIX}${collection}:`
  }

  private readRaw(fullKey: string): string | null {
    return this.backend ? this.backend.getItem(fullKey) : (this.mem.get(fullKey) ?? null)
  }
  private writeRaw(fullKey: string, value: string): void {
    if (this.backend) this.backend.setItem(fullKey, value)
    else this.mem.set(fullKey, value)
  }
  private deleteRaw(fullKey: string): void {
    if (this.backend) this.backend.removeItem(fullKey)
    else this.mem.delete(fullKey)
  }
  private allKeys(): string[] {
    if (this.backend) {
      // Web Storage 키 순회 — length/key 사용
      const ws = this.backend as unknown as Storage
      const out: string[] = []
      for (let i = 0; i < ws.length; i++) {
        const k = ws.key(i)
        if (k) out.push(k)
      }
      return out
    }
    return [...this.mem.keys()]
  }

  async get<T = unknown>(collection: string, key: string): Promise<T | null> {
    const raw = this.readRaw(this.k(collection, key))
    if (raw == null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async set<T = unknown>(collection: string, key: string, value: T): Promise<void> {
    this.writeRaw(this.k(collection, key), JSON.stringify(value))
  }

  async remove(collection: string, key: string): Promise<void> {
    this.deleteRaw(this.k(collection, key))
  }

  async all<T = unknown>(collection: string): Promise<T[]> {
    const p = this.prefix(collection)
    const out: T[] = []
    for (const fk of this.allKeys()) {
      if (!fk.startsWith(p)) continue
      const raw = this.readRaw(fk)
      if (raw == null) continue
      try {
        out.push(JSON.parse(raw) as T)
      } catch {
        /* skip */
      }
    }
    return out
  }

  async keys(collection: string): Promise<string[]> {
    const p = this.prefix(collection)
    return this.allKeys()
      .filter((fk) => fk.startsWith(p))
      .map((fk) => fk.slice(p.length))
  }
}
