/**
 * examples/day05/ex_001_sse_agent.ts
 *
 * Day 05 示例：apps/api/ SSE 端到端 demo。
 *
 * 流程：
 *   1. 构造 OpenAIChatClient + CalculatorTool + Agent
 *   2. 用 createAgentApp 构造 Hono app
 *   3. listen 端口 0（OS 自动分配）
 *   4. 用进程内 fetch 调自己端口，读 SSE 流并逐帧打印
 *   5. 关闭 server
 *
 * 这验证：
 *   - POST /agent 返回 Content-Type: text/event-stream
 *   - 完整事件序列 message_start → iteration → tool_call → tool_result → message_end → done
 *   - SSE 帧格式符合 W3C spec（event:/data: + 双换行结尾）
 *
 * 环境变量：
 *   OPENAI_API_KEY, OPENAI_BASE_URL, MODEL_NAME（参考 day04 demo）
 *
 * 用法：
 *   pnpm exec tsx examples/day05/ex_001_sse_agent.ts
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

async function main() {
  // port: 0 → 让 OS 自动分配空闲端口，避免冲突
  const server = serve({ fetch: app.fetch, port: 0 });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${String(address.port)}/agent`;

  console.log(`[day05-sse] listening on ${url}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '用 calculator 工具计算 1+2*3' }),
    });

    console.log(
      `[day05-sse] status=${String(res.status)} content-type=${res.headers.get('content-type') ?? ''}`,
    );

    if (res.body === null) {
      throw new Error('expected SSE response to have a body');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) process.stdout.write(decoder.decode(value));
    }
  } finally {
    server.close();
    console.log('\n[day05-sse] server closed');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
