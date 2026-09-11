/**
 * apps/web/src/views/eval/api.ts
 *
 * Day 22 — Eval Platform 前端 API 客户端。
 *
 * 6 条 API（spec §4.4）：
 *   - GET  /eval/reports         —— 历史报告
 *   - POST /eval/corpus          —— 跑库构建评测
 *   - POST /eval/retrieve        —— 跑检索评测
 *   - GET  /eval/dataset         —— GT 集
 *   - GET  /eval/corpus-stats    —— 库探针
 *   - POST /eval/judge           —— 单条 LLM Judge
 *
 * 不做：
 *   - 不直接调 dev 网关 LLM（API 层在 apps/api）
 *   - 不做 polling（手动刷新）
 *
 * 类型策略：web 不 import libs/eval 类型（web tsconfig 用 Bundler resolution + libs/eval
 * 没声明文件，触发 TS2307）。改用 unknown + page 层 cast。
 */

export interface EvalQueryView {
  readonly id: string;
  readonly query: string;
  readonly expectedAnswer: string;
  readonly expectedChunkIds: readonly string[];
  readonly queryLabels: {
    readonly type: string;
    readonly domain: string;
    readonly difficulty: string;
    readonly requiresMultiSource: boolean;
    readonly requiresNumeric: boolean;
  };
  readonly answerLabels: {
    readonly answerType: string;
    readonly expectedLength: string;
    readonly requiresReasoning: boolean;
    readonly isAmbiguous: boolean;
  };
  readonly source: 'human' | 'llm';
  readonly humanReviewed: boolean;
}

export interface RetrievalEvalReportView {
  readonly runId: string;
  readonly timestamp: string;
  readonly poolK: number;
  readonly finalK: number;
  readonly aggregate: {
    readonly total: number;
    readonly skippedStale: number;
    readonly recallAt5: number;
    readonly recallAt10: number;
    readonly recallAt20: number;
    readonly finalHitRate: number;
    readonly judgeAvg: number;
    readonly rerankFailedCount: number;
    readonly judgeFailedCount: number;
  };
}

export interface CorpusEvalReportView {
  readonly totalFiles: number;
  readonly overall: {
    readonly extractedRate: number;
    readonly totalChunks: number;
    readonly avgChunksPerFile: number;
  };
}

const BASE = '/api/eval';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export interface DatasetResponse {
  version: string;
  queries: readonly EvalQueryView[];
  total: number;
  humanReviewed: number;
}

export async function fetchDataset(): Promise<DatasetResponse> {
  return get<DatasetResponse>('/dataset');
}

export async function fetchReports(): Promise<{
  retrieval: readonly RetrievalEvalReportView[];
  corpus: readonly CorpusEvalReportView[];
}> {
  return get('/reports');
}

export async function fetchCorpusStats(): Promise<{
  tableName: string;
  size: number;
  sample: readonly { id: string; source: string; text: string }[];
}> {
  return get('/corpus-stats');
}

export async function runCorpusEval(): Promise<CorpusEvalReportView> {
  return post<CorpusEvalReportView>('/corpus', {});
}

export async function runRetrievalEval(
  opts: {
    gtPath?: string;
    poolK?: number;
    finalK?: number;
  } = {},
): Promise<RetrievalEvalReportView> {
  return post<RetrievalEvalReportView>('/retrieve', opts);
}

export async function runJudge(
  query: string,
  answer: string,
  expectedAnswer: string,
): Promise<{
  score: number;
  reasoning: string;
}> {
  return post('/judge', { query, answer, expectedAnswer });
}
