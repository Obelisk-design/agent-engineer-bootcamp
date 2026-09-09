/**
 * apps/api/src/rag-rerank.ts
 *
 * POST /rerank handler。
 *
 * 流程：
 *   1. zod parse body（RerankRequest：query + hits）
 *   2. 提取 hits.content → documents 喂 libs/reranker.rerank
 *   3. 解析 results → 绑回原 Hit 字段 + 加 relevanceScore + originalIndex
 *   4. 返回 RerankResponse { reranked, phases }
 *
 * 设计：
 *   - 不读 env 在 libs 层（apps/api 负责注入 apiKey / baseUrl / model）
 *   - rerank 失败 → 502 upstream_failure（让前端 PanelRerank 显示红字，不阻塞 PanelA/B）
 */

import type { Context } from 'hono';
import { RerankRequest, RerankResponse, ApiError, type RerankedHit } from '@bootcamp/api-schema';
import { rerank } from '../../../libs/reranker/index.js';

export async function ragRerankHandler(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = RerankRequest.safeParse(body);
  if (!parsed.success) {
    return c.json(
      ApiError.parse({
        error: parsed.error.message,
        code: 'bad_request',
        details: { issues: parsed.error.issues },
      }),
      400,
    );
  }
  const { query, hits, topN } = parsed.data;

  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    return c.json(ApiError.parse({ error: 'OPENAI_API_KEY not set', code: 'env_missing' }), 500);
  }
  const baseUrl = process.env['OPENAI_BASE_URL'];
  const model = process.env['RERANKER_MODEL_NAME'] ?? 'qwen3-reranker-4b';

  const totalStart = Date.now();
  const documents = hits.map((h) => h.content);

  const rerankStart = Date.now();
  const result = await rerank(
    {
      query,
      documents,
      ...(topN !== undefined ? { topN } : {}),
      model,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    },
    apiKey,
  );
  const rerankMs = Date.now() - rerankStart;

  if (result === null) {
    return c.json(
      ApiError.parse({ error: 'rerank upstream call failed', code: 'upstream_failure' }),
      502,
    );
  }

  // 绑回原 Hit 字段 + 加 relevanceScore + originalIndex
  const reranked: RerankedHit[] = result.hits.map((rh) => {
    const original = hits[rh.index];
    if (original === undefined) {
      // 防御性：rerank 返回了未知 index（不应该发生）
      throw new Error(`rerank returned unknown index ${rh.index}`);
    }
    return {
      ...original,
      relevanceScore: rh.score,
      originalIndex: rh.index,
    };
  });

  const totalMs = Date.now() - totalStart;

  return c.json(
    RerankResponse.parse({
      reranked,
      phases: { rerankMs, totalMs },
    }),
  );
}
