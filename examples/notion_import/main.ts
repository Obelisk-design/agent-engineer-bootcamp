/**
 * examples/notion_import/main.ts
 *
 * Imports a personal Notion workspace into the local RAG index.
 *
 * Usage:
 *   npx tsx examples/notion_import/main.ts                # full import
 *   npx tsx examples/notion_import/main.ts --dry-run      # fetch + diff + convert, NO writes
 *
 * Required env:
 *   NOTION_TOKEN               Notion internal integration secret
 *   OPENAI_API_KEY             Embedding API key
 *   OPENAI_BASE_URL            (optional) custom embedding gateway
 *   EMBEDDING_MODEL_NAME       (optional) override model name
 *
 * Spec: docs/superpowers/specs/2026-08-25-notion-import-design.md §5.7
 *
 * NOTE: This script transitively imports `@notionhq/client` via
 * `libs/notion/index.ts` → `libs/notion/fetch.ts`. Until Task 7 lands
 * the package install, module load will fail with
 * "Cannot find module '@notionhq/client'". Smoke verification is
 * deferred — see `.superpowers/sdd/2026-08-25-notion-import/task-6-report.md`.
 */

import 'dotenv/config';
import {
  listAllPages,
  fetchPageBlocks,
  pageToMarkdown,
  diffNotion,
  type NotionDoc,
  type NotionFetchOptions,
  type PageMeta,
} from '../../libs/notion/index.js';
import {
  incrementalIndexFromSources,
  hashText,
  openMetaStore,
  type DocSource,
} from '../../libs/rag/index.js';
import { collectPagesRecursive, readMaxChildren, MAX_DEPTH, type CollectOpts } from './collect.js';

/* ============================================================
 * Constants — searchable + DRY
 * ============================================================ */

/** lancedb store URI (relative to repo root). */
const STORE_URI = '.lancedb/rag';
/** namespace for Notion chunk tables; meta table follows as `${TABLE_PREFIX}_meta`. */
const TABLE_PREFIX = 'chunks_notion';

/* ============================================================
 * CLI gating
 * ============================================================ */

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_CHILDREN: number | null = readMaxChildren();
if (MAX_CHILDREN !== null) {
  console.log(`--max-children cap: ${MAX_CHILDREN}`);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    console.error(`FATAL: env ${name} not set`);
    process.exit(1);
  }
  return v;
}

interface Args {
  readonly token: string;
  readonly apiKey: string;
  readonly baseUrl: string | undefined;
  readonly model: string | undefined;
}

function readArgs(): Args {
  return {
    token: requireEnv('NOTION_TOKEN'),
    apiKey: requireEnv('OPENAI_API_KEY'),
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.EMBEDDING_MODEL_NAME,
  };
}

/* ============================================================
 * NotionDoc construction (3 failure paths; see Hard-Red #5)
 * ============================================================ */

/**
 * Build a `NotionDoc` for a page that the SDK refused to return blocks for
 * (forbidden / not_found). Content is empty; `unreachable` flag tells the
 * diff + write adapter layers to pin dual-sentinel meta values.
 *
 * Why a helper, not an inline object literal: Task 4 D1 + Task 5 D3
 * carried-forward findings require BOTH `lastEditedMs: 0` AND
 * `lastEditedIso: ''` to be pinned together — extracting the literal
 * makes the constraint visible at every call site.
 */
function unreachableNotionDoc(meta: PageMeta, _reason: string): NotionDoc {
  return {
    pageId: meta.pageId,
    lastEditedMs: 0,
    lastEditedIso: '',
    sourceKind: 'notion',
    sourceLabel: meta.sourceLabel,
    content: '',
    unreachable: true,
  };
}

/**
 * Build a `NotionDoc` for a page whose blocks converted successfully.
 */
function successfulNotionDoc(meta: PageMeta, mdTitle: string, mdBody: string): NotionDoc {
  return {
    pageId: meta.pageId,
    lastEditedMs: meta.lastEditedMs,
    lastEditedIso: meta.lastEditedIso,
    sourceKind: 'notion',
    sourceLabel: meta.sourceLabel,
    content: `# ${mdTitle}\n${mdBody}`.trim(),
  };
}

/**
 * Convert `NotionDoc[]` → `DocSource[]` for `incrementalIndexFromSources`.
 *
 * Unreachable pages PIN both `updatedMs: 0` AND `contentHash: 'UNREACHABLE'`
 * — the worker does not special-case unreachable and writes these two
 * fields DIRECTLY into lancedb meta (Task 5 D3 carry-forward).
 *
 * Without the dual-sentinel pin, `diffNotion` reclassifies them as
 * `modified` on the next run (Task 4 D1) and the indexer re-embeds
 * known-empty content every import.
 */
function unreachableDocSource(d: NotionDoc): DocSource {
  return {
    sourceKey: d.pageId,
    sourceLabel: d.sourceLabel,
    content: d.content,
    sourceKind: 'notion',
    updatedMs: 0,
    contentHash: 'UNREACHABLE',
  };
}

/** Build DocSource for a reachable NotionDoc (regular content hash). */
function reachableDocSource(d: NotionDoc): DocSource {
  return {
    sourceKey: d.pageId,
    sourceLabel: d.sourceLabel,
    content: d.content,
    sourceKind: 'notion',
    updatedMs: d.lastEditedMs,
    contentHash: hashText(d.content),
  };
}

function toDocSources(docs: readonly NotionDoc[]): readonly DocSource[] {
  return docs.map((d) =>
    d.unreachable === true ? unreachableDocSource(d) : reachableDocSource(d),
  );
}

