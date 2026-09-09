import { z } from 'zod';
import { Hit } from './search.js';

/**
 * Rerank 请求：query + 已有的 search hits + namespace 上下文。
 *
 * 设计：复用 libs/api-schema 的 Hit（来自 search 响应）。
 * 后端从 hits.content 提取 documents 喂 reranker，再把 results 绑回原 Hit 字段。
 *
 * 为什么不让前端直接传 query + documents：
 *   - 前端拿不到原始 documents 数组（只有 search 后的 chunks）
 *   - 后端做字段映射（rerank index → 原 chunkId / sourceLabel）是单一事实源
 */
export const RerankRequest = z.object({
  query: z.string().min(1).max(2000),
  hits: z.array(Hit).min(1).max(20),
  topN: z.number().int().min(1).max(20).optional(),
});
export type RerankRequest = z.infer<typeof RerankRequest>;

/** 单条重排命中：在原 Hit 字段上加 relevance_score。 */
export const RerankedHit = Hit.extend({
  /** reranker 给的相关性分，∈ [0, 1]，越大越相关（vllm qwen3-reranker-4b 实测） */
  relevanceScore: z.number().min(0).max(1),
  /** 在原 hits 数组里的下标（用于前端显示"位置变化"） */
  originalIndex: z.number().int().min(0),
});
export type RerankedHit = z.infer<typeof RerankedHit>;

/** Rerank 响应：重排后的 hits + 阶段耗时。 */
export const RerankResponse = z.object({
  reranked: z.array(RerankedHit),
  phases: z.object({
    rerankMs: z.number(),
    totalMs: z.number(),
  }),
});
export type RerankResponse = z.infer<typeof RerankResponse>;
