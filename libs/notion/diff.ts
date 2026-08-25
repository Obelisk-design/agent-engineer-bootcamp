import { diffDocs, type DiffResult, hashText } from '../rag/indexer.js';
import type { NotionDoc } from './to-markdown.js';

export function diffNotion(
  current: readonly NotionDoc[],
  cached: ReadonlyMap<string, { readonly mtimeMs: number; readonly hash: string }>,
): DiffResult {
  return diffDocs(
    current.map((d) => ({
      source: d.pageId,
      // 不可达的页面固定为 mtimeMs=0 + hash='UNREACHABLE'，让它们和上次失败 fetch 时
      // 写入缓存的 sentinel 条目保持一致，diffDocs() 会把它们归类为 `unchanged`（稳定跳过）。
      // diffDocs 同时比较 mtimeMs 和 hash；只固定 hash 仍然会在真实 lastEditedMs 上触发 mtime 检查。
      mtimeMs: d.unreachable === true ? 0 : d.lastEditedMs,
      hash: d.unreachable === true ? 'UNREACHABLE' : hashText(d.content),
    })),
    cached as ReadonlyMap<
      string,
      {
        source: string;
        mtimeMs: number;
        hash: string;
        chunkCount: { heading: number; paragraph: number };
      }
    >,
  );
}
