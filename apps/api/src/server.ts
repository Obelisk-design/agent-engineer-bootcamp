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
 *   - Runtime 层（loop 抛错）：以 `event: error` SSE 帧发出
 *   - Trace 查询（runId 不存在）：404 + JSON
 *
 * 不做的事（YAGNI）：
 * - Trace 持久化（Day 10+）
 * - Token/Latency/Cost 派生（Day 07+）
 * - Trace 过滤 / 分页 / 模糊匹配（Day 10+ Evaluation）
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { Agent } from '../../../libs/agent/index.js';
import { agentEventToSSEMessage } from './sse-adapter.js';
import { loadWebIndexHtml } from './web-loader.js';
import { TraceCollector } from './trace-collector.js';

export interface AgentAppOptions {
  readonly agent: Agent;
  readonly collector?: TraceCollector;
}

/**
 * 构造一个绑定到指定 Agent 的 Hono app。
 */
export function createAgentApp(options: AgentAppOptions): Hono {
  const app = new Hono();
  const collector = options.collector ?? new TraceCollector();

  // Day 06: 单页 Web UI
  const html = loadWebIndexHtml();
  app.get('/', (c) => c.html(html));

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

  // Day 05: POST /agent + SSE
  app.post('/agent', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { input?: unknown } | null;
    const input = body?.input;
    if (typeof input !== 'string' || input.length === 0) {
      return c.json({ error: 'request body must be { input: string }' }, 400);
    }

    // Day 06: start() 分配 runId，事件流走 TraceCollector + SSE 双路
    const runId = collector.start();

    return streamSSE(c, async (stream) => {
      try {
        for await (const ev of options.agent.runEvents(input)) {
          collector.collect(runId, ev);
          await stream.writeSSE(agentEventToSSEMessage(ev));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        collector.collect(runId, { kind: 'error', message });
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ kind: 'error', message }),
        });
      } finally {
        collector.end(runId);
      }
    });
  });

  return app;
}
