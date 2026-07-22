import { describe, expect, it } from 'vitest';

import { agentEventToSSEMessage, agentEventsToSSEMessages } from '../../../apps/api/src/index.js';
import type { AgentEvent } from '../../../libs/agent/index.js';

describe('agentEventToSSEMessage', () => {
  it('encodes message_start with kind as event name', () => {
    const msg = agentEventToSSEMessage({ kind: 'message_start' });
    expect(msg.event).toBe('message_start');
    expect(msg.data).toBe('{"kind":"message_start"}');
  });

  it('encodes iteration with payload', () => {
    const msg = agentEventToSSEMessage({ kind: 'iteration', n: 3 });
    expect(msg.event).toBe('iteration');
    expect(JSON.parse(msg.data)).toEqual({ kind: 'iteration', n: 3 });
  });

  it('encodes tool_call preserving unknown args shape', () => {
    const msg = agentEventToSSEMessage({
      kind: 'tool_call',
      id: 'call_1',
      name: 'calculator',
      args: { expression: '1+2*3' },
    });
    expect(msg.event).toBe('tool_call');
    expect(JSON.parse(msg.data)).toEqual({
      kind: 'tool_call',
      id: 'call_1',
      name: 'calculator',
      args: { expression: '1+2*3' },
    });
  });

  it('encodes tool_result with stringified output', () => {
    const msg = agentEventToSSEMessage({
      kind: 'tool_result',
      id: 'call_1',
      name: 'calculator',
      output: '{"result":7}',
    });
    expect(msg.event).toBe('tool_result');
    expect(JSON.parse(msg.data)).toEqual({
      kind: 'tool_result',
      id: 'call_1',
      name: 'calculator',
      output: '{"result":7}',
    });
  });

  it('encodes message_end with content', () => {
    const msg = agentEventToSSEMessage({ kind: 'message_end', content: 'hello' });
    expect(msg.event).toBe('message_end');
    expect(JSON.parse(msg.data)).toEqual({ kind: 'message_end', content: 'hello' });
  });

  it('encodes done', () => {
    const msg = agentEventToSSEMessage({ kind: 'done' });
    expect(msg.event).toBe('done');
    expect(msg.data).toBe('{"kind":"done"}');
  });

  it('encodes error with message', () => {
    const msg = agentEventToSSEMessage({ kind: 'error', message: 'oops' });
    expect(msg.event).toBe('error');
    expect(JSON.parse(msg.data)).toEqual({ kind: 'error', message: 'oops' });
  });
});

describe('agentEventsToSSEMessages', () => {
  async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const v of iter) out.push(v);
    return out;
  }

  it('preserves event order from source stream', async () => {
    async function* source(): AsyncIterable<AgentEvent> {
      yield { kind: 'message_start' };
      yield { kind: 'iteration', n: 1 };
      yield { kind: 'tool_call', id: 'a', name: 'calculator', args: {} };
      yield { kind: 'tool_result', id: 'a', name: 'calculator', output: '3' };
      yield { kind: 'message_end', content: '3' };
      yield { kind: 'done' };
    }

    const messages = await collect(agentEventsToSSEMessages(source()));
    expect(messages.map((m) => m.event)).toEqual([
      'message_start',
      'iteration',
      'tool_call',
      'tool_result',
      'message_end',
      'done',
    ]);
  });

  it('produces JSON-parseable data for every event', async () => {
    async function* source(): AsyncIterable<AgentEvent> {
      yield { kind: 'message_start' };
      yield { kind: 'iteration', n: 2 };
      yield { kind: 'message_end', content: 'done' };
      yield { kind: 'done' };
    }

    const messages = await collect(agentEventsToSSEMessages(source()));
    for (const m of messages) {
      // 任何一个 data 解析失败都说明序列化坏了
      expect(() => JSON.parse(m.data) as unknown).not.toThrow();
    }
  });

  it('returns empty stream when source is empty', async () => {
    async function* source(): AsyncIterable<AgentEvent> {
      // no yields
    }
    const messages = await collect(agentEventsToSSEMessages(source()));
    expect(messages).toEqual([]);
  });
});
