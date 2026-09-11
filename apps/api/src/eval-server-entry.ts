/**
 * apps/api/src/eval-server-entry.ts
 *
 * Day 22 — Eval Platform 独立 entry。
 * 仅启动 createEvalApp()，绑端口 3202（不与 RAG 3100 / Agent 3000 抢）。
 *
 * 不做：
 *   - 不与 RAG / Agent app 共进程（独立 Hono app，零耦合，spec §3.2）
 */

import { serve } from '@hono/node-server';
import { createEvalApp } from './eval-server.js';

const app = createEvalApp();
const port = Number(process.env['PORT'] ?? 3202);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Eval server listening on http://127.0.0.1:${String(info.port)}`);
});
