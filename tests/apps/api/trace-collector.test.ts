import { describe, expect, it } from 'vitest';

import { createAgentApp } from '../../../apps/api/src/index.js';
import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry, calculatorTool } from '../../../libs/tools/index.js';
import { FakeChatClient } from '../../libs/agent/shared/fake-chat-client.js';

/**
 * Day 06 Trace Collector 端到端测试。
 *
 * 覆盖:
 * - POST /agent 完成后，GET /traces/:runId 拿回完整 events 数组
 * - Trace.events 包含完整 8 kind（不含 error 路径）
 * - GET /traces 列出按 startedAt 倒序
 * - GET /traces/:runId 不存在 → 404
 * - Trace meta / startedAt / endedAt 字段
 */

async function readSSEResponse(res: Response): Promise<string> {
  if (res.body === null) throw new Error('expected response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) out += decoder.decode(value);
  }
  return out;
}

describe('Trace Collector (POST /agent)', () => {
  it('GET /traces/:runId returns full event array after calculator flow', async () => {
    const chat = new FakeChatClient([
      { toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }] },
      { content: '3' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    // 跑 POST /agent 拿 runId
    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'compute' }),
      }),
    );
    expect(res.status).toBe(200);
    await readSSEResponse(res);

    // GET /traces 拿 runId 列表
    const listRes = await app.fetch(new Request('http://localhost/traces'));
    expect(listRes.status).toBe(200);
    const traces = (await listRes.json()) as Array<{ runId: string }>;
    expect(traces.length).toBeGreaterThan(0);
    const runId = traces[0]?.runId;
    expect(runId).toBeDefined();

    // GET /traces/:runId 拿完整 trace
    const traceRes = await app.fetch(new Request(`http://localhost/traces/${runId}`));
    expect(traceRes.status).toBe(200);
    const trace = (await traceRes.json()) as {
      runId: string;
      startedAt: number;
      endedAt: number | null;
      events: Array<{ kind: string; [k: string]: unknown }>;
      meta: Record<string, unknown>;
    };

    expect(trace.runId).toBe(runId);
    expect(typeof trace.startedAt).toBe('number');
    expect(typeof trace.endedAt).toBe('number');
    expect(trace.startedAt).toBeLessThanOrEqual(trace.endedAt ?? Date.now());
    expect(trace.meta).toEqual({});

    // 完整 8 kind 序列（不含 error）
    const kinds = trace.events.map((e) => e.kind);
    expect(kinds).toEqual([
      'message_start',
      'iteration',
      'request',
      'response',
      'tool_call',
      'tool_result',
      'iteration',
      'request',
      'response',
      'message_end',
      'done',
    ]);

    // request.messages 在第二轮应该累积 tool result
    const requests = trace.events
      .filter((e) => e.kind === 'request')
      .map((e) => e as unknown as { iteration: number; messages: Array<{ role: string }> });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.messages).toHaveLength(1); // user only (no systemPrompt)
    expect(requests[1]?.messages).toHaveLength(3); // + assistant(tool) + tool(result)
    expect(requests[1]?.messages[2]?.role).toBe('tool');
  });

  it('GET /traces returns traces sorted by startedAt desc', async () => {
    const chat = new FakeChatClient([{ content: 'hi' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    // 跑 3 次
    for (let i = 0; i < 3; i++) {
      const res = await app.fetch(
        new Request('http://localhost/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: `msg ${String(i)}` }),
        }),
      );
      await readSSEResponse(res);
    }

    const listRes = await app.fetch(new Request('http://localhost/traces'));
    const traces = (await listRes.json()) as Array<{ startedAt: number }>;
    expect(traces.length).toBe(3);
    // 倒序
    for (let i = 0; i < traces.length - 1; i++) {
      expect(traces[i]?.startedAt).toBeGreaterThanOrEqual(traces[i + 1]?.startedAt ?? 0);
    }
  });

  it('GET /traces/:runId returns 404 for unknown runId', async () => {
    const chat = new FakeChatClient([]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(new Request('http://localhost/traces/nonexistent-id'));
    expect(res.status).toBe(404);
  });

  it('collector records error event when agent loop throws', async () => {
    // 2 次 toolCalls 但 maxIterations=2 → 第二次 chat 后下一轮 maxIterations 越界 → throw
    const chat = new FakeChatClient([
      { toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1' } }] },
      { toolCalls: [{ id: 'tc_2', toolName: 'calculator', args: { expression: '2' } }] },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools, maxIterations: 2 });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'infinite' }),
      }),
    );
    expect(res.status).toBe(200);
    await readSSEResponse(res);

    const listRes = await app.fetch(new Request('http://localhost/traces'));
    const traces = (await listRes.json()) as Array<{ runId: string }>;
    const runId = traces[0]?.runId ?? '';
    const traceRes = await app.fetch(new Request(`http://localhost/traces/${runId}`));
    const trace = (await traceRes.json()) as { events: Array<{ kind: string }> };

    // 最后一个 event 应该是 error
    const last = trace.events.at(-1);
    expect(last?.kind).toBe('error');
  });

  it('injected collector is shared (cross-app, cross-request)', async () => {
    // 验证注入 collector 的能力：测试用同一个 collector 构造多个 app，
    // collector 状态跨 app 共享 —— 这给未来"多 Agent 共享 trace store"留口子
    const chat = new FakeChatClient([{ content: 'shared' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const { TraceCollector } = await import('../../../apps/api/src/index.js');
    const shared = new TraceCollector();
    const app1 = createAgentApp({ agent, collector: shared });
    const app2 = createAgentApp({ agent, collector: shared });

    // app1 跑一次
    const r1 = await app1.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'a' }),
      }),
    );
    await readSSEResponse(r1);

    // shared collector 应有 1 条 trace
    expect(shared.size()).toBe(1);

    // app2 也跑，shared 增至 2 条
    const r2 = await app2.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'b' }),
      }),
    );
    await readSSEResponse(r2);
    expect(shared.size()).toBe(2);

    // app1 也能看到 app2 的 trace（共享 collector）
    const listRes = await app1.fetch(new Request('http://localhost/traces'));
    const traces = (await listRes.json()) as Array<unknown>;
    expect(traces.length).toBe(2);
  });
});
