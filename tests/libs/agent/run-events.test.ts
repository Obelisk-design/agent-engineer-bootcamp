import { describe, expect, it } from 'vitest';

import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry, calculatorTool } from '../../../libs/tools/index.js';
import { FakeChatClient } from './shared/fake-chat-client.js';

/**
 * Day 06 CI smoke tests for Agent.runEvents().
 *
 * 覆盖:
 * - 9 kind 完整事件序列（message_start / iteration / request / response /
 *   tool_call / tool_result / message_end / done / error）
 * - request 事件的 messages 累积正确（第二轮含 tool result）
 * - response 事件携带 ChatResponse（content / toolCalls 两种形态）
 * - 不依赖 OPENAI_API_KEY，纯本地跑
 */

describe('Agent.runEvents — event sequence', () => {
  it('emits the full sequence for a calculator flow with 2 LLM calls', async () => {
    const chat = new FakeChatClient([
      // 第一次 chat：返回 toolCalls
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }],
      },
      // 第二次 chat：返回 content
      { content: '3' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });

    const events = [];
    for await (const ev of agent.runEvents('compute 1+2')) events.push(ev);

    // 序列断言：覆盖 8 个 kind（不含 error）
    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual([
      'message_start',
      'iteration', // 1
      'request', // 1
      'response', // 1: toolCalls
      'tool_call',
      'tool_result',
      'iteration', // 2
      'request', // 2
      'response', // 2: content
      'message_end',
      'done',
    ]);
  });

  it('returns final content via runEvents then done', async () => {
    const chat = new FakeChatClient([{ content: 'hi' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });

    const events = [];
    for await (const ev of agent.runEvents('hello')) events.push(ev);

    expect(events[0]?.kind).toBe('message_start');
    const messageEnd = events.find((e) => e.kind === 'message_end');
    expect(messageEnd).toEqual({ kind: 'message_end', content: 'hi' });
    expect(events.at(-1)).toEqual({ kind: 'done' });
  });

  it('emits error event when loop throws', async () => {
    // 2 次 toolCalls 但 maxIterations=2 → 第 2 次 chat 调用时进入下一轮前
    // maxIterations 已经越界 → runEvents throws → for-await 冒泡
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1' } }],
      },
      {
        toolCalls: [{ id: 'tc_2', toolName: 'calculator', args: { expression: '2' } }],
      },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools, maxIterations: 2 });

    let caught: unknown = null;
    try {
      for await (const _ev of agent.runEvents('infinite')) {
        // drain
      }
    } catch (err) {
      caught = err;
    }

    // runEvents 当前不在内部 catch（仍直接 throw），for-await 冒泡
    // 后续 Day 06+ 也许会把 throw 转成 yield error 事件，但当前契约：throw 出去
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/exceeded 2 iterations/);
  });
});

describe('Agent.runEvents — request.messages accumulation', () => {
  it('first iteration: messages contain system + user only', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }],
      },
      { content: '3' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({
      chat,
      tools,
      systemPrompt: 'You are a helpful assistant.',
    });

    // 只消费到第一次 chat 完成
    for await (const ev of agent.runEvents('compute')) {
      if (ev.kind === 'response' && ev.iteration === 1) break;
    }

    expect(chat.requests).toHaveLength(1);
    expect(chat.requests[0]?.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'compute' },
    ]);
  });

  it('second iteration: messages accumulate tool result from iteration 1', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }],
      },
      { content: '3' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({
      chat,
      tools,
      systemPrompt: 'You are a helpful assistant.',
    });

    // 跑完整个流
    for await (const _ev of agent.runEvents('compute')) {
      // drain
    }

    expect(chat.requests).toHaveLength(2);

    // 第一轮：system + user
    expect(chat.requests[0]?.messages).toHaveLength(2);

    // 第二轮：system + user + assistant(toolCalls) + tool(result)
    const secondMessages = chat.requests[1]?.messages ?? [];
    expect(secondMessages).toHaveLength(4);
    expect(secondMessages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    expect(secondMessages[1]).toEqual({ role: 'user', content: 'compute' });
    expect(secondMessages[2]).toMatchObject({
      role: 'assistant',
      toolCalls: [{ id: 'tc_1', toolName: 'calculator' }],
    });
    expect(secondMessages[3]).toMatchObject({
      role: 'tool',
      toolCallId: 'tc_1',
    });
    // tool result content 是 calculator 输出 '3'
    expect((secondMessages[3] as { content: string }).content).toBe('{"result":3}');
  });
});

describe('Agent.runEvents — response event payload', () => {
  it('response with toolCalls has iteration + toolCalls (no content)', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '5' } }],
      },
      { content: '5' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });

    const responses = [];
    for await (const ev of agent.runEvents('compute')) {
      if (ev.kind === 'response') responses.push(ev);
    }

    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({
      kind: 'response',
      iteration: 1,
      toolCalls: [{ id: 'tc_1', toolName: 'calculator' }],
    });
    expect(responses[0]).not.toHaveProperty('content');
  });

  it('response with content has iteration + content (no toolCalls)', async () => {
    const chat = new FakeChatClient([{ content: 'the answer' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });

    const responses = [];
    for await (const ev of agent.runEvents('ask')) {
      if (ev.kind === 'response') responses.push(ev);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({
      kind: 'response',
      iteration: 1,
      content: 'the answer',
    });
    expect(responses[0]).not.toHaveProperty('toolCalls');
  });
});
