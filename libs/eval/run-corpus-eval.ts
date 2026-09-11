/**
 * libs/eval/run-corpus-eval.ts
 *
 * Day 22 — 库构建质量评测（spec §1.2 第 5 条）。
 *
 * 评测什么：
 *   - 覆盖率（file_format / category 维度）
 *   - 平均 chunk 数 / 文件
 *   - 抽取失败率（按 format）
 *   - 空 chunk 率
 *   - token 分布（min / median / max）
 *
 * Why 这个评测：
 *   - Day 19/20 评测只看 retrieval recall —— 不知道"是不是 chunking 阶段就坏了"
 *   - spec §1.2 明确要"两套都建"——库构建质量 + 端到端
 *
 * 输入：跑 ex_001_rag_ready_pipeline 同样的步骤，**不调 embedding**，纯本地统计
 *
 * 不做：
 *   - 不调 embedding / lancedb（库构建评测只看 RAG-ready 层）
 *   - 不做 embedding 维度分析（Day 41+ 话题）
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { buildManifest } from '../../examples/day21/rag-ready/manifest.js';
import { extractByFile } from '../../examples/day21/rag-ready/extractors.js';
import { chunkText } from '../../examples/day21/rag-ready/chunker.js';

export interface CorpusEvalReport {
  readonly totalFiles: number;
  readonly byCategory: Readonly<Record<string, { total: number; extracted: number }>>;
  readonly byFormat: Readonly<
    Record<
      string,
      {
        total: number;
        extracted: number;
        empty: number;
        unavailable: number;
      }
    >
  >;
  readonly overall: {
    readonly extractedRate: number;
    readonly emptyRate: number;
    readonly unavailableRate: number;
    readonly totalChunks: number;
    readonly avgChunksPerFile: number;
    readonly avgTokensPerChunk: number;
    readonly tokenMin: number;
    readonly tokenMedian: number;
    readonly tokenMax: number;
  };
}

export async function runCorpusEval(corpusDir: string): Promise<CorpusEvalReport> {
  const manifest = await buildManifest(corpusDir);

  const byCategory: Record<string, { total: number; extracted: number }> = {};
  const byFormat: Record<
    string,
    { total: number; extracted: number; empty: number; unavailable: number }
  > = {};

  let totalChunks = 0;
  let totalTokens = 0;
  let extractedCount = 0;
  let unavailableCount = 0;
  let emptyCount = 0;
  const tokenList: number[] = [];

  for (const entry of manifest) {
    const cat = entry.category;
    const fmt = extname(entry.filename).toLowerCase().replace(/^\./, '');
    byCategory[cat] = byCategory[cat] ?? { total: 0, extracted: 0 };
    byCategory[cat].total++;
    byFormat[fmt] = byFormat[fmt] ?? {
      total: 0,
      extracted: 0,
      empty: 0,
      unavailable: 0,
    };
    byFormat[fmt].total++;

    const buf = await readFile(join(corpusDir, entry.filename));
    const extracted = await extractByFile(entry.filename, buf);

    if (!extracted.ok && extracted.note === 'text_unavailable_image_requires_ocr') {
      byFormat[fmt].unavailable++;
      unavailableCount++;
      continue;
    }
    if (!extracted.ok || extracted.text.length < 10) {
      byFormat[fmt].empty++;
      emptyCount++;
      continue;
    }

    extractedCount++;
    byCategory[cat].extracted++;
    byFormat[fmt].extracted++;

    const chunks = chunkText(entry.filename, entry.category, extracted.text);
    totalChunks += chunks.length;
    for (const c of chunks) {
      totalTokens += c.token_count;
      tokenList.push(c.token_count);
    }
  }

  tokenList.sort((a, b) => a - b);
  const median = tokenList.length > 0 ? tokenList[Math.floor(tokenList.length / 2)]! : 0;

  const totalFiles = manifest.length;
  return {
    totalFiles,
    byCategory,
    byFormat,
    overall: {
      extractedRate: totalFiles > 0 ? extractedCount / totalFiles : 0,
      emptyRate: totalFiles > 0 ? emptyCount / totalFiles : 0,
      unavailableRate: totalFiles > 0 ? unavailableCount / totalFiles : 0,
      totalChunks,
      avgChunksPerFile: extractedCount > 0 ? totalChunks / extractedCount : 0,
      avgTokensPerChunk: totalChunks > 0 ? totalTokens / totalChunks : 0,
      tokenMin: tokenList.length > 0 ? tokenList[0]! : 0,
      tokenMedian: median,
      tokenMax: tokenList.length > 0 ? tokenList[tokenList.length - 1]! : 0,
    },
  };
}

// 兼容旧 call site（不接受 readdir，不影响 eval runner）
void readdir;
