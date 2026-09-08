import { describe, expect, it } from 'vitest';

import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry, calculatorTool } from '../../../libs/tools/index.js';
import { FakeChatClient } from './shared/fake-chat-client.js';

describe('Agent', () => {
  it('returns content immediately when LLM answers without tool', async () => {
    const chat = new FakeChatClient([{ content: 'hi' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const answer = await agent.run([{ role: 'user', content: 'hello' }]);
    expect(answer).toBe('hi');
  });

  it('runs tool loop and returns final content', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }],
      },
      { content: '3' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });
    const answer = await agent.run([{ role: 'user', content: 'compute' }]);
    expect(answer).toBe('3');
  });

  it('returns error string for unknown tool and continues loop', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'nonexistent', args: {} }],
      },
      { content: 'done' },
    ]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const answer = await agent.run([{ role: 'user', content: 'call missing tool' }]);
    expect(answer).toBe('done');
  });

  it('throws when loop exceeds maxIterations', async () => {
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
    await expect(agent.run([{ role: 'user', content: 'infinite' }])).rejects.toThrow(
      'exceeded 2 iterations',
    );
  });
});

// 🆕 Day 15: tool_call_start / tool_call_end 事件覆盖。
// 不动现有 calculatorTool 的 4 个测试，新加 3 个聚焦可观测性事件的用例。
describe('Agent tool_call_start / tool_call_end (Day 15)', () => {
  it('yields tool_call_start before tool_call and tool_call_end after execute', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 't1', toolName: 'calculator', args: { expression: '2+3' } }],
      },
      { content: 'done' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });

    const kinds: string[] = [];
    for await (const ev of agent.runEvents([{ role: 'user', content: 'go' }])) {
      if (ev.kind.startsWith('tool_')) kinds.push(ev.kind);
    }

    // 顺序约束：start → call → result → end（Day 15 ADR 0005）
    expect(kinds).toEqual(['tool_call_start', 'tool_call', 'tool_result', 'tool_call_end']);
  });

  it('marks ok=false when tool throws, still yields tool_result with Error string', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 't1', toolName: 'missing_tool', args: {} }],
      },
      { content: 'done' },
    ]);
    const tools = new ToolRegistry();
    // 不注册 missing_tool —— ToolRegistry.execute 会抛 unknown tool
    const agent = new Agent({ chat, tools });

    let endEvent: { ok?: boolean; latencyMs?: number } | null = null;
    let resultEvent: { output?: string } | null = null;
    for await (const ev of agent.runEvents([{ role: 'user', content: 'go' }])) {
      if (ev.kind === 'tool_call_end') endEvent = ev;
      if (ev.kind === 'tool_result') resultEvent = ev;
    }

    expect(endEvent?.ok).toBe(false);
    expect(String(resultEvent?.output ?? '')).toContain('Error');
  });

  it('latencyMs is non-negative and tokenUsage echoes turn-1 accumulated usage', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 't1', toolName: 'calculator', args: { expression: '1' } }],
        usage: { promptTokens: 10, completionTokens: 5 },
      },
      { content: 'done' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });

    let endEvent: {
      latencyMs?: number;
      ok?: boolean;
      tokenUsage?: { promptTokens: number; completionTokens: number };
    } | null = null;
    for await (const ev of agent.runEvents([{ role: 'user', content: 'go' }])) {
      if (ev.kind === 'tool_call_end') endEvent = ev;
    }

    expect(endEvent?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(endEvent?.ok).toBe(true);
    expect(endEvent?.tokenUsage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });
});
