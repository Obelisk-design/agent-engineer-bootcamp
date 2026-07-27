import { describe, expect, it } from 'vitest';

import { buildCallChain } from '../../../apps/web/src/lib/callChain.js';

describe('buildCallChain', () => {
  it('summarizes a full agent execution in a readable step list', () => {
    const events = [
      { kind: 'message_start' },
      { kind: 'iteration', n: 1 },
      {
        kind: 'request',
        iteration: 1,
        messages: [{ role: 'user', content: 'compute 1+2' }],
      },
      {
        kind: 'response',
        iteration: 1,
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }],
      },
      { kind: 'tool_call', id: 'tc_1', name: 'calculator', args: { expression: '1+2' } },
      { kind: 'tool_result', id: 'tc_1', name: 'calculator', output: '{"result":3}' },
      { kind: 'message_end', content: '3' },
      { kind: 'done' },
    ] as const;

    const chain = buildCallChain(events);

    expect(chain.map((step) => step.label)).toEqual([
      '接收任务',
      '迭代 1',
      'LLM 请求',
      'LLM 响应',
      '工具调用 calculator',
      '工具返回 calculator',
      '生成答案',
      '完成',
    ]);
  });
});
