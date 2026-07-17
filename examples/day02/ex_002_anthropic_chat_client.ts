/**
 * examples/day02/ex_002_anthropic_chat_client.ts
 *
 * Day 02 延展示例：用 libs/llm 里的 AnthropicChatClient 调一次最小对话。
 *
 * 这是 Day 03 课题（多 provider）在 Day 02 提前触发的产物 —— 验证 ChatClient
 * 接口在 Anthropic Messages API 下仍然稳定。业务代码（`client.chat([...])`）
 * 与 ex_001 的 OpenAIChatClient demo 完全一致 —— 抽象层的价值兑现。
 *
 * 用法：
 *   1. 在 .env 里填入 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL
 *   2. pnpm exec tsx examples/day02/ex_002_anthropic_chat_client.ts
 */

import 'dotenv/config';

import { AnthropicChatClient } from '../../libs/llm/index.js';

const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
const baseURL = process.env.ANTHROPIC_BASE_URL;
const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-...';

if (!apiKey) {
  throw new Error('ANTHROPIC_AUTH_TOKEN is required (set in .env)');
}
if (!baseURL) {
  throw new Error('ANTHROPIC_BASE_URL is required (set in .env)');
}

console.log(`[anthropic-chat-client] baseURL=${baseURL}`);
console.log(`[anthropic-chat-client] model=${model}`);
console.log('[anthropic-chat-client] sending request...');

const client = new AnthropicChatClient({ apiKey, baseURL, model });

const reply = await client.chat([
  { role: 'system', content: '你是个刺猬.' },
  { role: 'user', content: '用一句话介绍你自己。' },
]);

console.log('[anthropic-chat-client] response:');
console.log(reply);
