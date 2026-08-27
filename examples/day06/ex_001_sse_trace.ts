/**
 * examples/day06/ex_001_sse_trace.ts
 *
 * Day 06 示例：apps/api/ SSE 端到端 + Trace 收集验证。
 *
 * 覆盖 Day 06 阶段一产出：
 *   - libs/agent/event.ts AgentEvent 判别联合（7 kind，Day 06 阶段一）
 *   - apps/api/src/sse-adapter.ts framework-agnostic SSE 编码
 *   - apps/api/src/server.ts POST /agent + GET /traces + GET /traces/:runId
 *
 * 跟 day05 ex_001_sse_agent.ts 不同：
 *   - Day 06 多了 Trace 端点，demo 同时拉 SSE 流 + 查 Trace
 *   - 验证 TraceCollector 收集到完整 events 序列
 *   - 验证 endedAt / meta 字段
 *
 * 用法：
 *   pnpm exec tsx examples/day06/ex_001_sse_trace.ts
 */

import 'dotenv/config';

import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';

import { OpenAIChatClient } from '../../libs/llm/index.js';
import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';
import { createAgentApp } from '../../apps/api/src/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.MODEL_NAME;

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}
if (!baseURL) {
  throw new Error('OPENAI_BASE_URL is required (set in .env or shell env)');
}
if (!model) {
  throw new Error('MODEL_NAME is required (set in .env or shell env)');
}

const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  model,
});

// 关键：Day 06 加了 collector 注入，让 demo 拿同一实例查 trace
import { TraceCollector } from '../../apps/api/src/trace-collector.js';

const sharedCollector = new TraceCollector();
const app = createAgentApp({ agent, collector: sharedCollector });

async function main() {
  // port: 0 → 让 OS 自动分配空闲端口
  const server = serve({ fetch: app.fetch, port: 0 });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;

  console.log(`[day06-sse-trace] listening on ${baseUrl}`);
  console.log(`[day06-sse-trace] shared collector size: ${sharedCollector.size()}`);

  try {
    // 1. POST /agent → 走完整 Agent Loop + 收集 events
    const res = await fetch(`${baseUrl}/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '用 calculator 工具计算 1+2*3' }),
    });

    console.log(
      `[day06-sse-trace] SSE status=${String(res.status)} content-type=${res.headers.get('content-type') ?? ''}`,
    );

    if (res.body === null) {
      throw new Error('expected SSE response to have a body');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    process.stdout.write('\n[day06-sse-trace] SSE frames:\n');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) process.stdout.write(decoder.decode(value));
    }
    process.stdout.write('\n');

    // 2. 查 trace（demo 用共享 collector，实际生产用 GET /traces）
    console.log(`[day06-sse-trace] collector size after run: ${sharedCollector.size()}`);
    const traces = sharedCollector.list();
    if (traces.length === 0) {
      throw new Error('expected at least one trace in shared collector');
    }
    const trace = traces[0];
    if (trace === undefined) {
      throw new Error('expected first trace to exist');
    }
    const kinds = trace.events.map((e) => e.kind);
    console.log(`[day06-sse-trace] trace runId=${trace.runId}`);
    console.log(`[day06-sse-trace] trace kinds: ${kinds.join(' → ')}`);
    console.log(
      `[day06-sse-trace] trace startedAt=${trace.startedAt} endedAt=${trace.endedAt ?? 'undefined'}`,
    );
    console.log(`[day06-sse-trace] trace events count: ${trace.events.length}`);

    // 3. 验：完整 kind 序列（含 request / response 事件，Day 06 阶段三加的）
    const expectedKinds = [
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
    ];
    if (JSON.stringify(kinds) !== JSON.stringify(expectedKinds)) {
      console.warn(`[day06-sse-trace] WARNING: kinds mismatch`);
      console.warn(`  expected: ${expectedKinds.join(' → ')}`);
      console.warn(`  actual:   ${kinds.join(' → ')}`);
    } else {
      console.log(`[day06-sse-trace] ✓ kinds sequence matches expected`);
    }

    // 4. 验：meta 仍为空（usage 是 Day 07 才填的）
    console.log(`[day06-sse-trace] meta: ${JSON.stringify(trace.meta)}`);
  } finally {
    server.close();
    console.log('\n[day06-sse-trace] server closed');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
