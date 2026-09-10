/**
 * libs/rag/evaluate.ts
 *
 * 5 条 fixed query × 2 种 chunk 策略 = 10 次 retrieve 自动跑分。
 *
 * 评估口径：
 *   hit = top-K hits 里有任一 chunk **文本内 expectedKeywords 全中**（默认 K=3, expectedKeywords 全量 AND）
 *
 * 输出：
 *   - 控制台打印 Markdown 表（heading vs paragraph 命中率 + 平均 elapsedMs）
 *   - 返回 EvaluateReport（便于 example 进一步处理）
 *
 * 5 条 query 选型（决策 B）：
 *   Q1 关键词型    "4闸必跑是哪4 个"
 *   Q2  问句型      "为什么不引 ml 库"
 *   Q3  跨文档型    "tool 参数契约的事实源是什么"
 *   Q4  表格型      "zod union 怎么写"
 *   Q5  ADR 型      "Agent.runEvents messages 边界"
 *
 * Why 这些 query 覆盖 4 类典型场景：
 *   - 关键词型：high-density term，应被多种 chunk 命中
 *   - 问句型：句式相似（vs 词项）要求语义级匹配
 *   - 跨文档型：期望分布在多文件，靠 chunk 粒度决定是否漏
 *   - 表格型：表格可能被 paragraph 切碎
 *   - ADR 型：结构化短文档，命中容易
 *
 * 不做：
 *   - LLM-judge 评估（路线表 Day 16-17 才上；今天只用关键词命中）
 *   - 不动 ex 脚本里改 query（保持固定，便于回归对比）
 */

import type { SearchHit } from './store.js';
import type { ChunkStrategy } from './retrieve.js';

export interface EvalQuery {
  readonly id: string;
  readonly query: string;
  readonly expectedKeywords: readonly string[];
  /** "all"（默认，全中）| "any"（任一中）—— Q3 跨文档型用 any 更合理 */
  readonly matchMode?: 'all' | 'any';
  /** "main"（daily+adr）| "test"（test-corpus）—— 默认 main */
  readonly corpus?: 'main' | 'test';
  /**
   * 白盒 ground truth source 列表（Day 17 新增）。
   * 设置后 judgeHit 走 v2 逻辑：top-K 内任一 chunk 的 source 在此列表中 = hit。
   * 不设置 → 走 v1 关键词逻辑（向后兼容）。
   *
   * Why：Day 17 诊断发现 lancedb + qwen3-embed 在小语料下"主题杂糅长文档"
   * （如 day14.md 涵盖 RAG UI / 路由 / 4 闸必跑）抢占 top-3，
   * 关键词命中会被大文档误中。groundTruthSources 把"语义检索"与"文档定位"分开评估。
   */
  readonly groundTruthSources?: readonly string[];
}

