import { describe, it, expect } from 'vitest';

import { fetchPageBlocksWithClient, type MinimalClient, type NotionFetchOptions } from './fetch.js';

const baseOpts: NotionFetchOptions = { auth: 'secret_x', rateLimitMs: 0, maxRetries: 2 };

// Cast helper: brief's minimal fakes only declare the methods they exercise.
// `MinimalClient.search` exists for listAllPages (Task 6) but isn't touched
// here, so these test doubles intentionally omit it. Once Task 7 installs
// @notionhq/client and the real Client class satisfies MinimalClient, the
// cast stays a type-only concession to the structural-typing seam.
const asClient = (fake: object): MinimalClient => fake as MinimalClient;

describe('fetchPageBlocks classification', () => {
  it('returns ok=true with blocks when SDK returns content', async () => {
    const fakeClient = asClient({
      blocks: { children: { list: async () => ({ results: [{ id: 'b1', type: 'paragraph' }] }) } },
    });
    const out = await fetchPageBlocksWithClient('p1', fakeClient, baseOpts);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.blocks).toHaveLength(1);
  });

  it('returns ok=false reason=forbidden on 403', async () => {
    const fakeClient = asClient({
      blocks: { children: { list: async () => { throw Object.assign(new Error('forbidden'), { code: 'unauthorized', status: 403 }); } } },
    });
    const out = await fetchPageBlocksWithClient('p1', fakeClient, baseOpts);
    expect(out).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns ok=false reason=not_found on 404', async () => {
    const fakeClient = asClient({
      blocks: { children: { list: async () => { throw Object.assign(new Error('missing'), { code: 'object_not_found', status: 404 }); } } },
    });
    const out = await fetchPageBlocksWithClient('p1', fakeClient, baseOpts);
    expect(out).toEqual({ ok: false, reason: 'not_found' });
  });

  it('retries on 429 then succeeds', async () => {
    let calls = 0;
    const fakeClient = asClient({
      blocks: { children: { list: async () => {
        calls += 1;
        if (calls < 2) throw Object.assign(new Error('slow down'), { code: 'rate_limited', status: 429 });
        return { results: [] };
      } } },
    });
    const out = await fetchPageBlocksWithClient('p1', fakeClient, baseOpts);
    expect(out.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('gives up after maxRetries and throws on persistent 429', async () => {
    let calls = 0;
    const fakeClient = asClient({
      blocks: { children: { list: async () => {
        calls += 1;
        throw Object.assign(new Error('rate limited'), { code: 'rate_limited', status: 429 });
      } } },
    });
    await expect(fetchPageBlocksWithClient('p1', fakeClient, { ...baseOpts, maxRetries: 1 }))
      .rejects.toThrow(/rate/);
    expect(calls).toBe(2);
  });
});
