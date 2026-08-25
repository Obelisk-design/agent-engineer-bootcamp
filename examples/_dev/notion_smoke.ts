/**
 * examples/_dev/notion_smoke.ts
 *
 * Smoke test for `incrementalIndexFromSources` (Task 5 entry point).
 * NOT part of the bootcamp example suite — lives under `_dev/` so vitest's
 * default include glob (libs/**, tests/**) skips it.
 *
 * Run manually: npx tsx examples/_dev/notion_smoke.ts
 */
import 'dotenv/config';
import { incrementalIndexFromSources, type DocSource } from '../../libs/rag/index.js';
import { hashText } from '../../libs/rag/indexer.js';

async function main(): Promise<void> {
  const content = '# Smoke\n\nThis is a Notion smoke test chunk.\n';
  const source: DocSource = {
    sourceKey: 'smoke/notion',
    sourceLabel: 'smoke/notion',
    content,
    sourceKind: 'notion',
    updatedMs: Date.now(),
    contentHash: hashText(content),
  };
  const report = await incrementalIndexFromSources([source], {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    ...(process.env.OPENAI_BASE_URL !== undefined ? { baseUrl: process.env.OPENAI_BASE_URL } : {}),
    ...(process.env.EMBEDDING_MODEL_NAME !== undefined ? { model: process.env.EMBEDDING_MODEL_NAME } : {}),
    tablePrefix: 'chunks_smoke',
  });
  console.log(`smoke: added=${report.added.length}, heading=${report.headingChunksAdded}, paragraph=${report.paragraphChunksAdded}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
