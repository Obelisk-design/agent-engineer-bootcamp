/**
 * examples/day24/ex_002_verify_gt.ts
 *
 * 校验版本表的 chunk_id 是否稳定 + GT expectedChunkIds 是否仍有效。
 *
 * 用法：
 *   pnpm exec tsx examples/day24/ex_002_verify_gt.ts --corpus corporate --version v1
 *
 * 做三件事：
 *   1. 拉指定版本表（chunks_{corpus}_{version}_heading）全量 chunk_id
 *   2. 若 v1：对比旧表 chunks_corporate_heading（ex_000 产物）的 id，
 *      验证"版本化重入"是否逐字复现 chunk_id（命门 1：不改变 chunk_id → GT 有效）
 *   3. 读 gt-dataset.json，算每条 query 的 expectedChunkIds 是否全在当前版本表
 *      （v2 清洗改内容时 #NNN 会漂移 → 这里能看到多少条 GT 变 stale）
 *
 * 周一清洗后入 v2 再跑一次 --version v2，看 stale 数量评估对比可行性。
 *
 * Windows lancedb 堆：命令行带 NODE_OPTIONS=--max-old-space-size=4096
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import * as lancedb from '@lancedb/lancedb';

interface Args {
  readonly corpus: 'corporate' | 'docs';
  readonly version: string;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i > 0 ? argv[i + 1] : undefined;
  };
  const corpus = get('--corpus');
  const version = get('--version');
  if (corpus !== 'corporate' && corpus !== 'docs') throw new Error('必须 --corpus corporate|docs');
  if (!version) throw new Error('必须 --version v1|v2');
  return { corpus, version };
}

const CORPUS_URI = { corporate: '.lancedb/corporate', docs: '.lancedb/docs' } as const;
const GT_PATH = 'examples/day22/gt-dataset.json';

/** 拉一张表全量 chunk_id（直接 lancedb query，不走 vector search，最可靠）。 */
async function fetchAllIds(uri: string, tableName: string): Promise<Set<string>> {
  const db = await lancedb.connect(uri);
  const existing = await db.tableNames();
  if (!existing.includes(tableName)) return new Set();
  const t = await db.openTable(tableName);
  const rows = (await t.query().select(['id']).toArray()) as { id: string }[];
  return new Set(rows.map((r) => String(r.id)));
}

interface GtQuery {
  readonly id: string;
  readonly query: string;
  readonly expectedChunkIds: readonly string[];
}
interface GtDataset {
  readonly version: string;
  readonly queries: readonly GtQuery[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = CORPUS_URI[args.corpus];
  const versionTable = `chunks_${args.corpus}_${args.version}_heading`;

  console.log(`>>> 校验 ${uri}/${versionTable}`);
  const versionIds = await fetchAllIds(uri, versionTable);
  console.log(`>>> 版本表 chunk_id: ${versionIds.size}`);
  if (versionIds.size === 0) {
    console.warn('!!! 版本表为空或不存在，先跑 index-corpus.ts 入库');
    return;
  }

  // 1. v1 对比旧表（ex_000 产物 chunks_corporate_heading）
  if (args.corpus === 'corporate' && args.version === 'v1') {
    const oldIds = await fetchAllIds(uri, 'chunks_corporate_heading');
    const onlyNew: string[] = [];
    const onlyOld: string[] = [];
    for (const id of versionIds) if (!oldIds.has(id)) onlyNew.push(id);
    for (const id of oldIds) if (!versionIds.has(id)) onlyOld.push(id);
    console.log(`\n=== v1 vs 旧表(chunks_corporate_heading) ===`);
    console.log(`旧表 id: ${oldIds.size} / 新表 id: ${versionIds.size}`);
    console.log(`共同: ${versionIds.size - onlyNew.length}`);
    console.log(`仅新表: ${onlyNew.length} ${onlyNew.slice(0, 5).join(', ')}`);
    console.log(`仅旧表: ${onlyOld.length} ${onlyOld.slice(0, 5).join(', ')}`);
    if (onlyNew.length === 0 && onlyOld.length === 0) {
      console.log('✅ chunk_id 逐字一致 —— GT expectedChunkIds 对 v1 有效');
    } else {
      console.warn('⚠️ chunk_id 不一致 —— GT 可能部分失效，见下面 stale 统计');
    }
  }

  // 2. GT 有效性
  const raw = await readFile(GT_PATH, 'utf8');
  const gt = JSON.parse(raw) as GtDataset;
  let allHit = 0;
  let stale: GtQuery[] = [];
  for (const q of gt.queries) {
    const ok = q.expectedChunkIds.length > 0 && q.expectedChunkIds.every((cid) => versionIds.has(cid));
    if (ok) allHit++;
    else stale.push(q);
  }
  console.log(`\n=== GT 有效性（${GT_PATH}，共 ${gt.queries.length} 条） ===`);
  console.log(`全命中: ${allHit} / stale: ${stale.length}`);
  if (stale.length > 0) {
    console.log(`stale 的 query: ${stale.map((q) => q.id).join(', ')}`);
  }
}

main().catch((err) => {
  console.error('verify 异常：', err);
  process.exit(1);
});
