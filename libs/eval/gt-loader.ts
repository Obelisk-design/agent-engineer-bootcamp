/**
 * libs/eval/gt-loader.ts
 *
 * Day 22 — 加载 + 校验 GT 集（JSON）。
 *
 * 流程（spec §7.4）：
 *   1. 读 JSON 文件
 *   2. zod safeParse → 校验失败抛 / 收集错误
 *   3. 对每条 query 的 expectedChunkIds，**lazy** 校验"在当前 chunks_heading/paragraph 表是否存在"
 *      - 不存在 → 该 query 标 gtStale=true（spec §7.4）
 *      - 不阻塞加载（loader 只警告，eval runner 才跳过 stale）
 *
 * 设计依据：
 * - 库存在性校验需要 VectorStore → loader 接受可选 store，存在就校验
 * - 不依赖 retrieval（loader 是纯 IO + 校验，无网络/embed 调用）
 *
 * 不做：
 * - 不做 GT 集 version diff（Day 41+ 话题）
 * - 不做 GT 自动增量（Day 41+ 话题）
 */

import { readFile } from 'node:fs/promises';
import {
  EvalDatasetSchema,
  type EvalDataset,
  type EvalQuery,
  type EvalQueryRuntime,
} from './schema.js';
import type { VectorStore } from '../rag/store.js';

export interface LoadedQuery extends EvalQuery {
  readonly runtime: EvalQueryRuntime;
}

export interface LoadOptions {
  /** 可选：传入 store 后校验 expectedChunkIds 存在性（spec §7.4） */
  readonly stores?: readonly VectorStore[];
}

export async function loadGtDataset(
  jsonPath: string,
  opts: LoadOptions = {},
): Promise<readonly LoadedQuery[]> {
  const raw = await readFile(jsonPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const result = EvalDatasetSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`GT dataset 校验失败 @ ${jsonPath}: ${issues}`);
  }
  const dataset: EvalDataset = result.data;

  // 库存在性校验（lazy：store 未传 → 全标 false）
  const knownIds = new Set<string>();
  if (opts.stores !== undefined) {
    for (const store of opts.stores) {
      const records = await fetchAllRecords(store);
      for (const r of records) knownIds.add(r.id);
    }
  }

  return dataset.queries.map((q) => {
    const allHit = q.expectedChunkIds.every((cid) => knownIds.has(cid) || knownIds.size === 0);
    const validationError = allHit ? undefined : 'some expectedChunkIds not in current store';
    return {
      ...q,
      runtime: {
        gtStale: knownIds.size > 0 && !allHit,
        ...(validationError !== undefined ? { validationError } : {}),
      },
    };
  });
}

/** 库存在性校验 —— 通过 store.search 拉所有 record（k=大数）拿到 id 列表 */
async function fetchAllRecords(store: VectorStore): Promise<readonly { id: string }[]> {
  // 临时用 zero vector 拉所有（lancedb 不支持 list-all API，绕一下）
  // YAGNI：Day 22 接受"零向量返回近似 top-K"的不精确 —— 真要精确走 store.list()
  // 这里是 lazy 校验，不是评测路径
  // dummy 向量维度必须匹配表实际维度（dev qwen3-embedding-8b = 4096）
  const dummy = new Array(4096).fill(0);
  const hits = await store.search(dummy, 10000);
  return hits.map((h) => ({ id: h.record.id }));
}

/** 过滤掉 stale query（spec §7.4 — eval runner 用） */
export function dropStale(queries: readonly LoadedQuery[]): readonly LoadedQuery[] {
  return queries.filter((q) => !q.runtime.gtStale);
}

/** 统计 stale 数（UI 上"X 条 GT 失效"） */
export function countStale(queries: readonly LoadedQuery[]): number {
  return queries.filter((q) => q.runtime.gtStale).length;
}
