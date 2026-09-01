/**
 * libs/rag/store.ts
 *
 * 抽象 VectorStore 接口 + lancedb 本地版实现 + 内存版 fallback。
 *
 * 设计要点：
 * - VectorStore 是 interface（不绑 lancedb），未来换 sqlite-vss / pgvector 不改调用方
 * - openVectorStore(uri?) 自动选实现：
 *      - uri 前缀 "memory://" → 内存版（测试 + 离线 demo 用）
 *      - 默认 / 绝对路径 → lancedb 本地版
 * - lancedb 默认路径：.lancedb/rag（仓库根，相对 process.cwd()）
 * - 内存版只用于 evaluate.test.ts 单测和离线 demo —— lancedb native 装不上时仍可跑
 *
 * 不做（YAGNI）：
 * - 不抽 VectorRecordBuilder / Transformer / IndexConfig（路线表 Day 16-17 不需要）
 * - 不做 namespace / multi-tenant（单进程单库）
 * - 不做持久化 schema migration（mode: 'overwrite' 重建即可）
 */

import * as lancedb from '@lancedb/lancedb';
import type { SourceKind } from './chunk.js';

export interface VectorRecord {
  /** 形如 `${source}#${byteStart}-${byteEnd}` —— 自带去重键 */
  readonly id: string;
  readonly vector: readonly number[];
  readonly text: string;
  readonly source: string;
  readonly sourceKind: SourceKind;
}

export interface SearchHit {
  readonly record: VectorRecord;
  /** cosine distance（越小越相似），lancedb 返回 _distance；内存版手算 cosine */
  readonly score: number;
}

export interface VectorStore {
  add(records: readonly VectorRecord[]): Promise<void>;
  search(query: readonly number[], k: number): Promise<readonly SearchHit[]>;
  size(): Promise<number>;
  /** 删除匹配 filter 的所有记录。filter 语法同 lancedb SQL where 子句（如 'source = "x.md"'）。
   *  返回被删除的行数。Day 13 增量入库依赖此接口。 */
  delete(filter: string): Promise<number>;
  close(): Promise<void>;
}

/* ============================================================
 * lancedb 实现
 * ============================================================ */

interface LanceRow {
  id: string;
  vector: number[];
  text: string;
  source: string;
  sourceKind: string;
}

const toRow = (r: LanceRow): Record<string, unknown> => ({
  id: r.id,
  vector: r.vector,
  text: r.text,
  source: r.source,
  sourceKind: r.sourceKind,
});

class LanceStore implements VectorStore {
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

  async add(records: readonly VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const rows: LanceRow[] = records.map((r) => ({
      id: r.id,
      vector: [...r.vector],
      text: r.text,
      source: r.source,
      sourceKind: r.sourceKind,
    }));
    const existing = await this.db.tableNames();
    if (!existing.includes(this.tableName)) {
      await this.db.createTable(this.tableName, rows.map(toRow), { mode: 'overwrite' });
      this.cached = null;
    } else {
      const t = await this.tbl();
      await t.add(rows.map(toRow));
    }
  }

  async search(query: readonly number[], k: number): Promise<readonly SearchHit[]> {
    const existing = await this.db.tableNames();
    if (!existing.includes(this.tableName)) {
      return [];
    }
    const t = await this.tbl();
    const raw = await t
      .vectorSearch([...query])
      .limit(k)
      .toArray();
    return raw.map((row) => ({
      record: {
        id: String(row.id),
        vector: row.vector as number[],
        text: String(row.text),
        source: String(row.source),
        sourceKind: String(row.sourceKind) as SourceKind,
      },
      score: Number(row._distance),
    }));
  }

  async size(): Promise<number> {
    const existing = await this.db.tableNames();
    if (!existing.includes(this.tableName)) return 0;
    const t = await this.tbl();
    return t.countRows();
  }

  async close(): Promise<void> {
    this.cached = null;
    // lancedb JS 没有显式 close —— native handle 由 GC 释放
  }

  async delete(filter: string): Promise<number> {
    const existing = await this.db.tableNames();
    if (!existing.includes(this.tableName)) return 0;
    const t = await this.tbl();
    const before = await t.countRows();
    await t.delete(filter);
    const after = await t.countRows();
    return before - after;
  }
}

/* ============================================================
 * 内存实现（fallback + 单测用）
 * ============================================================ */

class MemoryStore implements VectorStore {
  private records: VectorRecord[] = [];

  async add(records: readonly VectorRecord[]): Promise<void> {
    for (const r of records) this.records.push(r);
  }

  async search(query: readonly number[], k: number): Promise<readonly SearchHit[]> {
    if (this.records.length === 0 || k <= 0) return [];
    const scores = this.records.map((r) => {
      if (r.vector.length !== query.length) {
        throw new RangeError(
          `memory store: query dim ${query.length} != record dim ${r.vector.length} (id=${r.id})`,
        );
      }
      let dot = 0;
      let na = 0;
      let nq = 0;
      for (let i = 0; i < query.length; i++) {
        const qi = query[i]!;
        const ri = r.vector[i]!;
        dot += qi * ri;
        na += ri * ri;
        nq += qi * qi;
      }
      if (na === 0 || nq === 0) {
        return { record: r, score: 2 }; // 与零向量的 cosine distance = 1（+1 兜底）
      }
      return { record: r, score: 1 - dot / (Math.sqrt(na) * Math.sqrt(nq)) };
    });
    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, k);
  }

  async size(): Promise<number> {
    return this.records.length;
  }

  async close(): Promise<void> {
    this.records = [];
  }

  async delete(filter: string): Promise<number> {
    // 简化版：只支持 'source = "x.md"' 形式（indexer 只用这种）
    const m = /^source\s*=\s*"([^"]*)"\s*$/.exec(filter);
    if (m === null) {
      throw new RangeError(`memory store: only 'source = "x.md"' filter supported, got: ${filter}`);
    }
    const target = m[1]!;
    const before = this.records.length;
    this.records = this.records.filter((r) => r.source !== target);
    return before - this.records.length;
  }
}

/* ============================================================
 * 工厂
 * ============================================================ */

/**
 * 打开 vector store。
 * - uri 以 `memory://` 开头 → 内存版
 * - 默认 / 其它 → lancedb 本地版（相对 process.cwd() 的路径）
 */
export async function openVectorStore(uri?: string, tableName = 'chunks'): Promise<VectorStore> {
  if (uri !== undefined && uri.startsWith('memory://')) {
    return new MemoryStore();
  }
  const target = uri ?? '.lancedb/rag';
  const db = await lancedb.connect(target);
  return new LanceStore(db, tableName);
}

export function memoryStore(): VectorStore {
  return new MemoryStore();
}
