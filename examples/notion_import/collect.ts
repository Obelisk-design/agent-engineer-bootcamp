/**
 * examples/notion_import/collect.ts
 *
 * Pure orchestrator for child_page recursion. Extracted from main.ts so
 * integration tests can drive it with a fake MinimalClient (no dotenv,
 * no process.exit, no IO at module load).
 *
 * Spec context: §5.2 of 2026-08-25-notion-import-design.md commits the
 * recursive expansion (depth=3 + cycle detect) to the orchestrator layer;
 * `pageToMarkdown` stays a pure function that drops child_page blocks.
 *
 * Locked rulings:
 *   - depth=3 = 3 levels INCLUDING seed (0=seed, 1=child, 2=grandchild).
 *     `if (depth > maxDepth) return;` (allows 0/1/2 at maxDepth=3).
 *   - parent-path separator: " / " (slash + single-space padding).
 *   - cycle short-circuit: visited Set hit stops at any depth.
 *   - --max-children default null (unlimited). Spec §R4 lists it as a
 *     safety valve, not the default.
 */

import {
  extractChildPageIds,
  fetchPageBlocks,
  fetchPageBlocksWithClient,
  getPageMeta,
  getPageMetaWithClient,
} from '../../libs/notion/index.js';
import type {
  MinimalClient,
  NotionFetchOptions,
  PageMeta,
  FetchPageResult,
} from '../../libs/notion/index.js';

/** Maximum recursion depth including the seed (0/1/2 with default 3). */
export const MAX_DEPTH = 3;

/**
 * Parse `--max-children <N>` CLI flag (safety valve against runaway
 * workspaces; default null = unlimited per spec §R4).
 */
export function readMaxChildren(): number | null {
  const i = process.argv.indexOf('--max-children');
  if (i < 0) return null;
  const raw = process.argv[i + 1];
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface CollectedPage {
  readonly meta: PageMeta;
  readonly parentPath: string;
  readonly depth: number;
}

export interface CollectOpts {
  readonly fetchOpts: NotionFetchOptions;
  readonly maxDepth: number;
  readonly maxChildren: number | null;
  readonly visited: Set<string>;
  /**
   * Optional injection seam for tests. When provided, used INSTEAD of the
   * production fetchPageBlocks + getPageMeta. Production callers omit this.
   */
  readonly client?: MinimalClient;
}

/**
 * Walk child_page blocks of `parentPageId` and yield each child as a
 * CollectedPage. Recurses depth-first into grandchildren up to maxDepth.
 *
 * `yieldFn` returns false to abort the recursion (used by collectPagesRecursive
 * to enforce --max-children cap).
 */
export async function recurseIntoChildren(
  parentPageId: string,
  parentPath: string,
  opts: CollectOpts,
  depth: number,
  yieldFn: (cp: CollectedPage) => boolean,
): Promise<void> {
  if (depth > opts.maxDepth) return;
  const blocksRes: FetchPageResult = opts.client !== undefined
    ? await fetchPageBlocksWithClient(parentPageId, opts.client, opts.fetchOpts)
    : await fetchPageBlocks(parentPageId, opts.fetchOpts);
  if (!blocksRes.ok) return;
  const childIds = extractChildPageIds(
    blocksRes.blocks as readonly Record<string, unknown>[],
  );
  for (const childId of childIds) {
    if (opts.visited.has(childId)) {
      console.warn(`cycle: skip child ${childId} of ${parentPageId} (already visited)`);
      continue;
    }
    opts.visited.add(childId);
    const childMeta: PageMeta = opts.client !== undefined
      ? await getPageMetaWithClient(childId, opts.client, opts.fetchOpts)
      : await getPageMeta(childId, opts.fetchOpts);
    const newPath = `${parentPath} / ${childMeta.sourceLabel}`;
    if (!yieldFn({ meta: childMeta, parentPath: newPath, depth })) return;
    await recurseIntoChildren(childId, newPath, opts, depth + 1, yieldFn);
  }
}

/**
 * Yield each seed page (and its recursively-enumerated children) as a
 * CollectedPage. Caller is responsible for setting up `opts.visited` with
 * any pre-known ids (e.g. seeds already enumerated by listAllPages) so
 * the same page never appears twice across the run.
 */
export async function collectPagesRecursive(
  seedPages: AsyncIterable<PageMeta>,
  opts: CollectOpts,
): Promise<readonly CollectedPage[]> {
  const out: CollectedPage[] = [];
  let childrenCount = 0;
  for await (const seedMeta of seedPages) {
    const normId = seedMeta.pageId;
    if (opts.visited.has(normId)) {
      console.warn(`cycle: skip ${normId} (already visited)`);
      continue;
    }
    opts.visited.add(normId);
    out.push({ meta: seedMeta, parentPath: seedMeta.sourceLabel, depth: 0 });
    await recurseIntoChildren(seedMeta.pageId, seedMeta.sourceLabel, opts, 1, (cp) => {
      if (opts.maxChildren !== null && childrenCount >= opts.maxChildren) {
        console.warn(`--max-children cap (${opts.maxChildren}) reached; skipping further children`);
        return false;
      }
      out.push(cp);
      childrenCount += 1;
      return true;
    });
  }
  return out;
}
