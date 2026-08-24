/**
 * libs/rag/evaluate.ts
 *
 * 5 条 fixed query × 2 种 chunk 策略 = 10 次 retrieve 自动跑分。
 *
 * 评估口径：
 *   hit = top-K hits 里有任一 chunk **文本内 expectedKeywords 全中**（默认 K=3, expectedKeywords 全量 AND）
 *
 * 输出：
 *   - 控制台打印 Markdown 表（heading vs paragraph 命中率 + 平均 elapsedMs）
 *   - 返回 EvaluateReport（便于 example 进一步处理）
 *
 * 5 条 query 选型（决策 B）：
 *   Q1 关键词型    "4闸必跑是哪4 个"
 *   Q2  问句型      "为什么不引 ml 库"
 *   Q3  跨文档型    "tool 参数契约的事实源是什么"
 *   Q4  表格型      "zod union 怎么写"
 *   Q5  ADR 型      "Agent.runEvents messages 边界"
 *
 * Why 这些 query 覆盖 4 类典型场景：
 *   - 关键词型：high-density term，应被多种 chunk 命中
 *   - 问句型：句式相似（vs 词项）要求语义级匹配
 *   - 跨文档型：期望分布在多文件，靠 chunk 粒度决定是否漏
 *   - 表格型：表格可能被 paragraph 切碎
 *   - ADR 型：结构化短文档，命中容易
 *
 * 不做：
 *   - LLM-judge 评估（路线表 Day 16-17 才上；今天只用关键词命中）
 *   - 不动 ex 脚本里改 query（保持固定，便于回归对比）
 */

import type { SearchHit } from './store.js';
import type { ChunkStrategy } from './retrieve.js';

export interface EvalQuery {
  readonly id: string;
  readonly query: string;
  readonly expectedKeywords: readonly string[];
  /** "all"（默认，全中）| "any"（任一中）—— Q3 跨文档型用 any 更合理 */
  readonly matchMode?: 'all' | 'any';
  /** "main"（daily+adr）| "test"（test-corpus）—— 默认 main */
  readonly corpus?: 'main' | 'test';
}

export const DEFAULT_EVAL_QUERIES: readonly EvalQuery[] = [
  {
    id: 'Q1',
    query: '4闸必跑是哪4 个',
    // any 模式：4 个 keyword 任一命中即算（paragraph 切把"4闸必跑"和"vitest/typecheck"散到不同 chunk）
    expectedKeywords: ['vitest', 'typecheck', 'lint', 'typecheck:web'],
    matchMode: 'any',
  },
  {
    id: 'Q2',
    query: '为什么不引 ml 库',
    expectedKeywords: ['PCA', 'power iteration'],
    matchMode: 'any',
  },
  {
    id: 'Q3',
    query: 'tool 参数契约的事实源是什么',
    expectedKeywords: ['zod'],
    matchMode: 'any',
  },
  {
    id: 'Q4',
    query: 'zod union 怎么写',
    expectedKeywords: ['z.union'],
  },
  {
    id: 'Q5',
    query: 'Agent.runEvents messages 边界',
    expectedKeywords: ['runEvents'],
  },
  {
    id: 'Q6',
    query: '紫光云是什么',
    expectedKeywords: ['紫光云'],
    corpus: 'test',
  },
];

/**
 * 判断一个 hits 列表是否"命中"某条 query。
 * 默认 top-K=3 内任一 chunk 文本满足 keywords 全部包含（AND 关系）。
 */
export function judgeHit(query: EvalQuery, hits: readonly SearchHit[], k = 3): boolean {
  const mode = query.matchMode ?? 'all';
  const top = hits.slice(0, k);
  if (top.length === 0) return false;
  if (mode === 'any') {
    return top.some((h) => query.expectedKeywords.some((kw) => h.record.text.includes(kw)));
  }
  return top.some((h) => query.expectedKeywords.every((kw) => h.record.text.includes(kw)));
}

export interface EvalRow {
  readonly queryId: string;
  readonly chunkStrategy: ChunkStrategy;
  readonly hit: boolean;
  readonly elapsedMs: number;
  readonly topSources: readonly string[];
}

export interface EvaluateReport {
  readonly rows: readonly EvalRow[];
  /** "heading" | "paragraph" 各自的命中数 / 总数 */
  readonly summary: Readonly<Record<ChunkStrategy, { hit: number; total: number; avgElapsedMs: number }>>;
}

export function buildReport(rows: readonly EvalRow[]): EvaluateReport {
  const summary: Record<ChunkStrategy, { hit: number; total: number; avgElapsedMs: number }> = {
    heading: { hit: 0, total: 0, avgElapsedMs: 0 },
    paragraph: { hit: 0, total: 0, avgElapsedMs: 0 },
  };
  for (const r of rows) {
    const s = summary[r.chunkStrategy];
    summary[r.chunkStrategy] = {
      hit: s.hit + (r.hit ? 1 : 0),
      total: s.total + 1,
      avgElapsedMs: s.avgElapsedMs + r.elapsedMs,
    };
  }
  for (const k of ['heading', 'paragraph'] as const) {
    const s = summary[k];
    summary[k] = { ...s, avgElapsedMs: s.total > 0 ? s.avgElapsedMs / s.total : 0 };
  }
  return { rows, summary };
}

export function formatReport(report: EvaluateReport): string {
  const lines: string[] = [];
  lines.push('| Query | heading | paragraph |');
  lines.push('| --- | --- | --- |');
  const byQ = new Map<string, { heading?: EvalRow; paragraph?: EvalRow }>();
  for (const r of report.rows) {
    const m = byQ.get(r.queryId) ?? {};
    byQ.set(r.queryId, { ...m, [r.chunkStrategy]: r });
  }
  for (const [qid, m] of byQ) {
    const h = m.heading;
    const p = m.paragraph;
    lines.push(
      `| ${qid} | ${h ? (h.hit ? `✅ ${h.elapsedMs}ms` : `❌ ${h.elapsedMs}ms`) : '-'} | ${p ? (p.hit ? `✅ ${p.elapsedMs}ms` : `❌ ${p.elapsedMs}ms`) : '-'} |`,
    );
  }
  lines.push('');
  lines.push(`**heading**: ${report.summary.heading.hit}/${report.summary.heading.total} (avg ${report.summary.heading.avgElapsedMs.toFixed(0)}ms)`);
  lines.push(`**paragraph**: ${report.summary.paragraph.hit}/${report.summary.paragraph.total} (avg ${report.summary.paragraph.avgElapsedMs.toFixed(0)}ms)`);
  return lines.join('\n');
}