/**
 * libs/rag/indexer.ts
 *
 * 增量入库（Day 13 follow-up）：
 *   - mtime 跳过：文档未变 → 不重 embed
 *   - hash 兜底：mtime 相同但内容变（git pull / 复制覆盖）也能检出
 *   - 精确删除：文档改 / 删 → 通过 lancedb delete('source IN (...)') 一次性清掉所有旧 chunk
 *
 * 设计要点：
 * - metadata 自身也是 lancedb 表（'rag_meta'），跟 chunks_* 同库（`.lancedb/rag`）
 * - metadata schema：{ source, mtimeMs, hash, headingCount, paragraphCount }
 *   source 作主键；多 strategy 表共享同一份 meta（heading + paragraph chunk 数都记）
 * - diff 算法是纯函数：diffDocs(currentDocs, cachedMeta) → {added, modified, removed}
 *
 * 不做（YAGNI）：
 * - 不做文件锁 / 并发安全（Day 13 单进程单 agent）
 * - 不做增量 embed（删了旧 chunk 后整文档重 embed，比部分重 embed 简单 + 更正）
 * - 不做 mtime 精度处理（Node 14+ fs.stat.mtimeMs 已是毫秒，足够区分）
 * - 不做 rename 检测（同 mtime 不同 hash 已覆盖绝大多数场景；rename 走"删 + 增"两步）
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as lancedb from '@lancedb/lancedb';
import { chunkByHeading, chunkByParagraph, dropEmptyChunks, type Chunk, type SourceKind } from './chunk.js';
import type { DocEntry } from './index.js';
import { embed } from '../embedding/embed.js';
import { openVectorStore, type VectorRecord } from './store.js';

/* ============================================================
 * Generalized source abstraction (file or Notion page).
 *
 * DocSource decouples incrementalIndex from filesystem-specific concepts.
 * Today callers feed DocEntry[]; toDocSources() adapts to DocSource[].
 * Future callers (Notion import) build DocSource[] directly, bypassing
 * fs.stat.
 * ============================================================ */

export interface DocSource {
  /** Primary key — relPath for file-based docs, Notion pageId for page-based docs */
  readonly sourceKey: string;
  /** Human-readable label written into lancedb `source` column (was DocEntry.relPath) */
  readonly sourceLabel: string;
  readonly content: string;
  readonly sourceKind: SourceKind;
  /** Last-modified timestamp (ms). file: fs.stat.mtimeMs; notion: lastEditedMs */
  readonly updatedMs: number;
  /** SHA-256 fingerprint of content — guards against mtime-spoof / cross-machine drift */
  readonly contentHash: string;
}

/* ============================================================
 * Metadata schema
 * ============================================================ */

export interface DocMeta {
  /** 文档路径（与 DocEntry.relPath 同形） */
  readonly source: string;
  /** fs.stat 的 mtimeMs */
  readonly mtimeMs: number;
  /** 文本 SHA-256 指纹（防止 mtime 假阴性） */
  readonly hash: string;
  /** 各 strategy 表的 chunk 数 {heading: N, paragraph: M} */
  readonly chunkCount: Readonly<Record<'heading' | 'paragraph', number>>;
}

interface MetaRow {
  source: string;
  mtimeMs: number;
  hash: string;
  headingCount: number;
  paragraphCount: number;
}

function metaToRow(m: DocMeta): MetaRow {
  return {
    source: m.source,
    mtimeMs: m.mtimeMs,
    hash: m.hash,
    headingCount: m.chunkCount.heading,
    paragraphCount: m.chunkCount.paragraph,
  };
}

function rowToMeta(r: MetaRow): DocMeta {
  return {
    source: r.source,
    mtimeMs: r.mtimeMs,
    hash: r.hash,
    chunkCount: { heading: r.headingCount, paragraph: r.paragraphCount },
  };
}

/* ============================================================
 * 纯函数：hash + diff
 * ============================================================ */

/** 计算文本 SHA-256。Node crypto.createHash 比 web crypto 简单（同步、无 import.meta 限制）。 */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/**
 * 文件型 DocEntry[] → DocSource[]。Notion 类 source 由调用方直接构造 DocSource，
 * 不经过此 helper（无 fs.stat / absPath 概念）。
 */
async function toDocSources(docs: readonly DocEntry[]): Promise<readonly DocSource[]> {
  return Promise.all(
    docs.map(async (d) => {
      const stat = await fs.stat(d.absPath);
      return {
        sourceKey: d.relPath,
        sourceLabel: d.relPath,
        content: d.content,
        sourceKind: d.kind,
        updatedMs: stat.mtimeMs,
        contentHash: hashText(d.content),
      };
    }),
  );
}

