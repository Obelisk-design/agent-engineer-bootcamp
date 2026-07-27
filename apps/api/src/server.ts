/**
 * apps/api/src/server.ts
 *
 * Hono App —— 把 Agent 暴露成 SSE HTTP 端点 + 单页 Web UI + Trace 端点。
 *
 * 设计原则：
 * - 不在 apps/api/ 里硬编码 ChatClient / ToolRegistry。调用方构造 Agent 后传给 createAgentApp。
 * - 路由：
 *   GET  /              Agent Console 单页 UI
 *   POST /agent         Server-Sent Events
 *   GET  /traces        列出最近 trace（按 startedAt 倒序）
 *   GET  /traces/:runId 拿指定 trace 完整 events 快照
 * - TraceCollector 是可选注入（默认 new 一个 in-memory），跨请求共享状态。
 * - 错误返回：
 *   - HTTP 协议层（缺 input）：400 + JSON
 *   - Runtime 层：error 走 SSE 事件（Day 07 行为变更：runEvents yield error，不再 throw）
 *   - Trace 查询（runId 不存在）：404 + JSON
 *
 * Day 07 改造（Phase C Task 9）：
 * - AbortController：监听 request.signal（客户端断线）→ abortController.abort()
 * - signal 透传给 agent.runEvents(input, { signal })
 * - usage 累积：消费 response 事件，把 ChatUsage 累加
 * - message_end / error 时把 totalUsage 写进 trace meta（addMeta）
 * - 删 try/catch（error 已走 SSE 事件路径）；保留 finally 保证 collector.end()
 *
 * 不做的事（YAGNI）：
 * - Trace 持久化（Day 10+）
 * - latency / cost 派生（Day 10+）
 * - Trace 过滤 / 分页 / 模糊匹配（Day 10+ Evaluation）
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { Agent } from '../../../libs/agent/index.js';
import type { ChatUsage } from '../../../libs/llm/chat-client.js';
import { agentEventToSSEMessage } from './sse-adapter.js';
import { TraceCollector } from './trace-collector.js';

export interface AgentAppOptions {
  readonly agent: Agent;
  readonly collector?: TraceCollector;
}

/**
 * 构造一个绑定到指定 Agent 的 Hono app。
 *
 * 🆕 Day 08: 不再返回 HTML UI（前后端分离）。
 * 前端是 apps/web（Vue + Vite），通过 dev proxy / 生产反代打到本 server。
 */
export function createAgentApp(options: AgentAppOptions): Hono {
  const app = new Hono();
  const collector = options.collector ?? new TraceCollector();

  // Day 06: Trace 查询路由
  app.get('/traces', (c) => c.json(collector.list()));

  app.get('/traces/:runId', (c) => {
    const runId = c.req.param('runId');
    const trace = collector.get(runId);
    if (trace === undefined) {
      return c.json({ error: `trace not found: ${runId}` }, 404);
    }
    return c.json(trace);
  });

  // Day 05/07: POST /agent + SSE
  app.post('/agent', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { input?: unknown } | null;
    const input = body?.input;
    if (typeof input !== 'string' || input.length === 0) {
      return c.json({ error: 'request body must be { input: string }' }, 400);
    }

    // 🆕 Day 07: AbortController + 监听客户端断线
    const abortController = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => abortController.abort());

    // Day 06: start() 分配 runId，事件流走 TraceCollector + SSE 双路
    const runId = collector.start();

    return streamSSE(c, async (stream) => {
      // 🆕 Day 07: usage 累积（多轮 tool_calls + final answer 之和）
      let totalUsage: ChatUsage | undefined;

      try {
        for await (const ev of options.agent.runEvents(input, {
          signal: abortController.signal,
        })) {
          collector.collect(runId, ev);

          // 🆕 Day 07: 累积 usage
          if (ev.kind === 'response' && ev.usage !== undefined) {
            totalUsage =
              totalUsage === undefined
                ? ev.usage
                : {
                    promptTokens: totalUsage.promptTokens + ev.usage.promptTokens,
                    completionTokens: totalUsage.completionTokens + ev.usage.completionTokens,
                  };
          }

          // 终止事件：写 meta + end
          if (ev.kind === 'message_end' || ev.kind === 'error') {
            if (totalUsage !== undefined) {
              collector.addMeta(runId, { usage: totalUsage });
            }
            collector.end(runId);
          }

          await stream.writeSSE(agentEventToSSEMessage(ev));
        }
      } finally {
        // 兜底：signal abort / 流异常时也保证 collector.end 被调
        collector.end(runId);
      }
    });
  });

  return app;
}
