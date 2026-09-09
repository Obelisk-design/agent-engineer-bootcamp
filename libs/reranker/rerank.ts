/**
 * libs/reranker/rerank.ts
 *
 * OpenAI 风格 /v1/rerank 端点的 client wrapper（libs 层不读 env）。
 *
 * 探针证（dev 网关 qwen3-reranker-4b 实测）：
 *   - POST {baseUrl}/rerank
 *   - body { model, query, documents: string[], top_n? }
 *   - 200 → { id, results: [{ index, relevance_score, document: { text } }], meta: {...} }
 *   - relevance_score ∈ [0, 1]，越大越相关（不是 logit）
 *
 * 仿 libs/embedding/embed.ts 风格：缺失抛 RangeError；HTTP / JSON 错误返回 null。
 *
 * 不做（YAGNI）：
 *   - 不做 batch / 流式（vllm 0.x 不支持 rerank stream）
 *   - 不做 NaN score 替换 placeholder（rerank score 是概率，不像 embed 可能 NaN）
 *   - 不做 retry（dev 网关现状稳；上层 fetch 失败语义清晰）
 */

export type RerankTopN = number;

export interface RerankRequest {
  readonly query: string;
  readonly documents: readonly string[];
  readonly topN?: RerankTopN;
  readonly model?: string;
  readonly baseUrl?: string;
}

export interface RerankHit {
  /** 原 documents 数组的下标（用于回绑原 Hit） */
  readonly index: number;
  /** relevance_score ∈ [0, 1] */
  readonly score: number;
  readonly text: string;
}

export interface RerankResult {
  readonly id: string;
  readonly hits: readonly RerankHit[];
  readonly meta: {
    readonly inputTokens: number;
  };
}

const DEFAULT_MODEL = 'qwen3-reranker-4b';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface RerankJson {
  id: string;
  results: { index: number; relevance_score: number; document?: { text?: string } }[];
  meta?: { tokens?: { input_tokens?: number } };
}

export async function rerank(
  req: RerankRequest,
  apiKey: string,
  signal?: AbortSignal,
): Promise<RerankResult | null> {
  if (!apiKey) throw new RangeError('apiKey required');
  if (!req.query.trim()) throw new RangeError('query must be non-empty');
  if (req.documents.length === 0) throw new RangeError('documents must be non-empty');

  const model = req.model ?? DEFAULT_MODEL;
  const baseUrl = req.baseUrl ?? DEFAULT_BASE_URL;
  const body: Record<string, unknown> = {
    model,
    query: req.query,
    documents: [...req.documents],
  };
  if (req.topN !== undefined) body['top_n'] = req.topN;

  try {
    const res = await fetch(`${baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      console.warn(`[rerank] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as RerankJson;
    if (!Array.isArray(json.results)) {
      console.warn('[rerank] response missing results array');
      return null;
    }
    const hits: RerankHit[] = json.results.map((r) => ({
      index: r.index,
      score: r.relevance_score,
      text: r.document?.text ?? req.documents[r.index] ?? '',
    }));
    // vllm 返回的 results 已按 relevance_score 降序，但保险再排一次
    hits.sort((a, b) => b.score - a.score);
    return {
      id: json.id ?? '',
      hits,
      meta: { inputTokens: json.meta?.tokens?.input_tokens ?? 0 },
    };
  } catch (e) {
    console.warn(`[rerank] fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
