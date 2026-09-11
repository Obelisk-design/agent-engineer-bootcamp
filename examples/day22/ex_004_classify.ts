/**
 * examples/day22/ex_004_classify.ts
 *
 * Day 22 — 输出三维度分类分布（spec §5）。
 *
 * 流程：
 *   1. 加载 GT 集
 *   2. summarizeQueryLabels 输出 type / domain / difficulty 分布
 *   3. 对 chunkLabels 也汇总
 *
 * 跑法：
 *   pnpm exec tsx examples/day22/ex_004_classify.ts
 *   或：GT_PATH=examples/day22/gt-raw.json pnpm exec tsx examples/day22/ex_004_classify.ts
 *
 * 不做：
 *   - 不调 LLM（用 libs/eval/classify 规则分类）
 *   - 不做 GT 修正（人工在 JSON 文件改）
 */

import { loadGtDataset, summarizeQueryLabels } from '../../libs/eval/index.js';

async function main(): Promise<void> {
  const gtPath = process.env.GT_PATH ?? 'examples/day22/gt-dataset.json';
  const queries = await loadGtDataset(gtPath);

  console.log(`GT 集: ${queries.length} 条 query\n`);

  console.log('=== Query 维度分布 ===');
  console.log(summarizeQueryLabels(queries));

  console.log('\n=== Chunk 维度分布 ===');
  const byType = new Map<string, number>();
  const byFmt = new Map<string, number>();
  const trapCount = queries.flatMap((q) => q.chunkLabels).filter((c) => c.isTrapClause).length;
  for (const q of queries) {
    for (const cl of q.chunkLabels) {
      byType.set(cl.chunkType, (byType.get(cl.chunkType) ?? 0) + 1);
      byFmt.set(cl.sourceFormat, (byFmt.get(cl.sourceFormat) ?? 0) + 1);
    }
  }
  console.log(`chunkType: ${[...byType.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`sourceFormat: ${[...byFmt.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`陷阱条款: ${trapCount}`);

  console.log('\n=== Answer 维度分布 ===');
  const byAnsType = new Map<string, number>();
  const byLen = new Map<string, number>();
  for (const q of queries) {
    byAnsType.set(q.answerLabels.answerType, (byAnsType.get(q.answerLabels.answerType) ?? 0) + 1);
    byLen.set(q.answerLabels.expectedLength, (byLen.get(q.answerLabels.expectedLength) ?? 0) + 1);
  }
  console.log(`answerType: ${[...byAnsType.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`expectedLength: ${[...byLen.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);

  console.log('\n=== Human Reviewed 统计 ===');
  const reviewed = queries.filter((q) => q.humanReviewed).length;
  console.log(`已人工修正: ${reviewed}/${queries.length}`);
}

main().catch((err) => {
  console.error('classify 异常：', err);
  process.exit(1);
});
