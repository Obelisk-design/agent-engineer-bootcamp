/**
 * tests/libs/rag/evaluate.test.ts
 *
 * Day 17:覆盖 judgeHit v1 关键词逻辑 + v2 groundTruthSources 双判逻辑。
 *
 * v1 (Day 13-16):纯关键词 any/all 模式
 * v2 (Day 17):groundTruthSources 存在时走双判（关键词 OR 文档命中）
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EVAL_QUERIES,
  EVAL_QUERIES_V1,
  judgeHit,
  type EvalQuery,
} from '../../../libs/rag/evaluate.js';
import type { SearchHit, VectorRecord } from '../../../libs/rag/store.js';

function makeHit(source: string, text: string, score = 0.5): SearchHit {
  const record: VectorRecord = {
    id: `${source}#0`,
    vector: [1, 0],
    text,
    source,
    sourceKind: 'daily',
  };
  return { record, score };
}

describe('judgeHit v1（关键词模式，向后兼容）', () => {
  it('all 模式（默认）：top-3 内任一 chunk 含全部 keywords → hit', () => {
    const q: EvalQuery = {
      id: 'Q',
      query: 'foo',
      expectedKeywords: ['alpha', 'beta'],
    };
    const hits = [makeHit('a.md', 'alpha and beta'), makeHit('b.md', 'unrelated')];
    expect(judgeHit(q, hits)).toBe(true);
  });

  it('all 模式：top-3 内没有任何 chunk 含全部 keywords → miss', () => {
    const q: EvalQuery = {
      id: 'Q',
      query: 'foo',
      expectedKeywords: ['alpha', 'beta'],
    };
    const hits = [makeHit('a.md', 'only alpha'), makeHit('b.md', 'only beta')];
    expect(judgeHit(q, hits)).toBe(false);
  });

  it('any 模式：top-3 内任一 chunk 含任一 keyword → hit', () => {
    const q: EvalQuery = {
      id: 'Q',
      query: 'foo',
      expectedKeywords: ['alpha', 'beta'],
      matchMode: 'any',
    };
    const hits = [makeHit('a.md', 'only alpha')];
    expect(judgeHit(q, hits)).toBe(true);
  });

  it('空 hits → false', () => {
    const q: EvalQuery = { id: 'Q', query: 'foo', expectedKeywords: ['alpha'] };
    expect(judgeHit(q, [])).toBe(false);
  });

  it('only judge top-K=3：第 4 个 hit 命中但前 3 没命中 → false', () => {
    const q: EvalQuery = { id: 'Q', query: 'foo', expectedKeywords: ['alpha'] };
    const hits = [
      makeHit('a.md', 'no'),
      makeHit('b.md', 'no'),
      makeHit('c.md', 'no'),
      makeHit('d.md', 'alpha here'),
    ];
    expect(judgeHit(q, hits, 3)).toBe(false);
  });
});

describe('judgeHit v2（groundTruthSources 双判，Day 17 增）', () => {
  it('groundTruthSources 命中 + 关键词不命中 → hit（双判 OR 逻辑）', () => {
    const q: EvalQuery = {
      id: 'Q',
      query: 'foo',
      expectedKeywords: ['zzz'],
      matchMode: 'all',
      groundTruthSources: ['docs/daily/day12.md'],
    };
    const hits = [makeHit('docs/daily/day14.md', 'no zzz here')];
    expect(judgeHit(q, hits)).toBe(true);
  });

  it('groundTruthSources 不命中 + 关键词命中 → hit（双判 OR 逻辑）', () => {
    const q: EvalQuery = {
      id: 'Q',
      query: 'foo',
      expectedKeywords: ['alpha'],
      matchMode: 'all',
      groundTruthSources: ['docs/daily/day12.md'],
    };
    const hits = [makeHit('docs/daily/day14.md', 'alpha here')];
    expect(judgeHit(q, hits)).toBe(true);
  });

  it('groundTruthSources 不命中 + 关键词不命中 → miss', () => {
    const q: EvalQuery = {
      id: 'Q',
      query: 'foo',
      expectedKeywords: ['xyz123_marker_unlikely_to_appear'],
      matchMode: 'all',
      groundTruthSources: ['docs/daily/day12.md'],
    };
    const hits = [makeHit('docs/daily/day14.md', 'no marker here at all')];
    expect(judgeHit(q, hits)).toBe(false);
  });

  it('groundTruthSources 多个 source，任一命中即 hit', () => {
    const q: EvalQuery = {
      id: 'Q',
      query: 'foo',
      expectedKeywords: ['zzz'],
      matchMode: 'all',
      groundTruthSources: ['docs/daily/day12.md', 'docs/daily/day14.md'],
    };
    const hits = [makeHit('docs/daily/day14.md', 'no zzz')];
    expect(judgeHit(q, hits)).toBe(true);
  });

  it('groundTruthSources 为空数组 → 走 v1 关键词逻辑（不为空时走 v2）', () => {
    const q: EvalQuery = {
      id: 'Q',
      query: 'foo',
      expectedKeywords: ['alpha'],
      matchMode: 'all',
      groundTruthSources: [],
    };
    const hits = [makeHit('a.md', 'alpha here')];
    // v1 路径命中
    expect(judgeHit(q, hits)).toBe(true);
  });
});

describe('DEFAULT_EVAL_QUERIES v2 数据契约', () => {
  it('至少 7 条 query', () => {
    expect(DEFAULT_EVAL_QUERIES.length).toBeGreaterThanOrEqual(7);
  });

  it('所有 query id 唯一', () => {
    const ids = new Set(DEFAULT_EVAL_QUERIES.map((q) => q.id));
    expect(ids.size).toBe(DEFAULT_EVAL_QUERIES.length);
  });

  it('每条 query 都有非空 id / query / keywords', () => {
    for (const q of DEFAULT_EVAL_QUERIES) {
      expect(q.id.length).toBeGreaterThan(0);
      expect(q.query.length).toBeGreaterThan(0);
      expect(q.expectedKeywords.length).toBeGreaterThan(0);
    }
  });

  it('v2 的 query 都带 groundTruthSources', () => {
    for (const q of DEFAULT_EVAL_QUERIES) {
      expect(q.groundTruthSources, `query ${q.id} 缺 groundTruthSources`).toBeDefined();
      expect(q.groundTruthSources?.length, `query ${q.id} groundTruthSources 为空`).toBeGreaterThan(
        0,
      );
    }
  });
});

describe('EVAL_QUERIES_V1 备份数据', () => {
  it('v1 保留 7 条 query（Q1-Q7）', () => {
    expect(EVAL_QUERIES_V1.length).toBe(7);
  });

  it('v1 query 不带 groundTruthSources（向 v1 路径兼容）', () => {
    for (const q of EVAL_QUERIES_V1) {
      expect(q.groundTruthSources).toBeUndefined();
    }
  });
});
