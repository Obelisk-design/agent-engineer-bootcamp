/**
 * examples/day09/multi_turn_client.ts
 *
 * Day 09 验证：多轮对话 —— 真实 LLM 端到端。
 *
 * 本 demo **同时启动 server + 进程内 fetch**，无需 Chrome / 浏览器。
 * 跑完两轮后：
 * - turn 1: 发 "我是肥老大"（无 history）
 * - turn 2: 发 "请告诉我你刚才听到的名字是什么？"（带 messages history）
 * - 断言：turn 2 的响应里包含 "肥老大" —— 证明 LLM 真的看到了 history
 *
 * 这是 mock 测试覆盖不到的：mock 只验 messages 透传，不验 LLM 真"记住"了。
 *
 * 用法：
 *   pnpm exec tsx examples/day09/multi_turn_client.ts
 *
 * 预期输出（顺序）：
 *   [day09] turn 1: ...
 *   [day09] turn 1 answer: ...（可能问候、可能确认名字）
 *   [day09] turn 2: ...（带 history）
 *   [day09] turn 2 answer: 肥老大（应包含这个名字）
 *   [day09] ✅ LLM 真的"记住"了 turn 1 的输入
 *
 * 失败模式：
 * - turn 2 answer 不含 "肥老大" —— messages 没正确透传或 LLM 未读 history
 * - server 启动失败 —— 检查 OPENAI_API_KEY / .env
 * - turn 2 返回 error 事件 —— 看 SSE error 帧的 message
 */

import 'dotenv/config';

import type { AddressInfo } from 'node:net';

import { serve } from '@hono/node-server';

import { OpenAIChatClient } from '../../libs/llm/index.js';
import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';
import { createAgentApp } from '../../apps/api/src/index.js';
import type { Message } from '../../libs/llm/index.js';
import type { AgentEvent } from '../../libs/agent/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.MODEL_NAME;
const port = Number(process.env.PORT ?? 3000);

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}
if (!baseURL) {
  throw new Error('OPENAI_BASE_URL is required (set in .env or shell env)');
}
if (!model) {
  throw new Error('MODEL_NAME is required (set in .env or shell env)');
}

const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

// 🆕 Day 09: AgentOptions 不再含 systemPrompt。system 消息由 caller 拼在 messages[0]。
const agent = new Agent({ chat, tools, model });

const app = createAgentApp({ agent });
const server = serve({ fetch: app.fetch, port });

const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${String(address.port)}`;
console.log(`[day09] server listening on ${baseUrl}`);

/**
 * 解析 SSE 帧 + 提取最终 answer。
 *
 * 复用 apps/web/src/api/agentClient.ts 的解析思路，但只取 message_end.content。
 * 不暴露 SSE 帧细节给上层 —— demo 只关心 "LLM 最后说了什么"。
 */
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncIterable<AgentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let eventName = '';
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (eventName === '' || data === '') continue;
      try {
        const parsed: unknown = JSON.parse(data);
        if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed) {
          yield parsed as AgentEvent;
        }
      } catch {
        // skip malformed frame
      }
    }
  }
}

/**
 * 发一轮 POST /agent 并返回 final answer。
 * 失败抛 Error（带 SSE error 帧的 message）。
 */
async function sendTurn(
  input: string,
  messages: readonly Message[] = [],
): Promise<{ answer: string; error: string | null }> {
  console.log(`\n[day09] → turn (input="${input}", history=${String(messages.length)})`);
  const response = await fetch(`${baseUrl}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, ...(messages.length > 0 ? { messages } : {}) }),
  });

  if (!response.ok) {
    const errBody: unknown = await response.json().catch(() => ({}));
    throw new Error(`[day09] HTTP ${String(response.status)}: ${JSON.stringify(errBody)}`);
  }
  if (response.body === null) {
    throw new Error('[day09] response body is null');
  }

  let answer = '';
  let error: string | null = null;
  for await (const ev of parseSSE(response.body)) {
    if (ev.kind === 'message_delta') {
      process.stdout.write(ev.content);
    } else if (ev.kind === 'message_end') {
      answer = ev.content;
    } else if (ev.kind === 'error') {
      error = ev.message;
    }
  }
  process.stdout.write('\n');
  return { answer, error };
}

async function main(): Promise<void> {
  const systemMessage: Message = {
    role: 'system',
    content: 'You are a helpful assistant. Be concise. Answer in the same language as the user.',
  };

  // ====== TURN 1: 首轮，无 history ======
  const turn1Input = '我是肥老大';
  const turn1 = await sendTurn(turn1Input, [systemMessage]);
  if (turn1.error !== null) {
    throw new Error(`[day09] turn 1 error: ${turn1.error}`);
  }
  console.log(`[day09] turn 1 answer: ${turn1.answer}`);

  // ====== TURN 2: 多轮 —— 带 history ======
  const turn2Input = '请告诉我你刚才听到的名字是什么？请只回答名字本身，不要其他内容。';
  const turn2Messages: Message[] = [
    systemMessage,
    { role: 'user', content: turn1Input },
    { role: 'assistant', content: turn1.answer },
  ];
  const turn2 = await sendTurn(turn2Input, turn2Messages);
  if (turn2.error !== null) {
    throw new Error(`[day09] turn 2 error: ${turn2.error}`);
  }
  console.log(`[day09] turn 2 answer: ${turn2.answer}`);

  // ====== 断言 ======
  // 关键验证：turn 2 的回答应包含 "肥老大"（说明 LLM 真的看到了 history）
  if (turn2.answer.includes('肥老大')) {
    console.log('\n[day09] ✅ LLM 真的"记住"了 turn 1 的输入');
    console.log('[day09]    turn 2 answer 包含 "肥老大"');
    process.exitCode = 0;
  } else {
    console.error('\n[day09] ❌ LLM 没看到 turn 1 的输入');
    console.error(`[day09]    turn 2 answer: ${turn2.answer}`);
    console.error('[day09]    检查 server.ts 是否把 messages 正确拼到 runEvents');
    process.exitCode = 1;
  }
}

function shutdown(): void {
  console.log('\n[day09] shutting down…');
  server.close(() => process.exit(process.exitCode ?? 0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[day09] failed:', err instanceof Error ? err.message : String(err));
  shutdown();
});
