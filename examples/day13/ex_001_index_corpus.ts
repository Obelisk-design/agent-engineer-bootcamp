/**
 * examples/day13/ex_001_index_corpus.ts
 *
 * 加载真文档 → 切分 → 嵌入 → 入库。
 * 4 个 lancedb 表：
 *   - chunks_heading       (daily+adr, heading 切)
 *   - chunks_paragraph     (daily+adr, paragraph 切)
 *   - chunks_test_corpus   (test-corpus, heading 切 —— 评测专用)
 *   - chunks_test_paragraph (test-corpus, paragraph 切 —— 评测专用)
 *
 * 跑法：npx tsx examples/day13/ex_001_index_corpus.ts
 *
 * 准备：需要 .env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME。
 * 产物：仓库根 .lancedb/rag（gitignored）。
 */

import 'dotenv/config';
import {
  chunkByHeading,
  chunkByParagraph,
  dropEmptyChunks,
  loadDocsCorpus,
  loadTestCorpus,
  openVectorStore,
  type Chunk,
  type DocEntry,
  type VectorRecord,
} from '../../libs/rag/index.js';

function toRecords(chunks: readonly Chunk[], vectors: number[][], fallbackFlags: readonly boolean[]): VectorRecord[] {
  const out: VectorRecord[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const v = vectors[i]!;
    if (v.length === 0) {
      console.log(`  skip chunk[${i}] (${chunks[i]!.source}) — placeholder fallback failed`);
      continue;
    }
    void fallbackFlags;
    const c = chunks[i]!;
    out.push({
      id: `${c.source}#${c.byteStart}-${c.byteEnd}`,
      vector: v,
      text: c.text,
      source: c.source,
      sourceKind: c.sourceKind,
    });
  }
  return out;
}

async function indexOne(
  label: string,
  docs: readonly DocEntry[],
  strategy: 'heading' | 'paragraph',
  tableName: string,
  apiKey: string,
  model: string | undefined,
  baseUrl: string | undefined,
): Promise<void> {
  const chunks = dropEmptyChunks(
    docs.flatMap((d) =>
      strategy === 'heading'
        ? chunkByHeading(d.content, d.relPath, d.kind)
        : chunkByParagraph(d.content, d.relPath, d.kind),
    ),
  );
  const { embed } = await import('../../libs/embedding/embed.js');
  const t = Date.now();
  const er = await embed(
    { input: chunks.map((c) => c.text), ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) },
    apiKey,
  );
  const fb = er.fallbackFlags.filter(Boolean).length;
  console.log(`${label} embed: ${er.vectors.length} × ${er.dimensions} dim in ${Date.now() - t}ms (fallbacks=${fb})`);
  const store = await openVectorStore('.lancedb/rag', tableName);
  const records = toRecords(chunks, er.vectors, er.fallbackFlags);
  await store.add(records);
  console.log(`${label} store size: ${await store.size()}`);
  await store.close();
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  console.log('--- 1. load main corpus (daily + adr) ---');
  const mainDocs = await loadDocsCorpus();
  console.log(`loaded ${mainDocs.length} docs`);

  console.log('\n--- 2. load test-corpus ---');
  const testDocs = await loadTestCorpus();
  console.log(`loaded ${testDocs.length} docs`);
  for (const d of testDocs) {
    console.log(`  - ${d.relPath} (${d.content.length} chars)`);
  }

  console.log('\n--- 3. index main heading + paragraph ---');
  await indexOne('main:heading', mainDocs, 'heading', 'chunks_heading', apiKey, model, baseUrl);
  await indexOne('main:paragraph', mainDocs, 'paragraph', 'chunks_paragraph', apiKey, model, baseUrl);

  if (testDocs.length > 0) {
    console.log('\n--- 4. index test-corpus ---');
    await indexOne('test:heading', testDocs, 'heading', 'chunks_test_corpus', apiKey, model, baseUrl);
    await indexOne('test:paragraph', testDocs, 'paragraph', 'chunks_test_paragraph', apiKey, model, baseUrl);
  } else {
    console.log('\n--- 4. test-corpus empty, skip ---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});