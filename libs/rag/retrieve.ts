/**
 * libs/rag/retrieve.ts
 *
 * 把今天 3 件事串起来：embed(query) → store.search() → top-K hits。
 *
 * 设计要点：
 * - 接受 embedFn / store / apiKey / baseUrl / model —— 全可注入，便于单测 mock
 * - chunkStrategy 是必填字段（spec 决策：让 evaluate 对比拿到是哪一种切法）
 * - apiKey 不传 → throw（不允许 libs 层偷偷读 env；env 读取在 examples 层）
 * - 维度 mismatch → throw（不静默用 zero-vector 兜底）
 *
 * 错误传播：
 *   embed 失败 → 抛到上层（不在 retrieve 静默 catch —— 评估需要看到这个失败）
 *   store.search 失败 → 抛到上层
 *   命中 0 → 不抛，返回 hits=[]（空检索是合法状态）
 */

import { embed, type EmbedRequest, type EmbedResult } from '../embedding/embed.js';
import type { SearchHit, VectorStore } from './store.js';

export type ChunkStrategy = 'heading' | 'paragraph';

export interface RetrieveOptions {
  readonly k: number;
  readonly chunkStrategy: ChunkStrategy;
  readonly store: VectorStore;
  readonly embedFn?: (req: EmbedRequest, apiKey: string) => Promise<EmbedResult>;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
  /** 单条 query 重复 N 次取平均耗时（默认 1）—— evaluate 用来对比稳定性 */
  readonly repetitions?: number;
}

export interface RetrieveResult {
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly chunkStrategy: ChunkStrategy;
  readonly elapsedMs: number;
}

export async function retrieve(query: string, opts: RetrieveOptions): Promise<RetrieveResult> {
  if (!query.trim()) {
    throw new RangeError('retrieve: query must be non-empty');
  }
  if (!opts.apiKey) {
    throw new RangeError('retrieve: apiKey required');
  }
  const fn = opts.embedFn ?? embed;
  const t0 = Date.now();
  const req: EmbedRequest = {
    input: query,
    ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
    ...(opts.model !== undefined ? { model: opts.model } : {}),
  };
  const er = await fn(req, opts.apiKey);
  if (er.vectors.length !== 1) {
    throw new Error(`retrieve: expected 1 query vector, got ${er.vectors.length}`);
  }
  const hits = await opts.store.search(er.vectors[0]!, opts.k);
  const elapsedMs = Date.now() - t0;
  return { query, hits, chunkStrategy: opts.chunkStrategy, elapsedMs };
}

/**
 * 多次 retrieve 取 hits（用于 evaluate 对比稳定性）。repetitions=1 时等同 retrieve。
 */
export async function retrieveRepeated(
  query: string,
  opts: Omit<RetrieveOptions, 'repetitions'>,
  repetitions: number,
): Promise<RetrieveResult> {
  if (repetitions <= 1) return retrieve(query, opts);
  const results: RetrieveResult[] = [];
  for (let i = 0; i < repetitions; i++) {
    results.push(await retrieve(query, opts));
  }
  // hits 取第一次（语义同；后续重复应稳定）；elapsedMs 累加
  return {
    ...results[0]!,
    elapsedMs: results.reduce((s, r) => s + r.elapsedMs, 0),
  };
}