/**
 * libs/llm/tool-call.ts
 *
 * ToolCallData / ChatResponse / ToolDefinition 类型定义。
 *
 * 这些类型在 libs/llm 层定义而非 libs/agent 层 —— 因为 Message.history
 * 字段 (toolCalls / toolCallId) 在 libs/llm/message.ts 用到。下层依赖上层
 * 是分层违规, 所以类型定义放在 llm 层。
 *
 * libs/agent/types.ts pure re-export 给 agent 层用, 不再自己定义。
 */

import type { ToolParameters } from '../tools/tool.js';

export interface ToolCallData {
  readonly id: string;
  readonly toolName: string;
  readonly args: unknown;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
}

export type ChatResponse =
  | { readonly kind: 'content'; readonly content: string }
  | { readonly kind: 'tool_calls'; readonly toolCalls: ReadonlyArray<ToolCallData> };
