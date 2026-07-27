/**
 * examples/day08/agent_server.ts
 *
 * Day 08 验证用 server：启动 apps/api + 监听 3000。
 *
 * 与 ex_002_web_ui.ts 区别：
 * - 等待 server.listen() 完成后再读 server.address()（修异步 race bug）
 * - 注释指向 apps/web（Vite dev proxy 默认 5173）
 *
 * 用法：
 *   # terminal 1: 起 API
 *   pnpm exec tsx examples/day08/agent_server.ts
 *
 *   # terminal 2: 起前端
 *   cd apps/web && pnpm exec vite --host 127.0.0.1
 *
 *   浏览器开 http://127.0.0.1:5173/
 *   Vite proxy 把 /agent /traces 打到 3000
 */

import 'dotenv/config';

import { serve } from '@hono/node-server';

import { OpenAIChatClient } from '../../libs/llm/index.js';
import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';
import { createAgentApp } from '../../apps/api/src/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.MODEL_NAME ?? 'ai-coding';
const port = Number(process.env.PORT ?? 3000);

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required');
}

const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  systemPrompt: 'You are a helpful assistant. Prefer using available tools over guessing.',
});

const app = createAgentApp({ agent });

const server = serve({ fetch: app.fetch, port });

// 等 listen 完成（@hono/node-server 2.0 是异步 listen）
server.on('listening', () => {
  const address = server.address();
  if (address === null) {
    throw new Error('server address is null after listening');
  }
  const url = `http://127.0.0.1:${String(address.port)}`;
  console.log(`[day08-server] listening on ${url}`);
  console.log(`[day08-server] POST SSE endpoint: ${url}/agent`);
  console.log(`[day08-server] GET traces: ${url}/traces`);
  console.log(`[day08-server] Frontend (apps/web) should proxy /agent + /traces to this server`);
});

function shutdown(): void {
  console.log('\n[day08-server] shutting down…');
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
