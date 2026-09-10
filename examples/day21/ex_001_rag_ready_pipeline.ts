/**
 * examples/day21/ex_001_rag_ready_pipeline.ts
 *
 * Day 21 真活：把 day21/rag-ready/ 的 3 个模块串成一个最小 RAG 准备 pipeline。
 *
 * 流程：
 *   1. buildManifest(corpusDir)         → 元数据索引（id/category/title/format/keywords...）
 *   2. extractByFile(file, buf)        → 把每份语料解出纯文本
 *   3. chunkText(file, category, text)  → 按 ## 标题 + token 上限切 chunks
 *
 * 输出：每份文件的 chunk 数、平均 token 数、关键词命中示例（前 3 份）
 *
 * 跑法：pnpm exec tsx examples/day21/ex_001_rag_ready_pipeline.ts
 * 准备：tests/fixtures/corporate-docs/ 已存在（200 份，含 PDF/MD/DOCX/XLSX/PPTX/PNG/JPG/WEBP/TIFF/EML/ZIP/HTML/CSV/TXT/JSON/YAML/wiki.md 共 17 种格式）
 *
 * 不做（YAGNI）：
 *   - 不嵌入（chunk 直接调，不走 libs/rag/embed）
 *   - 不写 lancedb（产物只到 Chunk[]，落库推 Day 22+）
 *   - 不做 OCR（图片 extractor 返回 text_unavailable）
 */
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { buildManifest } from './rag-ready/manifest.js';
import { chunkText } from './rag-ready/chunker.js';
import { extractByFile, estimateTokens } from './rag-ready/extractors.js';

const CORPUS_DIR = 'tests/fixtures/corporate-docs';

async function main() {
  const t0 = Date.now();
  // 1. 元数据索引
  const manifest = await buildManifest(CORPUS_DIR);
  const t1 = Date.now();
  console.log(`[1/3] buildManifest: ${manifest.length} 份文件，耗时 ${t1 - t0}ms`);

  // 2+3. 串起 extract → chunk
  let totalChunks = 0;
  let totalTokens = 0;
  let textOk = 0;
  let textUnavailable = 0;
  let textEmpty = 0;
  const samplesShown = new Set<string>();

  for (const entry of manifest) {
    const fullPath = join(CORPUS_DIR, entry.filename);
    const ext = extname(entry.filename).toLowerCase().replace(/^\./, '');
    // sharp 期望 png/jpg/jpeg/webp/tiff，不含 docx/xlsx/pptx/zip/eml 等 → 直接读 buffer
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
    totalChunks += chunks.length;
    totalTokens += chunks.reduce((s, c) => s + c.token_count, 0);

    // 演示：前 3 份 markdown 打印 chunk 摘要
    if (ext === 'md' && !samplesShown.has(entry.category)) {
      samplesShown.add(entry.category);
      console.log(`\n--- 示例：${entry.filename} (${entry.category}/${entry.title}) ---`);
      console.log(
        `  extract.ok=${extracted.ok} text_len=${extracted.text.length} tokens≈${estimateTokens(extracted.text)}`,
      );
      console.log(
        `  chunks=${chunks.length} avg_tokens=${Math.round(chunks.reduce((s, c) => s + c.token_count, 0) / chunks.length)}`,
      );
      console.log(`  keywords=${JSON.stringify(entry.keywords)}`);
      console.log(
        `  sections=${chunks
          .map((c) => c.heading)
          .slice(0, 3)
          .join(' | ')}${chunks.length > 3 ? ' | ...' : ''}`,
      );
      if (samplesShown.size >= 3) continue;
    }
  }
  const t2 = Date.now();

  console.log('\n=== pipeline 汇总 ===');
  console.log(`总文件数:        ${manifest.length}`);
  console.log(
    `文本提取成功:    ${textOk}（含正常 md/pdf/docx/xlsx/pptx/zip/eml/json/yaml/html/csv/txt/wiki.md）`,
  );
  console.log(`图片无 OCR:      ${textUnavailable}（PNG/JPG/WEBP/TIFF 占位）`);
  console.log(`空/失败:         ${textEmpty}`);
  console.log(`总 chunks:       ${totalChunks}`);
  console.log(`总 tokens:       ${totalTokens}`);
  console.log(`平均 chunk 数:   ${(totalChunks / textOk).toFixed(1)} / 文件`);
  console.log(`平均 chunk tokens: ${Math.round(totalTokens / totalChunks)}`);
  console.log(
    `耗时:            ${t2 - t0}ms（含 buildManifest ${t1 - t0}ms + extract+chunk ${t2 - t1}ms）`,
  );
}

main().catch((e) => {
  console.error('pipeline 异常：', e);
  process.exit(1);
});
