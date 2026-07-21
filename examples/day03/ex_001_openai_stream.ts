/**
 * examples/day03/ex_001_openai_stream.ts
 *
 * Day 03 示例：用 libs/llm 里的 OpenAIChatClient 跑一次流式对话。
 *
 * 今天的例子里我们能学到的：
 *   1. ChatClient.stream() 在 OpenAI 兼容协议下走 SDK 的 stream: true 路径。
 *   2. 调用方用 for await 逐 chunk 消费 —— 这里 process.stdout.write 不换行，
 *      让字符"流"式打印出来，区别于 chat() 一次性打印完整字符串。
 *   3. 累计 chunk 数 + 总耗时 log，便于肉眼区分"真流式"与"快速 batch"。
 *
 * 对比 examples/day02/ex_001_chat_client.ts：
 *   旧 demo 用 client.chat(...) 等字符串一次性返回。
 *   新 demo 用 client.stream(...) 逐 chunk 处理 —— 是 Day 03 课题的端到端验证。
 *
 * 用法：
 *   复制 .env.example 到 .env，填入 OPENAI_API_KEY
 *   pnpm exec tsx examples/day03/ex_001_openai_stream.ts
 */

import 'dotenv/config';

import { OpenAIChatClient } from '../../libs/llm/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.MODEL_NAME ?? 'ai-coding';

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}

console.log(`[openai-stream] baseURL=${baseURL}`);
console.log(`[openai-stream] model=${model}`);
console.log('[openai-stream] sending request...');

const client = new OpenAIChatClient({ apiKey, baseURL, model });

const startMs = Date.now();
let chunkCount = 0;
let totalChars = 0;

console.log('[openai-stream] reply:');
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
  `\n[openai-stream] done. chunks=${chunkCount} chars=${totalChars} elapsedMs=${elapsedMs}`,
);
