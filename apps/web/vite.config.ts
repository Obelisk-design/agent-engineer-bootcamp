/**
 * apps/web/vite.config.ts
 *
 * Vite 配置 —— Agent Console 前端。
 *
 * 核心配置：
 * - dev server 端口由 scripts/with-ports.ts 通过 CLI --port 决定
 * - dev proxy：把 /agent /traces 代理到 VITE_API_TARGET（默认 http://localhost:3000）
 *   让前端 fetch('/agent') 直接打到 API，不需要 CORS 中间件
 * - 生产构建产物在 apps/web/dist（不污染根 dist）
 */

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Day 12 fix：vite 默认从 cwd 读 .env，但 vite 从根目录启、cwd 也是 apps/web，
  // 根 .env 读不到 → 前端 import.meta.env.VITE_OPENAI_API_KEY 为 undefined。
  // 显式指定 envDir 回到项目根，让前后端共用同一份 .env。
  // ⚠️ 不要加 envPrefix: ['OPENAI_'] —— 那会让前端任意位置 import.meta.env.OPENAI_API_KEY
  //    把 key 打进生产 bundle，违反 Vite 安全原则。强制走 VITE_* 前缀。
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // SSE 端点（POST + 长连接）
      '/agent': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // Trace 查询端点（GET）
      '/traces': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
