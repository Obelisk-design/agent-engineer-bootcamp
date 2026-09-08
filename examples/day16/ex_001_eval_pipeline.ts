/**
 * examples/day16/ex_001_eval_pipeline.ts
 *
 * Day 16 真活 #1：把 evaluate.ts 已有框架跑出第一份 report。
 *
 * ex_001_eval_pipeline = ex_001 (入库) + ex_003 (单 query) 的批量版：
 *   - 跑 DEFAULT_EVAL_QUERIES (Q1-Q7)
 *   - 每条 query 跑 heading + paragraph 两种 strategy
 *   - judgeHit 判 hit/miss
 *   - buildReport + formatReport 出 Markdown 表格
 *
 * 前置：examples/day13/ex_001_index_corpus.ts 已跑过（仓库根 .lancedb/rag/ 有 chunks_heading + chunks_paragraph）。
 *        examples/day13/ex_001 同样需跑过 test-corpus → .lancedb/rag/chunks_test_heading + chunks_test_paragraph。
 *
 * 跑法：npx tsx examples/day16/ex_001_eval_pipeline.ts
 * 准备：.env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME。
 *
 * 输出（stdout）：
 *   - Markdown 表（每条 query × strategy 的 hit/elapsed）
 *   - summary（heading / paragraph 各命中率 + 平均 elapsed）
 *   - 第一份 report 就是 Day 17 调 chunk / Day 19 上 reranker 的 baseline
 *
 * 不做（YAGNI）：
 *   - 不导出 JSON / CSV（路线表 Day 31-40 才上评估体系）
 *   - 不算 recall@K / MRR（关键词命中够，NDCG 留给 Day 31+）
 *   - 不存 report 到文件（落 spec / memory 即可，要复跑直接重跑本 example）
 */

import 'dotenv/config';
import {
  buildReport,
  DEFAULT_EVAL_QUERIES,
  formatReport,
  judgeHit,
  openVectorStore,
  retrieve,
  type EvalRow,
} from '../../libs/rag/index.js';

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!model) throw new Error('EMBEDDING_MODEL_NAME is required');

  const headingStore = await openVectorStore('.lancedb/rag', 'chunks_heading');
  const paragraphStore = await openVectorStore('.lancedb/rag', 'chunks_paragraph');
  const testHeadingStore = await openVectorStore('.lancedb/rag', 'chunks_test_heading');
  const testParagraphStore = await openVectorStore('.lancedb/rag', 'chunks_test_paragraph');

  const rows: EvalRow[] = [];
  try {
    for (const q of DEFAULT_EVAL_QUERIES) {
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

  const report = buildReport(rows);
  console.log('\n========== EVAL REPORT (markdown) ==========');
  console.log(formatReport(report));
  console.log('\n========== RAW ROWS (debug) ==========');
  for (const r of rows) {
    console.log(JSON.stringify(r));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
