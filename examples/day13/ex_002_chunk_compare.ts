/**
 * examples/day13/ex_002_chunk_compare.ts
 *
 * DEFAULT_EVAL_QUERIES 每条 query × 2 种 chunk 策略 = 自动跑分。
 * query.corpus = 'test' 的走 test store，否则走 main store。
 *
 * 控制台打印 Markdown 对比表。
 *
 * 前置：ex_001 已跑过（.lancedb/rag 里有 4 表：chunks_heading / chunks_paragraph / chunks_test_corpus / chunks_test_paragraph）。
 *
 * 跑法：npx tsx examples/day13/ex_002_chunk_compare.ts
 */

import 'dotenv/config';
import {
  DEFAULT_EVAL_QUERIES,
  buildReport,
  formatReport,
  judgeHit,
  openVectorStore,
  retrieve,
  type EvalRow,
  type VectorStore,
} from '../../libs/rag/index.js';

async function getStore(
  corpus: 'main' | 'test',
  strategy: 'heading' | 'paragraph',
): Promise<VectorStore> {
  const table =
    corpus === 'test'
      ? strategy === 'heading'
        ? 'chunks_test_corpus'
        : 'chunks_test_paragraph'
      : strategy === 'heading'
        ? 'chunks_heading'
        : 'chunks_paragraph';
  return openVectorStore('.lancedb/rag', table);
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const embedModel = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!embedModel) throw new Error('EMBEDDING_MODEL_NAME not set');

  const headingMain = await getStore('main', 'heading');
  const paragraphMain = await getStore('main', 'paragraph');
  const headingTest = await getStore('test', 'heading');
  const paragraphTest = await getStore('test', 'paragraph');

  console.log(`main:heading  size=${await headingMain.size()}`);
  console.log(`main:paragraph size=${await paragraphMain.size()}`);
  console.log(`test:heading  size=${await headingTest.size()}`);
  console.log(`test:paragraph size=${await paragraphTest.size()}\n`);

  const rows: EvalRow[] = [];
  for (const q of DEFAULT_EVAL_QUERIES) {
    const corpus = q.corpus ?? 'main';
    console.log(`>>> ${q.id} [${corpus}]: ${q.query}`);

    const hStore = corpus === 'test' ? headingTest : headingMain;
    const pStore = corpus === 'test' ? paragraphTest : paragraphMain;

    const hRes = await retrieve(q.query, {
      k: 5,
      chunkStrategy: 'heading',
      store: hStore,
      apiKey,
      model: embedModel,
      ...(baseUrl ? { baseUrl } : {}),
    });
    const hHit = judgeHit(q, hRes.hits, 3);
    console.log(`  heading  hit=${hHit} elapsedMs=${hRes.elapsedMs} topSources=${hRes.hits.slice(0, 3).map((h) => h.record.source).join(', ')}`);
    rows.push({
      queryId: q.id,
      chunkStrategy: 'heading',
      hit: hHit,
      elapsedMs: hRes.elapsedMs,
      topSources: hRes.hits.slice(0, 3).map((h) => h.record.source),
    });

    const pRes = await retrieve(q.query, {
      k: 5,
      chunkStrategy: 'paragraph',
      store: pStore,
      apiKey,
      model: embedModel,
      ...(baseUrl ? { baseUrl } : {}),
    });
    const pHit = judgeHit(q, pRes.hits, 3);
    console.log(`  paragraph hit=${pHit} elapsedMs=${pRes.elapsedMs} topSources=${pRes.hits.slice(0, 3).map((h) => h.record.source).join(', ')}\n`);
    rows.push({
      queryId: q.id,
      chunkStrategy: 'paragraph',
      hit: pHit,
      elapsedMs: pRes.elapsedMs,
      topSources: pRes.hits.slice(0, 3).map((h) => h.record.source),
    });
  }

  await headingMain.close();
  await paragraphMain.close();
  await headingTest.close();
  await paragraphTest.close();

  const report = buildReport(rows);
  console.log('\n========== EVAL REPORT ==========');
  console.log(formatReport(report));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});