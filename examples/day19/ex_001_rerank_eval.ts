/**
 * examples/day19/ex_001_rerank_eval.ts
 *
 * Day 19 真活：two-stage retrieval 评估闭环。
 *
 * 编排（本脚本 = 编排层，libs/rag 不依赖 libs/reranker）：
 *   对照组：retrieve(heading, k=3) 的 top-3 → judgeHit
 *   实验组：retrieve(heading, k=20) 召回池 → rerank(top_n=3) → index 回绑 → judgeHit
 *   诊断位：GT source 在不在 top-20 池内（gtInPool）
 *
 * 失败语义：rerank 服务返 null → 该 query 走向量序 top-3 fallback + rerankFailed=true
 *           （不伪造 rerank score，judgeHit 仍按文本判定）
 *
 * 跑法：npx tsx examples/day19/ex_001_rerank_eval.ts
 * 准备：.env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME / RERANKER_MODEL_NAME
 * 前置：Day 18 force reindex 已跑过（chunks_heading 用新切法）
 *
 * 判定线（写进 day19.md）：
 *   - rerank ≥ 8/9 → Day 18 spec 预期兑现
 *   - 6-7/9        → 部分兑现，看归因表（修不动 / 召回失败 各占多少）
 *   - ≤ 5/9        → rerank 无效，结论写 memory
 *
 * 不做（YAGNI）：
 *   - 不加"top-20 直接取前 3 不 rerank"第三臂（池变宽的功劳隔离 → Day 31+ 评估体系）
 *   - 不动 /search API（网页两阶段流程保持 retrieve + 前端调 /rerank 现状）
 */

import 'dotenv/config';
import {
  DEFAULT_EVAL_QUERIES,
  evaluateRerankRow,
  formatRerankReport,
  openVectorStore,
  retrieve,
  type EvalQuery,
  type RerankEvalRow,
  type SearchHit,
} from '../../libs/rag/index.js';
import { rerank } from '../../libs/reranker/rerank.js';

const POOL_K = 20; // 召回池宽度（老大拍板）
const FINAL_K = 3; // 精排后取 top-3（与对照组同口径，judgeHit 只看前 3）

async function runRerankEval(
  queries: readonly EvalQuery[],
  apiKey: string,
  baseUrl: string,
  embedModel: string,
  rerankerModel: string,
): Promise<RerankEvalRow[]> {
  const headingStore = await openVectorStore('.lancedb/rag', 'chunks_heading');
  const testHeadingStore = await openVectorStore('.lancedb/rag', 'chunks_test_heading');
  const rows: RerankEvalRow[] = [];

  try {
    for (const q of queries) {
      const store = q.corpus === 'test' ? testHeadingStore : headingStore;
      const t0 = Date.now();

      // 1. 召回宽：top-20 池（对照组直接取前 3，不再单独跑一次 k=3——池的前 3 就是）
      const pool = await retrieve(q.query, {
        k: POOL_K,
        chunkStrategy: 'heading',
        store,
        apiKey,
        baseUrl,
        model: embedModel,
      });

      // 2. 精排窄：rerank top_n=3；index 回绑池内原 hit（保留 source 元数据）
      const rr = await rerank(
        {
          query: q.query,
          documents: pool.hits.map((h) => h.record.text),
          topN: FINAL_K,
          model: rerankerModel,
          baseUrl,
        },
        apiKey,
      );

      let finalHits: readonly SearchHit[];
      let rerankFailed: boolean;
      if (rr === null) {
        // fallback：rerank 挂了不破流程，按向量序取 top-3（judgeHit 按文本判定，不伪造 score）
        finalHits = pool.hits.slice(0, FINAL_K);
        rerankFailed = true;
      } else {
        finalHits = rr.hits.map((rh) => pool.hits[rh.index]!);
        rerankFailed = false;
      }

      const row = {
        ...evaluateRerankRow(q, pool.hits, finalHits, FINAL_K),
        rerankFailed,
        elapsedMs: Date.now() - t0,
      };
      rows.push(row);
      console.log(
        `  ${q.id} ${q.query} | pool=${pool.hits.length} baseline=${row.baselineHit ? '✅' : '❌'} rerank=${row.rerankHit ? '✅' : '❌'}${rerankFailed ? ' (fallback)' : ''} gtInPool=${row.gtInPool === null ? '-' : row.gtInPool ? '✓' : '✗'} ${row.elapsedMs}ms`,
      );
    }
  } finally {
    await headingStore.close();
    await testHeadingStore.close();
  }

  return rows;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const embedModel = process.env.EMBEDDING_MODEL_NAME;
  const rerankerModel = process.env.RERANKER_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!embedModel) throw new Error('EMBEDDING_MODEL_NAME is required');
  if (!rerankerModel) throw new Error('RERANKER_MODEL_NAME is required');

  console.log(
    `\n========== Day 19 RERANK EVAL (pool K=${POOL_K} → top_n=${FINAL_K}, heading v2) ==========`,
  );
  const rows = await runRerankEval(
    DEFAULT_EVAL_QUERIES,
    apiKey,
    baseUrl,
    embedModel,
    rerankerModel,
  );

  console.log('\n========== REPORT ==========');
  console.log(formatRerankReport(rows));

  const n = rows.length;
  const rerankHit = rows.filter((r) => r.rerankHit).length;
  console.log('\n========== 判定 ==========');
  if (rerankHit >= 8) console.log(`rerank ${rerankHit}/${n} ≥ 8/9 → Day 18 spec 预期兑现`);
  else if (rerankHit >= 6) console.log(`rerank ${rerankHit}/${n} 6-7/9 → 部分兑现，看上方归因表`);
  else console.log(`rerank ${rerankHit}/${n} ≤ 5/9 → rerank 无效，结论写 memory`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
