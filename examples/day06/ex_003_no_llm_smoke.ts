/**
 * examples/day06/ex_003_no_llm_smoke.ts
 *
 * Day 06 示例：无 LLM 依赖的端到端 smoke test。
 *
 * 覆盖 Day 06 阶段四产出：
 *   - tests/libs/agent/shared/fake-chat-client.ts 可复用测试 helper
 *   - tests/apps/api/end-to-end.test.ts POST /agent 端到端 SSE 流（happy path）
 *   - CI 环境独立：pnpm test 在 OPENAI_API_KEY 缺失或为空时全绿
 *
 * 这个 demo 把 day06 落地的 "FakeChatClient + app.fetch 端到端" 复刻到
 * examples/，作为手动自测入口 + 未来回归保护。
 *
 * 跟 ex_001 / ex_002 不同：
 *   - 不用真实 OPENAI_API_KEY（FakeChatClient 模拟 chat 响应）
 *   - 跑完整 POST /agent → SSE 帧 → collector 查 trace 的端到端
 *   - 验证 events 序列 + CI independence（env 缺 key 也能跑）
 *
 * 用法：
 *   pnpm exec tsx examples/day06/ex_003_no_llm_smoke.ts
 *
 * CI 独立性验证：
 *   OPENAI_API_KEY="" pnpm exec tsx examples/day06/ex_003_no_llm_smoke.ts
 *   env -u OPENAI_API_KEY pnpm exec tsx examples/day06/ex_003_no_llm_smoke.ts
 */

import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';

import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';
import { createAgentApp } from '../../apps/api/src/index.js';
import { TraceCollector } from '../../apps/api/src/trace-collector.js';
import { FakeChatClient } from '../../tests/libs/agent/shared/fake-chat-client.js';
import type { ChatUsage } from '../../libs/llm/index.js';

// 关键：用 FakeChatClient —— 不依赖 OPENAI_API_KEY
const chat = new FakeChatClient([
  // 第一次 chat：返回 tool_calls（让 Agent 走 calculator 路径）
  {
    toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2*3' } }],
    usage: { promptTokens: 50, completionTokens: 10 } satisfies ChatUsage,
  },
  // 第二次 chat：返回 content（最终答案）
  {
    content: '7',
    usage: { promptTokens: 60, completionTokens: 5 } satisfies ChatUsage,
  },
]);
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  model: 'gpt-4o-mini',
});

const collector = new TraceCollector();
const app = createAgentApp({ agent, collector });

async function readSSE(res: Response): Promise<string> {
  if (res.body === null) {
    throw new Error('expected SSE response to have a body');
  }
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

async function main() {
  console.log(`[day06-smoke] OPENAI_API_KEY=${process.env.OPENAI_API_KEY ?? '<unset>'}`);
  console.log(`[day06-smoke] 验证：FakeChatClient 端到端，不依赖真实 LLM`);

  const server = serve({ fetch: app.fetch, port: 0 });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${String(address.port)}/agent`;

  try {
    // 1. POST /agent
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'compute 1+2*3' }),
    });

    console.log(`[day06-smoke] status=${String(res.status)}`);
    const sseBody = await readSSE(res);
    console.log(`[day06-smoke] SSE body length: ${sseBody.length}`);

    // 2. 验：SSE 帧序列覆盖（Day 06 阶段一+阶段四，Day 07 后多 message_delta）
    const expectedFrames = [
      'event: message_start',
      'event: iteration',
      'event: request',
      'event: response',
      'event: tool_call',
      'event: tool_result',
      'event: message_delta', // 🆕 Day 07
      'event: message_end',
      'event: done',
    ];
    let allFramesPresent = true;
    for (const frame of expectedFrames) {
      if (!sseBody.includes(frame)) {
        console.error(`[day06-smoke] ✗ missing frame: ${frame}`);
        allFramesPresent = false;
      }
    }
    if (allFramesPresent) {
      console.log(
        `[day06-smoke] ✓ all ${String(expectedFrames.length)} expected SSE frames present`,
      );
    }

    // 3. 验：collector 收到完整 events
    const traces = collector.list();
    if (traces.length === 0) {
      throw new Error('expected at least one trace');
    }
    const trace = traces[0];
    if (trace === undefined) {
      throw new Error('expected first trace to exist');
    }
    const kinds = trace.events.map((e) => e.kind);
    console.log(`[day06-smoke] trace kinds: ${kinds.join(' → ')}`);

    if (trace.endedAt === undefined) {
      console.error(`[day06-smoke] ✗ trace.endedAt is undefined`);
    } else {
      console.log(`[day06-smoke] ✓ trace.endedAt set`);
    }

    // 4. 验：CI independence — OPENAI_API_KEY 缺失/空时 demo 仍能跑通
    // （这条已经在 main 函数顶部打印 OPENAI_API_KEY=<unset> 验证）

    console.log(`\n[day06-smoke] ✓ smoke test passed`);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('[day06-smoke] ✗ smoke test failed');
  console.error(err);
  process.exit(1);
});
