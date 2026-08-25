import { diffDocs, type DiffResult, hashText } from '../rag/indexer.js';
import type { NotionDoc } from './to-markdown.js';

export function diffNotion(
  current: readonly NotionDoc[],
  cached: ReadonlyMap<string, { readonly mtimeMs: number; readonly hash: string }>,
): DiffResult {
  return diffDocs(
    current.map((d) => ({
      source: d.pageId,
      // unreachable pages are pinned to mtimeMs=0 + hash='UNREACHABLE' so
      // they match the cached sentinel entry written on the prior failed
      // fetch and diffDocs() classifies them as `unchanged` (stable skip).
      // diffDocs compares both mtimeMs and hash; pinning only the hash
      // would still trip the mtime check on real lastEditedMs values.
      mtimeMs: d.unreachable === true ? 0 : d.lastEditedMs,
      hash: d.unreachable === true ? 'UNREACHABLE' : hashText(d.content),
    })),
    cached as ReadonlyMap<string, { source: string; mtimeMs: number; hash: string; chunkCount: { heading: number; paragraph: number } }>,
  );
}