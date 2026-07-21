// /api/authors 라우트 — _data/authors.yml 기반 저자 목록 조회. 정식 명세: apps/backend/SPEC.md §5
import { Hono } from 'hono'
import { listAuthors } from '../store/authorsStore.js'

export const authors = new Hono()

// 조회 — [{ key, name }]. authors.yml 없으면 빈 배열.
authors.get('/', (c) => {
  return c.json(listAuthors())
})
