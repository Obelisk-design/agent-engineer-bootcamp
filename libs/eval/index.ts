/**
 * libs/eval/index.ts — barrel
 *
 * Day 22 — 一次 import 拿全 eval 工具链。
 *
 * 用法：
 *   import {
 *     loadGtDataset, runCorpusEval, runRetrievalEval,
 *     formatCorpusReport, formatRetrievalReport,
 *     judgeLLM, makeJudgeCallback,
 *     classifyQuery, classifyChunk, classifyAnswer,
 *     type EvalQuery, type LoadedQuery, type CorpusEvalReport, type RetrievalEvalReport,
 *   } from '../../libs/eval/index.js';
 */

// ====== schema / types ======
export {
  EvalQuerySchema,
  EvalDatasetSchema,
  QueryLabelsSchema,
  ChunkLabelsSchema,
  AnswerLabelsSchema,
  type EvalQuery,
  type EvalDataset,
  type EvalQueryRuntime,
  type QueryLabels,
  type ChunkLabels,
  type AnswerLabels,
  type QueryType,
  type Domain,
  type Difficulty,
  type ChunkType,
  type SourceFormat,
  type AnswerType,
  type ExpectedLength,
} from './schema.js';

// ====== GT loader ======
export {
  loadGtDataset,
  dropStale,
  countStale,
  type LoadedQuery,
  type LoadOptions,
} from './gt-loader.js';

// ====== classify ======
export { classifyQuery, classifyChunk, classifyAnswer, summarizeQueryLabels } from './classify.js';

// ====== run-corpus-eval ======
export { runCorpusEval, type CorpusEvalReport } from './run-corpus-eval.js';

// ====== run-retrieval-eval ======
export {
  runRetrievalEval,
  type RetrievalEvalRow,
  type RetrievalEvalReport,
  type RunRetrievalOptions,
} from './run-retrieval-eval.js';

// ====== format-report ======
export { formatCorpusReport, formatRetrievalReport } from './format-report.js';

// ====== judge-llm ======
export { judgeLLM, makeJudgeCallback, type JudgeVerdict, type JudgeOptions } from './judge-llm.js';
