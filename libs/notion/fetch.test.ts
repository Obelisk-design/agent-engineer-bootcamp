import { describe, it, expect } from 'vitest';

import {
  fetchPageBlocksWithClient,
  getPageMetaWithClient,
  type MinimalClient,
  type NotionFetchOptions,
} from './fetch.js';

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

describe('getPageMeta', () => {
  // 8-4-4-4-12 UUIDs (32 chars total). hyphenated below; normalized by removing '-'.
  const CHILD_HYPHEN = 'c1aaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const CHILD_NORM = 'c1aaaaaabbbbccccddddeeeeeeeeeeee';

  it('normalizes hyphenated pageId, parses lastEdited, builds sourceLabel from title', async () => {
    let captured: Record<string, unknown> | undefined;
    const fakeClient = asClient({
      pages: { retrieve: async (args: Record<string, unknown>) => {
        captured = args;
        return {
          id: CHILD_HYPHEN,
          last_edited_time: '2026-08-25T11:00:00.000Z',
          properties: { title: { type: 'title', title: [{ plain_text: 'Day09' }] } },
        };
      } },
    });
    const out = await getPageMetaWithClient(CHILD_HYPHEN, fakeClient, baseOpts);
    expect(out.pageId).toBe(CHILD_NORM);
    expect(out.lastEditedIso).toBe('2026-08-25T11:00:00.000Z');
    expect(out.lastEditedMs).toBe(Date.parse('2026-08-25T11:00:00.000Z'));
    expect(out.sourceLabel).toBe('Day09');
    // SDK received hyphenated form
    expect(captured).toBeDefined();
    expect(captured!['page_id']).toBe(CHILD_HYPHEN);
  });

  it('re-hyphenates a 32-char non-hyphenated input for the SDK call', async () => {
    let captured: Record<string, unknown> | undefined;
    const fakeClient = asClient({
      pages: { retrieve: async (args: Record<string, unknown>) => {
        captured = args;
        return {
          id: CHILD_NORM,
          last_edited_time: '2026-08-25T11:00:00.000Z',
          properties: { title: { type: 'title', title: [{ plain_text: 'Day09' }] } },
        };
      } },
    });
    const out = await getPageMetaWithClient(CHILD_NORM, fakeClient, baseOpts);
    expect(out.pageId).toBe(CHILD_NORM);
    // SDK received the re-hyphenated form
    expect(captured!['page_id']).toBe(CHILD_HYPHEN);
  });

  it('returns sourceLabel=id fallback when properties.title is absent', async () => {
    const fakeClient = asClient({
      pages: { retrieve: async () => ({
        id: 'aaaa1111-bbbb-2222-cccc-3333dddd4444',
        last_edited_time: '2026-08-25T10:00:00.000Z',
        properties: {},
      }) },
    });
    const out = await getPageMetaWithClient(
      'aaaa1111bbbb2222cccc3333dddd4444',
      fakeClient,
      baseOpts,
    );
    expect(out.sourceLabel).toBe('aaaa1111-bbbb-2222-cccc-3333dddd4444');
  });
});
