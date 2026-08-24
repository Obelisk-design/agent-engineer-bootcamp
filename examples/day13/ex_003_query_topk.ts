/**
 * examples/day13/ex_003_query_topk.ts
 *
 * 单 query → top-3 → 整段打印。让你亲眼看 LLM 会被喂什么。
 *
 * 前置：ex_001 已跑过。
 *
 * 跑法：npx tsx examples/day13/ex_003_query_topk.ts "你的问题"
 */

import 'dotenv/config';
import { buildRagPrompt, openVectorStore, retrieve } from '../../libs/rag/index.js';

async function main(): Promise<void> {
  const query = process.argv[2];
  if (!query) throw new Error('usage: tsx ex_003_query_topk.ts "<query>"');

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const store = await openVectorStore('.lancedb/rag', 'chunks_paragraph');
  const res = await retrieve(query, {
    k: 3,
    chunkStrategy: 'paragraph',
    store,
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {}),
  });
  await store.close();

  console.log(`query: ${res.query}`);
  console.log(`elapsedMs: ${res.elapsedMs}`);
  console.log(`hits: ${res.hits.length}`);
  for (let i = 0; i < res.hits.length; i++) {
    const h = res.hits[i]!;
    console.log(`\n--- hit #${i + 1} score=${h.score.toFixed(4)} source=${h.record.source} ---`);
    console.log(h.record.text);
  }

  console.log('\n========== RAG PROMPT (what LLM would see) ==========');
  console.log(buildRagPrompt(query, res.hits));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});