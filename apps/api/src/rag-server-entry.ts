/**
 * apps/api/src/rag-server-entry.ts
 *
 * RAG 独立 entry —— 仅启动 createRagApp()，绑端口 3100（不与 day09 agent 抢 3000）。
 * 与 day09 agent_server 零耦合（spec §Components "RAG 与 Agent 完全分离"）。
 */

import { serve } from '@hono/node-server';
import { createRagApp } from './rag-server.js';

const app = createRagApp();
const port = Number(process.env['PORT'] ?? 3100);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`RAG server listening on http://127.0.0.1:${String(info.port)}`);
});