export interface DiffResult {
  readonly added: readonly string[];    // source 路径
  readonly modified: readonly string[];
  readonly removed: readonly string[]; // 已删除文档的 source
  readonly unchanged: readonly string[];
}

/**
 * 给当前 docs + 当前 mtime/hash + 已缓存 meta 算 diff。
 *  - 当前有 / meta 无 → added
 *  - 当前有 / meta 有但 mtimeMs 或 hash 不同 → modified
 *  - 当前有 / meta 一致 → unchanged
 *  - 当前无 / meta 有 → removed
 *
 * 注：调用方负责给 doc 补 mtimeMs + hash（indexer 内用 fs.stat + hashText）。
 */
export function diffDocs(
  current: readonly { source: string; mtimeMs: number; hash: string }[],
  cached: ReadonlyMap<string, DocMeta>,
): DiffResult {
  const currentMap = new Map(current.map((d) => [d.source, d]));
  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  for (const doc of current) {
    const prev = cached.get(doc.source);
    if (prev === undefined) {
      added.push(doc.source);
    } else if (prev.mtimeMs !== doc.mtimeMs || prev.hash !== doc.hash) {
      modified.push(doc.source);
    } else {
      unchanged.push(doc.source);
    }
  }

  const removed: string[] = [];
  for (const [source] of cached) {
    if (!currentMap.has(source)) removed.push(source);
  }

  return { added, modified, removed, unchanged };
}

/* ============================================================
 * Metadata store（lancedb 一张专门表）
 *
 * 命名约定：meta 表名 = `${tablePrefix}_meta`（与 chunks_${strategy} 同 namespace）。
 * 这样多 corpus 共存时（如 main 的 chunks_meta vs test 的 chunks_test_meta）互不污染。
 * ============================================================ */

class MetaStore {
  private readonly db: lancedb.Connection;
  private readonly tableName: string;
  private cached: lancedb.Table | null = null;

  constructor(db: lancedb.Connection, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  private async tbl(): Promise<lancedb.Table> {
    if (this.cached !== null) return this.cached;
    this.cached = await this.db.openTable(this.tableName);
    return this.cached;
  }

  async loadAll(): Promise<Map<string, DocMeta>> {
    const existing = await this.db.tableNames();
    if (!existing.includes(this.tableName)) return new Map();
    const t = await this.tbl();
    const rows = (await t.query().toArray()) as MetaRow[];
    const out = new Map<string, DocMeta>();
    for (const r of rows) out.set(r.source, rowToMeta(r));
    return out;
  }

  async upsert(metas: readonly DocMeta[]): Promise<void> {
    if (metas.length === 0) return;
    const rows = metas.map(metaToRow);
    const existing = await this.db.tableNames();
    if (!existing.includes(this.tableName)) {
      await this.db.createTable(this.tableName, rows as unknown as Record<string, unknown>[], {
        mode: 'overwrite',
      });
      this.cached = null;
    } else {
      const t = await this.tbl();
      await t.delete(inListFilter(metas.map((m) => m.source)));
      await t.add(rows as unknown as Record<string, unknown>[]);
    }
  }

  async deleteSources(sources: readonly string[]): Promise<void> {
    if (sources.length === 0) return;
    const existing = await this.db.tableNames();
    if (!existing.includes(this.tableName)) return;
    const t = await this.tbl();
    await t.delete(inListFilter(sources));
  }
}

/**
 * 打开 metadata store。tableName = `${tablePrefix}_meta` —— 与 chunks_${strategy} 共享 namespace。
 * @param uri        lancedb 目录
 * @param tablePrefix 'chunks' | 'chunks_test' | ...
 */
export async function openMetaStore(uri?: string, tablePrefix = 'chunks'): Promise<MetaStore> {
  const target = uri ?? '.lancedb/rag';
  const db = await lancedb.connect(target);
  return new MetaStore(db, `${tablePrefix}_meta`);
}

/* ============================================================
 * 增量入库主流程
 * ============================================================ */

export interface IncrementalIndexPhases {
  /** 读 mtime + 计算 hash（fs.stat + SHA-256，CPU+IO 混合） */
  readonly statMs: number;
  /** lancedb delete('source IN (...)') 累计（含 meta 表） */
  readonly deleteMs: number;
  /** embed() 实测调用累计（一次 embed 多个 chunk 计 1 次） */
  readonly embedMs: number;
  readonly embedCalls: number;
  /** lancedb add() 累计（含 meta 表 upsert） */
  readonly addMs: number;
  /** open / loadAll / close 等 */
  readonly ioMs: number;
  readonly totalMs: number;
}

export interface IncrementalIndexReport {
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly removed: readonly string[];
  readonly skipped: readonly string[];
  /** added + modified + removed 的并集（顺序：added → modified → removed）—— 给调用方一行打印 */
  readonly changedFiles: readonly string[];
  readonly headingChunksAdded: number;
  readonly paragraphChunksAdded: number;
  readonly phases: IncrementalIndexPhases;
  /** 本次新增的 chunk 里 fallback 占位的数量（heading / paragraph 各自统计）。
   *  静默退化路径有了可观测指标 —— 上层可据此决定是否重 embed。 */
  readonly embedFallbacks: { heading: number; paragraph: number };
  /** 本次 reindex 但整篇 chunk 全部走 fallback 的 source key 列表（embed 完全失败）。
   *  这类 source 没写入向量表，检索层不会命中；调用方需要知道丢了哪些。 */
  readonly failedDocSources: readonly string[];
}

export interface IncrementalIndexOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly storeUri?: string;
  readonly tablePrefix?: string; // 默认 'chunks' → chunks_heading / chunks_paragraph
  readonly force?: boolean; // 强制全量重 embed（调试 / 修复）
}

