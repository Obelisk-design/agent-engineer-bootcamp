/**
 * examples/day22/ex_002_corpus_eval.ts
 *
 * Day 22 — 跑库构建评测（spec §1.2 第 5 条）。
 *
 * 调用 libs/eval/run-corpus-eval 跑 RAG-ready 三件套（manifest + extract + chunk），
 * 输出格式由 libs/eval/format-report 格式化。
 *
 * 跑法：
 *   pnpm exec tsx examples/day22/ex_002_corpus_eval.ts
 *
 * 不做：
 *   - 不调 embedding / lancedb（库构建评测只看 RAG-ready 层）
 *   - 不做 embedding 维度分析（Day 41+ 话题）
 */

import { writeFile } from 'node:fs/promises';
import { runCorpusEval, formatCorpusReport } from '../../libs/eval/index.js';

const CORPUS_DIR = 'tests/fixtures/corporate-docs';
const REPORT_PATH = 'examples/day22/reports/corpus-eval.json';

async function main(): Promise<void> {
  const t0 = Date.now();
  const report = await runCorpusEval(CORPUS_DIR);
  const t1 = Date.now();

  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log(formatCorpusReport(report));
  console.log(`\n报告已写入: ${REPORT_PATH}`);
  console.log(`耗时: ${t1 - t0}ms`);
}

main().catch((err) => {
  console.error('corpus eval 异常：', err);
  process.exit(1);
});