export const DEFAULT_EVAL_QUERIES: readonly EvalQuery[] = [
  // ====== v2 baseline（Day 17 起取代 v1）======
  // v1 保留为 EVAL_QUERIES_V1（export 在下方），新调用方用 DEFAULT_EVAL_QUERIES。
  // v2 关键变化：
  //  - 加 groundTruthSources 白盒文档约束（防 day14.md 这种"主题杂糅长文档"误中）
  //  - 加 2 条新 query（Q8/Q9 覆盖 day12 / day13 内容）
  //  - v2 query 改问法（Q2 改"PCA 是什么"语义对齐更好）
  {
    id: 'Q1',
    query: '4 闸必跑是哪 4 个',
    expectedKeywords: ['vitest', 'typecheck'],
    matchMode: 'any',
    groundTruthSources: ['docs/daily/day12.md', 'docs/daily/day14.md'],
  },
  {
    id: 'Q2',
    query: 'PCA 是什么',
    expectedKeywords: ['PCA', '手写'],
    matchMode: 'any',
    groundTruthSources: ['docs/daily/day12.md'],
  },
  {
    id: 'Q3',
    query: 'tool 参数事实源',
    expectedKeywords: ['zod', 'schema'],
    matchMode: 'any',
    groundTruthSources: ['docs/adr/0003-tool-params-single-source-of-truth-zod.md'],
  },
  {
    id: 'Q4',
    query: 'zod union 怎么写',
    expectedKeywords: ['z.union'],
    groundTruthSources: ['docs/adr/0003-tool-params-single-source-of-truth-zod.md'],
  },
  {
    id: 'Q5',
    query: 'runEvents 边界',
    expectedKeywords: ['runEvents', 'caller'],
    matchMode: 'any',
    groundTruthSources: [
      'docs/adr/0002-run-events-accepts-messages-caller-injects-system-prompt.md',
    ],
  },
  // Day 17 新增：覆盖 day12 (PCA) + day13 (RAG indexer) 内容
  {
    id: 'Q8',
    query: 'cosine 怎么算',
    expectedKeywords: ['cosine', 'dot'],
    matchMode: 'any',
    groundTruthSources: ['docs/daily/day12.md'],
  },
  {
    id: 'Q9',
    query: 'lancedb 增量入库',
    expectedKeywords: ['incrementalIndex', 'lancedb'],
    matchMode: 'any',
    groundTruthSources: ['docs/daily/day13.md'],
  },
  {
    id: 'Q6',
    query: '紫光云是什么',
    expectedKeywords: ['紫光云'],
    corpus: 'test',
    groundTruthSources: ['docs/test-corpus/紫光云.md'],
  },
  {
    id: 'Q7',
    query: '阿里云是什么',
    expectedKeywords: ['阿里云'],
    corpus: 'test',
    groundTruthSources: ['docs/test-corpus/aliyun.md'],
  },
];

/**
 * v1 baseline（Day 13-Day 16 用过），Day 17 起被 DEFAULT_EVAL_QUERIES (v2) 取代。
 * 保留 export 便于 ex_002_eval_v2.ts 双跑对比。
 */
export const EVAL_QUERIES_V1: readonly EvalQuery[] = [
  {
    id: 'Q1',
    query: '4闸必跑是哪4 个',
    // any 模式：4 个 keyword 任一命中即算（paragraph 切把"4闸必跑"和"vitest/typecheck"散到不同 chunk）
    expectedKeywords: ['vitest', 'typecheck', 'lint', 'typecheck:web'],
    matchMode: 'any',
  },
  {
    id: 'Q2',
    query: '为什么不引 ml 库',
    expectedKeywords: ['PCA', 'power iteration'],
    matchMode: 'any',
  },
  {
    id: 'Q3',
    query: 'tool 参数契约的事实源是什么',
    expectedKeywords: ['zod'],
    matchMode: 'any',
  },
  {
    id: 'Q4',
    query: 'zod union 怎么写',
    expectedKeywords: ['z.union'],
  },
  {
    id: 'Q5',
    query: 'Agent.runEvents messages 边界',
    expectedKeywords: ['runEvents'],
  },
  {
    id: 'Q6',
    query: '紫光云是什么',
    expectedKeywords: ['紫光云'],
    corpus: 'test',
  },
  {
    id: 'Q7',
    query: '阿里云是什么',
    expectedKeywords: ['阿里云'],
    corpus: 'test',
  },
];

/**
 * 判断一个 hits 列表是否"命中"某条 query。
 *
 * 判定逻辑（v2，Day 17 增 groundTruthSources 支持）：
 *   - query.groundTruthSources 不存在 → 走 v1 关键词逻辑（向后兼容）
 *   - query.groundTruthSources 存在 → 走 v2 双判：
 *       1) top-K 内任一 chunk 的 source 在 groundTruthSources → 算"文档命中"（v2 win）
 *       2) top-K 内任一 chunk 文本含 expectedKeywords（按 matchMode）→ 算"语义命中"（v2 win）
 *       两条任一中 → 算 hit
 *
 * Why 双判：Day 17 诊断发现关键词命中会被"主题杂糅长文档"误中，
 * groundTruthSources 是"该 query 应该命中哪几个文档"的白盒约束。
 */
