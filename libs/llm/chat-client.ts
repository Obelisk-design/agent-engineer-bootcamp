/**
 * libs/llm/chat-client.ts
 *
 * ChatClient 抽象层的最小契约 —— libs/llm 的中心接口定义。
 *
 * 契约：
 *   chat(request): 一次对话，传入 ChatRequest（messages + 可选 tools），拿到 ChatResponse。
 *   stream(request): 流式对话，传入 ChatRequest，逐 chunk yield ChatChunk。
 *
 * 设计决策（Day 04 重构）：
 * - 统一 chat / stream 接口，移除 chatWithTools
 * - 普通聊天：await client.chat({ messages })
 * - 工具调用：await client.chat({ messages, tools: [calculatorTool.definition] })
 * - 返回统一 ChatResponse：{ content?, toolCalls? }
 *
 * provider 实现目录：
 * - libs/llm/openai-chat-client.ts       —— OpenAI 兼容协议
 * - libs/llm/anthropic-chat-client.ts    —— Anthropic Messages API
 * - 未来新 provider：libs/llm/<name>-chat-client.ts，implements ChatClient
 */

import type { Message } from './message.js';
import type { ToolDefinition } from '../tools/tool.js';

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
}

export interface ChatChunk {
  readonly content?: string;
}

export interface ChatClient {
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatChunk>;
  setModel(model: string): void;
}
