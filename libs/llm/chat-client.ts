/**
 * libs/llm/chat-client.ts
 *
 * ChatClient 抽象层的最小契约 —— libs/llm 的中心接口定义。
 *
 * 契约：
 *   chat(messages): 一次对话，传入历史，拿到 assistant 回复（string）。
 *   stream(messages): 流式对话，传入历史，逐 chunk yield 文本增量（AsyncIterable<string>）。
 *   chatWithTools(messages, tools): 工具增强对话，返回 ChatResponse（content 或 tool_calls）。
 *   setModel(model): 运行时切换模型（可选 set；如果不需要切换，可忽略）。
 *
 * Day 02 c851ad8 commit 时跟 OpenAI 实现共占 chat-client.ts。
 * Day 02 延展加 AnthropicChatClient 后，OpenAI 实现拆到 openai-chat-client.ts。
 * Day 03 加 stream() —— additive 增强（不改 chat() 契约）。
 * Day 04 加 chatWithTools() —— additive 增强（不改 chat/stream/setModel 契约）。
 *
 * 设计取舍：
 * - chat 返回 string 而非结构化 response：ChatClient 最克制的契约；
 *   usage / finish_reason / refusal 都不在基础范围里，需要时再升级。
 * - setModel 失败语义保持 void：模型无效由底层 SDK 抛 validation error。
 * - chatWithTools 返回 ChatResponse 判别联合：tool_calls / content 二选一。
 *   与 chat() 不同 —— tool calling 是 ChatClient 的扩展职责，不是 chat() 的修改。
 *
 * provider 实现目录：
 * - libs/llm/openai-chat-client.ts       —— OpenAI 兼容协议（含 chat/stream/chatWithTools）
 * - libs/llm/anthropic-chat-client.ts    —— Anthropic Messages API（含 chat/stream/chatWithTools）
 * - 未来新 provider：libs/llm/<name>-chat-client.ts，implements ChatClient
 */

import type { Message } from './message.js';
import type { ChatResponse, ToolDefinition } from './tool-call.js';

export interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;
  chatWithTools(messages: Message[], tools: ReadonlyArray<ToolDefinition>): Promise<ChatResponse>;
  setModel(model: string): void;
}
