/**
 * apps/web/src/api/agentClient.ts
 *
 * AgentClient —— 前端唯一与 Agent Runtime 通信的入口。
 *
 * 职责：
 * - POST /agent + 读取 SSE 响应
 * - 解析 SSE 帧 (event: / data: 格式)
 * - 把 data JSON 反序列化成 AgentEvent 判别联合
 * - 把"网络 / transport 层"封装在内部，组件只看到 AsyncIterable<AgentEvent>
 *
 * 设计原则（Day 02 §9 边界纪律延伸）：
 * - Vue 组件永远不直接 fetch / 解析 SSE / JSON.parse data
 * - 组件只看到 AgentEvent —— 协议细节不泄漏
 * - AbortSignal 从 stream() options 传入，AbortController 在组件层持有
 *
 * 跟 libs/agent 的边界：
 * - AgentEvent 类型从 libs/agent re-export（apps/web 通过相对路径引用）
 * - 前后端共享同一份类型定义 —— 不会"两份 AgentEvent 漂移"
 */

import type { AgentEvent } from '../../../../libs/agent/index.js';

/**
 * 流式消费选项。
 *
 * signal：调用方持有 AbortController，触发 abort 时 fetch 自动断开，
 *        server.ts 监听 c.req.raw.signal → 内部 abort → Agent.runEvents yield error。
 *        Day 07 AbortSignal 链路完整闭环。
 */
export interface StreamOptions {
  readonly signal?: AbortSignal;
}

export interface AgentClient {
  /**
   * 流式发送输入并消费 AgentEvent。
   * 返回 AsyncIterable<AgentEvent> —— 协议无关的消费模型。
   */
  stream(input: string, options?: StreamOptions): AsyncIterable<AgentEvent>;
}

/**
 * 把 SSE 字节流转成 AgentEvent 流。
 *
 * 跟原 apps/api/src/web/index.html parseSSEStream 等价，
 * 但只暴露 AsyncIterable<AgentEvent> 给组件，不暴露 SSE 帧。
 *
 * 错误处理：
 * - 协议层错误（HTTP status != 200）：直接抛 Error，组件 try/catch
 * - Runtime 错误：AgentEvent.kind === 'error'，组件 switch case
 * - SSE 帧格式错误（缺 event / data）：跳过当前帧
 */
async function* parseSSEEvents(body: ReadableStream<Uint8Array>): AsyncIterable<AgentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 帧以 \n\n 分隔
    let boundaryIndex: number;
    while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      const event = parseFrame(raw);
      if (event !== null) yield event;
    }
  }
}

/**
 * 解析单帧 SSE：识别 event: 行 + data: 行 + JSON.parse data。
 * 缺 event 或 data → 返回 null（跳过）。
 */
function parseFrame(raw: string): AgentEvent | null {
  let eventName = '';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }
  if (eventName === '' || data === '') return null;
  try {
    // 把 event 字段也塞到 JSON 里 parse：apps/api sse-adapter.ts 已经把 kind 序列化了
    // 所以这里的 AgentEvent.kind 就是 eventName
    const parsed: unknown = JSON.parse(data);
    if (!isAgentEvent(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 类型守卫：runtime 验证 parsed JSON 是 AgentEvent。
 *
 * 跟 libs/agent/event.ts 判别联合对齐 —— 加新 kind 时这里要同步扩展。
 *
 * 当前 AgentEvent 12 kind（Day 08 末态）：
 */
function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === 'message_start' ||
    kind === 'iteration' ||
    kind === 'request' ||
    kind === 'response' ||
    kind === 'message_delta' ||
    kind === 'context' || // 🆕 Day 08
    kind === 'tool_call' ||
    kind === 'tool_result' ||
    kind === 'message_end' ||
    kind === 'run_summary' || // 🆕 Day 08
    kind === 'done' ||
    kind === 'error'
  );
}

/**
 * 默认实现：fetch /agent + SSE。
 *
 * 端点：相对路径 '/agent'。开发期走 Vite dev proxy 到 localhost:3000；
 *       生产期部署到同一域名 / 通过 Nginx 反代（不在 Day 08 scope）。
 */
export const defaultAgentClient: AgentClient = {
  async *stream(input: string, options?: StreamOptions): AsyncIterable<AgentEvent> {
    const response = await fetch('/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
    });

    // 协议层错误：HTTP 400 等
    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => ({ error: 'request failed' }));
      const message =
        typeof errorBody === 'object' &&
        errorBody !== null &&
        'error' in errorBody &&
        typeof errorBody.error === 'string'
          ? errorBody.error
          : `HTTP ${String(response.status)}`;
      throw new Error(`[${String(response.status)}] ${message}`);
    }

    if (response.body === null) {
      throw new Error('response body is null');
    }

    yield* parseSSEEvents(response.body);
  },
};
