/**
 * libs/llm/tool-call.ts
 *
 * ToolCallData / ChatResponse 类型定义。
 *
 * ToolDefinition 定义在 libs/tools/tool.ts（Tool 层事实源），
 * 不再由本文件定义或 re-export，避免 libs/llm 与 libs/tools 双头定义。
 *
 * ChatResponse 作为 ChatClient.chatWithTools 的返回值，仍由 libs/llm 层持有 ——
 * 它是 LLM 抽象层的响应契约，不是 Tool 层契约。
 */

export interface ToolCallData {
  readonly id: string;
  readonly toolName: string;
  readonly args: unknown;
}

export type ChatResponse =
  | { readonly kind: 'content'; readonly content: string }
  | { readonly kind: 'tool_calls'; readonly toolCalls: ReadonlyArray<ToolCallData> };
