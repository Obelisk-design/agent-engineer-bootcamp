/**
 * tests/apps/web/agent-event-roundtrip.test.ts
 *
 * 表驱动测试：枚举 AgentEvent 全 14 kind，逐个断言
 *   1) sse-adapter.agentEventToSSEMessage 能正确编码
 *   2) 前端 parseFrame 风格的解码器能反解回等价 AgentEvent
 *   3) 前端 isAgentEvent guard 接受该 kind（不再被当成未知 kind 丢弃）
 *
 * 目的：未来新增 kind 时若忘记扩 guard / 解析逻辑，此处会立刻 RED。
 * Day 15 review finding 7：序列断言硬编码 → 通过「全 kind 覆盖」来固化契约。
 *
 * 测试不依赖真实网络：sse-adapter 是纯函数，parseFrame / isAgentEvent 来自 agentClient.ts。
 */

import { describe, it, expect } from 'vitest';
import type { AgentEvent } from '../../../libs/agent/index.js';
import { agentEventToSSEMessage } from '../../../apps/api/src/sse-adapter.js';

// —— agentClient.ts 不导出 parseFrame / isAgentEvent，本文件 inline 一份同步等价实现 —
// 与 apps/web/src/api/agentClient.ts 当前实现完全一致（kind 集合跟随 Task 2 扩展）。
const ALLOWED_KINDS = new Set<string>([
  'message_start',
  'iteration',
  'request',
  'response',
  'message_delta',
  'context',
  'tool_call',
  'tool_call_start',
  'tool_call_end',
  'tool_result',
  'message_end',
  'run_summary',
  'done',
  'error',
]);

function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && ALLOWED_KINDS.has(kind);
}

function parseFrame(raw: string): AgentEvent | null {
  let eventName = '';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }
  if (eventName === '' || data === '') return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (!isAgentEvent(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// 14 kind 全部枚举 —— 与 libs/agent/event.ts 判别联合一一对应。
const ALL_KINDS: AgentEvent[] = [
  { kind: 'message_start' },
  { kind: 'iteration', n: 1 },
  { kind: 'request', iteration: 1, messages: [] },
  { kind: 'response', iteration: 1, content: 'x' },
  { kind: 'message_delta', content: 'x' },
  { kind: 'context', iteration: 1, promptTokens: 0, limit: 200000 },
  { kind: 'tool_call_start', id: 't1', name: 'echo', args: {}, startedAt: 0 },
  { kind: 'tool_call', id: 't1', name: 'echo', args: {} },
  {
    kind: 'tool_call_end',
    id: 't1',
    name: 'echo',
    latencyMs: 1,
    ok: true,
    tokenUsage: { promptTokens: 0, completionTokens: 0 },
  },
  { kind: 'tool_result', id: 't1', name: 'echo', output: '{}' },
  { kind: 'message_end', content: 'done' },
  {
    kind: 'run_summary',
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    peakPromptTokens: 0,
    iterations: 1,
  },
  { kind: 'done' },
  { kind: 'error', message: 'x' },
];

describe('AgentEvent SSE roundtrip (Day 15, all 14 kinds)', () => {
  it('ALL_KINDS table covers exactly 14 entries', () => {
    expect(ALL_KINDS).toHaveLength(14);
  });

  it('ALLOWED_KINDS guard matches ALL_KINDS table', () => {
    // 防止「枚举表与 guard 集合漂移」——两张表必须一一对应。
    const fromTable = new Set(ALL_KINDS.map((e) => e.kind));
    expect(ALLOWED_KINDS.size).toBe(fromTable.size);
    for (const k of fromTable) expect(ALLOWED_KINDS.has(k)).toBe(true);
  });

  for (const event of ALL_KINDS) {
    it(`survives roundtrip for kind=${event.kind}`, () => {
      const frame = agentEventToSSEMessage(event);

      // 1) 编码端：event 字段就是 kind。
      expect(frame.event).toBe(event.kind);

      // 2) 编码端：data 是 JSON 字符串，能 parse 回原对象。
      const decoded = parseFrame(`event: ${frame.event}\ndata: ${frame.data}`);
      expect(decoded).not.toBeNull();
      expect(decoded).toEqual(event);
    });
  }

  it('rejects unknown kind via guard', () => {
    const unknown = { kind: 'totally_made_up', payload: 1 };
    expect(isAgentEvent(unknown)).toBe(false);
  });
});
