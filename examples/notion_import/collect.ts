/**
 * examples/notion_import/collect.ts
 *
 * child_page 递归的纯 orchestrator。从 main.ts 抽出来，方便集成测试用
 * MinimalClient fake 驱动它（无 dotenv、无 process.exit、模块加载时不触发 IO）。
 *
 * Spec 背景：2026-08-25-notion-import-design.md 的 §5.2 把递归展开
 * （depth=3 + 环检测）落到 orchestrator 层；`pageToMarkdown` 保持纯函数，
 * 直接丢掉 child_page 块。
 *
 * 锁定的规则：
 *   - depth=3 = 含 seed 共 3 层（0=seed，1=child，2=grandchild）。
 *     用 `if (depth > maxDepth) return;`（maxDepth=3 时允许 0/1/2）。
 *   - parent-path 分隔符：" / "（斜杠 + 单空格填充）。
 *   - 环短路：visited Set 命中时任何 depth 都直接停止。
 *   - --max-children 默认 null（无限）。spec §R4 把它列为安全阀，不是默认项。
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

/** 含 seed 的最大递归深度（默认 3 时实际是 0/1/2）。 */
export const MAX_DEPTH = 3;

/**
 * 解析 `--max-children <N>` CLI 参数（防止 workspace 失控的安全阀；
 * 默认 null = 无限，按 spec §R4 规定）。
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
   * 测试用的可选注入接缝。传入时，会用它代替生产环境下的
   * fetchPageBlocks + getPageMeta。生产环境的调用方不要传这个字段。
   */
  readonly client?: MinimalClient;
}

/**
 * 遍历 `parentPageId` 的 child_page 块，把每个 child 作为 CollectedPage yield 出去。
 * 深度优先递归到 grandchild，最深到 maxDepth。
 *
 * `yieldFn` 返回 false 时中止递归（collectPagesRecursive 用这个机制
 * 来落实 --max-children 上限）。
 */
export async function recurseIntoChildren(
  parentPageId: string,
  parentPath: string,
  opts: CollectOpts,
  depth: number,
  yieldFn: (cp: CollectedPage) => boolean,
): Promise<void> {
  if (depth > opts.maxDepth) return;
  const blocksRes: FetchPageResult =
    opts.client !== undefined
      ? await fetchPageBlocksWithClient(parentPageId, opts.client, opts.fetchOpts)
      : await fetchPageBlocks(parentPageId, opts.fetchOpts);
  if (!blocksRes.ok) return;
  const childIds = extractChildPageIds(blocksRes.blocks as readonly Record<string, unknown>[]);
  for (const childId of childIds) {
    if (opts.visited.has(childId)) {
      console.warn(`cycle: skip child ${childId} of ${parentPageId} (already visited)`);
      continue;
    }
    opts.visited.add(childId);
    const childMeta: PageMeta =
      opts.client !== undefined
        ? await getPageMetaWithClient(childId, opts.client, opts.fetchOpts)
        : await getPageMeta(childId, opts.fetchOpts);
    const newPath = `${parentPath} / ${childMeta.sourceLabel}`;
    if (!yieldFn({ meta: childMeta, parentPath: newPath, depth })) return;
    await recurseIntoChildren(childId, newPath, opts, depth + 1, yieldFn);
  }
}

/**
 * 把每个 seed 页面（以及它递归枚举出来的子页面）作为 CollectedPage yield 出去。
 * 调用方负责把已经预先知道的 id 放进 `opts.visited`（比如已被 listAllPages
 * 枚举过的 seeds），确保同一个页面在整次运行里不会出现两次。
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
