import { describe, expect, it } from 'vitest';

import { createAgentApp } from '../../../apps/api/src/index.js';
import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry, calculatorTool } from '../../../libs/tools/index.js';
import { FakeChatClient } from '../../libs/agent/shared/fake-chat-client.js';

/**
 * Day 06 CI smoke tests for the apps/api end-to-end SSE pipeline.
 *
 * 覆盖:
 * - POST /agent 走完整 calculator flow，端到端 happy path
 * - SSE 帧顺序覆盖全部 8 kind（不含 error）
 * - request 事件的 messages 在第二轮 LLM 调用时含 tool result（累积正确）
 * - 不依赖 OPENAI_API_KEY，纯本地跑（CI 能跑）
 *
 * 不覆盖（留给 server.test.ts 细粒度测试）：
 * - 400 错误（input 缺失 / 非 string / 空）
 * - maxIterations 超限 → error 事件
 * - tool 未找到
 * - GET / 返回 HTML
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

describe('POST /agent end-to-end (CI smoke)', () => {
  it('streams full SSE sequence for calculator flow with 2 LLM calls', async () => {
    const chat = new FakeChatClient([
      // 第一次 chat：返回 toolCalls
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '10+20' } }],
      },
      // 第二次 chat：返回 content
      { content: '30' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'compute 10+20' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const body = await readSSEResponse(res);

    // 全部 8 个 kind 的 SSE 帧按顺序到达（不含 error）
    expect(body).toContain('event: message_start\ndata: {"kind":"message_start"}\n\n');
    expect(body).toContain('event: iteration\ndata: {"kind":"iteration","n":1}\n\n');
    expect(body).toContain('event: request\ndata:');
    expect(body).toContain('event: response\ndata:');
    expect(body).toContain('event: tool_call\ndata:');
    expect(body).toContain('"name":"calculator"');
    expect(body).toContain('event: tool_result\ndata:');
    expect(body).toContain('event: message_end\ndata: {"kind":"message_end","content":"30"}\n\n');
    expect(body).toContain('event: done\ndata: {"kind":"done"}\n\n');

    // 帧顺序：iteration 必须在 tool_call 之前
    const iterationIdx = body.indexOf('event: iteration\ndata: {"kind":"iteration","n":1}');
    const toolCallIdx = body.indexOf('event: tool_call\ndata:');
    expect(iterationIdx).toBeLessThan(toolCallIdx);
    // message_end 必须在 done 之前
    const messageEndIdx = body.indexOf('event: message_end\n');
    const doneIdx = body.indexOf('event: done\n');
    expect(messageEndIdx).toBeLessThan(doneIdx);
  });

  it('streams message_end + done when LLM answers without tools', async () => {
    const chat = new FakeChatClient([{ content: 'hi back' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'hello' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await readSSEResponse(res);

    expect(body).toContain('event: message_start\n');
    expect(body).toContain('event: iteration\ndata: {"kind":"iteration","n":1}\n\n');
    expect(body).toContain(
      'event: message_end\ndata: {"kind":"message_end","content":"hi back"}\n\n',
    );
    expect(body).toContain('event: done\ndata: {"kind":"done"}\n\n');
    expect(body).not.toContain('event: tool_call');
  });

  it('second LLM call receives messages including tool result', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }],
      },
      { content: '3' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    // 用 systemPrompt 让第二轮 messages 长度 = 4（system + user + assistant + tool）
    const agent = new Agent({
      chat,
      tools,
      systemPrompt: 'You are a helpful assistant.',
    });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'compute' }),
      }),
    );
    await readSSEResponse(res);

    // FakeChatClient.requests 应记录 2 次 chat 调用
    expect(chat.requests).toHaveLength(2);
    // 第一次：system + user
    expect(chat.requests[0]?.messages).toHaveLength(2);
    // 第二次：system + user + assistant(tool) + tool(result) = 4
    const secondMessages = chat.requests[1]?.messages ?? [];
    expect(secondMessages).toHaveLength(4);
    // 最后一条是 tool result
    const lastMessage = secondMessages.at(-1);
    expect(lastMessage?.role).toBe('tool');
    expect((lastMessage as { toolCallId?: string } | undefined)?.toolCallId).toBe('tc_1');
  });
});

describe('CI environment independence', () => {
  it('runs without OPENAI_API_KEY in the environment', () => {
    // 测试本身的存在就是断言：本文件不引用 OPENAI_API_KEY / .env / dotenv。
    // FakeChatClient 完全本地 mock，所有 chat() 响应都是写死的。
    // 真实 LLM demo（examples/day05/*）需要 OPENAI_API_KEY，但那些不在 vitest 收集范围。
    // 这里断言 OPENAI_API_KEY 缺失或为空（CI 默认 unset）以显式锁死依赖。
    expect(process.env.OPENAI_API_KEY ?? '').toBe('');
  });
});
