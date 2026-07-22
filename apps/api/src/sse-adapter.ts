/**
 * apps/api/src/sse-adapter.ts
 *
 * SSE Adapter —— 把 AgentEvent 适配成 SSE 消息形态。
 *
 * 设计原则：
 * - 输出是 framework-agnostic 的 { event, data } 形态（符合 W3C SSE spec 字段），
 *   不依赖任何 HTTP 框架。今天 server.ts 把它喂给 Hono `streamSSE.writeSSE`；
 *   未来要换 Fastify / Express / Web Response / 自定义 transport，都不需要改这个文件。
 * - 核心纯函数 `agentEventToSSEMessage` 单测一行即可验证。
 * - `data` 用 JSON.stringify。JSON 字符串不含裸换行符，
 *   单行 SSE `data:` 一定合法，不需要拆多行。
 *
 * 不做的事（YAGNI）：
 * - event id（重连场景）
 * - retry 字段
 * - 心跳 / comment 帧
 * - 多行 data
 */

import type { AgentEvent } from '../../../libs/agent/index.js';

/**
 * W3C SSE 消息形态（最小子集）。
 * event: 事件类型名（用 AgentEvent.kind）。
 * data: 已序列化的 JSON 字符串。
 */
export interface SSEMessage {
  readonly event: string;
  readonly data: string;
}

/**
 * 把单个 AgentEvent 转成一条 SSE 消息。
 */
export function agentEventToSSEMessage(ev: AgentEvent): SSEMessage {
  return {
    event: ev.kind,
    data: JSON.stringify(ev),
  };
}

/**
 * 把 AgentEvent 流转成 SSE 消息流。
 * 调用方负责把 SSEMessage 写到底层 transport（Hono `writeSSE`、Node res.write、…）。
 */
export async function* agentEventsToSSEMessages(
  events: AsyncIterable<AgentEvent>,
): AsyncIterable<SSEMessage> {
  for await (const ev of events) {
    yield agentEventToSSEMessage(ev);
  }
}
