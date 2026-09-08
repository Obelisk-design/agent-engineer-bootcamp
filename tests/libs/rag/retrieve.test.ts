import { describe, expect, it } from 'vitest';
import { memoryStore, type VectorRecord, type VectorStore } from '../../../libs/rag/store.js';
import { retrieve, retrieveMerged } from '../../../libs/rag/retrieve.js';

describe('retrieve (mock embed)', () => {
  it('空 query 抛 RangeError', async () => {
    const s = memoryStore();
    await expect(
      retrieve('', { k: 1, chunkStrategy: 'heading', store: s, apiKey: 'x' }),
    ).rejects.toThrow(RangeError);
    await s.close();
  });

  it('空 apiKey 抛 RangeError', async () => {
    const s = memoryStore();
    await expect(
      retrieve('q', { k: 1, chunkStrategy: 'heading', store: s, apiKey: '' }),
    ).rejects.toThrow(RangeError);
    await s.close();
  });

  it('mock embedFn 走 mock → search 直接命中', async () => {
    const s = memoryStore();
    await s.add([
      {
        id: 'x',
        vector: [1, 0, 0],
        text: 'target',
        source: 's',
        sourceKind: 'daily',
      },
    ]);
    const res = await retrieve('q', {
      k: 1,
      chunkStrategy: 'heading',
      store: s,
      apiKey: 'fake',
      embedFn: async () => ({
        vectors: [[1, 0, 0]],
        model: 'm',
        dimensions: 3,
        fallbackFlags: [false],
      }),
    });
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0]!.record.id).toBe('x');
    expect(res.chunkStrategy).toBe('heading');
    await s.close();
  });

  it('mock embed 返回多个 vector 抛错', async () => {
    const s = memoryStore();
    await expect(
      retrieve('q', {
        k: 1,
        chunkStrategy: 'heading',
        store: s,
        apiKey: 'fake',
        embedFn: async () => ({
          vectors: [
            [1, 0],
            [0, 1],
          ],
          model: 'm',
          dimensions: 2,
          fallbackFlags: [false, false],
        }),
      }),
    ).rejects.toThrow(/expected 1 query vector/);
    await s.close();
  });
});

describe('retrieveMerged (mock embed)', () => {
  it('空 query 抛 RangeError', async () => {
    const s = memoryStore();
    await expect(
      retrieveMerged('', { k: 1, stores: { heading: s, paragraph: s }, apiKey: 'x' }),
    ).rejects.toThrow(RangeError);
    await s.close();
  });

  // mock store: 按 query vector 内容决定返回哪批 hits —— 模拟 heading/paragraph 两批分布
  function makeSplitStore(): VectorStore {
    const all: VectorRecord[] = [
      { id: 'h1', vector: [1, 0, 0], text: 'shared', source: 'a.md', sourceKind: 'daily' },
      { id: 'p1', vector: [0, 1, 0], text: 'shared', source: 'a.md', sourceKind: 'daily' },
      { id: 'h2', vector: [1, 0, 0], text: 'h-only', source: 'a.md', sourceKind: 'daily' },
      { id: 'p2', vector: [0, 1, 0], text: 'p-only', source: 'a.md', sourceKind: 'daily' },
    ];
    return {
      async add() {
        throw new Error('add not used');
      },
      async size() {
        return all.length;
      },
      async close() {
        /* noop */
      },
      async delete() {
        return 0;
      },
      async search(query, k) {
        // query 跟 [1,0,0] 接近 → heading 分布；跟 [0,1,0] 接近 → paragraph 分布
        const dot = query[0]!;
        const hits = all
          .filter((r) => (dot > 0.5 ? r.vector[0]! > 0.5 : r.vector[1]! > 0.5))
          .slice(0, k)
          .map((r) => ({
            record: r,
            score: dot > 0.5 ? 0.1 : 0.05,
          }));
        return hits;
      },
    };
  }

  it('text 相等 + score 不同 → 保留 score 最小那条，deduped 计数对', async () => {
    const s = makeSplitStore();
    // heading retrieve 拿 [1,0,0] → 命中 h1/h2；paragraph retrieve 拿 [0,1,0] → 命中 p1/p2
    // 'shared' 出现在两批，heading score=0.1、paragraph score=0.05 → 保留 p1
    const res = await retrieveMerged('q', {
      k: 5,
      stores: { heading: s, paragraph: s },
      apiKey: 'fake',
      embedFn: async (_req, _apiKey, strategy) => ({
        vectors: [strategy === 'heading' ? [1, 0, 0] : [0, 1, 0]],
        model: 'm',
        dimensions: 3,
        fallbackFlags: [false],
      }),
    });
    expect(res.headingHits).toBe(2);
    expect(res.paragraphHits).toBe(2);
    expect(res.deduped).toBe(1);
    expect(res.hits).toHaveLength(3);
    const sharedHit = res.hits.find((h) => h.record.text === 'shared');
    expect(sharedHit?.record.id).toBe('p1');
    expect(sharedHit?.score).toBe(0.05);
    await s.close();
  });

  it('score 全局排序：跨 strategy 按 score 升序取 topK', async () => {
    const s = makeSplitStore();
    const res = await retrieveMerged('q', {
      k: 2,
      stores: { heading: s, paragraph: s },
      apiKey: 'fake',
      embedFn: async (_req, _apiKey, strategy) => ({
        vectors: [strategy === 'heading' ? [1, 0, 0] : [0, 1, 0]],
        model: 'm',
        dimensions: 3,
        fallbackFlags: [false],
      }),
    });
    expect(res.hits).toHaveLength(2);
    // 合并后 4 条 unique scores: [0.05(p1/shared), 0.05(p2/p-only), 0.1(h1/shared), 0.1(h2/h-only)]
    // 升序 top-2 = [0.05, 0.05]；合并同 score 时按 Map 插入顺序稳定
    expect(res.hits[0]!.score).toBe(0.05);
    expect(res.hits[0]!.record.id).toBe('p1');
    expect(res.hits[1]!.score).toBe(0.05);
    expect(res.hits[1]!.record.id).toBe('p2');
    await s.close();
  });
});