export function judgeHit(query: EvalQuery, hits: readonly SearchHit[], k = 3): boolean {
  const top = hits.slice(0, k);
  if (top.length === 0) return false;

  // v2 路径：groundTruthSources 存在时双判
  if (query.groundTruthSources !== undefined && query.groundTruthSources.length > 0) {
    const docHit = top.some((h) => query.groundTruthSources!.includes(h.record.source));
    const kwHit = judgeByKeywords(query, top);
    return docHit || kwHit;
  }

  // v1 路径：纯关键词
  return judgeByKeywords(query, top);
}

function judgeByKeywords(query: EvalQuery, top: readonly SearchHit[]): boolean {
  const mode = query.matchMode ?? 'all';
  if (mode === 'any') {
    return top.some((h) => query.expectedKeywords.some((kw) => h.record.text.includes(kw)));
  }
  return top.some((h) => query.expectedKeywords.every((kw) => h.record.text.includes(kw)));
}

export interface EvalRow {
  readonly queryId: string;
  readonly chunkStrategy: ChunkStrategy;
  readonly hit: boolean;
  readonly elapsedMs: number;
  readonly topSources: readonly string[];
}

export interface EvaluateReport {
  readonly rows: readonly EvalRow[];
  /** "heading" | "paragraph" 各自的命中数 / 总数 */
  readonly summary: Readonly<
    Record<ChunkStrategy, { hit: number; total: number; avgElapsedMs: number }>
  >;
}

export function buildReport(rows: readonly EvalRow[]): EvaluateReport {
  const summary: Record<ChunkStrategy, { hit: number; total: number; avgElapsedMs: number }> = {
    heading: { hit: 0, total: 0, avgElapsedMs: 0 },
    paragraph: { hit: 0, total: 0, avgElapsedMs: 0 },
  };
  for (const r of rows) {
    const s = summary[r.chunkStrategy];
    summary[r.chunkStrategy] = {
      hit: s.hit + (r.hit ? 1 : 0),
      total: s.total + 1,
      avgElapsedMs: s.avgElapsedMs + r.elapsedMs,
    };
  }
  for (const k of ['heading', 'paragraph'] as const) {
    const s = summary[k];
    summary[k] = { ...s, avgElapsedMs: s.total > 0 ? s.avgElapsedMs / s.total : 0 };
  }
  return { rows, summary };
}

/**
 * Day 19 — two-stage retrieval（召回宽 K=20 → rerank 精排 top_n=3）评估。
 *
 * 归因三分法（per query，见 spec 2026-09-10-day19-rerank-eval-design.md）：
 *   - gtInPool=true  + baseline miss + rerank hit → rerank 的功劳（排序失败被修）
 *   - gtInPool=true  + rerank 也 miss              → rerank 修不动（留线索）
 *   - gtInPool=false                               → 召回失败，rerank 数学上救不了
 *
 * 设计约束：
 *   - 纯函数（poolHits / finalHits 都是输入）→ mock 单测可覆盖，不发网络
 *   - finalHits 是 rerank 回绑后的 top-3；rerank 服务挂了时 caller 传向量序 top-3 fallback
 *     （不伪造 rerank score，rerankFailed 由 caller 标记）
 *   - query.groundTruthSources 未设 → gtInPool = null（该 query 不参与归因统计）
 */
export interface RerankEvalRow {
  readonly queryId: string;
  readonly query: string;
  /** 对照臂：向量 top-3 是否命中 */
  readonly baselineHit: boolean;
  /** 实验臂：rerank top-3（或 fallback）是否命中 */
  readonly rerankHit: boolean;
  /** GT source 是否在 top-20 召回池内；query 未设 groundTruthSources → null */
  readonly gtInPool: boolean | null;
  /** rerank 服务失败走了 fallback（结果按向量序算） */
  readonly rerankFailed: boolean;
  /** 实验臂 top-3 的 source（调试用） */
  readonly topSources: readonly string[];
  readonly elapsedMs: number;
}

export function evaluateRerankRow(
  query: EvalQuery,
  poolHits: readonly SearchHit[],
  finalHits: readonly SearchHit[],
  k = 3,
): Omit<RerankEvalRow, 'rerankFailed' | 'elapsedMs'> {
  return {
    queryId: query.id,
    query: query.query,
    baselineHit: judgeHit(query, poolHits, k),
    rerankHit: judgeHit(query, finalHits, k),
    gtInPool:
      query.groundTruthSources !== undefined && query.groundTruthSources.length > 0
        ? poolHits.some((h) => query.groundTruthSources!.includes(h.record.source))
        : null,
    topSources: finalHits.map((h) => h.record.source),
  };
}

