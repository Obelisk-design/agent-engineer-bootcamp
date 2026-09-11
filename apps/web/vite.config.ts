/**
 * apps/web/vite.config.ts
 *
 * Vite 配置 —— Agent Console 前端。
 *
 * 变更：Day 23 Task 1 (P0) —— admin 模板移植
 * - 加 AutoImport / Components (ElementPlusResolver) —— admin 风格按需引入
 * - 加 SCSS modern-compiler
 * - 保留 tailwindcss() 插件 —— Task 6 才正式弃 Tailwind，Task 1 仅注册三件套
 *
 * 其余配置（端口 / proxy / envDir）保持 Day 22 原状。
 */

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000';
// 🆕 Day 14: RAG app 跑在 3100（day09 agent 占用 3000）
// 前端 fetch /api/search 实际打到 http://localhost:3100/search（rewrite 去前缀）
const RAG_API_TARGET = process.env.VITE_RAG_API_TARGET ?? 'http://localhost:3100';
// 🆕 Day 22: Eval app 跑在 3202（与 RAG / Agent 完全隔离）
// 前端 fetch /api/eval/* 打到 3202/eval/*（rewrite 去 /api 前缀）
const EVAL_API_TARGET = process.env.VITE_EVAL_API_TARGET ?? 'http://localhost:3202';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
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
      // 🆕 Day 22: Eval app 代理 —— 前端 /api/eval/* 打到 3202/eval/*（rewrite 去 /api 前缀）
      // 比 /api 规则更具体，必须先匹配
      '/api/eval': {
        target: EVAL_API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // 🆕 Day 14: RAG app 代理 —— 前端 /api/search 打到 3100/search（rewrite 去 /api 前缀）
      // 与 day09 Agent app 完全独立，端口隔离避免冲突
      '/api': {
        target: RAG_API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  // 🆕 Day 23 Task 2: vite alias @/* 与 tsconfig paths 对齐
  // Task 1 tsconfig.json 已配 paths，但 vite.config.ts 漏配 alias → runtime 'Failed to resolve @/...'
  // 不破坏 Task 1 既有 plugins / proxy / build 配置
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  // 🆕 Day 23 Task 1: admin 模板用 SCSS 主题，modern-compiler 避免 dart-sass legacy 警告
  css: {
    preprocessorOptions: {
      scss: { api: 'modern-compiler' },
    },
  },
});
