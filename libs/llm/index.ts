/**
 * libs/llm/index.ts
 *
 * libs/llm 公共 API 导出。
 * Day 02 先导出 OpenAI provider；Day 02 延展 多导出 Anthropic provider。
 * Day 03 加 stream()。
 * Day 04 重构：统一 chat / stream 接口，移除 chatWithTools。
 */

export type { Role, Message } from './message.js';
export type {
  ChatClient,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  ToolCallData,
} from './chat-client.js';
export type { OpenAIChatClientOptions } from './openai-chat-client.js';
export { OpenAIChatClient } from './openai-chat-client.js';
export type { AnthropicChatClientOptions } from './anthropic-chat-client.js';
export { AnthropicChatClient } from './anthropic-chat-client.js';
