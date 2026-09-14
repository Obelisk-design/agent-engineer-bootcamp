/**
 * examples/day24/index-corpus.ts
 *
 * Day 24 版本化增量入库：docs + corporate-docs 两语料入 lancedb，按版本建表。
 *
 * 用法：
 *   pnpm exec tsx examples/day24/index-corpus.ts --corpus corporate --version v1
 *   pnpm exec tsx examples/day24/index-corpus.ts --corpus corporate --version v2 --dry-run
 *   pnpm exec tsx examples/day24/index-corpus.ts --corpus docs --version v1
 *
 * 表命名（版本前缀，ADR 0004 双表对称这里单 heading 表）：
 *   .lancedb/{corpus}/chunks_{corpus}_{version}_heading   向量表
 *   .lancedb/{corpus}/chunks_{corpus}_{version}_meta      增量 meta 表
 *
 * 为什么自写 embed+add 循环而不走 incrementalIndexFromSources（命门 1）：
 *   runIncrementalIndex 内部用 markdown chunker（chunkByHeadingSmart）且 id 不补零，
 *   走它会改变 chunk_id → GT expectedChunkIds 全失效。本脚本复用 Day 13 的
 *   diffDocs / hashText / openMetaStore（diff 引擎大脑），embed+add 照抄 ex_000
 *   （Day 21 多格式 chunkText + 无条件入库含 fallback），保证 chunk_id 逐字复现。
 *
 * 增量优化：
 *   - 每文件 extract（本地 CPU，便宜）+ hashText（SHA-256）
 *   - diffDocs 对比 cached meta → added / modified / removed
 *   - 只对 changed 的文件 embed（HTTP，贵）+ reindex
 *   - changed = hash 变 → 文件内容变才重嵌，未变全 skip
 *
 * 增量互删红线（memory dev-gateway-embedding-drift 实踩 2 次）：
 *   diffDocs 语义 = 本次传入 sources 全集，未传入的 source 算 removed 被删。
 *   → 每次入库必须传该 version 的【完整语料目录】，不能只传新增文件。
 *
 * Windows lancedb 堆（Day 23 memory）：
 *   200 份多格式 + lancedb meta scan 需 ~4GB 堆。命令行跑建议带
 *   NODE_OPTIONS=--max-old-space-size=4096（见 package.json ingest 脚本）。
 */

import 'dotenv/config';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  hashText,
  diffDocs,
  openMetaStore,
  openVectorStore,
  type DocSource,
  type DocMeta,
  type VectorRecord,
} from '../../libs/rag/index.js';
import { embed } from '../../libs/embedding/embed.js';
import { buildManifest } from '../day21/rag-ready/manifest.js';
import { extractByFile } from '../day21/rag-ready/extractors.js';
import { chunkText } from '../day21/rag-ready/chunker.js';

/* ============================================================
 * 参数解析
 * ============================================================ */

interface Args {
  readonly corpus: 'corporate' | 'docs';
  readonly version: string; // 'v1' | 'v2' | ...
  readonly dryRun: boolean;
  readonly force: boolean; // 强制全量重 embed（修 fallback / 调试）
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i > 0 ? argv[i + 1] : undefined;
  };
  const corpus = get('--corpus');
  const version = get('--version');
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');
  if (corpus !== 'corporate' && corpus !== 'docs') {
    throw new Error('必须 --corpus corporate|docs');
  }
  if (!version || !/^v\d+$/.test(version)) {
    throw new Error('必须 --version v1|v2|...');
  }
  return { corpus, version, dryRun, force };
}

/* ============================================================
 * 语料定位：每个 corpus 的目录 / lancedb uri / sourceKey 规则
 * ============================================================ */

const CORPUS_DIR = {
  corporate: 'tests/fixtures/corporate-docs',
  docs: 'docs',
} as const;

// corporate 沿用 Day 22 现有 .lancedb/corporate 目录；docs 用独立 .lancedb/docs
const CORPUS_URI = {
  corporate: '.lancedb/corporate',
  docs: '.lancedb/docs',
} as const;

/* ============================================================
 * 扫描语料 → DocSource[]
 *   - corporate：buildManifest（NNN_ 文件名）→ extractByFile → sourceKey = filename
 *   - docs：递归扫 *.md → sourceKey = 相对 repo root 路径
 *   只收 extract 成功的（图片 / 空文本 skip，不入库不入 meta）
 * ============================================================ */

