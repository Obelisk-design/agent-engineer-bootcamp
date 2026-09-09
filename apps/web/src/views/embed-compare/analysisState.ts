/**
 * apps/web/src/views/embed-compare/analysisState.ts
 *
 * 统一状态模型（Day 19 重构）：单 analysisState ref + 5 段 PipelineStage。
 * 替代之前 PanelEmbed / PanelCompare / PanelRerank 各自维护的 isXxxLoading 布尔。
 *
 * 单一真相源：EmbedCompare.vue 持有 ref；子组件 props-in / events-out。
 */

import type { Hit, RerankResponse } from '@/lib/api-schema.js';

export type StageStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';

export interface PipelineStage {
  status: StageStatus;
  ms?: number;
  error?: string;
}

export interface EmbeddingPayload {
  vector: number[] | null;
  /** 前端测的 embed 延迟（后端 phases.embedMs 永远是 0） */
  embedMs: number;
  /** 向量维度 = vector.length */
  dimension: number;
  /** model 名（来自 .env 或默认值） */
  model: string;
}

export interface VectorSearchPayload {
  hits: Hit[];
  /** 后端给的 retrieveMs（lance knn 检索耗时） */
  retrieveMs: number;
  /** query vs topK cosine 距离热图 HTML（可折叠展示） */
  heatMapHtml: string | null;
}

export interface RerankerPayload {
  response: RerankResponse;
}

export interface AnalysisState {
  /** 用户输入 */
  query: string;
  namespace: 'notion' | 'md' | 'all';
  topK: number;
  rerankEnabled: boolean;

  /** 5 段状态机 */
  pipeline: {
    query: PipelineStage;
    embed: PipelineStage;
    vectorSearch: PipelineStage;
    reranker: PipelineStage;
    final: PipelineStage;
  };

  /** 各阶段真实数据（status === 'idle' 时为 null） */
  embedding: EmbeddingPayload | null;
  vectorSearch: VectorSearchPayload | null;
  reranker: RerankerPayload | null;

  /** 顶层致命错误（env missing / query 空 / 中断外的未分类异常） */
  lastError: string | null;
}

/** 相关裁决阈值：rerank top-1 relevanceScore 低于它 → "库内没有相关内容"
 *  依据 2026-09-09 实测：相关查询（cosine 怎么算）top1=0.924，噪音查询（紫光云）top1=0.019，
 *  区分度 40 倍；取远离两端的 0.3。不用 cosine 做裁决——dev 网关 embed 分数波动 ±0.05，
 *  0.12 阈值实测会跳变；reranker 区分度是 cosine 的量级差。
 */
export const RELEVANCE_VERDICT_THRESHOLD = 0.3;

export function emptyPipelineStages(): AnalysisState['pipeline'] {
  return {
    query: { status: 'idle' },
    embed: { status: 'idle' },
    vectorSearch: { status: 'idle' },
    reranker: { status: 'idle' },
    final: { status: 'idle' },
  };
}

export function defaultAnalysisState(): AnalysisState {
  return {
    query: '',
    namespace: 'all',
    topK: 5,
    rerankEnabled: true,
    pipeline: emptyPipelineStages(),
    embedding: null,
    vectorSearch: null,
    reranker: null,
    lastError: null,
  };
}
