/**
 * examples/day20/ex_002_merged_rerank_eval.ts
 *
 * Day 20 真活 2：retrieveMerged（heading + paragraph 双 strategy）+ rerank 评估。
 *
 * 与 day19/ex_001_rerank_eval.ts 的唯一区别：recall 来源改成 retrieveMerged（双 strategy 合并 top-20）。
 *
 * 假设：Q3 "tool 参数事实源" 在 Day 19 heading-only retrieve(K=20) 召回失败；
 *       retrieveMerged 双 strategy 池能拉进 ADR 0003 的 paragraph chunks（40 个），rerank 应能修。
 *
 * 跑法：npx tsx examples/day20/ex_002_merged_rerank_eval.ts
 * 准备：.env（OPENAI_API_KEY/BASE_URL/EMBEDDING_MODEL_NAME/RERANKER_MODEL_NAME），Day 18 force reindex 已跑
 *
 * 不做（YAGNI）：
 *   - 不加"retrieveMerged 不 rerank"第三臂
 *   - 不做 fuzzy dedupe（text 相等已由 retrieveMerged 内部处理）
 *   - 不动 libs/rag 或 libs/reranker
 */

import 'dotenv/config';
import {
  DEFAULT_EVAL_QUERIES,
  evaluateRerankRow,
  formatRerankReport,
  openVectorStore,
  retrieveMerged,
  type EvalQuery,
  type RerankEvalRow,
  type SearchHit,
} from '../../libs/rag/index.js';
import { rerank } from '../../libs/reranker/rerank.js';

const POOL_K = 20;
const FINAL_K = 3;

async function runMergedRerankEval(
  queries: readonly EvalQuery[],
  apiKey: string,
  baseUrl: string,
  embedModel: string,
  rerankerModel: string,
): Promise<RerankEvalRow[]> {
  const headingStore = await openVectorStore('.lancedb/rag', 'chunks_heading');
  const paragraphStore = await openVectorStore('.lancedb/rag', 'chunks_paragraph');
  const testHeadingStore = await openVectorStore('.lancedb/rag', 'chunks_test_heading');
  const testParagraphStore = await openVectorStore('.lancedb/rag', 'chunks_test_paragraph');
  const rows: RerankEvalRow[] = [];

  try {
    for (const q of queries) {
      const isTest = q.corpus === 'test';
      const storeSet = isTest
        ? { heading: testHeadingStore, paragraph: testParagraphStore }
        : { heading: headingStore, paragraph: paragraphStore };

      const t0 = Date.now();

      // 1. 双 strategy 召回宽：retrieveMerged 每 strategy 各 K=20 → 合并 + text 去重 + top-20
      const merged = await retrieveMerged(q.query, {
        k: POOL_K,
        stores: storeSet,
        apiKey,
        baseUrl,
        model: embedModel,
      });
      const poolHits = merged.hits;

      // 2. 精排窄：rerank top_n=3
      const rr = await rerank(
        {
          query: q.query,
          documents: poolHits.map((h) => h.record.text),
          topN: FINAL_K,
          model: rerankerModel,
          baseUrl,
        },
        apiKey,
      );

      let finalHits: readonly SearchHit[];
      let rerankFailed: boolean;
      if (rr === null) {
        finalHits = poolHits.slice(0, FINAL_K);
        rerankFailed = true;
      } else {
        finalHits = rr.hits
          .map((rh) => poolHits[rh.index]!)
          .filter((h): h is SearchHit => h !== undefined);
        rerankFailed = false;
      }

      const row = {
        ...evaluateRerankRow(q, poolHits, finalHits, FINAL_K),
        rerankFailed,
        elapsedMs: Date.now() - t0,
      };
      rows.push(row);
      console.log(
        `  ${q.id} ${q.query} | pool=${poolHits.length} (h=${merged.headingHits}+p=${merged.paragraphHits}-dedup=${merged.deduped}) baseline=${row.baselineHit ? '✅' : '❌'} rerank=${row.rerankHit ? '✅' : '❌'}${rerankFailed ? ' (fallback)' : ''} gtInPool=${row.gtInPool === null ? '-' : row.gtInPool ? '✓' : '✗'} ${row.elapsedMs}ms`,
      );
    }
  } finally {
    await headingStore.close();
    await paragraphStore.close();
    await testHeadingStore.close();
    await testParagraphStore.close();
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
    `\n========== Day 20 MERGED+rerank EVAL (retrieveMerged K=${POOL_K} → rerank top_n=${FINAL_K}) ==========`,
  );
  const rows = await runMergedRerankEval(
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
  const baselineHit = rows.filter((r) => r.baselineHit).length;
  console.log(
    `\nbaseline: ${baselineHit}/${n} → rerank: ${rerankHit}/${n} (Δ ${rerankHit - baselineHit >= 0 ? '+' : ''}${rerankHit - baselineHit})`,
  );
  console.log('\n========== vs Day 19 (heading-only retrieve K=20 → rerank) ==========');
  const DAY19_RERANK = 9;
  console.log('Day 19: baseline 7/9 → rerank 9/9 (Q3 召回失败)');
  if (rerankHit >= DAY19_RERANK)
    console.log(
      `Day 20: rerank ${rerankHit}/9 ≥ Day 19 9/9 → 双 strategy 不劣化 + Q3 是否升级看归因表`,
    );
  else
    console.log(
      `Day 20: rerank ${rerankHit}/9 < Day 19 9/9 → 双 strategy 反而退化，需诊断（可能 paragraph 池引入噪音）`,
    );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
