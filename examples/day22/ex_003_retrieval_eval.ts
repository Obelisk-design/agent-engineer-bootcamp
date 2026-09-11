/**
 * examples/day22/ex_003_retrieval_eval.ts
 *
 * Day 22 — 跑端到端检索/答案评测（spec §1.2 第 1 条 + §6.2）。
 *
 * 流程（spec §6.2）：
 *   1. 加载 GT 集（examples/day22/gt-dataset.json 或 gt-raw.json）
 *   2. 打开 chunks_corporate_heading store
 *   3. for each query: retrieve(K=20) → rerank(top_n=3) → judgeLLM
 *   4. 聚合 recall@k / final-hit / 三维度 breakdown
 *   5. 写 report → examples/day22/reports/retrieval-eval-{runId}.json
 *
 * 跑法：
 *   pnpm exec tsx examples/day22/ex_003_retrieval_eval.ts
 *   或指定 GT：GT_PATH=examples/day22/gt-raw.json pnpm exec tsx examples/day22/ex_003_retrieval_eval.ts
 *
 * 不做：
 *   - 不调 incrementalIndex（库已由 ex_000 入库）
 *   - 不做跨日 diff（Day 41+ 话题）
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { openVectorStore } from '../../libs/rag/store.js';
import {
  loadGtDataset,
  runRetrievalEval,
  formatRetrievalReport,
  makeJudgeCallback,
} from '../../libs/eval/index.js';

const LANCEDB_URI = '.lancedb/corporate';
const TABLE_NAME = 'chunks_corporate_heading';
const REPORTS_DIR = 'examples/day22/reports';

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const embedModel = process.env.EMBEDDING_MODEL_NAME;
  const rerankModel = process.env.RERANKER_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!embedModel) throw new Error('EMBEDDING_MODEL_NAME is required');
  if (!rerankModel) throw new Error('RERANKER_MODEL_NAME is required');

  const gtPath = process.env.GT_PATH ?? 'examples/day22/gt-dataset.json';
  const store = await openVectorStore(LANCEDB_URI, TABLE_NAME);

  try {
    const queries = await loadGtDataset(gtPath, { stores: [store] });
    const stale = queries.filter((q) => q.runtime.gtStale).length;
    const valid = queries.filter((q) => !q.runtime.gtStale);
    console.log(`GT 集: ${queries.length} (stale=${stale}, valid=${valid.length})`);

    const chatModel = process.env.MODEL_NAME ?? 'ai-coding';
    const judge = makeJudgeCallback({ apiKey, baseUrl, model: chatModel });

    const report = await runRetrievalEval(queries, {
      apiKey,
      baseUrl,
      embedModel,
      rerankModel,
      store,
      judge,
    });

    await mkdir(REPORTS_DIR, { recursive: true });
    const outPath = `${REPORTS_DIR}/retrieval-eval-${report.runId}.json`;
    await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(formatRetrievalReport(report));
    console.log(`\n报告: ${outPath}`);
  } finally {
    await store.close();
  }
}

main().catch((err) => {
  console.error('retrieval eval 异常：', err);
  process.exit(1);
});
