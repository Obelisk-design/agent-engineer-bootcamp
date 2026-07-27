/**
 * libs/llm/chat-client.ts
 *
 * ChatClient 抽象层的最小契约 —— libs/llm 的中心接口定义。
 *
 * 契约：
 *   chat(request, options?): 一次对话，传入 ChatRequest（messages + 可选 tools），
 *                            拿到 ChatResponse（content? / toolCalls? / usage?）。
 *   stream(request, options?): 流式对话，传入 ChatRequest，逐 chunk yield ChatChunk。
 *
 * 设计决策（Day 04 重构）：
 * - 统一 chat / stream 接口，移除 chatWithTools
 * - 普通聊天：await client.chat({ messages })
 * - 工具调用：await client.chat({ messages, tools: [calculatorTool.definition] })
 * - 返回统一 ChatResponse：{ content?, toolCalls?, usage? }
 *
 * 设计决策（Day 07）：
 * - options.signal: AbortSignal 透传给 SDK，取消时 SDK 终止请求，
 *                   已发送 token 不浪费（流式 UX 关键）。
 * - ChatResponse.usage: provider SDK 都返回 token 用量，藏起来 = 浪费免费数据。
 *                       ChatResponse 是事实源，Trace meta 是 derived（apps/api 层透传）。
 *
 * provider 实现目录：
 * - libs/llm/openai-chat-client.ts       —— OpenAI 兼容协议
 * - libs/llm/anthropic-chat-client.ts    —— Anthropic Messages API
 * - 未来新 provider：libs/llm/<name>-chat-client.ts，implements ChatClient
 *
 * 不做的事（YAGNI）：
 * - ChatResponse 不含 latency / cost（Day 10+ 评估）
 * - ChatUsage 不分 cached / reasoning tokens（provider 能力差异大）
 * - 多模态 / vision / audio chunks
 */

import type { Message } from './message.js';
import type { ToolDefinition } from '../tools/tool.js';

export interface ChatOptions {
  readonly signal?: AbortSignal;
}

export interface ChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface ChatRequest {
  readonly messages: Message[];
  readonly tools?: ReadonlyArray<ToolDefinition>;
}

export interface ToolCallData {
  readonly id: string;
  readonly toolName: string;
  readonly args: unknown;
}

export interface ChatResponse {
  readonly content?: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly usage?: ChatUsage;
}

export interface ChatChunk {
  readonly content?: string;
}

export interface ChatClient {
  chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse>;
  stream(request: ChatRequest, options?: ChatOptions): AsyncIterable<ChatChunk>;
  setModel(model: string): void;
}