export async function incrementalIndex(
  docs: readonly DocEntry[],
  opts: IncrementalIndexOptions,
): Promise<IncrementalIndexReport> {
  const t0 = Date.now();
  let statMs = 0;
  let deleteMs = 0;
  let embedMs = 0;
  let addMs = 0;
  let ioMs = 0;
  let embedCalls = 0;

  const timed = async <T>(acc: { ms: number }, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    const out = await fn();
    acc.ms += Date.now() - t;
    return out;
  };
  const statAcc = { ms: 0 };
  const deleteAcc = { ms: 0 };
  const embedAcc = { ms: 0 };
  const addAcc = { ms: 0 };
  const ioAcc = { ms: 0 };

  const tablePrefix = opts.tablePrefix ?? 'chunks';
  const headingStore = await timed(ioAcc, () =>
    openVectorStore(opts.storeUri, `${tablePrefix}_heading`),
  );
  const paragraphStore = await timed(ioAcc, () =>
    openVectorStore(opts.storeUri, `${tablePrefix}_paragraph`),
  );
  const meta = await timed(ioAcc, () => openMetaStore(opts.storeUri, tablePrefix));
  const cached = await timed(ioAcc, () => meta.loadAll());

  // 1. 给 docs 补 updatedMs + contentHash（DocSource 抽象；file 走 fs.stat，notion 等其他 source 由调用方直接构造 DocSource）
  const enriched = await timed(statAcc, () => toDocSources(docs));

  // 2. diff
  let added: readonly string[];
  let modified: readonly string[];
  let removed: readonly string[];
  if (opts.force === true) {
    added = enriched.map((e) => e.sourceKey);
    modified = [];
    removed = Array.from(cached.keys());
  } else {
    const diff = diffDocs(
      enriched.map((e) => ({ source: e.sourceKey, mtimeMs: e.updatedMs, hash: e.contentHash })),
      cached,
    );
    added = diff.added;
    modified = diff.modified;
    removed = diff.removed;
  }

  const skipped = docs
    .map((d) => d.relPath)
    .filter((s) => !added.includes(s) && !modified.includes(s));

  // 3. removed → 清掉所有旧 chunk + meta 记录
  if (removed.length > 0) {
    const filter = inListFilter(removed);
    await timed(deleteAcc, () => headingStore.delete(filter));
    await timed(deleteAcc, () => paragraphStore.delete(filter));
    await timed(deleteAcc, () => meta.deleteSources(removed));
  }

  // 4. toReindex（added + modified）→ 先清掉旧 chunk（保证幂等）
  const toReindex = [...added, ...modified];
  if (toReindex.length > 0) {
    const filter = inListFilter(toReindex);
    await timed(deleteAcc, () => headingStore.delete(filter));
    await timed(deleteAcc, () => paragraphStore.delete(filter));
  }

  // 5. 重新切 + embed + 入库
  let headingChunksAdded = 0;
  let paragraphChunksAdded = 0;
  let embedFallbacks = { heading: 0, paragraph: 0 };
  const failedDocSources: string[] = [];
  const newMetas: DocMeta[] = [];
  if (toReindex.length > 0) {
    const docMap = new Map(docs.map((d) => [d.relPath, d]));
    const enrichedMap = new Map(enriched.map((e) => [e.sourceKey, e]));

    for (const source of toReindex) {
      const doc = docMap.get(source);
      const em = enrichedMap.get(source);
      if (doc === undefined || em === undefined) continue;

      const headingChunks = dropEmptyChunks(chunkByHeading(doc.content, doc.relPath, doc.kind));
      const paragraphChunks = dropEmptyChunks(chunkByParagraph(doc.content, doc.relPath, doc.kind));

      const headingRes = await timed(embedAcc, () =>
        embed(
          {
            input: headingChunks.map((c) => c.text),
            ...(opts.model !== undefined ? { model: opts.model } : {}),
            ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
          },
          opts.apiKey,
        ),
      );
      const paragraphRes = await timed(embedAcc, () =>
        embed(
          {
            input: paragraphChunks.map((c) => c.text),
            ...(opts.model !== undefined ? { model: opts.model } : {}),
            ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
          },
          opts.apiKey,
        ),
      );
      embedCalls += 2; // 一次 heading + 一次 paragraph

      // 累加 fallback 计数 + 标记整篇失败的 source
      const headingFallbacks = headingRes.fallbackFlags.filter(Boolean).length;
      const paragraphFallbacks = paragraphRes.fallbackFlags.filter(Boolean).length;
      embedFallbacks = {
        heading: embedFallbacks.heading + headingFallbacks,
        paragraph: embedFallbacks.paragraph + paragraphFallbacks,
      };
      const headingAllFailed = headingRes.vectors.every((v) => v.length === 0);
      const paragraphAllFailed = paragraphRes.vectors.every((v) => v.length === 0);
      if (headingAllFailed && paragraphAllFailed && headingChunks.length > 0 && paragraphChunks.length > 0) {
        failedDocSources.push(source);
      }

      const headingRecords = buildRecords(headingChunks, headingRes.vectors, headingRes.fallbackFlags);
      const paragraphRecords = buildRecords(paragraphChunks, paragraphRes.vectors, paragraphRes.fallbackFlags);

      if (headingRecords.length > 0) await timed(addAcc, () => headingStore.add(headingRecords));
      if (paragraphRecords.length > 0) await timed(addAcc, () => paragraphStore.add(paragraphRecords));

      headingChunksAdded += headingRecords.length;
      paragraphChunksAdded += paragraphRecords.length;
      newMetas.push({
        source,
        mtimeMs: em.updatedMs,
        hash: em.contentHash,
        chunkCount: { heading: headingRecords.length, paragraph: paragraphRecords.length },
      });
    }
    await timed(addAcc, () => meta.upsert(newMetas));
  }

  await timed(ioAcc, async () => {
    await headingStore.close();
    await paragraphStore.close();
  });

  statMs = statAcc.ms;
  deleteMs = deleteAcc.ms;
  embedMs = embedAcc.ms;
  addMs = addAcc.ms;
  ioMs = ioAcc.ms;

  return {
    added,
    modified,
    removed,
    skipped,
    changedFiles: [...added, ...modified, ...removed],
    headingChunksAdded,
    paragraphChunksAdded,
    phases: { statMs, deleteMs, embedMs, embedCalls, addMs, ioMs, totalMs: Date.now() - t0 },
    embedFallbacks,
    failedDocSources,
  };
}

