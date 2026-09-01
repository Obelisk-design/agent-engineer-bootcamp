/**
 * libs/notion/child-pages.ts
 *
 * Identify child_page block ids in a raw Notion blocks array so the
 * orchestrator can recurse into them.
 *
 * Spec context: §5.2 of 2026-08-25-notion-import-design.md commits the
 * recursive expansion (depth=3 + cycle detect) to the orchestrator layer.
 * `pageToMarkdown` stays a pure function that silently drops child_page
 * blocks; this helper extracts the child_page ids from raw block arrays
 * so the orchestrator can fetch each child independently.
 */

/**
 * Extract child_page block ids from a Notion blocks array.
 *
 * Returns ids in the SAME NORMALIZED FORMAT as `fetch.ts` pageId convention
 * (32 chars, hyphens stripped via `id.replace(/-/g, '')`) so the orchestrator's
 * visited `Set<string>` lookups stay consistent across listAllPages and
 * child lookups.
 *
 * Skips blocks that are not child_page, or that lack a string id.
 */
export function extractChildPageIds(blocks: readonly Record<string, unknown>[]): readonly string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b['type'] !== 'child_page') continue;
    const id = b['id'];
    if (typeof id !== 'string' || id.length === 0) continue;
    out.push(id.replace(/-/g, ''));
  }
  return out;
}
