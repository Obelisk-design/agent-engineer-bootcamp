/**
 * libs/eval/run-retrieval-eval.ts
 *
 * Day 22 — 端到端检索/答案评测（spec §1.2 第 1 条 + §6.2）。
 *
 * 评测什么：
 *   - per-query: recall@k（GT chunk_id 在不在 top-k 池）+ rerank-hit + judge-score
 *   - 整体聚合: recall@5 / recall@10 / recall@20 / rerank-hit / judge-avg
 *   - 三维度分类 breakdown（spec §5）：query type / domain / difficulty 各自的分数
 *   - 归因 5 桶：救回 / 修不动 / 排错 / 召回失败 / 服务失败（Day 19 沿用）
 *
 * 编排（spec §6.2）：
 *   for each query in GT:
 *     1. retrieve(K=POOL_K)        → pool
 *     2. rerank(top_n=FINAL_K)     → final（fallback: rerank 挂走向量序）
 *     3. judgeLLM(answer vs gt)    → score（fallback: judge 挂记 judgeFailed）
 *     4. compute recall@k, EM
 *     5. tag with 3-dim labels
 *
 * Why 独立编排（不依赖 libs/rag evaluate.ts）：
 *   - libs/rag evaluate.ts 是关键词命中 + heading/paragraph 双策略对比
 *   - Day 22 eval 是 GT chunk_id 命中 + recall@k + LLM Judge + 三维度分类
 *   - 两条线不冲突；本文件独立演进
 *
 * 不做：
 *   - 不实现 LLM Judge（独立文件 judge-llm.ts）
 *   - 不做报告格式化（独立文件 format-report.ts）
 *   - 不做跨日 diff（Day 41+ 话题）
 */

import { retrieve, type ChunkStrategy } from '../rag/retrieve.js';
import type { SearchHit } from '../rag/store.js';
import { rerank } from '../reranker/rerank.js';
import type { LoadedQuery } from './gt-loader.js';
import type { QueryLabels } from './schema.js';

export interface RetrievalEvalRow {
  readonly queryId: string;
  readonly query: string;
  readonly queryLabels: QueryLabels;
  readonly expectedChunkIds: readonly string[];
  /** recall@5 / @10 / @20（pool K=20 时等同 in-pool） */
  readonly recallAt5: boolean;
  readonly recallAt10: boolean;
  readonly recallAt20: boolean;
  /** GT chunk_id 是否在最终 top-3（rerank 后） */
  readonly finalHit: boolean;
  readonly rerankFailed: boolean;
  readonly judgeFailed: boolean;
  readonly judgeScore: number | null;
  readonly finalSources: readonly string[];
  readonly elapsedMs: number;
}

export interface RetrievalEvalReport {
  readonly runId: string;
  readonly timestamp: string;
  readonly poolK: number;
  readonly finalK: number;
  readonly rows: readonly RetrievalEvalRow[];
  readonly aggregate: {
    readonly total: number;
    readonly skippedStale: number;
    readonly recallAt5: number;
    readonly recallAt10: number;
    readonly recallAt20: number;
    readonly finalHitRate: number;
    readonly judgeAvg: number;
    readonly rerankFailedCount: number;
    readonly judgeFailedCount: number;
  };
  readonly byDimension: Readonly<
    Record<
      'type' | 'domain' | 'difficulty',
      Readonly<Record<string, { total: number; finalHit: number; recallAt20: number }>>
    >
  >;
}

export interface RunRetrievalOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly embedModel: string;
  readonly rerankModel: string;
  readonly poolK?: number; // 默认 20
  readonly finalK?: number; // 默认 3
  readonly chunkStrategy?: ChunkStrategy; // 默认 'heading'
  readonly store: VectorStore;
  /** 单 query judge 评分的回调（避免在本文件 import judge-llm 形成循环） */
  readonly judge?: (
    query: string,
    answer: string,
    expectedAnswer: string,
    apiKey: string,
    baseUrl: string,
    model: string,
  ) => Promise<{ score: number; failed: boolean }>;
}

