import 'dotenv/config';
import { embed } from './libs/embedding/embed.js';
import { openVectorStore } from './libs/rag/store.js';
async function main(): Promise<void> {
  const er = await embed(
    {
      input: 'test query',
      model: process.env.EMBEDDING_MODEL_NAME!,
      baseUrl: process.env.OPENAI_BASE_URL!,
    },
    process.env.OPENAI_API_KEY!,
  );
  console.log('embed dim:', er.dimensions, 'vec len:', er.vectors[0]!.length);
  const store = await openVectorStore('.lancedb/corporate', 'chunks_corporate_heading');
  try {
    const size = await store.size();
    console.log('store size:', size);
    const hits = await store.search(er.vectors[0]!, 5);
    console.log('hits:', hits.length);
  } finally {
    await store.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
