/**
 * apps/web/src/views/embed-compare/api.ts
 *
 * 前端 embed-compare page 的 API 客户端：
 *   - fetch /api/search  → SearchResponse（lancedb cosine top-K）
 *   - fetch /api/rerank  → RerankResponse（reranker 重排）
 *   - 缺 env → 抛 RangeError，由 EmbedCompare 显示红 banner
 *
 * 仿 apps/web/src/views/embed/api.ts 风格，但**前端不直接调 dev 网关**——
 * dev 网关只跑 embeddings / rerank 模型（前置 proxy 通过 /api/* 转发到 apps/api）。
 *
 * 设计：
 *   - embed API（直接调 dev 网关）走 embedTexts（apps/web/.../embed/api.ts）
 *   - search / rerank API（间接走 lancedb）走本文件的 fetch
 */

import 'dotenv/config'; // 仅 typecheck 时；运行时由 vite 处理
import type {
  SearchRequest,
  SearchResponse,
  RerankRequest,
  RerankResponse,
  Hit,
} from '@/lib/api-schema.js';

let warned = false;

export function warnDevKeyOnce(): void {
  if (warned) return;
  warned = true;
  const apiKeyRaw = import.meta.env.VITE_OPENAI_API_KEY;
  if (typeof apiKeyRaw === 'string' && apiKeyRaw.length > 0) {
    console.warn('[embed-compare] VITE_OPENAI_API_KEY is exposed in the browser — dev-only.');
  }
}

export async function searchHits(
  query: string,
  opts: { topK?: number; namespace?: 'notion' | 'md' | 'all' } = {},
): Promise<SearchResponse> {
  warnDevKeyOnce();
  const body: SearchRequest = {
    query,
    topK: opts.topK ?? 5,
    namespace: opts.namespace ?? 'all',
  };
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `search HTTP ${res.status}`);
  }
  return (await res.json()) as SearchResponse;
}

export interface RerankOpts {
  topN?: number;
}

export async function rerankHits(
  query: string,
  hits: readonly Hit[],
  opts: RerankOpts = {},
): Promise<RerankResponse> {
  warnDevKeyOnce();
  const body: RerankRequest = {
    query,
    hits: [...hits],
    ...(opts.topN !== undefined ? { topN: opts.topN } : {}),
  };
  const res = await fetch('/api/rerank', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `rerank HTTP ${res.status}`);
  }
  return (await res.json()) as RerankResponse;
}
