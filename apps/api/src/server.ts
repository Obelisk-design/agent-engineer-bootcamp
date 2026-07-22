/**
 * apps/api/src/server.ts
 *
 * Hono App —— 把 Agent 暴露成 SSE HTTP 端点 + 单页 Web UI。
 *
 * 设计原则：
 * - 不在 apps/api/ 里硬编码 ChatClient / ToolRegistry。调用方构造 Agent 后传给 createAgentApp。
 *   这样 apps/api/ 不依赖任何具体 provider，可被 OpenAI / Anthropic / Fake 任意 Agent 复用。
 * - 只暴露两个路由：GET / 返回单页 HTML，POST /agent 走 SSE。Day 05/06 YAGNI 边界。
 * - HTML 用 fs.readFileSync 启动时读一次，缓存到内存。零运行时磁盘 IO 成本。
 * - HTML 路径解析基于 import.meta.url：server 编译后位置变了也能正确找到 web/index.html。
 *
 * 不做的事（YAGNI）：
 * - Auth / API key 校验
 * - 多 Agent 并发 / queue
 * - 错误重试 / 熔断
 * - 流式 abort
 * - Markdown / 代码高亮 / 多轮对话历史
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { Agent } from '../../../libs/agent/index.js';
import { agentEventsToSSEMessages } from './sse-adapter.js';
import { loadWebIndexHtml } from './web-loader.js';

export interface AgentAppOptions {
  readonly agent: Agent;
}

/**
 * 构造一个绑定到指定 Agent 的 Hono app。
 * 调用方拿到 app 后可以挂到自己的 HTTP server，也可以 `app.fetch(req)` 自行处理。
 */
export function createAgentApp(options: AgentAppOptions): Hono {
  const app = new Hono();

  // Day 06：单页 Web UI。GET / 返回 HTML；POST /agent 走 SSE。
  const html = loadWebIndexHtml();

  app.get('/', (c) => c.html(html));

  app.post('/agent', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { input?: unknown } | null;
    const input = body?.input;
    if (typeof input !== 'string' || input.length === 0) {
      return c.json({ error: 'request body must be { input: string }' }, 400);
    }

    return streamSSE(c, async (stream) => {
      try {
        for await (const msg of agentEventsToSSEMessages(options.agent.runEvents(input))) {
          await stream.writeSSE(msg);
        }
      } catch (err) {
        // Loop 抛错（maxIterations 超限 / chat 客户端异常）以 error 事件发出，让客户端收到收尾信号。
        const message = err instanceof Error ? err.message : String(err);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ kind: 'error', message }),
        });
      }
    });
  });

  return app;
}