export function formatRerankReport(rows: readonly RerankEvalRow[]): string {
  const lines: string[] = [];
  lines.push('| Query | baseline (向量 top-3) | rerank (top-20→3) | GT in pool | 归因 |');
  lines.push('| --- | --- | --- | --- | --- |');

  let baselineTotal = 0;
  let rerankTotal = 0;
  let rerankWins = 0; // 在池 + baseline miss + rerank hit
  let rerankFixes = 0; // 在池 + 两边都 miss（rerank 修不动）
  let rerankBreaks = 0; // 在池 + baseline hit + rerank miss（rerank 排错，负贡献）
  let recallMisses = 0; // 不在池（rerank 救不了）
  let failedCount = 0;

  for (const r of rows) {
    const poolMark = r.gtInPool === null ? '-' : r.gtInPool ? '✓' : '✗ 召回失败';
    let attribution: string;
    if (r.gtInPool === null) {
      attribution = '（未设 GT）';
    } else if (!r.gtInPool) {
      attribution = '召回失败';
      recallMisses++;
    } else if (!r.baselineHit && r.rerankHit) {
      attribution = '✅ rerank 救回';
      rerankWins++;
    } else if (!r.rerankHit) {
      attribution = r.baselineHit ? '⚠️ rerank 排错（负贡献）' : 'rerank 修不动';
      if (r.baselineHit) rerankBreaks++;
      else rerankFixes++;
    } else {
      attribution = '两边都中';
    }
    if (r.rerankFailed) failedCount++;
    baselineTotal += r.baselineHit ? 1 : 0;
    rerankTotal += r.rerankHit ? 1 : 0;
    lines.push(
      `| ${r.queryId} ${r.query} | ${r.baselineHit ? '✅' : '❌'} | ${r.rerankHit ? '✅' : '❌'}${r.rerankFailed ? ' (fallback)' : ''} | ${poolMark} | ${attribution} |`,
    );
  }
  const n = rows.length;
  lines.push('');
  lines.push(
    `**baseline**: ${baselineTotal}/${n} → **rerank**: ${rerankTotal}/${n} (Δ ${rerankTotal - baselineTotal >= 0 ? '+' : ''}${rerankTotal - baselineTotal})`,
  );
  lines.push(
    `归因：rerank 救回 ${rerankWins} · rerank 修不动 ${rerankFixes} · rerank 排错 ${rerankBreaks} · 召回失败（不在池） ${recallMisses} · rerank 服务失败 ${failedCount}`,
  );
  return lines.join('\n');
}

export function formatReport(report: EvaluateReport): string {
  const lines: string[] = [];
  lines.push('| Query | heading | paragraph |');
  lines.push('| --- | --- | --- |');
  const byQ = new Map<string, { heading?: EvalRow; paragraph?: EvalRow }>();
  for (const r of report.rows) {
    const m = byQ.get(r.queryId) ?? {};
    byQ.set(r.queryId, { ...m, [r.chunkStrategy]: r });
  }
  for (const [qid, m] of byQ) {
    const h = m.heading;
    const p = m.paragraph;
    lines.push(
      `| ${qid} | ${h ? (h.hit ? `✅ ${h.elapsedMs}ms` : `❌ ${h.elapsedMs}ms`) : '-'} | ${p ? (p.hit ? `✅ ${p.elapsedMs}ms` : `❌ ${p.elapsedMs}ms`) : '-'} |`,
    );
  }
  lines.push('');
  lines.push(
    `**heading**: ${report.summary.heading.hit}/${report.summary.heading.total} (avg ${report.summary.heading.avgElapsedMs.toFixed(0)}ms)`,
  );
  lines.push(
    `**paragraph**: ${report.summary.paragraph.hit}/${report.summary.paragraph.total} (avg ${report.summary.paragraph.avgElapsedMs.toFixed(0)}ms)`,
  );
  return lines.join('\n');
}
