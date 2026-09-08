/**
 * examples/day16/ex_002_merge_demo.ts
 *
 * Day 16 真活 #2：演示 retrieveMerged 比单 strategy retrieve 多召回多少 hit。
 *
 * 跑 1 条 query（默认 Q1 "4闸必跑是哪 4 个"）→ 三个对比：
 *   1) retrieve(chunkStrategy='heading')   —— 单 strategy heading
 *   2) retrieve(chunkStrategy='paragraph') —— 单 strategy paragraph
 *   3) retrieveMerged                      —— heading + paragraph 并行合并 + text 相等去重 + score 全局排序
 *
 * 报告解读：
 *   - 3 个结果 hits 数对比（merged ≤ heading + paragraph）
 *   - headingHits / paragraphHits / deduped 计数
 *   - top sources 列表（直观看到哪些 chunk 是 paragraph 独家 / heading 独家 / 双 strategy 都中）
 *
 * 前置：examples/day13/ex_001_index_corpus.ts 已跑过。
 *
 * 跑法：npx tsx examples/day16/ex_002_merge_demo.ts
 *       npx tsx examples/day16/ex_002_merge_demo.ts "你的问题"     改 query
 * 准备：.env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME。
 *
 * 不做（YAGNI）：
 *   - 不跑全 7 条 DEFAULT_EVAL_QUERIES（那是 ex_001 的活）
 *   - 不算 hit/miss（判 hit 是 evaluate.ts 的职责，ex_002 只看分布）
 *   - 不存 diff 到文件（终端打印够，要复跑直接重跑）
 */

import 'dotenv/config';
import { openVectorStore, retrieve, retrieveMerged } from '../../libs/rag/index.js';

function printHits(
  label: string,
  query: string,
  hits: readonly { record: { source: string; text: string }; score: number }[],
): void {
  console.log(`\n--- ${label} (${query}) ---`);
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]!;
    const snippet = h.record.text.replace(/\s+/g, ' ').slice(0, 60);
    console.log(`  #${i + 1} score=${h.score.toFixed(4)} ${h.record.source}`);
    console.log(`     "${snippet}…"`);
  }
}

async function main(): Promise<void> {
  const query = process.argv[2] ?? '4闸必跑是哪 4 个';
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!model) throw new Error('EMBEDDING_MODEL_NAME is required');

  const headingStore = await openVectorStore('.lancedb/rag', 'chunks_heading');
  const paragraphStore = await openVectorStore('.lancedb/rag', 'chunks_paragraph');

  try {
    const headingRes = await retrieve(query, {
      k: 3,
      chunkStrategy: 'heading',
      store: headingStore,
      apiKey,
      baseUrl,
      model,
    });
    const paragraphRes = await retrieve(query, {
      k: 3,
      chunkStrategy: 'paragraph',
      store: paragraphStore,
      apiKey,
      baseUrl,
      model,
    });
    const merged = await retrieveMerged(query, {
      k: 3,
      stores: { heading: headingStore, paragraph: paragraphStore },
      apiKey,
      baseUrl,
      model,
    });

    printHits('heading only', query, headingRes.hits);
    printHits('paragraph only', query, paragraphRes.hits);
    printHits('retrieveMerged', query, merged.hits);

    console.log('\n========== SUMMARY ==========');
    console.log(`heading:    ${headingRes.hits.length} hits (${headingRes.elapsedMs}ms)`);
    console.log(`paragraph:  ${paragraphRes.hits.length} hits (${paragraphRes.elapsedMs}ms)`);
    console.log(
      `merged:     ${merged.hits.length} hits (${merged.elapsedMs}ms)  headingHits=${merged.headingHits} paragraphHits=${merged.paragraphHits} deduped=${merged.deduped}`,
    );
  } finally {
    await headingStore.close();
    await paragraphStore.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
