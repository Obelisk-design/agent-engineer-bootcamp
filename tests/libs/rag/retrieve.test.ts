import { describe, expect, it } from 'vitest';
import { memoryStore } from '../../../libs/rag/store.js';
import { retrieve } from '../../../libs/rag/retrieve.js';

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
