/**
 * examples/day13/ex_004_rag_loop.ts
 *
 * 单轮 RAG 闭路：retrieve → buildRagPrompt → chat → 打印 { query, top-3 sources, answer, elapsedMs }。
 * 决策 A1（单轮 prompt），不走 agent loop。
 *
 * 前置：ex_001 已跑过。
 *
 * 跑法：npx tsx examples/day13/ex_004_rag_loop.ts "你的问题"
 */

import 'dotenv/config';
import { OpenAIChatClient } from '../../libs/llm/openai-chat-client.js';
import { buildRagPrompt, openVectorStore, retrieve } from '../../libs/rag/index.js';

async function main(): Promise<void> {
  const query = process.argv[2];
  if (!query) throw new Error('usage: tsx ex_004_rag_loop.ts "<query>"');

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.MODEL_NAME;
  const embedModel = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!model) throw new Error('MODEL_NAME is required');
  if (!embedModel) throw new Error('EMBEDDING_MODEL_NAME is required');

  const t0 = Date.now();
  const store = await openVectorStore('.lancedb/rag', 'chunks_paragraph');
  const res = await retrieve(query, {
    k: 3,
    chunkStrategy: 'paragraph',
    store,
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(embedModel ? { model: embedModel } : {}),
  });
  await store.close();
  const retrieveMs = Date.now() - t0;

  console.log(`>>> query: ${query}`);
  console.log(`>>> retrieve: ${res.hits.length} hits in ${retrieveMs}ms`);
  console.log(`>>> sources: ${res.hits.map((h) => h.record.source).join(', ')}`);

  const prompt = buildRagPrompt(query, res.hits);

  const clientOpts: { apiKey: string; model: string; baseURL?: string } = { apiKey, model };
  if (baseUrl) clientOpts.baseURL = baseUrl;
  const client = new OpenAIChatClient(clientOpts);

  const t1 = Date.now();
  const resp = await client.chat({ messages: [{ role: 'user', content: prompt }] });
  const chatMs = Date.now() - t1;

  console.log(`>>> chat: ${chatMs}ms, usage=${JSON.stringify(resp.usage ?? {})}\n`);
  console.log('========== ANSWER ==========');
  console.log(resp.content ?? '(no content)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