/* ============================================================
 * Stage 1 — Notion fetch + convert
 * ============================================================ */

async function buildNotionDocs(args: Args): Promise<readonly NotionDoc[]> {
  const fetchOpts: NotionFetchOptions = { auth: args.token, rateLimitMs: 350 };
  const start = Date.now();

  // Stage 1 — collect (seed + children + grandchildren up to MAX_DEPTH=3,
  // with cycle detect via visited Set + --max-children safety valve).
  const visited = new Set<string>();
  const collectOpts: CollectOpts = {
    fetchOpts,
    maxDepth: MAX_DEPTH,
    maxChildren: MAX_CHILDREN,
    visited,
  };
  const collected = await collectPagesRecursive(listAllPages(fetchOpts), collectOpts);

  // Stage 2 — process each CollectedPage independently into a NotionDoc.
  // Seed pages keep their own sourceLabel; children/grandchildren carry
  // the parent path so chunk-level provenance is preserved.
  const docs: NotionDoc[] = [];
  for (const cp of collected) {
    const blocksRes = await fetchPageBlocks(cp.meta.pageId, fetchOpts);

    if (!blocksRes.ok) {
      if (blocksRes.reason === 'forbidden' || blocksRes.reason === 'not_found') {
        docs.push(unreachableNotionDoc(cp.meta, blocksRes.reason));
        console.warn(`warn: ${cp.meta.pageId} ${blocksRes.reason}; marked unreachable`);
        continue;
      }
      throw new Error(`fetchPageBlocks failed for ${cp.meta.pageId}: ${blocksRes.reason}`);
    }

    const conv = pageToMarkdown(
      { id: cp.meta.pageId, properties: { title: { type: 'title', title: [] } } },
      blocksRes.blocks as unknown as readonly {
        readonly type: string;
        readonly [k: string]: unknown;
      }[],
    );
    const docMeta: PageMeta = {
      pageId: cp.meta.pageId,
      lastEditedMs: cp.meta.lastEditedMs,
      lastEditedIso: cp.meta.lastEditedIso,
      sourceLabel: cp.depth === 0 ? cp.meta.sourceLabel : cp.parentPath,
    };
    docs.push(successfulNotionDoc(docMeta, conv.title, conv.markdown));
  }

  const seedCount = collected.filter((c) => c.depth === 0).length;
  const childCount = collected.length - seedCount;
  const apiCalls = docs.length + collected.length; // blocks-fetch + getPageMeta per page
  const elapsedMs = Date.now() - start;
  const reqPerSec = apiCalls / (elapsedMs / 1000);
  console.log(
    `>>> Notion import${DRY_RUN ? ' (DRY-RUN)' : ''}: seedPages=${seedCount}, childPages=${childCount}, total=${docs.length} pages in ${elapsedMs}ms (~${reqPerSec.toFixed(1)} req/s)`,
  );
  return docs;
}

/* ============================================================
 * Stage 2 — load cached meta from lancedb
 * ============================================================ */

async function loadCachedMeta(): Promise<ReadonlyMap<string, { mtimeMs: number; hash: string }>> {
  const m = await openMetaStore(STORE_URI, TABLE_PREFIX);
  const all = await m.loadAll();
  return new Map(
    Array.from(all.entries()).map(([k, v]) => [k, { mtimeMs: v.mtimeMs, hash: v.hash }]),
  );
}

/* ============================================================
 * Stage 3 — entry point
 * ============================================================ */

async function main(): Promise<void> {
  // Spec §5.7: dry-run banner at top of report so the operator never
  // confuses a no-write run with a real import.

  const args = readArgs();

  const notionDocs = await buildNotionDocs(args);

  const cached = await loadCachedMeta();
  const diff = diffNotion(notionDocs, cached);
  console.log(
    `>>> Diff: +${diff.added.length} added, +${diff.modified.length} modified, -${diff.removed.length} removed, ${diff.unchanged.length} unchanged`,
  );

  if (DRY_RUN) {
    console.log(`DRY-RUN MODE: no writes to lancedb`);
    // Sample one reachable + one unreachable doc so the report shows the
    // shape without flushing the full list to stdout.
    const sampleReachable = notionDocs.find((d) => d.unreachable !== true);
    const sampleUnreachable = notionDocs.find((d) => d.unreachable === true);
    console.log(
      `>>> Dry-run sample: reachable=${sampleReachable?.pageId ?? '(none)'} bytes=${sampleReachable?.content.length ?? 0}; unreachable=${sampleUnreachable?.pageId ?? '(none)'}`,
    );
    return;
  }

  const sources = toDocSources(notionDocs);
  const report = await incrementalIndexFromSources(sources, {
    apiKey: args.apiKey,
    ...(args.baseUrl !== undefined ? { baseUrl: args.baseUrl } : {}),
    ...(args.model !== undefined ? { model: args.model } : {}),
    storeUri: STORE_URI,
    tablePrefix: TABLE_PREFIX,
  });

  console.log(
    `>>> Embed: heading=${report.headingChunksAdded}, paragraph=${report.paragraphChunksAdded} (fallback: ${JSON.stringify(report.embedFallbacks)})`,
  );
  console.log(
    `>>> Write: ${report.headingChunksAdded + report.paragraphChunksAdded} chunks in ${report.phases.addMs}ms`,
  );
  if (report.failedDocSources.length > 0) {
    console.warn(`>>> WARN: ${report.failedDocSources.length} source(s) failed embedding entirely`);
  }
  console.log(`>>> Total: ${report.phases.totalMs}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
