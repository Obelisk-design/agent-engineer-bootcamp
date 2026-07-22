/**
 * examples/day05/ex_002_web_ui.ts
 *
 * Day 05 示例：apps/api/ Web UI 演示 server。
 *
 * 跟 ex_001 不同：本 demo **只启动 server，不进程内自调 fetch**。
 * 启动后用浏览器访问 http://127.0.0.1:<port>/ 即可看到 Agent Console UI。
 *
 * 用法：
 *   pnpm exec tsx examples/day05/ex_002_web_ui.ts
 *
 * 配合 Chrome MCP 验证：
 *   1. 启动本 demo（默认 listen 端口 3000）
 *   2. Chrome navigate 到 http://127.0.0.1:3000/
 *   3. 输入"帮我计算 10+20" + 点 Send
 *   4. 截图看左栏 Conversation + 右栏 Execution Timeline
 */

import 'dotenv/config';

import type { AddressInfo } from 'node:net';

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
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
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

const address = server.address() as AddressInfo;
const url = `http://127.0.0.1:${String(address.port)}`;
console.log(`[web-ui] listening on ${url}`);
console.log(`[web-ui] open browser: ${url}/`);
console.log(`[web-ui] POST SSE endpoint: ${url}/agent`);

function shutdown() {
  console.log('\n[web-ui] shutting down…');
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
