/**
 * libs/reranker/rerank.test.ts
 *
 * TDD contract：mock fetch 不打真实网络。覆盖 6 个核心场景：
 *   1. ✅ missing apiKey → RangeError
 *   2. ✅ empty query / documents → RangeError
 *   3. ✅ 成功：mock fetch 返回标准 vllm 响应 → 解出 hits 数组（按 score 降序）
 *   4. ✅ HTTP !2xx → 返回 null + console.warn
 *   5. ✅ response 缺 results → 返回 null + console.warn
 *   6. ✅ fetch throw（网络错误）→ 返回 null + console.warn
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rerank } from '../../../libs/reranker/rerank.js';

const originalFetch = globalThis.fetch;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  globalThis.fetch = originalFetch;
});

function mockFetchOnce(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe('rerank', () => {
  it('missing apiKey → RangeError', async () => {
    await expect(rerank({ query: 'q', documents: ['d'] }, '')).rejects.toThrow(RangeError);
  });

  it('empty query → RangeError', async () => {
    await expect(rerank({ query: '  ', documents: ['d'] }, 'k')).rejects.toThrow(RangeError);
  });

  it('empty documents → RangeError', async () => {
    await expect(rerank({ query: 'q', documents: [] }, 'k')).rejects.toThrow(RangeError);
  });

  it('成功响应 → 解出 hits 按 score 降序', async () => {
    mockFetchOnce({
      id: 'score-abc',
      results: [
        { index: 0, relevance_score: 0.9, document: { text: 'doc0' } },
        { index: 1, relevance_score: 0.1, document: { text: 'doc1' } },
        { index: 2, relevance_score: 0.5, document: { text: 'doc2' } },
      ],
      meta: { tokens: { input_tokens: 42 } },
    });
    const r = await rerank({ query: 'q', documents: ['d0', 'd1', 'd2'] }, 'k');
    expect(r).not.toBeNull();
    expect(r!.id).toBe('score-abc');
    expect(r!.hits.map((h) => h.index)).toEqual([0, 2, 1]); // 降序
    expect(r!.hits.map((h) => h.score)).toEqual([0.9, 0.5, 0.1]);
    expect(r!.hits[0]!.text).toBe('doc0');
    expect(r!.meta.inputTokens).toBe(42);
  });

  it('HTTP !2xx → null + warn', async () => {
    mockFetchOnce({ error: 'rate_limit' }, 429);
    const r = await rerank({ query: 'q', documents: ['d'] }, 'k');
    expect(r).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('response 缺 results → null + warn', async () => {
    mockFetchOnce({ id: 'score-x' }); // 无 results
    const r = await rerank({ query: 'q', documents: ['d'] }, 'k');
    expect(r).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('fetch throw（网络错误）→ null + warn', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const r = await rerank({ query: 'q', documents: ['d'] }, 'k');
    expect(r).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
