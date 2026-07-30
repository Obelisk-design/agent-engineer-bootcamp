/**
 * tests/apps/web/multi-turn.test.ts
 *
 * Day 09 反例验证：前端多轮对话 —— agentClient.stream 应把 messages 发到 server。
 *
 * 策略：mock globalThis.fetch，捕获 body，断言形状。
 * 不跑真实 Vue 渲染（vitest jsdom 配置不在 Day 09 范围）。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultAgentClient } from '../../../apps/web/src/api/agentClient.js';

describe('AgentClient.stream — multi-turn body shape (Day 09)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends { input, messages } in body when messages option provided', async () => {
    const captured: { url: string; init: RequestInit } = { url: '', init: {} as RequestInit };
    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured.url = typeof url === 'string' ? url : url.toString();
      captured.init = init ?? ({} as RequestInit);
      // 最小化 Response：body null 会让 stream 抛错，但我们只关心 fetch 被调用过
      return new Response(null, { status: 500 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const history = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello back' },
    ];

    // 调用 stream, 不消费 events (Response 500 → stream 内部抛错也无所谓)
    try {
      // AsyncIterable 没有 .next() —— 用 for await 触发第一个 yield
      for await (const _ev of defaultAgentClient.stream('what did I say?', {
        messages: history,
      })) {
        break;
      }
    } catch {
      // expected
    }

    expect(captured.url).toBe('/agent');
    expect(captured.init.method).toBe('POST');
    const body = JSON.parse(captured.init.body as string) as {
      input: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.input).toBe('what did I say?');
    expect(body.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello back' },
    ]);
  });

  it('omits messages key when not provided (back-compat single-turn)', async () => {
    const captured: { init: RequestInit } = { init: {} as RequestInit };
    const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured.init = init ?? ({} as RequestInit);
      return new Response(null, { status: 500 });
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      for await (const _ev of defaultAgentClient.stream('hi')) {
        break;
      }
    } catch {
      // expected
    }

    const body = JSON.parse(captured.init.body as string) as { input: string; messages?: unknown };
    expect(body.input).toBe('hi');
    expect('messages' in body).toBe(false);
  });
});
