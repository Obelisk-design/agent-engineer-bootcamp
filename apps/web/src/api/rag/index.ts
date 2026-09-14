/**
 * apps/web/src/api/rag/index.ts
 * Day 23 Task 4 (P3) —— RAG 后端 API 封装
 *
 * 后端：apps/api 的 rag app（端口 3100）
 * Vite proxy：/api/* → http://localhost:3100/*（去 /api 前缀，见 vite.config.ts）
 * Day 24：数据源 = .lancedb/{corporate,docs}/chunks_{corpus}_{RAG_ACTIVE_VERSION}_heading
 *         namespace ∈ {corporate, docs, all}（notion/md 后端降级返空 hits）
 */
import axios from 'axios';
import type { Hit, SearchResponse } from '../../../../../libs/api-schema/src/index.js';

const http = axios.create({ baseURL: '/api', timeout: 60_000 });

// Re-export 让 store / view 直接用本地路径
export type { Hit, SearchResponse };

export async function search(
  query: string,
  topK = 5,
  namespace: 'corporate' | 'docs' | 'all' = 'all',
): Promise<SearchResponse> {
  const { data } = await http.post('/search', { query, topK, namespace });
  return data as SearchResponse;
}
