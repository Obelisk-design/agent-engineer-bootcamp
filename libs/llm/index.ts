/**
 * libs/llm/index.ts
 *
 * libs/llm 公共 API 导出。
 * 今天只导出 ChatClient 抽象层 + OpenAIChatClient 实现 + Message 类型。
 *
 * 日后扩展按子文件导出（不集中 re-export）：
 * - memory 子模块在 libs/llm/memory.ts（Day 06 之后）
 * - anthropic chat-client 在 libs/llm/anthropic-chat-client.ts（Day 02 之后任意时候）
 */

export type { Role, Message } from './message.js';
export type { ChatClient } from './chat-client.js';
export type { OpenAIChatClientOptions } from './chat-client.js';
export { OpenAIChatClient } from './chat-client.js';
