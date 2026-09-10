/**
 * tests/libs/rag/evaluate-rerank.test.ts
 *
 * Day 19：evaluateRerankRow 归因三分法 + formatRerankReport 输出断言。
 *
 * 纯函数 mock（不发网络）：
 *   pool  = 5 个 hit（模拟 K=20 召回池，前 2 个是向量序 top-2）
 *   final = rerank 回绑后的 top-3（顺序 = rerank 打分序，可与 pool 不同）
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateRerankRow,
  formatRerankReport,
  type EvalQuery,
  type RerankEvalRow,
} from '../../../libs/rag/evaluate.js';
import type { SearchHit } from '../../../libs/rag/store.js';

function hit(text: string, source: string, score: number): SearchHit {
  return {
    record: { id: `${source}#0-1`, vector: [], text, source, sourceKind: 'md' },
    score,
  };
}

const Q_WITH_GT: EvalQuery = {
  id: 'Q1',
  query: 'test query',
  expectedKeywords: ['keyword'],
  groundTruthSources: ['docs/gt.md'],
};

const Q_NO_GT: EvalQuery = {
  id: 'Q2',
  query: 'test query',
  expectedKeywords: ['keyword'],
};

describe('evaluateRerankRow', () => {
  it('GT 在池 + baseline miss + rerank hit → 三字段独立可判（rerank 救回场景）', () => {
    // 池前 3 都不含 GT（baseline miss）；rerank 把 GT 提到 final top-3
    const pool = [
      hit('无关内容 A', 'docs/a.md', 0.5),
      hit('无关内容 B', 'docs/b.md', 0.6),
      hit('无关内容 C', 'docs/c.md', 0.7),
      hit('GT 内容 keyword', 'docs/gt.md', 0.8),
    ];
    const final = [
      hit('GT 内容 keyword', 'docs/gt.md', 0.8),
      hit('无关内容 A', 'docs/a.md', 0.5),
      hit('无关内容 B', 'docs/b.md', 0.6),
    ];
    const row = evaluateRerankRow(Q_WITH_GT, pool, final, 3);
    expect(row.gtInPool).toBe(true);
    expect(row.baselineHit).toBe(false);
    expect(row.rerankHit).toBe(true);
    expect(row.topSources).toEqual(['docs/gt.md', 'docs/a.md', 'docs/b.md']);
  });

  it('GT 不在池 → gtInPool=false（rerank 数学上救不了，miss 算召回账）', () => {
    const pool = [hit('无关内容 A', 'docs/b.md', 0.5), hit('无关内容 B', 'docs/c.md', 0.6)];
    const final = [hit('无关内容 A', 'docs/b.md', 0.5), hit('无关内容 B', 'docs/c.md', 0.6)];
    const row = evaluateRerankRow(Q_WITH_GT, pool, final, 3);
    expect(row.gtInPool).toBe(false);
    expect(row.rerankHit).toBe(false);
  });

  it('GT 在池 + rerank 把它排出 top-3 → gtInPool=true + rerankHit=false（rerank 排错场景）', () => {
    // baseline 时 GT 恰在 top-3；rerank 后 GT 掉出 top-3
    const pool = [
      hit('GT 内容 keyword', 'docs/gt.md', 0.4),
      hit('无关内容 A', 'docs/b.md', 0.5),
      hit('无关内容 B', 'docs/c.md', 0.6),
      hit('无关内容 C', 'docs/d.md', 0.7),
    ];
    const final = [
      hit('无关内容 A', 'docs/b.md', 0.5),
      hit('无关内容 B', 'docs/c.md', 0.6),
      hit('无关内容 C', 'docs/d.md', 0.7),
    ];
    const row = evaluateRerankRow(Q_WITH_GT, pool, final, 3);
    expect(row.gtInPool).toBe(true);
    expect(row.baselineHit).toBe(true);
    expect(row.rerankHit).toBe(false);
  });

  it('query 未设 groundTruthSources → gtInPool=null（不参与归因统计）', () => {
    const pool = [hit('内容 keyword', 'docs/a.md', 0.5)];
    const final = [hit('内容 keyword', 'docs/a.md', 0.5)];
    const row = evaluateRerankRow(Q_NO_GT, pool, final, 3);
    expect(row.gtInPool).toBe(null);
    expect(row.rerankHit).toBe(true);
  });

  it('fallback 场景：final = pool 前 3（向量序）→ baselineHit 与 rerankHit 恒等', () => {
    const pool = [
      hit('GT 内容 keyword', 'docs/gt.md', 0.4),
      hit('无关内容 A', 'docs/b.md', 0.5),
      hit('无关内容 B', 'docs/c.md', 0.6),
      hit('无关内容 C', 'docs/d.md', 0.7),
    ];
    const final = pool.slice(0, 3);
    const row = {
      ...evaluateRerankRow(Q_WITH_GT, pool, final, 3),
      rerankFailed: true,
      elapsedMs: 123,
    };
    expect(row.baselineHit).toBe(row.rerankHit);
    expect(row.gtInPool).toBe(true);
  });
});

describe('formatRerankReport', () => {
  function row(partial: Partial<RerankEvalRow>): RerankEvalRow {
    return {
      queryId: 'Q1',
      query: 'q',
      baselineHit: false,
      rerankHit: false,
      gtInPool: true,
      rerankFailed: false,
      topSources: [],
      elapsedMs: 10,
      ...partial,
    };
  }

  it('归因计数：救回 / 修不动 / 排错 / 召回失败 四分类独立计数', () => {
    const rows = [
      row({ queryId: 'Q1', baselineHit: false, rerankHit: true, gtInPool: true }), // rerank 救回
      row({ queryId: 'Q2', baselineHit: false, rerankHit: false, gtInPool: true }), // 修不动
      row({ queryId: 'Q3', baselineHit: true, rerankHit: false, gtInPool: true }), // 排错
      row({ queryId: 'Q4', baselineHit: false, rerankHit: false, gtInPool: false }), // 召回失败
      row({ queryId: 'Q5', baselineHit: true, rerankHit: true, gtInPool: true }), // 两边都中
    ];
    const out = formatRerankReport(rows);
    expect(out).toContain('rerank 救回 1');
    expect(out).toContain('rerank 修不动 1');
    expect(out).toContain('rerank 排错 1');
    expect(out).toContain('召回失败（不在池） 1');
    expect(out).toContain('**baseline**: 2/5 → **rerank**: 2/5 (Δ');
  });

  it('rerankFailed 行标 (fallback) + 服务失败计数', () => {
    const out = formatRerankReport([
      row({ baselineHit: true, rerankHit: true, gtInPool: true, rerankFailed: true }),
    ]);
    expect(out).toContain('(fallback)');
    expect(out).toContain('rerank 服务失败 1');
  });

  it('gtInPool=null 显示 "-" 且不计入任何归因桶', () => {
    const out = formatRerankReport([row({ gtInPool: null })]);
    expect(out).toContain('| - | （未设 GT） |');
  });
});
