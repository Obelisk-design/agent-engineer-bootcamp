/**
 * libs/llm/index.ts
 *
 * libs/llm 公共 API 导出。
 * Day 02 先导出 OpenAI provider；Day 02 延展 多导出 Anthropic provider。
 * Day 03 加 stream()。
 * Day 04 加 ToolCallData / ChatResponse / ToolDefinition (chatWithTools 相关类型)。
 */

export type { Role, Message } from './message.js';
export type { ToolCallData, ChatResponse } from './tool-call.js';
export type { ToolDefinition } from '../tools/tool.js';
export type { ChatClient } from './chat-client.js';
export type { OpenAIChatClientOptions } from './openai-chat-client.js';
export { OpenAIChatClient } from './openai-chat-client.js';
export type { AnthropicChatClientOptions } from './anthropic-chat-client.js';
export { AnthropicChatClient } from './anthropic-chat-client.js';
