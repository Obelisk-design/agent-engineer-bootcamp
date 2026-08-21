/**
 * apps/web/src/views/embed/api.ts
 *
 * 前端 OpenAI 适配：从 import.meta.env 读 VITE_OPENAI_API_KEY / VITE_OPENAI_BASE_URL /
 * VITE_OPENAI_EMBEDDING_MODEL，warn 一次，调用 libs/embedding.embed。
 * key 缺失时返回 null，由 EmbedDemo 显示红 banner。
 */

import { embed } from '../../../../../libs/embedding/index.js';

const DEFAULT_BASE_URL = 'http://10.230.10.242:8000/v1';
const DEFAULT_MODEL = 'qwen3-embedding-8b';

let warned = false;

export interface OpenAIConfig {
  apiKey: string | null;
  baseUrl: string;
  modelName: string;
}

export function getOpenAIConfig(): OpenAIConfig {
  const apiKeyRaw = import.meta.env.VITE_OPENAI_API_KEY;
  const apiKey = typeof apiKeyRaw === 'string' && apiKeyRaw.length > 0 ? apiKeyRaw : null;
  const baseUrlRaw = import.meta.env.VITE_OPENAI_BASE_URL;
  const baseUrl =
    typeof baseUrlRaw === 'string' && baseUrlRaw.length > 0 ? baseUrlRaw : DEFAULT_BASE_URL;
  const modelRaw = import.meta.env.VITE_OPENAI_EMBEDDING_MODEL;
  const modelName = typeof modelRaw === 'string' && modelRaw.length > 0 ? modelRaw : DEFAULT_MODEL;
  return { apiKey, baseUrl, modelName };
}

export function warnDevKeyOnce(): void {
  if (warned) return;
  warned = true;
  if (getOpenAIConfig().apiKey !== null) {
    console.warn('[embed-demo] VITE_OPENAI_API_KEY is exposed in the browser — dev-only.');
  }
}

export async function embedTexts(
  texts: readonly string[],
  dimensions?: 4096 | 256,
  signal?: AbortSignal,
): Promise<number[][]> {
  const { apiKey, baseUrl, modelName } = getOpenAIConfig();
  if (apiKey === null) throw new RangeError('VITE_OPENAI_API_KEY not set');
  // Day 12 fix：dev 网关 vLLM/litellm 不支持 dimensions 参数（连原生 4096 也拒）。
  // 只在 caller 显式传 dimensions 时才下发 —— caller 必须知道该模型支持 Matryoshka。
  // 默认 undefined 让模型返回原生维度（最稳）。
  const req: Parameters<typeof embed>[0] = { input: texts, model: modelName, baseUrl };
  if (dimensions !== undefined) req.dimensions = dimensions;
  const result = await embed(req, apiKey, signal);
  return result.vectors;
}
