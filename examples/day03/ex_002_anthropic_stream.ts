/**
 * examples/day03/ex_002_anthropic_stream.ts
 *
 * Day 03 示例：用 libs/llm 里的 AnthropicChatClient 跑一次流式对话。
 *
 * 今天的例子里我们能学到的：
 *   1. ChatClient.stream() 在 Anthropic 协议下走 messages.stream() 路径。
 *   2. 内部过滤 RawMessageStreamEvent 判别联合 —— 调用方只看到纯文本增量，
 *      看不到 message_start / content_block_start 等框架事件。
 *   3. 调用代码与 OpenAI 流式 demo 完全一致（都是 for await + stdout.write），
 *      多 provider 一致性兑现。
 *
 * 对比 examples/day03/ex_001_openai_stream.ts：
 *   两个 demo 调用代码 0 行差异。Provider 差异封装在 class 里，
 *   ChatClient 抽象层的核心价值兑现。
 *
 * 用法：
 *   1. 在 .env 里填入 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL
 *   2. pnpm exec tsx examples/day03/ex_002_anthropic_stream.ts
 */

import 'dotenv/config';

import { AnthropicChatClient } from '../../libs/llm/index.js';

const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
const baseURL = process.env.ANTHROPIC_BASE_URL;
const model = process.env.ANTHROPIC_MODEL;

if (!apiKey) {
  throw new Error('ANTHROPIC_AUTH_TOKEN is required (set in .env)');
}
if (!baseURL) {
  throw new Error('ANTHROPIC_BASE_URL is required (set in .env)');
}
if (!model) {
  throw new Error('ANTHROPIC_MODEL is required (set in .env)');
}

console.log(`[anthropic-stream] baseURL=${baseURL}`);
console.log(`[anthropic-stream] model=${model}`);
console.log('[anthropic-stream] sending request...');

const client = new AnthropicChatClient({ apiKey, baseURL, model });

const startMs = Date.now();
let chunkCount = 0;
let totalChars = 0;

console.log('[anthropic-stream] reply:');
for await (const chunk of client.stream([
  { role: 'system', content: '你是个刺猬。' },
  { role: 'user', content: '用三句话介绍你自己，每句话末尾加一个表情。' },
])) {
  chunkCount += 1;
  totalChars += chunk.length;
  process.stdout.write(chunk);
}

const elapsedMs = Date.now() - startMs;
console.log(
  `\n[anthropic-stream] done. chunks=${chunkCount} chars=${totalChars} elapsedMs=${elapsedMs}`,
);
