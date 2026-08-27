/**
 * examples/day09/agent_server.ts
 *
 * Day 09 验证用 server：启动 apps/api + 监听 3000。
 *
 * 与 examples/day08/agent_server.ts 区别：
 * - 后端代码完全相同（Day 09 的 server.ts 改动向后兼容 day08 example）
 * - 注释指向 apps/web 多轮 UI 验证路径
 *
 * 启动方式（推荐 → 备选）：
 *
 *   # 推荐：一行起 API + 前端（concurrently）
 *   pnpm exec tsx scripts/dev-day09.ts
 *
 *   # 备选：两个 terminal（仅在单进程调试场景，比如只想要 API + curl 时）
 *   pnpm exec tsx scripts/with-ports.ts api 3000 -- tsx examples/day09/agent_server.ts   # terminal 1
 *   pnpm run dev:web                                                                  # terminal 2
 *
 *   # 备选：原始两条命令（保持原貌，便于 copy-paste）
 *   # terminal 1: 起 API
 *   pnpm exec tsx examples/day09/agent_server.ts
 *
 *   # terminal 2: 起前端
 *   cd apps/web && pnpm exec vite --host 127.0.0.1
 *
 *   浏览器开 http://127.0.0.1:5173/
 *   Vite proxy 把 /agent /traces 打到 3000
 *
 * Day 09 多轮验证步骤：
 *   1. 在输入框打"我是肥老大"，点 Send
 *   2. 等 assistant 回复（应包含问候 / 确认名字）
 *   3. 在输入框打"请告诉我你刚才听到的名字是什么？"，点 Send
 *   4. scrollback 应显示：turn 1 user / turn 1 assistant / turn 2 user / turn 2 assistant
 *   5. turn 2 assistant 应回答"肥老大" —— 证明多轮 + scrollback 端到端工作
 */

import 'dotenv/config';

import { serve } from '@hono/node-server';

import { OpenAIChatClient } from '../../libs/llm/index.js';
import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';
import { createAgentApp } from '../../apps/api/src/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.MODEL_NAME;
const port = Number(process.env.PORT ?? 3000);

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required');
}
if (!baseURL) {
  throw new Error('OPENAI_BASE_URL is required');
}
if (!model) {
  throw new Error('MODEL_NAME is required');
}

const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

// 🆕 Day 09: AgentOptions 不再含 systemPrompt。system 消息由调用方在 messages[0] 注入。
// server.ts 已自动处理 system 消息（如果有的话），这里 Agent 只配 chat / tools / model。
const agent = new Agent({
  chat,
  tools,
  model,
});

const app = createAgentApp({ agent });

const server = serve({ fetch: app.fetch, port });

// 等 listen 完成（@hono/node-server 2.0 是异步 listen）
server.on('listening', () => {
  const address = server.address();
  if (address === null) {
    throw new Error('server address is null after listening');
  }
  const portValue = typeof address === 'string' ? Number(address) : address.port;
  const url = `http://127.0.0.1:${String(portValue)}`;
  console.log(`[day09-server] listening on ${url}`);
  console.log(`[day09-server] POST SSE endpoint: ${url}/agent`);
  console.log(`[day09-server] GET traces: ${url}/traces`);
  console.log(`[day09-server] Frontend (apps/web) should proxy /agent + /traces to this server`);
  console.log('');
  console.log('[day09-server] Multi-turn verification:');
  console.log('[day09-server]   1. Open http://127.0.0.1:5173/ in browser');
  console.log('[day09-server]   2. Send "我是肥老大" → assistant replies');
  console.log('[day09-server]   3. Send "请告诉我你刚才听到的名字是什么？"');
  console.log('[day09-server]   4. Verify scrollback shows turn 1 + turn 2');
  console.log('[day09-server]   5. Verify turn 2 answer contains "肥老大"');
});

function shutdown(): void {
  console.log('\n[day09-server] shutting down…');
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