/* ============================================================
 * 工具：把 Chunk[] + embed 结果合成 VectorRecord[]
 *   - 跳过 fallback 占位（fallback vector 是 '[empty]' 的向量，没语义意义）
 *   - id 形如 `${source}#${ordinal}` —— ordinal 是 per-source 顺序号，
 *     对 file 和 notion 通用（Notion 没 byte 偏移；ordinal 由 chunk.ts 保证 0..N-1）
 * ============================================================ */

function buildRecords(
  chunks: readonly Chunk[],
  vectors: readonly (readonly number[])[],
  fallbackFlags: readonly boolean[],
): VectorRecord[] {
  const out: VectorRecord[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (fallbackFlags[i] === true) continue;
    const c = chunks[i]!;
    const v = vectors[i];
    if (v === undefined || v.length === 0) continue;
    out.push({
      id: `${c.source}#${c.ordinal}`,
      vector: [...v],
      text: c.text,
      source: c.source,
      sourceKind: c.sourceKind,
    });
  }
  return out;
}

/** 把字符串数组拼成 lancedb SQL 的 IN (...) 子句。转义双引号防注入（虽然 source 是文件系统路径，但 lancedb SQL parser 不友好）。 */
function inListFilter(sources: readonly string[]): string {
  return `source IN (${sources.map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}
