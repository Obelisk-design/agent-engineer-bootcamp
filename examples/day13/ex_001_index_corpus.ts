/**
 * examples/day13/ex_001_index_corpus.ts
 *
 * 加载真文档 → 调用 incrementalIndex 增量入库。
 * 2 次调用：
 *   - prefix='chunks'        → chunks_heading + chunks_paragraph（main 语料）
 *   - prefix='chunks_test'   → chunks_test_heading + chunks_test_paragraph（test-corpus）
 *
 * 第二次再跑会跳过未变文档（mtime + hash 双重判断），只重 embed 新增 / 修改 / 删除。
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

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  console.log('--- 1. load main corpus (daily + adr) ---');
  const mainDocs = await loadDocsCorpus();
  console.log(`loaded ${mainDocs.length} docs`);

  console.log('\n--- 2. incremental index main ---');
  const t1 = Date.now();
  const mainReport = await incrementalIndex(mainDocs, {
    apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(model !== undefined ? { model } : {}),
    storeUri: '.lancedb/rag',
    tablePrefix: 'chunks',
  });
  console.log(
    `main: added=${mainReport.added.length} modified=${mainReport.modified.length} ` +
      `removed=${mainReport.removed.length} skipped=${mainReport.skipped.length} ` +
      `+${mainReport.headingChunksAdded}h/${mainReport.paragraphChunksAdded}p chunks ` +
      `in ${Date.now() - t1}ms (indexer: ${mainReport.elapsedMs}ms)`,
  );

  console.log('\n--- 3. load test-corpus ---');
  const testDocs = await loadTestCorpus();
  console.log(`loaded ${testDocs.length} docs`);
  for (const d of testDocs) {
    console.log(`  - ${d.relPath} (${d.content.length} chars)`);
  }

  if (testDocs.length > 0) {
    console.log('\n--- 4. incremental index test-corpus ---');
    const t2 = Date.now();
    const testReport = await incrementalIndex(testDocs, {
      apiKey,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(model !== undefined ? { model } : {}),
      storeUri: '.lancedb/rag',
      tablePrefix: 'chunks_test',
    });
    console.log(
      `test: added=${testReport.added.length} modified=${testReport.modified.length} ` +
        `removed=${testReport.removed.length} skipped=${testReport.skipped.length} ` +
        `+${testReport.headingChunksAdded}h/${testReport.paragraphChunksAdded}p chunks ` +
        `in ${Date.now() - t2}ms (indexer: ${testReport.elapsedMs}ms)`,
    );
  } else {
    console.log('\n--- 4. test-corpus empty, skip ---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
