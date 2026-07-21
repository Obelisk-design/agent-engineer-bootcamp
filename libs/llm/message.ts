/**
 * libs/llm/message.ts
 *
 * ChatClient 抽象层的最小消息契约 (Day 02)。
 *
 * Day 04 加 2 个 optional 字段 (toolCalls / toolCallId) 支持 Agent Tool Calling。
 * Day 02/03 调用方无需感知 —— 未指定时 undefined, 行为同旧契约。
 *
 * 渐进式扩展路径:
 * - assistant 需要 tool_calls: 加 toolCalls 字段 (Day 04 已加)
 * - tool result 消息: 加 toolCallId 字段 (Day 04 已加)
 * - 未来 content 多模态: 加 contentBlocks?: ContentBlock[] 字段
 */

import type { ToolCallData } from './tool-call.js';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  readonly role: Role;
  readonly content: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly toolCallId?: string;
}
