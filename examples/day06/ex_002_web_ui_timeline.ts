/**
 * examples/day06/ex_002_web_ui_timeline.ts
 *
 * Day 06 示例：apps/api/ Web UI + Timeline 详细化演示 server。
 *
 * 覆盖 Day 06 阶段二 + 阶段三产出：
 *   - apps/api/src/web/index.html Agent Console（Claude Code 风格双栏）
 *   - 阶段三：Timeline 详细化（request / response 折叠 JSON 详情）
 *
 * 跟 day05 ex_002_web_ui.ts 类似，但 demo 注释明确指向 Day 06 的两阶段增强。
 * 浏览器验证流程见 README。
 *
 * 用法：
 *   pnpm exec tsx examples/day06/ex_002_web_ui_timeline.ts
 *
 * 浏览器验证：
 *   1. Chrome navigate http://127.0.0.1:3000/
 *   2. 看到左栏 Conversation + 右栏 Execution Timeline
 *   3. 输入"用 calculator 计算 10+20" + Send
 *   4. 观察右栏 Timeline 步骤（接收任务 / Iteration 1 / request 折叠区 /
 *      response 折叠区 / 调用 calculator / Tool 返回 / Iteration 2 /
 *      request / response / 生成答案 / 完成）
 *   5. 点击 request / response 折叠区看 messages 累积 / ChatResponse JSON
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
  model,
});

const app = createAgentApp({ agent });

const server = serve({ fetch: app.fetch, port });

const address = server.address() as AddressInfo;
const url = `http://127.0.0.1:${String(address.port)}`;
console.log(`[day06-web-ui] listening on ${url}`);
console.log(`[day06-web-ui] open browser: ${url}/`);
console.log(`[day06-web-ui] POST SSE endpoint: ${url}/agent`);
console.log(`[day06-web-ui] 验证 Day 06 阶段二+阶段三：双栏布局 + Timeline 折叠 JSON`);

function shutdown() {
  console.log('\n[day06-web-ui] shutting down…');
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