async function statMs(absPath: string): Promise<number> {
  const st = await stat(absPath);
  return st.mtimeMs;
}

async function collectCorporate(dir: string): Promise<readonly DocSource[]> {
  const manifest = await buildManifest(dir);
  const out: DocSource[] = [];
  for (const entry of manifest) {
    const buf = await readFile(join(dir, entry.filename));
    const extracted = await extractByFile(entry.filename, buf);
    // 图片（text_unavailable）/ 抽取失败 / 文本过短 → skip（ex_000 口径：text.length < 10 算空）
    if (!extracted.ok || extracted.text.length < 10) continue;
    out.push({
      sourceKey: entry.filename, // ex_000 一致：sourceKey = filename（决定 chunk_id 前缀）
      sourceLabel: entry.filename,
      content: extracted.text,
      sourceKind: 'fixture',
      updatedMs: await statMs(join(dir, entry.filename)),
      contentHash: hashText(extracted.text),
    });
  }
  return out;
}

// 递归收集目录下所有 .md（跳过隐藏文件 / 目录）
async function listMdRecursive(absDir: string, out: string[]): Promise<void> {
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(absDir, e.name);
    if (e.isDirectory()) {
      await listMdRecursive(full, out);
    } else if (e.name.endsWith('.md')) {
      out.push(full);
    }
  }
}

async function collectDocs(repoRoot: string, dir: string): Promise<readonly DocSource[]> {
  const absDir = join(repoRoot, dir);
  const mdPaths: string[] = [];
  await listMdRecursive(absDir, mdPaths);
  const out: DocSource[] = [];
  for (const full of mdPaths) {
    const buf = await readFile(full);
    const extracted = await extractByFile(full, buf); // .md → extractPlainText
    if (!extracted.ok || extracted.text.length < 10) continue;
    // sourceKey = 相对 repo root 路径（防跨子目录重名；docs 无 GT 约束，自由）
    const relPath = relative(repoRoot, full);
    out.push({
      sourceKey: relPath,
      sourceLabel: relPath,
      content: extracted.text,
      sourceKind: 'daily',
      updatedMs: await statMs(full),
      contentHash: hashText(extracted.text),
    });
  }
  return out;
}

/* ============================================================
 * inListFilter —— indexer.ts 里是模块私有未导出，这里自拼
 *   转义反斜杠 + 双引号（同 indexer.ts:538 逻辑）
 * ============================================================ */

