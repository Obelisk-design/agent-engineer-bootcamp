/**
 * libs/eval/schema.ts
 *
 * Day 22 — Ground Truth QA 集 schema（纯类型 + zod 校验）。
 *
 * 设计依据：spec 2026-09-11 §4.2
 * - EvalQuery 是 GT 集的单条记录
 * - EvalDataset 是整体（含 version）
 * - QueryLabels / ChunkLabels / AnswerLabels 是三维度分类标签（spec §5）
 * - 校验失败 → throw（loader 决定怎么处理）
 *
 * Why 用 zod：
 * - GT 集是 JSON 文件，必须有 schema 校验，否则漏字段就崩
 * - zod 给 `safeParse` 可以做"校验 + 收集错误"，比手动 if/else 干净
 *
 * 不做：
 * - 不引 ORM / DB（GT 集是 JSON 文件 + version diff）
 * - 不锁 embedding / reranker 模型版本（Day 41+ 话题）
 */

import { z } from 'zod';

// ====== 三维度分类 schema（spec §5）======

export const QueryTypeSchema = z.enum([
  'factual',
  'multi_hop',
  'comparative',
  'definitional',
  'cross_domain',
]);

export const DomainSchema = z.enum(['hr', 'admin', 'finance', 'it', 'legal']);

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);

export type QueryType = z.infer<typeof QueryTypeSchema>;
export type Domain = z.infer<typeof DomainSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type ChunkType = z.infer<typeof ChunkTypeSchema>;
export type SourceFormat = z.infer<typeof SourceFormatSchema>;
export type AnswerType = z.infer<typeof AnswerTypeSchema>;
export type ExpectedLength = z.infer<typeof ExpectedLengthSchema>;

export const QueryLabelsSchema = z.object({
  type: QueryTypeSchema,
  domain: DomainSchema,
  difficulty: DifficultySchema,
  requiresMultiSource: z.boolean(),
  requiresNumeric: z.boolean(),
});
export type QueryLabels = z.infer<typeof QueryLabelsSchema>;

export const ChunkTypeSchema = z.enum(['heading', 'paragraph', 'table', 'list', 'image_text']);

export const SourceFormatSchema = z.enum([
  'md',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'png',
  'jpg',
  'webp',
  'tiff',
  'eml',
  'zip',
  'html',
  'csv',
  'txt',
  'json',
  'yaml',
  'wiki.md',
]);

export const ChunkLabelsSchema = z.object({
  chunkType: ChunkTypeSchema,
  sourceFormat: SourceFormatSchema,
  hasNumeric: z.boolean(),
  hasList: z.boolean(),
  isTrapClause: z.boolean(),
});
export type ChunkLabels = z.infer<typeof ChunkLabelsSchema>;

export const AnswerTypeSchema = z.enum(['factoid', 'explanation', 'procedure', 'comparison']);

export const ExpectedLengthSchema = z.enum(['short', 'medium', 'long']);

export const AnswerLabelsSchema = z.object({
  answerType: AnswerTypeSchema,
  expectedLength: ExpectedLengthSchema,
  requiresReasoning: z.boolean(),
  isAmbiguous: z.boolean(),
});
export type AnswerLabels = z.infer<typeof AnswerLabelsSchema>;

// ====== EvalQuery + EvalDataset（spec §4.2）======

export const EvalQuerySchema = z.object({
  id: z.string().regex(/^Q\d{3}$/),
  query: z.string().min(1),
  expectedAnswer: z.string().min(1),
  expectedChunkIds: z.array(z.string()).min(1),
  queryLabels: QueryLabelsSchema,
  chunkLabels: z.array(ChunkLabelsSchema),
  answerLabels: AnswerLabelsSchema,
  source: z.enum(['human', 'llm']),
  humanReviewed: z.boolean(),
  updatedAt: z.string().optional(),
});
export type EvalQuery = z.infer<typeof EvalQuerySchema>;

export const EvalDatasetSchema = z.object({
  version: z.string(),
  queries: z.array(EvalQuerySchema),
});
export type EvalDataset = z.infer<typeof EvalDatasetSchema>;

// ====== Transient runtime 字段（不入 JSON；spec §4.2）======

/** GT loader 跑前校验后挂的标记 —— eval 跳过 stale 标记的 query */
export interface EvalQueryRuntime {
  readonly gtStale: boolean;
  /** 校验错误（zod safeParse 失败时填） */
  readonly validationError?: string;
}