export async function runRetrievalEval(
  queries: readonly LoadedQuery[],
  opts: RunRetrievalOptions,
): Promise<RetrievalEvalReport> {
  const poolK = opts.poolK ?? 20;
  const finalK = opts.finalK ?? 3;
  const chunkStrategy = opts.chunkStrategy ?? 'heading';

  const rows: RetrievalEvalRow[] = [];
  let skippedStale = 0;

  for (const q of queries) {
    if (q.runtime.gtStale) {
      skippedStale++;
      continue;
    }

    const t0 = Date.now();
    const expectedSet = new Set(q.expectedChunkIds);

    // 1. retrieve(K=poolK)
    const poolResult = await retrieve(q.query, {
      k: poolK,
      chunkStrategy,
      store: opts.store,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.embedModel,
    });

    // 2. rerank(top_n=finalK) + fallback
    const rr = await rerank(
      {
        query: q.query,
        documents: poolResult.hits.map((h) => h.record.text),
        topN: finalK,
        model: opts.rerankModel,
        baseUrl: opts.baseUrl,
      },
      opts.apiKey,
    );

    let finalHits: readonly SearchHit[];
    let rerankFailed = false;
    if (rr === null) {
      finalHits = poolResult.hits.slice(0, finalK);
      rerankFailed = true;
    } else {
      finalHits = rr.hits.map((rh) => poolResult.hits[rh.index]!);
    }

    // 3. recall@k
    const poolIds = poolResult.hits.map((h) => h.record.id);
    const recallAt5 = poolIds.slice(0, 5).some((id) => expectedSet.has(id));
    const recallAt10 = poolIds.slice(0, 10).some((id) => expectedSet.has(id));
    const recallAt20 = poolIds.slice(0, 20).some((id) => expectedSet.has(id));
    const finalHit = finalHits.some((h) => expectedSet.has(h.record.id));

    // 4. judge（caller 提供回调；未提供 → score=null）
    let judgeScore: number | null = null;
    let judgeFailed = false;
    if (opts.judge !== undefined) {
      const answer = finalHits.map((h) => h.record.text).join('\n---\n');
      try {
        // dev 网关聊天模型 = ai-coding（与 ex_001 GT 生成同源）
        const judgeModel = process.env.MODEL_NAME ?? 'ai-coding';
        const v = await opts.judge(
          q.query,
          answer,
          q.expectedAnswer,
          opts.apiKey,
          opts.baseUrl,
          judgeModel,
        );
        judgeScore = v.score;
        judgeFailed = v.failed;
      } catch {
        judgeFailed = true;
      }
    }

    rows.push({
      queryId: q.id,
      query: q.query,
      queryLabels: q.queryLabels,
      expectedChunkIds: q.expectedChunkIds,
      recallAt5,
      recallAt10,
      recallAt20,
      finalHit,
      rerankFailed,
      judgeFailed,
      judgeScore,
      finalSources: finalHits.map((h) => h.record.source),
      elapsedMs: Date.now() - t0,
    });
  }

  // 聚合
  const total = rows.length;
  const sum5 = rows.filter((r) => r.recallAt5).length;
  const sum10 = rows.filter((r) => r.recallAt10).length;
  const sum20 = rows.filter((r) => r.recallAt20).length;
  const sumFinal = rows.filter((r) => r.finalHit).length;
  const judgeScores = rows.filter((r) => r.judgeScore !== null).map((r) => r.judgeScore!);
  const judgeAvg =
    judgeScores.length > 0 ? judgeScores.reduce((s, x) => s + x, 0) / judgeScores.length : 0;

  // 三维度 breakdown
  const byDimension: Record<
    'type' | 'domain' | 'difficulty',
    Record<string, { total: number; finalHit: number; recallAt20: number }>
  > = {
    type: {},
    domain: {},
    difficulty: {},
  };
  for (const r of rows) {
    const t = byDimension.type[r.queryLabels.type] ?? { total: 0, finalHit: 0, recallAt20: 0 };
    t.total++;
    if (r.finalHit) t.finalHit++;
    if (r.recallAt20) t.recallAt20++;
    byDimension.type[r.queryLabels.type] = t;

    const d = byDimension.domain[r.queryLabels.domain] ?? { total: 0, finalHit: 0, recallAt20: 0 };
    d.total++;
    if (r.finalHit) d.finalHit++;
    if (r.recallAt20) d.recallAt20++;
    byDimension.domain[r.queryLabels.domain] = d;

    const df = byDimension.difficulty[r.queryLabels.difficulty] ?? {
      total: 0,
      finalHit: 0,
      recallAt20: 0,
    };
    df.total++;
    if (r.finalHit) df.finalHit++;
    if (r.recallAt20) df.recallAt20++;
    byDimension.difficulty[r.queryLabels.difficulty] = df;
  }

  return {
    runId: `run-${Date.now()}`,
    timestamp: new Date().toISOString(),
    poolK,
    finalK,
    rows,
    aggregate: {
      total,
      skippedStale,
      recallAt5: total > 0 ? sum5 / total : 0,
      recallAt10: total > 0 ? sum10 / total : 0,
      recallAt20: total > 0 ? sum20 / total : 0,
      finalHitRate: total > 0 ? sumFinal / total : 0,
      judgeAvg,
      rerankFailedCount: rows.filter((r) => r.rerankFailed).length,
      judgeFailedCount: rows.filter((r) => r.judgeFailed).length,
    },
    byDimension,
  };
}
