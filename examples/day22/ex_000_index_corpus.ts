/**
 * examples/day22/ex_000_index_corpus.ts
 *
 * Day 22 真活前置：把 Day 21 200 份多格式语料 embed + 落 lancedb，
 * 建立 `chunks_corporate_heading` 表，供 ex_001_generate_gt 用。
 *
 * 流程（ex_001_rag_ready_pipeline + embed + lancedb）：
 *   1. buildManifest(corpusDir)
 *   2. extractByFile(filename, buf)
 *   3. chunkText(filename, category, text)
 *   4. embed(text) → vector (4096 dim, qwen3-embedding-8b)
 *   5. lancedb.add() → chunks_corporate_heading
 *
 * Why 不调 incrementalIndex：
 *   - libs/rag/incrementalIndex 走 markdown chunkByHeadingSmart（不适合 PDF/DOCX/PPTX 等）
 *   - Day 21 多格式语料需要 Day 21 自己的 extractor + chunker
 *   - 这是 Day 22 的独立路径 → 不污染 Day 13-18 库
 *
 * 表命名（spec § ADR 0004）：
 *   - chunks_corporate_heading
 *   - 不建 chunks_corporate_paragraph（YAGNI；今天只验 heading 切法）
 *
 * 跑法：
 *   pnpm exec tsx examples/day22/ex_000_index_corpus.ts
 *
 * 不做：
 *   - 不做增量入库（Day 22 一次性 force 全量入库）
 *   - 不做 paragraph 双 strategy（YAGNI）
 *   - 不做 OCR（图片直接 skip，沿用 Day 21）
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { buildManifest } from './../day21/rag-ready/manifest.js';
import { extractByFile } from './../day21/rag-ready/extractors.js';
import { chunkText } from './../day21/rag-ready/chunker.js';
import { embed } from '../../libs/embedding/embed.js';
import { openVectorStore, type VectorRecord } from '../../libs/rag/store.js';

const CORPUS_DIR = 'tests/fixtures/corporate-docs';
const LANCEDB_URI = '.lancedb/corporate';
const TABLE_NAME = 'chunks_corporate_heading';

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const embedModel = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!embedModel) throw new Error('EMBEDDING_MODEL_NAME is required');

  const t0 = Date.now();
  const manifest = await buildManifest(CORPUS_DIR);
  const store = await openVectorStore(LANCEDB_URI, TABLE_NAME);

  try {
    let textOk = 0;
    let textUnavailable = 0;
    let textEmpty = 0;
    let chunksOk = 0;
    let embedFallback = 0;
    const records: VectorRecord[] = [];

    for (const entry of manifest) {
      const fullPath = join(CORPUS_DIR, entry.filename);
      const buf = await readFile(fullPath);
      const extracted = await extractByFile(entry.filename, buf);

      if (!extracted.ok && extracted.note === 'text_unavailable_image_requires_ocr') {
        textUnavailable++;
        continue;
      }
      if (!extracted.ok || extracted.text.length < 10) {
        textEmpty++;
        continue;
      }
      textOk++;

      const chunks = chunkText(entry.filename, entry.category, extracted.text);

      // 批量 embed（一次发一批，节省时间）
      const tEmbed = Date.now();
      const result = await embed(
        {
          input: chunks.map((c) => c.text),
          model: embedModel,
          baseUrl,
        },
        apiKey,
      );
      const elapsed = Date.now() - tEmbed;
      console.log(`  embed ${entry.filename} → ${chunks.length} chunks in ${elapsed}ms`);

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        const v = result.vectors[i]!;
        if (result.fallbackFlags[i] === true) embedFallback++;

        records.push({
          id: c.chunk_id,
          vector: v,
          text: c.text,
          source: entry.filename,
          sourceKind: 'fixture',
        });
        chunksOk++;
      }
    }

    if (records.length > 0) {
      await store.add(records);
    }

    const total = await store.size();
    const t1 = Date.now();

    console.log('\n=== Day 22 入库汇总 ===');
    console.log(`总文件:        ${manifest.length}`);
    console.log(`文本成功:      ${textOk}`);
    console.log(`图片无 OCR:    ${textUnavailable}`);
    console.log(`空/失败:       ${textEmpty}`);
    console.log(`chunks:        ${chunksOk}`);
    console.log(`embed fallback: ${embedFallback}`);
    console.log(`库 size:       ${total}`);
    console.log(`库路径:        ${LANCEDB_URI}/${TABLE_NAME}`);
    console.log(`总耗时:        ${t1 - t0}ms`);

    // 用 extname 简单统计（manifest 已有 category 但 ex 复用一下）
    void extname;
  } finally {
    await store.close();
  }
}

main().catch((err) => {
  console.error('index 异常：', err);
  process.exit(1);
});