function inListFilter(sources: readonly string[]): string {
  return `source IN (${sources.map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}

/* ============================================================
 * 主流程
 * ============================================================ */

async function main(): Promise<void> {
  // 用完整 process.argv（node 路径 + 脚本路径占 index 0/1），与 md_import 一致；
  // parseArgs 的 indexOf 对 --flag 自然落在 ≥2，get 用 i>0 取下一个 token。
  const args = parseArgs(process.argv);
  const repoRoot = process.cwd();
  const dir = CORPUS_DIR[args.corpus];
  const uri = CORPUS_URI[args.corpus];
  const tablePrefix = `chunks_${args.corpus}_${args.version}`;
  const headingTable = `${tablePrefix}_heading`;

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const embedModel = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!embedModel) throw new Error('EMBEDDING_MODEL_NAME is required');

  console.log(`>>> corpus=${args.corpus} version=${args.version} dryRun=${args.dryRun}`);
  console.log(`>>> 表: ${uri}/${headingTable} (meta: ${tablePrefix}_meta)`);

  const t0 = Date.now();
  // 1. 扫描 + extract + hash
  const sources =
    args.corpus === 'corporate' ? await collectCorporate(dir) : await collectDocs(repoRoot, dir);
  console.log(`>>> 抽取成功 source: ${sources.length}（图片/空 skip）`);

  // 2. open meta store + loadAll
  const meta = await openMetaStore(uri, tablePrefix);
  const cached = await meta.loadAll();

  // 3. diff
  const sourcesView = sources.map((s) => ({
    source: s.sourceKey,
    mtimeMs: s.updatedMs,
    hash: s.contentHash,
  }));
  // force = 强制全量重 embed（修 fallback / 调试）：全部当 added，cached 全当 removed
  const diff = args.force
    ? {
        added: sources.map((s) => s.sourceKey),
        modified: [] as string[],
        removed: Array.from(cached.keys()),
        unchanged: [] as string[],
      }
    : diffDocs(sourcesView, cached);
  console.log(
    `>>> Diff: +${diff.added.length} added, +${diff.modified.length} modified, ` +
      `-${diff.removed.length} removed, ${diff.unchanged.length} unchanged${args.force ? ' (force)' : ''}`,
  );

  if (args.dryRun) {
    console.log('DRY-RUN MODE: no writes to lancedb');
    return;
  }

  const headingStore = await openVectorStore(uri, headingTable);
  const toReindex = [...diff.added, ...diff.modified];
  const sourcesMap = new Map(sources.map((s) => [s.sourceKey, s]));
  // corporate：manifest 文件名 → category（chunkText 的 category 参数）。循环前建一次。
  let categoryMap = new Map<string, string>();
  if (args.corpus === 'corporate') {
    const m = await buildManifest(CORPUS_DIR.corporate);
    categoryMap = new Map(m.map((e) => [e.filename, e.category]));
  }
  const resolveCategory = (key: string): string =>
    args.corpus === 'docs' ? 'docs' : (categoryMap.get(key) ?? 'unknown');

  // 4. removed → 清旧 chunk + meta
  if (diff.removed.length > 0) {
    const filter = inListFilter(diff.removed);
    await headingStore.delete(filter);
    await meta.deleteSources(diff.removed);
    console.log(`>>> removed ${diff.removed.length} → 清旧 chunk + meta`);
  }

  // 5. toReindex → 先清旧 chunk（幂等）再 embed + add
  let chunksAdded = 0;
  let embedFallback = 0;
  let embedCalls = 0;
  const newMetas: DocMeta[] = [];
  const failedDocs: string[] = [];
  for (const source of toReindex) {
    const src = sourcesMap.get(source);
    if (src === undefined) continue;

    // 先清该 source 的旧 chunk（modified 场景；added 场景表里本来没有）
    await headingStore.delete(inListFilter([src.sourceKey]));

    // chunk（照抄 ex_000：sourceFile = sourceLabel，corporate = filename）
    const chunks = chunkText(src.sourceLabel, resolveCategory(src.sourceKey), src.content);
    if (chunks.length === 0) continue;

    const result = await embed(
      {
        input: chunks.map((c) => c.text),
        model: embedModel,
        baseUrl,
      },
      apiKey,
    );
    embedCalls++;

    // 入库（含 fallback 占位），source = sourceLabel，id = chunk_id（ex_000 口径）
    // 守卫：跳过完全失败的 v（v.length===0）。embed.ts 里 embed 全挂会 push([])，
    // 空数组进 lancedb createTable 会让 Arrow 推不出 vector 列类型 → 崩（docs 首跑实踩）。
    // fallback 成功时 v 是 4096 维占位（length≠0），仍入库 —— 保住 chunk_id 存在（GT 有效）。
    const records: VectorRecord[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]!;
      const v = result.vectors[i]!;
      if (result.fallbackFlags[i] === true) embedFallback++;
      if (v.length === 0) continue;
      records.push({
        id: c.chunk_id,
        vector: v,
        text: c.text,
        source: src.sourceLabel,
        sourceKind: src.sourceKind,
      });
    }
    // 整篇全空向量（embed 全挂）→ 不记账 meta，下次重跑会当 added 重试；否则记账 + add
    if (records.length === 0) {
      failedDocs.push(src.sourceKey);
      continue;
    }
    await headingStore.add(records);
    chunksAdded += records.length;
    newMetas.push({
      source: src.sourceKey,
      mtimeMs: src.updatedMs,
      hash: src.contentHash,
      chunkCount: { heading: records.length, paragraph: 0 },
    });
  }
  await meta.upsert(newMetas);

  await headingStore.close();

  console.log(
    `>>> Write: ${chunksAdded} chunks, ${embedCalls} embed 调用, fallback=${embedFallback}, failed=${failedDocs.length}`,
  );
  console.log(`>>> Total: ${Date.now() - t0}ms`);
  if (embedFallback > 0) {
    console.warn(`>>> WARN: ${embedFallback} chunk 走 fallback 占位（网关抖动），建议重跑该 version`);
  }
  if (failedDocs.length > 0) {
    console.warn(
      `>>> WARN: ${failedDocs.length} 个 source 整篇 embed 失败（未入 meta，下次重跑重试）：${failedDocs.join(', ')}`,
    );
  }
}

main().catch((err) => {
  console.error('index 异常：', err);
  process.exit(1);
});
