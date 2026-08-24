/**
 * examples/day13/ex_001_index_corpus.ts
 *
 * 加载 docs/daily/*.md + docs/adr/*.md 真文档 → 两种 chunk 策略切分 → 嵌入 → 入库。
 * 打印 corpus 统计：文档数、两种策略各自的 chunk 数、总字符。
 *
 * 跑法：npx tsx examples/day13/ex_001_index_corpus.ts
 *
 * 准备：需要 .env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME。
 * 产物：仓库根 .lancedb/rag（gitignored），目录里 4 个 table：chunks_heading / chunks_paragraph / rag_eval_heading / rag_eval_paragraph
 */

import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  chunkByHeading,
  chunkByParagraph,
  dropEmptyChunks,
  loadDocsCorpus,
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
      // placeholder 二次失败 —— 跳过不入库（lancedb 拒绝空 vector）
      console.log(`  skip chunk[${i}] (${chunks[i]!.source}) — placeholder fallback failed`);
      continue;
    }
    void fallbackFlags; // fallbackFlags 由调用方在打印里引用，这里保留以便 trace
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

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  console.log('--- 1. load docs corpus ---');
  const docs = await loadDocsCorpus();
  console.log(`loaded ${docs.length} docs`);
  for (const d of docs) {
    console.log(`  - ${d.relPath} (${d.content.length} chars)`);
  }

  console.log('\n--- 2. chunk by heading ---');
  const headingChunks = dropEmptyChunks(
    docs.flatMap((d: DocEntry) => chunkByHeading(d.content, d.relPath, d.kind)),
  );
  console.log(`heading chunks: ${headingChunks.length}`);

  console.log('\n--- 3. chunk by paragraph ---');
  const paragraphChunks = dropEmptyChunks(
    docs.flatMap((d: DocEntry) => chunkByParagraph(d.content, d.relPath, d.kind)),
  );
  console.log(`paragraph chunks: ${paragraphChunks.length}`);

  console.log('\n--- 4. embed + index both ---');
  const { embed } = await import('../../libs/embedding/embed.js');

  const tH = Date.now();
  const headingEmbed = await embed(
    { input: headingChunks.map((c) => c.text), ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) },
    apiKey,
  );
  const headingFallbacks = headingEmbed.fallbackFlags.filter(Boolean).length;
  console.log(`heading embed: ${headingEmbed.vectors.length} × ${headingEmbed.dimensions} dim in ${Date.now() - tH}ms (fallbacks=${headingFallbacks})`);

  const headingStore = await openVectorStore('.lancedb/rag', 'chunks_heading');
  const headingRecords = toRecords(headingChunks, headingEmbed.vectors, headingEmbed.fallbackFlags);
  await headingStore.add(headingRecords);
  console.log(`heading store size: ${await headingStore.size()}`);
  await headingStore.close();

  const tP = Date.now();
  const paragraphEmbed = await embed(
    { input: paragraphChunks.map((c) => c.text), ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) },
    apiKey,
  );
  const paragraphFallbacks = paragraphEmbed.fallbackFlags.filter(Boolean).length;
  console.log(`paragraph embed: ${paragraphEmbed.vectors.length} × ${paragraphEmbed.dimensions} dim in ${Date.now() - tP}ms (fallbacks=${paragraphFallbacks})`);

  const paragraphStore = await openVectorStore('.lancedb/rag', 'chunks_paragraph');
  const paragraphRecords = toRecords(paragraphChunks, paragraphEmbed.vectors, paragraphEmbed.fallbackFlags);
  await paragraphStore.add(paragraphRecords);
  console.log(`paragraph store size: ${await paragraphStore.size()}`);
  await paragraphStore.close();

  console.log('\n--- 5. summary ---');
  const totalCharsH = headingChunks.reduce((s, c) => s + c.text.length, 0);
  const totalCharsP = paragraphChunks.reduce((s, c) => s + c.text.length, 0);
  console.log(`heading   ${headingChunks.length} chunks, ${totalCharsH} chars`);
  console.log(`paragraph ${paragraphChunks.length} chunks, ${totalCharsP} chars`);

  // 删 残留 .lancedb/rag/_temporary —— 探针残留不算脏数据，仅信息
  try {
    const items = await fs.readdir(path.join('.lancedb', 'rag'));
    const temps = items.filter((n) => n.startsWith('_'));
    if (temps.length > 0) console.log(`note: lancedb temp dirs present: ${temps.length}`);
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});