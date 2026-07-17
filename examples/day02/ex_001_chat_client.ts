/**
 * examples/day02/ex_001_chat_client.ts
 *
 * Day 02 示例：用 libs/llm 里的 ChatClient 抽象层调一次最小对话。
 *
 * 今天的例子里我们能学到的：
 *   1. ChatClient 接口在工程层屏蔽了具体 LLM provider（OpenAI / Anthropic / 自建）。
 *   2. Message 类型限定了"对话上下文"的最朴素形态：role + content。
 *   3. 一个最小 ChatClient 使用 = 构造 → chat → 打印。
 *
 * 对比 examples/ex_002_chat_completion.ts：
 *   旧 demo 直接 new OpenAI({...}) + client.chat.completions.create({...})，
 *   业务逻辑和 OpenAI SDK 耦合在一起。新 demo 通过 ChatClient 抽象，业务
 *   只调 client.chat([...])，将来换成 AnthropicChatClient 也不影响业务代码。
 *
 * 用法：
 *   复制 .env.example 到 .env，填入 OPENAI_API_KEY
 *   pnpm exec tsx examples/day02/ex_001_chat_client.ts
 */

import 'dotenv/config';

import { OpenAIChatClient } from '../../libs/llm/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.MODEL_NAME ?? 'ai-coding';

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}

console.log(`[chat-client] baseURL=${baseURL}`);
console.log(`[chat-client] model=${model}`);
console.log('[chat-client] sending request...');

const client = new OpenAIChatClient({ apiKey, baseURL, model });

const reply = await client.chat([
  { role: 'system', content: 'You are a helpful AI coding assistant.' },
  { role: 'user', content: '用一句话介绍你自己。' },
]);

console.log('[chat-client] response:');
console.log(reply);
