/**
 * examples/md_import/main.ts
 *
 * 把 md 文件目录导入到本地 RAG 索引。
 *
 * 用法：
 *   npx tsx examples/md_import/main.ts                    # 全量导入
 *   npx tsx examples/md_import/main.ts --dry-run          # 不写库
 *   npx tsx examples/md_import/main.ts --source <dir>     # 指定源目录
 *
 * 必需环境变量：
 *   OPENAI_API_KEY    Embedding API key
 *   OPENAI_BASE_URL   （可选）自定义 embedding 网关
 *   EMBEDDING_MODEL_NAME  （可选）覆盖模型名
 *   MD_SOURCE_DIR     （可选）默认 ./notes
 *
 * Spec: docs/superpowers/specs/2026-08-26-day14-notion-md-rag-ui-design.md
 *
 * stdout 4 phase marker 与 notion_import 对齐（供 API 层 parse）：
 *   >>> Notion import: ...     → name='fetch' （注意：这里复用 fetch phase 名）
 *   >>> Diff: +N added, ...
 *   >>> Embed: heading=N paragraph=M
 *   >>> Write: N chunks in Nms
 */

import 'dotenv/config';
import { join } from 'node:path';
import {
  incrementalIndexFromSources,
  openMetaStore,
  type DocSource,
} from '../../libs/rag/index.js';
import { listMdFiles, readMdFile } from './collect.js';

const STORE_URI = '.lancedb/rag';
const TABLE_PREFIX = 'chunks_md';

const DRY_RUN = process.argv.includes('--dry-run');
const sourceIdx = process.argv.indexOf('--source');
const SOURCE_DIR =
  sourceIdx > 0 ? process.argv[sourceIdx + 1]! : (process.env['MD_SOURCE_DIR'] ?? './notes');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    console.error(`FATAL: env ${name} not set`);
    process.exit(1);
  }
  return v;
}

async function loadCachedMeta(): Promise<ReadonlyMap<string, { mtimeMs: number; hash: string }>> {
  const m = await openMetaStore(STORE_URI, TABLE_PREFIX);
  const all = await m.loadAll();
  return new Map(
    Array.from(all.entries()).map(([k, v]) => [k, { mtimeMs: v.mtimeMs, hash: v.hash }]),
  );
}

async function main(): Promise<void> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const baseUrl = process.env['OPENAI_BASE_URL'];
  const model = process.env['EMBEDDING_MODEL_NAME'];
  const absSource = join(process.cwd(), SOURCE_DIR);

  const start = Date.now();
  const absFiles = listMdFiles(absSource);
  const docs = absFiles.map((f) => readMdFile(f, absSource));
  const elapsed = Date.now() - start;

  console.log(
    `>>> Notion import${DRY_RUN ? ' (DRY-RUN)' : ''}: seedPages=${docs.length}, childPages=0, total=${docs.length} pages in ${elapsed}ms`,
  );

  const cached = await loadCachedMeta();

  // 用 path 作为 sourceKey
  const cachedKeyed = new Map<string, { mtimeMs: number; hash: string }>();
  for (const [k, v] of cached) cachedKeyed.set(k, v);

  // diff
  const added = docs.filter((d) => !cachedKeyed.has(d.path)).length;
  const modified = docs.filter((d) => {
    const c = cachedKeyed.get(d.path);
    return c !== undefined && c.hash !== d.contentHash;
  }).length;
  const removed = Array.from(cachedKeyed.keys()).filter(
    (k) => !docs.some((d) => d.path === k),
  ).length;
  const unchanged = docs.length - added - modified;

  console.log(
    `>>> Diff: +${added} added, +${modified} modified, -${removed} removed, ${unchanged} unchanged`,
  );

  if (DRY_RUN) {
    console.log(`DRY-RUN MODE: no writes to lancedb`);
    return;
  }

  const sources: DocSource[] = docs.map((d) => ({
    sourceKey: d.path,
    sourceLabel: d.path,
    content: d.content,
    sourceKind: 'md',
    updatedMs: d.mtimeMs,
    contentHash: d.contentHash,
  }));

  const report = await incrementalIndexFromSources(sources, {
    apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(model !== undefined ? { model } : {}),
    storeUri: STORE_URI,
    tablePrefix: TABLE_PREFIX,
  });

  console.log(
    `>>> Embed: heading=${report.headingChunksAdded} paragraph=${report.paragraphChunksAdded} (fallback: ${JSON.stringify(report.embedFallbacks)})`,
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
