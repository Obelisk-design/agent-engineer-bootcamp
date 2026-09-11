/**
 * apps/web/src/api/eval/index.ts
 * Day 23 Task 3 (P2) —— Eval 后端 API 封装
 *
 * 后端：apps/api 的 eval app，端口 3202
 * Vite proxy：/api/eval/* → http://localhost:3202/eval/*（去 /api 前缀，见 vite.config.ts）
 * 数据源：examples/day22 生成到 libs/eval/reports/*.json
 */
import axios from 'axios';

const http = axios.create({ baseURL: '/api/eval', timeout: 60_000 });

export interface RetrievalEvalReportView {
  runId: string;
  timestamp: string;
  aggregate: {
    total: number;
    recallAt20: number;
    finalHitRate: number;
    judgeAvg: number;
  };
}

export interface CorpusEvalReportView {
  totalFiles: number;
  overall: { extractedRate: number; totalChunks: number };
}

export interface CorpusStats {
  tableName: string;
  size: number;
  sample: Array<{ id: string; source: string; text: string }>;
}

export async function fetchReports(): Promise<{
  retrieval: RetrievalEvalReportView[];
  corpus: CorpusEvalReportView[];
}> {
  const { data } = await http.get('/reports');
  return data;
}

export async function fetchCorpusStats(): Promise<CorpusStats> {
  const { data } = await http.get('/corpus-stats');
  return data;
}
