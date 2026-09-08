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

/**
 * 双 strategy 并行合并：heading + paragraph 各跑一次 → 合并 hits → 按 text 相等去重
 * （保留 score 最小那条）→ 按 score 升序取 topK。
 *
 * 去重 key = `record.text`（不是 `record.id`）：
 *   - heading 切按 heading 边界，paragraph 切按 \n\n 边界 + overlap
 *   - 跨 strategy 的 id (`${source}#${byteStart}-${byteEnd}`) 不会冲突
 *   - 同 strategy 内 paragraph overlap 切出 text 尾部重复 → text 相等可识别
 *
 * 不做（YAGNI）：
 *   - 不做 fuzzy text 去重（text 完全相等才合并，partial overlap 留给 reranker Day 19）
 *   - 不做 score 归一化（lance cosine distance 跨 strategy 数值范围同分布）
 *   - 不做并行超过 2 strategy（Day 14 YAGNI：heading + paragraph 双 strategy 足矣）
 */
export interface RetrieveMergedOptions {
  readonly k: number;
  /** 双 store 入参：heading + paragraph 各一份（真 lancedb 下是两不同 table，1 个 store 不够） */
  readonly stores: Readonly<{ heading: VectorStore; paragraph: VectorStore }>;
  /** 接收 chunkStrategy 参数（heading 或 paragraph），便于单测按 strategy 区分 mock 返回 */
  readonly embedFn?: (
    req: EmbedRequest,
    apiKey: string,
    chunkStrategy: ChunkStrategy,
  ) => Promise<EmbedResult>;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

export interface RetrieveMergedResult {
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly elapsedMs: number;
  /** heading retrieve 调用返回的 hits 数 + paragraph retrieve 调用返回的 hits 数
   *  （mock 单测里两次调用 hits 数相同 = store 不分 strategy 是事实，不算 bug）；
   *  真 lancedb 双表下 heading/paragraph 各跑各的 hits 数会不同 */
  readonly headingHits: number;
  readonly paragraphHits: number;
  /** 被 text 相等去重 drop 多少条 */
  readonly deduped: number;
}

export async function retrieveMerged(
  query: string,
  opts: RetrieveMergedOptions,
): Promise<RetrieveMergedResult> {
  if (!query.trim()) {
    throw new RangeError('retrieveMerged: query must be non-empty');
  }
  if (!opts.apiKey) {
    throw new RangeError('retrieveMerged: apiKey required');
  }
  const t0 = Date.now();
  const [headingRes, paragraphRes] = await Promise.all([
    retrieve(query, {
      k: opts.k,
      chunkStrategy: 'heading',
      store: opts.stores.heading,
      ...baseOpts(opts, wrapEmbedFn(opts.embedFn, 'heading')),
    }),
    retrieve(query, {
      k: opts.k,
      chunkStrategy: 'paragraph',
      store: opts.stores.paragraph,
      ...baseOpts(opts, wrapEmbedFn(opts.embedFn, 'paragraph')),
    }),
  ]);
  // 合并 + text 相等去重（保留 score 最小）+ score 升序
  const seen = new Map<string, SearchHit>();
  let deduped = 0;
  for (const h of [...headingRes.hits, ...paragraphRes.hits]) {
    const existing = seen.get(h.record.text);
    if (existing === undefined) {
      seen.set(h.record.text, h);
    } else if (h.score < existing.score) {
      seen.set(h.record.text, h);
      deduped++;
    } else {
      deduped++;
    }
  }
  const merged = [...seen.values()].sort((a, b) => a.score - b.score).slice(0, opts.k);
  return {
    query,
    hits: merged,
    elapsedMs: Date.now() - t0,
    headingHits: headingRes.hits.length,
    paragraphHits: paragraphRes.hits.length,
    deduped,
  };
}

function baseOpts(
  opts: RetrieveMergedOptions,
  embedFn?: RetrieveOptions['embedFn'],
): Pick<RetrieveOptions, 'embedFn' | 'apiKey' | 'baseUrl' | 'model'> {
  return {
    apiKey: opts.apiKey,
    ...(embedFn !== undefined ? { embedFn } : {}),
    ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
    ...(opts.model !== undefined ? { model: opts.model } : {}),
  };
}

/** 把 retrieveMerged 接收的 3 参数 embedFn (req, apiKey, chunkStrategy) 包装成 retrieve 期望的 2 参数 (req, apiKey) */
function wrapEmbedFn(
  embedFn: RetrieveMergedOptions['embedFn'],
  strategy: ChunkStrategy,
): RetrieveOptions['embedFn'] | undefined {
  if (embedFn === undefined) return undefined;
  return (req: EmbedRequest, apiKey: string) => embedFn(req, apiKey, strategy);
}
