/**
 * apps/web/src/views/embed/api.ts
 *
 * 前端 OpenAI 适配：从 import.meta.env 读 VITE_OPENAI_API_KEY / VITE_OPENAI_BASE_URL /
 * VITE_OPENAI_EMBEDDING_MODEL，warn 一次，调用 libs/embedding.embed。
 * key 缺失时返回 null，由 EmbedDemo 显示红 banner。
 */

import { embed } from '../../../../../libs/embedding/index.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'text-embedding-3-small';

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
  dimensions: 4096 | 256,
  signal?: AbortSignal,
): Promise<number[][]> {
  const { apiKey, baseUrl, modelName } = getOpenAIConfig();
  if (apiKey === null) throw new RangeError('VITE_OPENAI_API_KEY not set');
  const result = await embed(
    { input: texts, dimensions, model: modelName, baseUrl },
    apiKey,
    signal,
  );
  return result.vectors;
}
