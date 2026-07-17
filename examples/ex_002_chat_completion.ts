/**
 * examples/ex_002_chat_completion.ts
 *
 * 调用 OpenAI 兼容 API 的最小示例。
 * 适用于任何支持 OpenAI Chat Completions API 协议的服务。
 *
 * 用法：
 *   1. 复制 .env.example 到 .env，填入 OPENAI_API_KEY
 *   2. pnpm exec tsx examples/ex_002_chat_completion.ts
 */

import 'dotenv/config';

import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.MODEL_NAME ?? 'ai-coding';

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}

console.log(`[chat-completion] baseURL=${baseURL}`);
console.log(`[chat-completion] model=${model}`);
console.log('[chat-completion] sending request...');

const client = new OpenAI({ apiKey, baseURL });

const completion = await client.chat.completions.create({
  model,
  messages: [
    { role: 'system', content: 'You are a helpful AI coding assistant.' },
    { role: 'user', content: '用一句话介绍你自己。' },
  ],
  temperature: 0.7,
});

const content = completion.choices[0]?.message?.content ?? '(empty)';
console.log('[chat-completion] response:');
console.log(content);
console.log('[chat-completion] usage:', completion.usage);
