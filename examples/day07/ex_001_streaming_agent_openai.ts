/**
 * examples/day07/ex_001_streaming_agent_openai.ts
 *
 * Day 07 示例：OpenAI 兼容协议 + 流式 + usage 累积。
 *
 * 验证：
 *   1. final-answer iter 走 stream()，yield message_delta 事件。
 *   2. 流式打字机效果（process.stdout.write 逐 chunk 输出）。
 *   3. response 事件携带 usage，累积打印 token 用量。
 *   4. AbortSignal 演示：5 秒后自动 abort 演示取消语义。
 *
 * 用法：
 *   确认 .env 中 OPENAI_API_KEY / OPENAI_BASE_URL / MODEL_NAME 已填
 *   pnpm exec tsx examples/day07/ex_001_streaming_agent_openai.ts
 */

import 'dotenv/config';

import { OpenAIChatClient } from '../../libs/llm/index.js';
import { ToolRegistry } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.MODEL_NAME;

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}
if (!baseURL) {
  throw new Error('OPENAI_BASE_URL is required (set in .env or shell env)');
}
if (!model) {
  throw new Error('MODEL_NAME is required (set in .env or shell env)');
}

console.log(`[openai-stream] baseURL=${baseURL}`);
console.log(`[openai-stream] model=${model}`);

const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry(); // 空 registry —— 不调 tool，专注流式
const agent = new Agent({
  chat,
  tools,
  model,
});

async function main() {
  // 🆕 Day 07 AbortSignal 演示：5 秒后自动 abort
  const abortController = new AbortController();
  const timer = setTimeout(() => {
    console.log('\n[openai-stream] 5s timeout reached — aborting');
    abortController.abort();
  }, 5000);

  let answer = '';
  let totalUsage: { promptTokens: number; completionTokens: number } | undefined;
  let messageDeltaCount = 0;

  process.stdout.write('[openai-stream] answer: ');
  // 🆕 Day 09: messages 由 caller 自己拼（含 system）
  const SYSTEM_PROMPT = 'You are a helpful assistant. Keep your answer short (under 100 words).';
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: '用一句话介绍 TypeScript' },
  ];
  try {
    for await (const ev of agent.runEvents(messages, {
      signal: abortController.signal,
    })) {
      if (ev.kind === 'message_delta') {
        // 🆕 Day 07: 流式打字机效果
        process.stdout.write(ev.content);
        messageDeltaCount += 1;
      } else if (ev.kind === 'response' && ev.usage !== undefined) {
        // 🆕 Day 07: 单轮 token 累积
        totalUsage =
          totalUsage === undefined
            ? ev.usage
            : {
                promptTokens: totalUsage.promptTokens + ev.usage.promptTokens,
                completionTokens: totalUsage.completionTokens + ev.usage.completionTokens,
              };
      } else if (ev.kind === 'message_end') {
        answer = ev.content;
      } else if (ev.kind === 'error') {
        console.error(`\n[openai-stream] error: ${ev.message}`);
      }
    }
  } finally {
    clearTimeout(timer);
  }

  console.log(); // 流式后换行
  console.log(`[openai-stream] message_delta count: ${messageDeltaCount}`);
  if (totalUsage !== undefined) {
    console.log(
      `[openai-stream] total usage: prompt=${totalUsage.promptTokens} completion=${totalUsage.completionTokens}`,
    );
  }
  console.log(`[openai-stream] final answer length: ${answer.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
