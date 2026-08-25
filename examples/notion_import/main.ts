/**
 * examples/notion_import/main.ts
 *
 * 把个人 Notion workspace 导入到本地 RAG 索引。
 *
 * 用法：
 *   npx tsx examples/notion_import/main.ts                # 全量导入
 *   npx tsx examples/notion_import/main.ts --dry-run      # fetch + diff + convert，不写库
 *
 * 必需环境变量：
 *   NOTION_TOKEN               Notion 内部集成的 secret
 *   OPENAI_API_KEY             Embedding API key
 *   OPENAI_BASE_URL            （可选）自定义 embedding 网关
 *   EMBEDDING_MODEL_NAME       （可选）覆盖模型名
 *
 * Spec：docs/superpowers/specs/2026-08-25-notion-import-design.md §5.7
 *
 * NOTE：本脚本通过 `libs/notion/index.ts` → `libs/notion/fetch.ts`
 * 间接 import `@notionhq/client`。在 Task 7 把这个包安装好之前，
 * 模块加载会失败并报 "Cannot find module '@notionhq/client'"。
 * smoke 验证被推迟 —— 见 `.superpowers/sdd/2026-08-25-notion-import/task-6-report.md`。
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

/** lancedb store URI（相对仓库根目录）。 */
const STORE_URI = '.lancedb/rag';
/** Notion chunk 表的 namespace；meta 表名跟它走 `${TABLE_PREFIX}_meta`。 */
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
 * 为 SDK 拒绝返回 blocks 的页面（forbidden / not_found）构造一个 `NotionDoc`。
 * content 为空；`unreachable` 标记告诉 diff + write adapter 层
 * 把两个 sentinel 元数据值都固定住。
 *
 * 为什么抽成 helper 而不是行内对象字面量：Task 4 D1 + Task 5 D3
 * 的 carry-forward 结论要求同时固定 `lastEditedMs: 0` 和
 * `lastEditedIso: ''` 两项 —— 抽出来后这个约束在每个调用点都可见。
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
 * 为 blocks 转换成功的页面构造 `NotionDoc`。
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
 * 把 `NotionDoc[]` 转成 `DocSource[]` 给 `incrementalIndexFromSources` 用。
 *
 * 不可达页面同时固定 `updatedMs: 0` 和 `contentHash: 'UNREACHABLE'` 两项
 * —— worker 不对 unreachable 做特殊处理，会把这两个字段直接写入 lancedb meta
 * （Task 5 D3 carry-forward）。
 *
 * 没有这个双 sentinel 固定，下次运行时 `diffNotion` 会把它们重新归类为
 * `modified`（Task 4 D1），indexer 会反复把已知为空的内容重新 embed。
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

/** 为可达的 NotionDoc 构造 DocSource（用正常的内容 hash）。 */
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

  // Stage 1 — 采集（seed + child + grandchild，最深 MAX_DEPTH=3，
  // 用 visited Set 做环检测 + --max-children 安全阀）。
  const visited = new Set<string>();
  const collectOpts: CollectOpts = {
    fetchOpts,
    maxDepth: MAX_DEPTH,
    maxChildren: MAX_CHILDREN,
    visited,
  };
  const collected = await collectPagesRecursive(listAllPages(fetchOpts), collectOpts);

  // Stage 2 — 把每个 CollectedPage 独立处理成 NotionDoc。
  // Seed 页面保留自己的 sourceLabel；child / grandchild 携带 parent path，
  // 让 chunk 级别能保留溯源信息。
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
  // 每页各一次 blocks-fetch + 一次 getPageMeta
  const apiCalls = docs.length + collected.length;
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
  // Spec §5.7：dry-run 横幅放在报告开头，防止操作员把不写库的运行当成真正导入。

  const args = readArgs();

  const notionDocs = await buildNotionDocs(args);

  const cached = await loadCachedMeta();
  const diff = diffNotion(notionDocs, cached);
  console.log(
    `>>> Diff: +${diff.added.length} added, +${diff.modified.length} modified, -${diff.removed.length} removed, ${diff.unchanged.length} unchanged`,
  );

  if (DRY_RUN) {
    console.log(`DRY-RUN MODE: no writes to lancedb`);
    // 各采一个 reachable + 一个 unreachable 的样例，让报告能看到结构
    // 又不用把整张列表刷到 stdout 上。
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
