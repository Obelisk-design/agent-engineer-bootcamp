import { z } from 'zod';

/**
 * 搜索请求：query + topK + namespace。
 * namespace='all' 时并行查 notion + md 两表，按 score 合并 topK。
 */
export const SearchRequest = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(50).default(5),
  namespace: z.enum(['notion', 'md', 'all']).default('all'),
});

export type SearchRequest = z.infer<typeof SearchRequest>;

/** 高亮区间：query 关键词在 content 中的位置。 */
export const Highlight = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  term: z.string(),
});
export type Highlight = z.infer<typeof Highlight>;

/**
 * 单条命中。
 *
 * score: cosine similarity ∈ [0, 1]，越大越相似。
 *   后端把 lance 返回的 cosine distance 转成 similarity（1 - distance），
 *   让 UI / caller 无需关心 lancedb 内部 metric。Day 14 后段约定。
 */
export const Hit = z.object({
  chunkId: z.string(),
  sourceKind: z.enum(['notion', 'md']),
  sourceLabel: z.string(),
  content: z.string(),
  score: z.number().min(0).max(1),
  chunkKind: z.enum(['heading', 'paragraph']),
  highlight: z.array(Highlight),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type Hit = z.infer<typeof Hit>;

/** 搜索响应：hits + phases（每阶段耗时）。 */
export const SearchResponse = z.object({
  hits: z.array(Hit),
  phases: z.object({
    embedMs: z.number(),
    retrieveMs: z.number(),
    totalMs: z.number(),
  }),
});

export type SearchResponse = z.infer<typeof SearchResponse>;
