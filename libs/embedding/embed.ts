/**
 * libs/embedding/embed.ts
 *
 * OpenAI-compatible embeddings wrapper。libs 层接受 apiKey + baseUrl + model 入参，
 * 不读 import.meta.env —— 让 libs 在 node 测试环境下可被 mock。
 * 实际读 env 在前端 api.ts。
 *
 * 默认值：baseUrl = https://api.openai.com/v1 ，model = text-embedding-3-small。
 * dev 环境下 caller 传 { baseUrl: OPENAI_BASE_URL, model: 'qwen3-embedding-8b' }。
 */

export type EmbedDimensions = 4096 | 256;

export interface EmbedRequest {
  input: string | readonly string[];
  dimensions?: EmbedDimensions;
  model?: string;
  baseUrl?: string;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  dimensions: number;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export async function embed(
  req: EmbedRequest,
  apiKey: string,
  signal?: AbortSignal,
): Promise<EmbedResult> {
  if (!apiKey) throw new RangeError('apiKey required');
  const model = req.model ?? DEFAULT_MODEL;
  const baseUrl = req.baseUrl ?? DEFAULT_BASE_URL;
  const body: Record<string, unknown> = {
    model,
    input: req.input,
  };
  if (req.dimensions !== undefined) body.dimensions = req.dimensions;

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    model: string;
    data: { embedding: number[] }[];
  };
  const vectors = json.data.map((d) => d.embedding);
  return {
    vectors,
    model: json.model,
    dimensions: vectors[0]?.length ?? 0,
  };
}
