/**
 * examples/day07/ex_002_streaming_agent_anthropic.ts
 *
 * Day 07 示例：Anthropic Messages API（Claude Code gateway）+ 流式 + usage 累积。
 *
 * 验证同 ex_001，但走 Anthropic provider。
 *
 * 环境变量：
 *   ANTHROPIC_AUTH_TOKEN
 *   ANTHROPIC_BASE_URL
 *   ANTHROPIC_MODEL（默认 MiniMax-M3）
 *
 * 用法：
 *   pnpm exec tsx examples/day07/ex_002_streaming_agent_anthropic.ts
 */

import 'dotenv/config';

import { AnthropicChatClient } from '../../libs/llm/index.js';
import { ToolRegistry } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';

const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
const baseURL = process.env.ANTHROPIC_BASE_URL;
const model = process.env.ANTHROPIC_MODEL ?? 'MiniMax-M3';

if (!apiKey) {
  throw new Error('ANTHROPIC_AUTH_TOKEN is required (set in .env or shell env)');
}
if (!baseURL) {
  throw new Error('ANTHROPIC_BASE_URL is required (set in .env or shell env)');
}

console.log(`[anthropic-stream] baseURL=${baseURL}`);
console.log(`[anthropic-stream] model=${model}`);

const chat = new AnthropicChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry(); // 空 registry
const agent = new Agent({
  chat,
  tools,
  model,
});

async function main() {
  // 🆕 Day 07 AbortSignal 演示
  const abortController = new AbortController();
  const timer = setTimeout(() => {
    console.log('\n[anthropic-stream] 5s timeout reached — aborting');
    abortController.abort();
  }, 5000);

  let answer = '';
  let totalUsage: { promptTokens: number; completionTokens: number } | undefined;
  let messageDeltaCount = 0;

  process.stdout.write('[anthropic-stream] answer: ');
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
        process.stdout.write(ev.content);
        messageDeltaCount += 1;
      } else if (ev.kind === 'response' && ev.usage !== undefined) {
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
        console.error(`\n[anthropic-stream] error: ${ev.message}`);
      }
    }
  } finally {
    clearTimeout(timer);
  }

  console.log();
  console.log(`[anthropic-stream] message_delta count: ${messageDeltaCount}`);
  if (totalUsage !== undefined) {
    console.log(
      `[anthropic-stream] total usage: prompt=${totalUsage.promptTokens} completion=${totalUsage.completionTokens}`,
    );
  }
  console.log(`[anthropic-stream] final answer length: ${answer.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
