import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 플레이그라운드: 샌드박스/로컬 브라우저에서 에디터를 띄워 검증·데모하는 용도.
// MVP 산출물 아님. 실제 셸은 Tauri(apps/desktop).
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
})
