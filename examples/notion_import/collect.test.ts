import { describe, it, expect } from 'vitest';

import {
  collectPagesRecursive,
  recurseIntoChildren,
  MAX_DEPTH,
  type CollectOpts,
} from './collect.js';
import type { MinimalClient, NotionFetchOptions } from '../../libs/notion/index.js';

const baseOpts: NotionFetchOptions = { auth: 'secret_x', rateLimitMs: 0, maxRetries: 2 };

const asClient = (fake: object): MinimalClient => fake as MinimalClient;

// Seed 页面 id：带连字符的 'aaaa1111-bbbb-2222-cccc-3333dddd4444' → 规范化成 'aaaa1111bbbb2222cccc3333dddd4444'
const SEED_ID_NORM = 'aaaa1111bbbb2222cccc3333dddd4444';
const SEED_ID_HYPHEN = 'aaaa1111-bbbb-2222-cccc-3333dddd4444';
// 子页面 id（8-4-4-4-12，共 32 位）
const C1_HYPHEN = 'c1aaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const C1_NORM = 'c1aaaaaabbbbccccddddeeeeeeeeeeee';
const C2_HYPHEN = 'c2aaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const C2_NORM = 'c2aaaaaabbbbccccddddeeeeeeeeeeee';
const C3_HYPHEN = 'c3aaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeMetaPage(idHyphen: string, title: string, iso: string): Record<string, unknown> {
  return {
    id: idHyphen,
    last_edited_time: iso,
    properties: { title: { type: 'title', title: [{ plain_text: title }] } },
  };
}

/**
 * 构造一个绑定到 child map 的 MinimalClient fake。每条 entry 的 blocks
 * 会把 `childIds` 枚举成 `child_page` 块；每个 childId 通过 `pages.retrieve`
 * 解析成一个带 title 的 meta 页。
 */
function makeFakeClient(
  blocksByPageId: ReadonlyMap<string, readonly { id: string; title: string }[]>,
  metaByPageIdHyphen: ReadonlyMap<string, { title: string; iso: string }>,
): MinimalClient {
  const norm = (id: string): string => id.replace(/-/g, '');
  const blocks: MinimalClient['blocks'] = {
    children: {
      list: async (args: Record<string, unknown>) => {
        const key = norm(String(args['block_id']));
        const children = blocksByPageId.get(key) ?? [];
        const results = children.map((c) => ({
          id: c.id,
          type: 'child_page',
          child_page: { title: c.title },
        }));
        return { results, has_more: false, next_cursor: null };
      },
    },
  };
  const pages: MinimalClient['pages'] = {
    retrieve: async (args: Record<string, unknown>) => {
      const hyphenId = String(args['page_id']);
      const m = metaByPageIdHyphen.get(hyphenId);
      if (m === undefined) throw new Error(`unexpected page_id ${hyphenId}`);
      return makeMetaPage(hyphenId, m.title, m.iso);
    },
  };
  return asClient({
    search: async () => ({ results: [], has_more: false, next_cursor: null }),
    blocks,
    pages,
  });
}

