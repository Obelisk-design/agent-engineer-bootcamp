/**
 * libs/agent/event.ts
 *
 * AgentEvent —— Agent Runtime 的事件模型。
 *
 * 设计决策（Day 05）：
 * - 判别联合（discriminated union）而非平铺 optional 字段。
 *   理由：SSE / IPC / 日志 是外部消费契约，二选一歧义会让消费方写 `if x !== undefined` 的串行判断。
 *   用 `kind` 后消费方可以 `switch (ev.kind)`，TS 会在每个分支里自动收窄类型。
 * - 不含 `message_delta`。Day 05 仍走 `chat()`（非 `stream()`），content 是整段一次性到达。
 *   真正接入 streaming tool calling 的 day 才把 `message_delta` 加进联合。
 * - `tool_call` / `tool_result` 严格 1:1 配对：每个 tool_call 后面必有同名 tool_result。
 *   这是 Agent Loop 的不变量，SSE 消费方可以靠这个不变量做超时检测 / 状态机。
 *
 * Day 05 追加：加 `request` / `response` 事件，把每次 LLM 调用的入参/出参暴露给消费方。
 * - request 携带累积的 messages（system + user 原始 + 历次 tool result）—— 是 Agent Loop 的"过程快照"
 * - response 携带 LLM 返回的 ChatResponse（content 或 toolCalls）
 * - 配 iteration 编号方便 timeline 把 request/response 锚定到对应轮次
 *
 * Day 07 追加：加 `message_delta` kind（10 kind）+ `response.usage` 可选字段。
 * - message_delta：final-answer iter 流式 yield 文本增量。tool_calls iter 不流式（仍走 request/response）。
 * - response.usage：单轮 LLM 调用的 token 用量（provider 返回的 ChatUsage）。
 *   apps/api 层累积到 TraceCollector meta（totalUsage = 多轮 sum）。
 *
 * Day 08 追加：加 `context` / `run_summary` 两种事件（12 kind 总计）。
 * - context：每次 LLM 调用前 yield，携带 promptTokens 与 contextLimit。前端 HeaderPill / Sidebar 消费。
 * - run_summary：message_end / error 之前 yield，携带累积的 totalPromptTokens / totalCompletionTokens / peakPromptTokens / iterations。
 *
 * 不做的事（YAGNI）：
 * - 事件序列号 / id（SSE 重连场景）
 * - 时间戳（消费方自己加）
 * - 分块 / partial JSON
 * - latency / cost 进 response（Day 10+ 评估）
 */

import type { Message, ToolCallData } from '../llm/index.js';
import type { ChatUsage } from '../llm/chat-client.js';

export type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | {
      readonly kind: 'request';
      readonly iteration: number;
      readonly messages: ReadonlyArray<Message>;
    }
  | {
      readonly kind: 'response';
      readonly iteration: number;
      readonly content?: string;
      readonly toolCalls?: ReadonlyArray<ToolCallData>;
      readonly usage?: ChatUsage; // 🆕 Day 07
    }
  | { readonly kind: 'message_delta'; readonly content: string } // 🆕 Day 07
  | {
      readonly kind: 'context';
      readonly iteration: number;
      readonly promptTokens: number;
      readonly limit: number;
    } // 🆕 Day 08
  | {
      readonly kind: 'tool_call';
      readonly id: string;
      readonly name: string;
      readonly args: unknown;
    }
  | {
      readonly kind: 'tool_result';
      readonly id: string;
      readonly name: string;
      readonly output: string;
    }
  | { readonly kind: 'message_end'; readonly content: string }
  | {
      readonly kind: 'run_summary';
      readonly totalPromptTokens: number;
      readonly totalCompletionTokens: number;
      readonly peakPromptTokens: number;
      readonly iterations: number;
    } // 🆕 Day 08
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
