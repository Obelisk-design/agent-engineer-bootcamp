/**
 * examples/day13/ex_002_chunk_compare.ts
 *
 * 5 条 fixed query × 2 种 chunk 策略 = 10 次 retrieve 自动跑分。
 * 控制台打印 Markdown 对比表。
 *
 * 前置：ex_001 已跑过（.lancedb/rag 里有 chunks_heading / chunks_paragraph 两表）。
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
} from '../../libs/rag/index.js';

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const embedModel = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!embedModel) throw new Error('EMBEDDING_MODEL_NAME not set');

  const headingStore = await openVectorStore('.lancedb/rag', 'chunks_heading');
  const paragraphStore = await openVectorStore('.lancedb/rag', 'chunks_paragraph');

  console.log(`heading store size: ${await headingStore.size()}`);
  console.log(`paragraph store size: ${await paragraphStore.size()}\n`);

  const rows: EvalRow[] = [];
  for (const q of DEFAULT_EVAL_QUERIES) {
    console.log(`>>> ${q.id}: ${q.query}`);

    const hRes = await retrieve(q.query, {
      k: 5,
      chunkStrategy: 'heading',
      store: headingStore,
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
      store: paragraphStore,
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

  await headingStore.close();
  await paragraphStore.close();

  const report = buildReport(rows);
  console.log('\n========== EVAL REPORT ==========');
  console.log(formatReport(report));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});