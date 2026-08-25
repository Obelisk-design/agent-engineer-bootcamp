/**
 * debug:notion-sizes — single-pass diagnostic for the "1-byte reachable" mystery.
 * Probes the first 3 pages from listAllPages; for each, dumps:
 *   - blocks.length (raw SDK count)
 *   - markdown.length (post-conversion)
 *   - markdown preview (first 200 chars)
 *
 * Usage: npx tsx examples/_dev/notion_debug_sizes.ts
 */
import 'dotenv/config';
import { listAllPages, fetchPageBlocks, pageToMarkdown } from '../../libs/notion/index.js';
import type { NotionFetchOptions, PageMeta } from '../../libs/notion/index.js';

async function main(): Promise<void> {
  const token = process.env.NOTION_TOKEN ?? '';
  if (!token) {
    console.error('FATAL: NOTION_TOKEN not set');
    process.exit(1);
  }
  const opts: NotionFetchOptions = { auth: token, rateLimitMs: 350 };
  console.log('Listing pages (first 3)...');
  const pages: PageMeta[] = [];
  for await (const meta of listAllPages(opts)) {
    pages.push(meta);
    if (pages.length >= 3) break;
  }
  console.log(`Probing ${pages.length} page(s)`);

  // Probe first 3 pages
  for (const meta of pages) {
    console.log(`\n=== page ${meta.pageId} ===`);
    const blocksRes = await fetchPageBlocks(meta.pageId, opts);
    console.log(`  ok=${blocksRes.ok}`);
    if (!blocksRes.ok) {
      console.log(`  reason=${blocksRes.reason}`);
      continue;
    }
    console.log(`  blocks.length=${blocksRes.blocks.length}`);
    if (blocksRes.blocks.length === 0) {
      console.log('  (no blocks — empty page)');
      continue;
    }
    // blocks is Record<string,unknown>[] from MinimalBlock seam; read .type via unknown cast
    const blockTypes = blocksRes.blocks.map((b) => (b as { type: string }).type).slice(0, 10);
    console.log(`  blockTypes (first 10): ${blockTypes.join(', ')}`);
    // Count child_page IDs — they're the gap between "189 pages" and "1 byte content"
    const childPageIds = blocksRes.blocks
      .filter((b) => (b as { type: string }).type === 'child_page')
      .map((b) => (b as { id?: string }).id ?? '<no id>');
    console.log(
      `  child_page count: ${childPageIds.length}, first 5 ids: ${childPageIds.slice(0, 5).join(', ')}`,
    );
    // Probe whether the child pages appear in listAllPages (option C test)
    console.log(`  Probing child pages via listAllPages (full pass)...`);
    const listedIds = new Set<string>();
    for await (const m of listAllPages(opts)) {
      listedIds.add(m.pageId);
    }
    console.log(`  listAllPages total: ${listedIds.size}`);
    const missing = childPageIds.filter((id) => id !== '<no id>' && !listedIds.has(id));
    console.log(`  child_page NOT in listAllPages: ${missing.length}/${childPageIds.length}`);
    if (missing.length > 0) {
      console.log(`  sample missing: ${missing.slice(0, 5).join(', ')}`);
    }
    // Cast: same MinimalPage wrapping pattern main.ts uses at L193-194
    const blocksForConv = blocksRes.blocks as unknown as readonly {
      readonly type: string;
      readonly [k: string]: unknown;
    }[];
    const { title, markdown } = pageToMarkdown(
      { id: meta.pageId, properties: { title: { type: 'title', title: [] } } },
      blocksForConv,
    );
    console.log(`  title=${JSON.stringify(title)}`);
    console.log(`  markdown.length=${markdown.length}`);
    console.log(`  markdown preview: ${JSON.stringify(markdown.slice(0, 200))}`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
