/**
 * apps/web/vite.config.ts
 *
 * Vite 配置 —— Agent Console 前端。
 *
 * 核心配置：
 * - dev server 端口 5173
 * - dev proxy：把 /agent /traces 代理到 localhost:3000（apps/api 默认端口）
 *   让前端 fetch('/agent') 直接打到 API，不需要 CORS 中间件
 * - 生产构建产物在 apps/web/dist（不污染根 dist）
 */

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
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