describe('collectPagesRecursive', () => {
  it('happy path: depth=3 yields seed + child + grandchild with parent path', async () => {
    // seed → Day09 → Review
    const blocksByPageId = new Map<string, readonly { id: string; title: string }[]>([
      [SEED_ID_NORM, [{ id: C1_HYPHEN, title: 'Day09' }]],
      [C1_NORM, [{ id: C2_HYPHEN, title: 'Review' }]],
    ]);
    const metaByPageIdHyphen = new Map<string, { title: string; iso: string }>([
      [C1_HYPHEN, { title: 'Day09', iso: '2026-08-25T11:00:00.000Z' }],
      [C2_HYPHEN, { title: 'Review', iso: '2026-08-25T12:00:00.000Z' }],
    ]);
    const client = makeFakeClient(blocksByPageId, metaByPageIdHyphen);

    const seedPage = {
      pageId: SEED_ID_NORM,
      lastEditedMs: Date.parse('2026-08-25T10:00:00.000Z'),
      lastEditedIso: '2026-08-25T10:00:00.000Z',
      sourceLabel: 'Daily',
    };
    async function* seeds(): AsyncIterable<typeof seedPage> {
      yield seedPage;
    }

    const opts: CollectOpts = {
      fetchOpts: baseOpts,
      maxDepth: MAX_DEPTH,
      maxChildren: null,
      visited: new Set<string>(),
      client,
    };
    const collected = await collectPagesRecursive(seeds(), opts);
    expect(collected).toHaveLength(3);
    expect(collected.map((c) => c.depth)).toEqual([0, 1, 2]);
    expect(collected.map((c) => c.parentPath)).toEqual([
      'Daily',
      'Daily / Day09',
      'Daily / Day09 / Review',
    ]);
    expect(collected.map((c) => c.meta.sourceLabel)).toEqual(['Daily', 'Day09', 'Review']);
    // id 已规范化
    expect(collected.map((c) => c.meta.pageId)).toEqual([SEED_ID_NORM, C1_NORM, C2_NORM]);
  });

  it('cycle short-circuit: child_page pointing back to seed is skipped at any depth', async () => {
    // seed "Daily" 有一个 child_page 的 id 等于 seed 自身的 id（自引用环）
    const blocksByPageId = new Map<string, readonly { id: string; title: string }[]>([
      [SEED_ID_NORM, [{ id: SEED_ID_HYPHEN, title: 'Self-ref' }]],
    ]);
    const metaByPageIdHyphen = new Map<string, { title: string; iso: string }>([
      [SEED_ID_HYPHEN, { title: 'Self-ref', iso: '2026-08-25T10:30:00.000Z' }],
    ]);
    const client = makeFakeClient(blocksByPageId, metaByPageIdHyphen);

    const seedPage = {
      pageId: SEED_ID_NORM,
      lastEditedMs: Date.parse('2026-08-25T10:00:00.000Z'),
      lastEditedIso: '2026-08-25T10:00:00.000Z',
      sourceLabel: 'Daily',
    };
    async function* seeds(): AsyncIterable<typeof seedPage> {
      yield seedPage;
    }

    const opts: CollectOpts = {
      fetchOpts: baseOpts,
      maxDepth: MAX_DEPTH,
      maxChildren: null,
      visited: new Set<string>(),
      client,
    };
    const collected = await collectPagesRecursive(seeds(), opts);
    expect(collected).toHaveLength(1);
    expect(collected[0]!.depth).toBe(0);
    expect(collected[0]!.meta.sourceLabel).toBe('Daily');
  });

  it('--max-children cap stops recursion once threshold reached', async () => {
    // seed 有 3 个子页面；上限设为 2 → 期望 1 个 seed + 2 个 child
    const blocksByPageId = new Map<string, readonly { id: string; title: string }[]>([
      [
        SEED_ID_NORM,
        [
          { id: C1_HYPHEN, title: 'C1' },
          { id: C2_HYPHEN, title: 'C2' },
          { id: C3_HYPHEN, title: 'C3' },
        ],
      ],
    ]);
    const metaByPageIdHyphen = new Map<string, { title: string; iso: string }>([
      [C1_HYPHEN, { title: 'C1', iso: '2026-08-25T11:00:00.000Z' }],
      [C2_HYPHEN, { title: 'C2', iso: '2026-08-25T12:00:00.000Z' }],
      [C3_HYPHEN, { title: 'C3', iso: '2026-08-25T13:00:00.000Z' }],
    ]);
    const client = makeFakeClient(blocksByPageId, metaByPageIdHyphen);

    const seedPage = {
      pageId: SEED_ID_NORM,
      lastEditedMs: Date.parse('2026-08-25T10:00:00.000Z'),
      lastEditedIso: '2026-08-25T10:00:00.000Z',
      sourceLabel: 'Daily',
    };
    async function* seeds(): AsyncIterable<typeof seedPage> {
      yield seedPage;
    }

    const opts: CollectOpts = {
      fetchOpts: baseOpts,
      maxDepth: MAX_DEPTH,
      maxChildren: 2,
      visited: new Set<string>(),
      client,
    };
    const collected = await collectPagesRecursive(seeds(), opts);
    expect(collected).toHaveLength(3); // 1 个 seed + 2 个 child
    expect(collected.map((c) => c.depth)).toEqual([0, 1, 1]);
    expect(collected.map((c) => c.meta.sourceLabel)).toEqual(['Daily', 'C1', 'C2']);
  });
});

describe('recurseIntoChildren', () => {
  it('returns immediately when depth > maxDepth', async () => {
    const opts: CollectOpts = {
      fetchOpts: baseOpts,
      maxDepth: 1,
      maxChildren: null,
      visited: new Set<string>(),
    };
    let invoked = false;
    await recurseIntoChildren('p1', 'X', opts, 2, () => {
      invoked = true;
      return true;
    });
    expect(invoked).toBe(false);
  });
});
