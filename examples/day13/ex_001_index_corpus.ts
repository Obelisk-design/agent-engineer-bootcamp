/**
 * examples/day13/ex_001_index_corpus.ts
 *
 * 加载真文档 → 调用 incrementalIndex 增量入库。
 * 2 次调用：
 *   - prefix='chunks'        → chunks_heading + chunks_paragraph（main 语料）
 *   - prefix='chunks_test'   → chunks_test_heading + chunks_test_paragraph（test-corpus）
 *
 * 报告解读：
 *   - changedFiles=[] + embedCalls=0 → 真正"零变更"（第二次跑无修改）
 *   - changedFiles=[...] + phase 表 → 一眼看出哪篇改了 / 各阶段耗时
 *
 * 跑法：npx tsx examples/day13/ex_001_index_corpus.ts
 * 准备：.env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME。
 * 产物：仓库根 .lancedb/rag（gitignored）。
 */

import 'dotenv/config';
import {
  incrementalIndex,
  loadDocsCorpus,
  loadTestCorpus,
} from '../../libs/rag/index.js';

function printReport(label: string, r: ReturnType<typeof incrementalIndex> extends Promise<infer R> ? R : never): void {
  console.log(`\n=== ${label} ===`);
  console.log(`changedFiles=${r.changedFiles.length}  (added=${r.added.length} modified=${r.modified.length} removed=${r.removed.length})`);
  console.log(`skipped=${r.skipped.length}  chunksAdded=${r.headingChunksAdded}h/${r.paragraphChunksAdded}p`);
  console.log('phases:');
  console.log(`  stat   ${String(r.phases.statMs).padStart(6)}ms`);
  console.log(`  delete ${String(r.phases.deleteMs).padStart(6)}ms`);
  console.log(`  embed  ${String(r.phases.embedMs).padStart(6)}ms  (calls=${r.phases.embedCalls})`);
  console.log(`  add    ${String(r.phases.addMs).padStart(6)}ms`);
  console.log(`  io     ${String(r.phases.ioMs).padStart(6)}ms`);
  console.log(`  total  ${String(r.phases.totalMs).padStart(6)}ms`);

  if (r.changedFiles.length > 0) {
    console.log('files:');
    for (const f of r.added) console.log(`  + added   ${f}`);
    for (const f of r.modified) console.log(`  ~ modified ${f}`);
    for (const f of r.removed) console.log(`  - removed ${f}`);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  console.log('--- 1. load main corpus (daily + adr) ---');
  const mainDocs = await loadDocsCorpus();
  console.log(`loaded ${mainDocs.length} docs`);

  console.log('\n--- 2. incremental index main ---');
  const mainReport = await incrementalIndex(mainDocs, {
    apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(model !== undefined ? { model } : {}),
    storeUri: '.lancedb/rag',
    tablePrefix: 'chunks',
  });
  printReport('main', mainReport);

  console.log('\n--- 3. load test-corpus ---');
  const testDocs = await loadTestCorpus();
  console.log(`loaded ${testDocs.length} docs`);
  for (const d of testDocs) {
    console.log(`  - ${d.relPath} (${d.content.length} chars)`);
  }

  if (testDocs.length > 0) {
    console.log('\n--- 4. incremental index test-corpus ---');
    const testReport = await incrementalIndex(testDocs, {
      apiKey,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(model !== undefined ? { model } : {}),
      storeUri: '.lancedb/rag',
      tablePrefix: 'chunks_test',
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
