/**
 * examples/day18/ex_002_v2_baseline_after.ts
 *
 * Day 18 真活：跑 v2 baseline（DEFAULT_EVAL_QUERIES），输出 heading / paragraph 命中率。
 *
 * 与 day17/ex_002_eval_v2.ts 的区别：
 *   - 只跑 v2（DEFAULT_EVAL_QUERIES），不跑 v1
 *   - 跑完打印 heading 命中率 vs Day 17 baseline（heading 6/9）
 *   - 验证目标：heading 6/9 → ≥ 7/9（至少追平 paragraph 7/9）
 *
 * 前置：examples/day18/ex_001_force_reindex.ts 已跑过（库用新切法重灌）。
 *
 * 跑法：npx tsx examples/day18/ex_002_v2_baseline_after.ts
 * 准备：.env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME。
 *
 * 解读：
 *   - heading 6/9 → ≥ 7/9 = chunking 调优生效
 *   - heading 仍 6/9 = 调优无效（Q2 / Q8 真实是 embed 模型能力边界），写 Day 19 reranker 候选
 *
 * 不做（YAGNI）：
 *   - 不跑 v1（ex_002_eval_v2 已覆盖）
 *   - 不算 NDCG / MRR
 *   - 不存结果到文件
 */

import 'dotenv/config';
import {
  buildReport,
  DEFAULT_EVAL_QUERIES,
  formatReport,
  judgeHit,
  openVectorStore,
  retrieve,
  type EvalQuery,
  type EvalRow,
} from '../../libs/rag/index.js';

const BASELINE_HEADING = 6; // Day 17 v2 baseline heading 命中数
const BASELINE_PARAGRAPH = 7; // Day 17 v2 baseline paragraph 命中数

async function runV2(
  queries: readonly EvalQuery[],
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<{ report: ReturnType<typeof buildReport>; rows: EvalRow[] }> {
  const headingStore = await openVectorStore('.lancedb/rag', 'chunks_heading');
  const paragraphStore = await openVectorStore('.lancedb/rag', 'chunks_paragraph');
  const testHeadingStore = await openVectorStore('.lancedb/rag', 'chunks_test_heading');
  const testParagraphStore = await openVectorStore('.lancedb/rag', 'chunks_test_paragraph');

  const rows: EvalRow[] = [];
  try {
    for (const q of queries) {
      const isTest = q.corpus === 'test';
      const stores = isTest
        ? { heading: testHeadingStore, paragraph: testParagraphStore }
        : { heading: headingStore, paragraph: paragraphStore };

      for (const strategy of ['heading', 'paragraph'] as const) {
        const t0 = Date.now();
        const res = await retrieve(q.query, {
          k: 3,
          chunkStrategy: strategy,
          store: stores[strategy],
          apiKey,
          baseUrl,
          model,
        });
        const elapsedMs = Date.now() - t0;
        const hit = judgeHit(q, res.hits, 3);
        rows.push({
          queryId: q.id,
          chunkStrategy: strategy,
          hit,
          elapsedMs,
          topSources: res.hits.map((h) => h.record.source),
        });
        console.log(
          `  ${q.id} ${strategy.padEnd(9)} hit=${hit ? '✅' : '❌'} ${elapsedMs}ms top=${res.hits
            .map((h) => h.record.source)
            .join(', ')}`,
        );
      }
    }
  } finally {
    await headingStore.close();
    await paragraphStore.close();
    await testHeadingStore.close();
    await testParagraphStore.close();
  }

  return { report: buildReport(rows), rows };
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!model) throw new Error('EMBEDDING_MODEL_NAME is required');

  console.log('\n========== RUN V2 (Day 18 after chunk tuning) ==========');
  const v2 = await runV2(DEFAULT_EVAL_QUERIES, apiKey, baseUrl, model);

  console.log('\n========== V2 REPORT ==========');
  console.log(formatReport(v2.report));

  const headingHit = v2.report.summary.heading.hit;
  const paragraphHit = v2.report.summary.paragraph.hit;
  const headingDelta = headingHit - BASELINE_HEADING;
  const paragraphDelta = paragraphHit - BASELINE_PARAGRAPH;

  console.log('\n========== vs Day 17 v2 BASELINE ==========');
  console.log(
    `heading  : Day17 baseline ${BASELINE_HEADING}/9  →  Day18 ${headingHit}/9  (Δ ${headingDelta >= 0 ? '+' : ''}${headingDelta})`,
  );
  console.log(
    `paragraph: Day17 baseline ${BASELINE_PARAGRAPH}/9  →  Day18 ${paragraphHit}/9  (Δ ${paragraphDelta >= 0 ? '+' : ''}${paragraphDelta})`,
  );

  console.log('\n========== 验证 ==========');
  console.log(
    `heading ≥ 7/9? ${headingHit >= 7 ? '✅ 调优生效' : `❌ 仍 ${headingHit}/9（接受 + Day 19 reranker 候选）`}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
