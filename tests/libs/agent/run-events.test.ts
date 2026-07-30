import { describe, expect, it } from 'vitest';

import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry, calculatorTool } from '../../../libs/tools/index.js';
import { FakeChatClient } from './shared/fake-chat-client.js';

const hasAnthropicKey =
  process.env.ANTHROPIC_API_KEY !== undefined && process.env.ANTHROPIC_API_KEY !== '';

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
    for await (const ev of agent.runEvents([{ role: 'user', content: 'compute 1+2' }]))
      events.push(ev);

    // 序列断言：覆盖 11 kind（不含 error / context）—— Day 07 加 message_delta；Day 08 加 run_summary
    // 注：calculator-flow 测试不传 model → 不 yield context 事件
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
      'message_delta', // Day 07: final-answer iter 流式
      'response', // 2: content
      'run_summary', // 🆕 Day 08: before message_end
      'message_end',
      'done',
    ]);
  });

  it('returns final content via runEvents then done', async () => {
    const chat = new FakeChatClient([{ content: 'hi' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });

    const events = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'hello' }])) events.push(ev);

    expect(events[0]?.kind).toBe('message_start');
    const context = events.find((e) => e.kind === 'context');
    expect(context).toBeUndefined(); // no model passed → no context event
    const messageEnd = events.find((e) => e.kind === 'message_end');
    expect(messageEnd).toEqual({ kind: 'message_end', content: 'hi' });
    // run_summary 出现在 message_end 之前
    const runSummary = events.find((e) => e.kind === 'run_summary');
    expect(runSummary).toBeDefined();
    expect(runSummary).toMatchObject({
      kind: 'run_summary',
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      peakPromptTokens: 0,
      iterations: 1,
    });
    expect(events.at(-1)).toEqual({ kind: 'done' });
  });

  it('emits error event when loop exceeds maxIterations', async () => {
    // 🆕 Day 07: error throw → yield（行为变更，灰区，肥老大 ack）
    // 2 次 toolCalls 但 maxIterations=2 → 第 2 次循环后超限
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

    // Day 07: 不再 throw，消费方拿到 error 事件，for-await 不抛
    const events = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'infinite' }]))
      events.push(ev);

    const errorEvent = events.find((e) => e.kind === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { message: string }).message).toMatch(/exceeded 2 iterations/);
    // error 后不发 done
    expect(events.find((e) => e.kind === 'done')).toBeUndefined();
  });

  it('emits run_summary before error when maxIterations exceeded', async () => {
    // 🆕 Day 08: error 路径也必须先发 run_summary（partial 累加也给前端看）
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

    const events = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'infinite' }]))
      events.push(ev);

    const runSummaryIndex = events.findIndex((e) => e.kind === 'run_summary');
    const errorIndex = events.findIndex((e) => e.kind === 'error');
    expect(runSummaryIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeGreaterThan(-1);
    expect(runSummaryIndex).toBeLessThan(errorIndex);
  });

  it.runIf(hasAnthropicKey)('emits context event when model is provided', async () => {
    const chat = new FakeChatClient([{ content: 'hi' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools, model: 'claude-opus-5' });

    const events = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'hello' }])) events.push(ev);

    const context = events.find((e) => e.kind === 'context');
    expect(context).toBeDefined();
    if (context?.kind === 'context') {
      expect(context.iteration).toBe(1);
      expect(context.limit).toBe(1_000_000);
      expect(context.promptTokens).toBeGreaterThan(0);
    }
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
    const agent = new Agent({ chat, tools });

    // 🆕 Day 09: messages 由 caller 自己拼（含 system）
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'compute' },
    ];

    // 只消费到第一次 chat 完成
    for await (const ev of agent.runEvents(messages)) {
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
    const agent = new Agent({ chat, tools });

    // 🆕 Day 09: messages 由 caller 自己拼（含 system）
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'compute' },
    ];

    // 跑完整个流
    for await (const _ev of agent.runEvents(messages)) {
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
    for await (const ev of agent.runEvents([{ role: 'user', content: 'compute' }])) {
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
    for await (const ev of agent.runEvents([{ role: 'user', content: 'ask' }])) {
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

/**
 * 🆕 Day 07 新增测试场景：
 * - signal abort 触发 yield error
 * - chat 抛错被 catch 转 yield error
 * - usage 字段正确从 response 事件透出
 * - message_delta 累积与 message_end.content 一致
 */
describe('Agent.runEvents — signal and error yield (Day 07)', () => {
  it('yields error event when signal aborts before first iteration', async () => {
    const chat = new FakeChatClient([{ content: 'never used' }]);
    const agent = new Agent({ chat, tools: new ToolRegistry() });
    const controller = new AbortController();
    controller.abort(); // 立即 abort

    const events = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'hi' }], {
      signal: controller.signal,
    })) {
      events.push(ev);
    }

    const errorEvent = events.find((e) => e.kind === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { message: string }).message).toBe('aborted by signal');
    // 不应进入 iteration / chat 调用
    expect(events.find((e) => e.kind === 'iteration')).toBeUndefined();
    expect(chat.requests).toHaveLength(0);
  });

  it('yields error event when chat throws', async () => {
    // FakeChatClient.chat 当 responses 耗尽时 throw —— 用空 responses 触发
    const chat = new FakeChatClient([]);
    const agent = new Agent({ chat, tools: new ToolRegistry() });

    const events = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'hi' }])) {
      events.push(ev);
    }

    const errorEvent = events.find((e) => e.kind === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { message: string }).message).toMatch(/no more mocked responses/);
  });

  it('emits message_delta events during final-answer iteration', async () => {
    const chat = new FakeChatClient([{ content: 'hi back' }]);
    // streamChunks 精细控制：拆 3 个 chunk
    chat.streamChunks.push([{ content: 'hi' }, { content: ' ' }, { content: 'back' }]);
    const agent = new Agent({ chat, tools: new ToolRegistry() });

    const events = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'hello' }])) events.push(ev);

    const deltas = events.filter((e) => e.kind === 'message_delta');
    expect(deltas).toHaveLength(3);
    expect(deltas.map((e) => (e as { content: string }).content)).toEqual(['hi', ' ', 'back']);
  });
});

describe('Agent.runEvents — usage accumulation (Day 07)', () => {
  it('response event includes usage from chat', async () => {
    const chat = new FakeChatClient([
      {
        content: 'answer',
        usage: { promptTokens: 10, completionTokens: 5 },
      },
    ]);
    const agent = new Agent({ chat, tools: new ToolRegistry() });

    const responses = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'q' }])) {
      if (ev.kind === 'response') responses.push(ev);
    }

    expect(responses[0]?.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  it('final message_end event comes after stream accumulates full content', async () => {
    const chat = new FakeChatClient([{ content: 'final answer' }]);
    const agent = new Agent({ chat, tools: new ToolRegistry() });

    let accumulatedDeltas = '';
    let messageEndContent = '';
    for await (const ev of agent.runEvents([{ role: 'user', content: 'q' }])) {
      if (ev.kind === 'message_delta') {
        accumulatedDeltas += (ev as { content: string }).content;
      }
      if (ev.kind === 'message_end') {
        messageEndContent = (ev as { content: string }).content;
      }
    }

    expect(accumulatedDeltas).toBe('final answer');
    expect(messageEndContent).toBe('final answer');
  });
});
