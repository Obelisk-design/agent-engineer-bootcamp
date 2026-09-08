/**
 * examples/day17/ex_002_eval_v2.ts
 *
 * Day 17 真活：双跑 v1 + v2 baseline，对比 hit 数变化。
 *
 * ex_002_eval_v2 = ex_001_eval_pipeline 的双跑版：
 *   - 跑 EVAL_QUERIES_V1（Day 13-16 旧 baseline）
 *   - 跑 DEFAULT_EVAL_QUERIES（Day 17 v2 baseline，含 groundTruthSources）
 *   - 两份 report 并排打印 + 数字 diff
 *
 * 前置：examples/day13/ex_001_index_corpus.ts 已跑过。
 *
 * 跑法：npx tsx examples/day17/ex_002_eval_v2.ts
 * 准备：.env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME。
 *
 * 解读：
 *   - v1 vs v2 命中率差异 = 评估 query 质量修正 + groundTruth 约束带来的"真实偏差校正"
 *   - v2 命中率应低于 v1（groundTruth 约束更严，剔除了"关键词误中大文档"）
 *
 * 不做（YAGNI）：
 *   - 不存 diff 到文件（终端打印够）
 *   - 不算 NDCG / MRR（Day 31+ 评估体系）
 */

import 'dotenv/config';
import {
  buildReport,
  DEFAULT_EVAL_QUERIES,
  EVAL_QUERIES_V1,
  formatReport,
  judgeHit,
  openVectorStore,
  retrieve,
  type EvalQuery,
  type EvalRow,
} from '../../libs/rag/index.js';

async function runBaseline(
  label: string,
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
          `  [${label}] ${q.id} ${strategy.padEnd(9)} hit=${hit ? '✅' : '❌'} ${elapsedMs}ms top=${res.hits
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

  console.log('\n========== RUN V1 (Day 13-16 baseline) ==========');
  const v1 = await runBaseline('v1', EVAL_QUERIES_V1, apiKey, baseUrl, model);

  console.log('\n========== RUN V2 (Day 17 baseline) ==========');
  const v2 = await runBaseline('v2', DEFAULT_EVAL_QUERIES, apiKey, baseUrl, model);

  console.log('\n========== V1 REPORT ==========');
  console.log(formatReport(v1.report));

  console.log('\n========== V2 REPORT ==========');
  console.log(formatReport(v2.report));

  console.log('\n========== V1 vs V2 DIFF ==========');
  const v1Summary = v1.report.summary;
  const v2Summary = v2.report.summary;
  console.log(
    `heading  : v1 ${v1Summary.heading.hit}/${v1Summary.heading.total}  vs  v2 ${v2Summary.heading.hit}/${v2Summary.heading.total}  (Δ ${v2Summary.heading.hit - v1Summary.heading.hit})`,
  );
  console.log(
    `paragraph: v1 ${v1Summary.paragraph.hit}/${v1Summary.paragraph.total}  vs  v2 ${v2Summary.paragraph.hit}/${v2Summary.paragraph.total}  (Δ ${v2Summary.paragraph.hit - v1Summary.paragraph.hit})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
