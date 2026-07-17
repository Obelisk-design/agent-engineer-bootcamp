/**
 * libs/llm/index.ts
 *
 * libs/llm 公共 API 导出。
 * Day 02 (c851ad8) 先导出 OpenAI provider；Day 02 延展 (本 commit) 多导出
 * Anthropic provider，验证 ChatClient 接口在多 provider 下仍然稳定。
 *
 * 日后扩展按子文件导出（不集中 re-export）：
 * - memory 子模块在 libs/llm/memory.ts（Day 06 之后）
 * - 其他 provider 子模块在 libs/llm/<provider>-chat-client.ts
 */

export type { Role, Message } from './message.js';
export type { ChatClient } from './chat-client.js';
export type { OpenAIChatClientOptions } from './openai-chat-client.js';
export { OpenAIChatClient } from './openai-chat-client.js';
export type { AnthropicChatClientOptions } from './anthropic-chat-client.js';
export { AnthropicChatClient } from './anthropic-chat-client.js';
