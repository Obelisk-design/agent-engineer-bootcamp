/**
 * examples/day18/ex_001_force_reindex.ts
 *
 * Day 18 重灌库脚本：force reindex main + test corpus。
 * 让 chunks_heading / chunks_paragraph 表用新切法（chunkByHeadingSmart + overlap 400）重新入库。
 *
 * 跑法：npx tsx examples/day18/ex_001_force_reindex.ts
 *
 * 与 day13/ex_001_index_corpus.ts 的区别：
 *   - 传 force: true → 强制全量 reindex（即使 hash 没变也重 embed）
 *   - 跑完打印 chunk 数量变化（heading 总数 vs 调前 35）
 *
 * 不做（YAGNI）：
 *   - 不改 ex_001_index_corpus.ts（保持 day 13 入口不变）
 *   - 不备份旧库（force reindex 会清掉所有旧 chunk，重灌失败就用 git checkout .lancedb/rag/）
 */

import 'dotenv/config';
import { incrementalIndex, loadDocsCorpus, loadTestCorpus } from '../../libs/rag/index.js';

function printReport(label: string, r: Awaited<ReturnType<typeof incrementalIndex>>): void {
  console.log(`\n=== ${label} (force reindex) ===`);
  console.log(
    `changedFiles=${r.changedFiles.length}  (added=${r.added.length} modified=${r.modified.length} removed=${r.removed.length})`,
  );
  console.log(
    `skipped=${r.skipped.length}  chunksAdded=${r.headingChunksAdded}h/${r.paragraphChunksAdded}p`,
  );
  console.log('phases:');
  console.log(`  stat   ${String(r.phases.statMs).padStart(6)}ms`);
  console.log(`  delete ${String(r.phases.deleteMs).padStart(6)}ms`);
  console.log(`  embed  ${String(r.phases.embedMs).padStart(6)}ms  (calls=${r.phases.embedCalls})`);
  console.log(`  add    ${String(r.phases.addMs).padStart(6)}ms`);
  console.log(`  io     ${String(r.phases.ioMs).padStart(6)}ms`);
  console.log(`  total  ${String(r.phases.totalMs).padStart(6)}ms`);
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  console.log('--- 1. load main corpus ---');
  const mainDocs = await loadDocsCorpus();
  console.log(`loaded ${mainDocs.length} docs`);

  console.log('\n--- 2. FORCE reindex main (chunkByHeadingSmart + overlap 400) ---');
  const mainReport = await incrementalIndex(mainDocs, {
    apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(model !== undefined ? { model } : {}),
    storeUri: '.lancedb/rag',
    tablePrefix: 'chunks',
    force: true,
  });
  printReport('main', mainReport);

  console.log('\n--- 3. load test-corpus ---');
  const testDocs = await loadTestCorpus();
  if (testDocs.length > 0) {
    console.log('\n--- 4. FORCE reindex test-corpus ---');
    const testReport = await incrementalIndex(testDocs, {
      apiKey,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(model !== undefined ? { model } : {}),
      storeUri: '.lancedb/rag',
      tablePrefix: 'chunks_test',
      force: true,
    });
    printReport('test', testReport);
  } else {
    console.log('\n--- 4. test-corpus empty, skip ---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
