import { describe, expect, it } from 'vitest';
import { memoryStore, type VectorRecord } from '../../../libs/rag/store.js';

function rec(id: string, vec: readonly number[]): VectorRecord {
  return {
    id,
    vector: vec,
    text: `text-${id}`,
    source: `s-${id}`,
    sourceKind: 'daily',
  };
}

describe('memoryStore', () => {
  it('空库 search 返回 []', async () => {
    const s = memoryStore();
    expect(await s.search([0.1, 0.2, 0.3], 3)).toHaveLength(0);
    await s.close();
  });

  it('入库 1 条 → search 同向量 → 命中 score ≈ 0', async () => {
    const s = memoryStore();
    const v = [0.5, 0.5, 0.5];
    await s.add([rec('a', v)]);
    const hits = await s.search(v, 3);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.record.id).toBe('a');
    expect(hits[0]!.score).toBeLessThan(1e-9);
    await s.close();
  });

  it('入库 2 条不同向量 → top-1 是最近的', async () => {
    const s = memoryStore();
    await s.add([rec('near', [1, 0, 0]), rec('far', [0, 1, 0])]);
    const hits = await s.search([1, 0.01, 0], 1);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.record.id).toBe('near');
    await s.close();
  });

  it('K > size → 只返回 size 条', async () => {
    const s = memoryStore();
    await s.add([rec('a', [1, 0])]);
    const hits = await s.search([1, 0], 5);
    expect(hits).toHaveLength(1);
    await s.close();
  });

  it('query dim mismatch 抛 RangeError', async () => {
    const s = memoryStore();
    await s.add([rec('a', [1, 0, 0])]);
    await expect(s.search([1, 0], 3)).rejects.toThrow(RangeError);
    await s.close();
  });
});
