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
  /** 哪些 index 被 placeholder 替代（dev 网关 NaN 防卡死用） */
  fallbackFlags: boolean[];
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** 占位文本：dev 网关 qwen3-embedding-8b 对某些输入（极短 / 特殊字符 / 全空白）输出 NaN vector。
 *  用统一 placeholder 替代，retrieval 时这条记录不会被命中（cosine 无意义），但不影响整体。 */
export const EMBED_FALLBACK_TEXT = '[empty]';

function isFiniteVector(v: readonly number[]): boolean {
  for (let i = 0; i < v.length; i++) {
    const n = v[i]!;
    if (!Number.isFinite(n)) return false;
  }
  return true;
}

interface EmbedJson {
  model: string;
  data: { embedding: number[] }[];
}

async function singleEmbed(
  input: string,
  model: string,
  baseUrl: string,
  apiKey: string,
  dimensions: EmbedDimensions | undefined,
  signal: AbortSignal | undefined,
): Promise<number[] | null> {
  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input,
        ...(dimensions !== undefined ? { dimensions } : {}),
      }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as EmbedJson;
    const v = json.data[0]?.embedding;
    return v !== undefined && isFiniteVector(v) ? v : null;
  } catch {
    return null;
  }
}

async function batchEmbed(
  inputs: readonly string[],
  model: string,
  baseUrl: string,
  apiKey: string,
  dimensions: EmbedDimensions | undefined,
  signal: AbortSignal | undefined,
): Promise<number[][] | null> {
  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: inputs,
        ...(dimensions !== undefined ? { dimensions } : {}),
      }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as EmbedJson;
    return json.data.map((d) => d.embedding);
  } catch {
    return null;
  }
}

export async function embed(
  req: EmbedRequest,
  apiKey: string,
  signal?: AbortSignal,
): Promise<EmbedResult> {
  if (!apiKey) throw new RangeError('apiKey required');
  const model = req.model ?? DEFAULT_MODEL;
  const baseUrl = req.baseUrl ?? DEFAULT_BASE_URL;
  const inputs = Array.isArray(req.input) ? [...req.input] : [req.input];

  // Day 13 修：dev 网关 vLLM 对某些输入（极短 / 特殊字符）**整批**返回 400 "NaN not JSON compliant"。
  // 修复策略：先整批试 → 若 400，按二分定位坏 chunk → 单条 fallback。
  // 这样避免被 NaN 卡住整批。

  let vectors = await batchEmbed(inputs, model, baseUrl, apiKey, req.dimensions, signal);
  /** 哪些 index 被 fallback 占位（true = 该 vector 是 placeholder，不是真实输入的向量） */
  const fallbackFlags: boolean[] = new Array(inputs.length).fill(false);
  if (vectors === null) {
    // 整批失败 —— 二分定位坏 chunk
    const acc: number[][] = [];
    const findFallback = async (start: number, end: number): Promise<void> => {
      if (start > end) return;
      const subBatch = await batchEmbed(
        inputs.slice(start, end + 1),
        model,
        baseUrl,
        apiKey,
        req.dimensions,
        signal,
      );
      if (subBatch === null) {
        if (start === end) {
          // 单条失败：单独试一次 → 还失败就用 placeholder
          const direct = await singleEmbed(
            inputs[start]!,
            model,
            baseUrl,
            apiKey,
            req.dimensions,
            signal,
          );
          if (direct !== null) {
            acc.push(direct);
          } else {
            const fb = await singleEmbed(
              EMBED_FALLBACK_TEXT,
              model,
              baseUrl,
              apiKey,
              req.dimensions,
              signal,
            );
            if (fb !== null) {
              acc.push(fb);
              fallbackFlags[start] = true;
            } else {
              acc.push([]);
              fallbackFlags[start] = true;
            }
          }
        } else {
          const mid = Math.floor((start + end) / 2);
          await findFallback(start, mid);
          await findFallback(mid + 1, end);
        }
      } else {
        for (let i = start; i <= end; i++) {
          acc.push(subBatch[i - start]!);
        }
      }
    };
    await findFallback(0, inputs.length - 1);
    vectors = acc;
  } else {
    // 整批 OK，但仍可能有 NaN/Inf vector
    for (let i = 0; i < vectors.length; i++) {
      if (!isFiniteVector(vectors[i]!)) {
        const fb = await singleEmbed(
          EMBED_FALLBACK_TEXT,
          model,
          baseUrl,
          apiKey,
          req.dimensions,
          signal,
        );
        if (fb !== null) {
          vectors[i] = fb;
          fallbackFlags[i] = true;
        } else {
          vectors[i] = [];
          fallbackFlags[i] = true;
        }
      }
    }
  }

  return {
    vectors,
    model,
    dimensions: vectors[0]?.length ?? 0,
    fallbackFlags,
  };
}
