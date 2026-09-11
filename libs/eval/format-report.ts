/**
 * libs/eval/format-report.ts
 *
 * Day 22 — 报告格式化（spec §6.2 输出）。
 *
 * 两份报告：
 *   - formatCorpusReport（库构建）
 *   - formatRetrievalReport（端到端）
 *
 * 设计要点：
 *   - 输出 Markdown 文本（CLI 打印友好）
 *   - 不做 HTML / PDF（Day 41+ 话题）
 *   - 不做跨日 diff（Day 41+ 话题）
 */

import type { CorpusEvalReport } from './run-corpus-eval.js';
import type { RetrievalEvalReport } from './run-retrieval-eval.js';

export function formatCorpusReport(report: CorpusEvalReport): string {
  const lines: string[] = [];
  lines.push('## 库构建评测报告');
  lines.push('');
  lines.push(`总文件数: ${report.totalFiles}`);
  lines.push('');
  lines.push('### 按分类');
  lines.push('| category | total | extracted |');
  lines.push('| --- | --- | --- |');
  for (const [cat, s] of Object.entries(report.byCategory)) {
    lines.push(`| ${cat} | ${s.total} | ${s.extracted} |`);
  }
  lines.push('');
  lines.push('### 按格式');
  lines.push('| format | total | extracted | empty | unavailable |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const [fmt, s] of Object.entries(report.byFormat)) {
    lines.push(`| ${fmt} | ${s.total} | ${s.extracted} | ${s.empty} | ${s.unavailable} |`);
  }
  lines.push('');
  lines.push('### 整体');
  const o = report.overall;
  lines.push(`- 抽取成功率: ${(o.extractedRate * 100).toFixed(1)}%`);
  lines.push(`- 空/失败率:   ${(o.emptyRate * 100).toFixed(1)}%`);
  lines.push(`- 无 OCR 率:   ${(o.unavailableRate * 100).toFixed(1)}%`);
  lines.push(`- 总 chunks:   ${o.totalChunks}`);
  lines.push(`- 平均 chunks/文件: ${o.avgChunksPerFile.toFixed(2)}`);
  lines.push(`- 平均 tokens/chunk: ${Math.round(o.avgTokensPerChunk)}`);
  lines.push(`- token 分布: min=${o.tokenMin} median=${o.tokenMedian} max=${o.tokenMax}`);
  return lines.join('\n');
}

export function formatRetrievalReport(report: RetrievalEvalReport): string {
  const lines: string[] = [];
  lines.push(`## 检索评测报告 (${report.runId})`);
  lines.push(`时间: ${report.timestamp}`);
  lines.push(`pool K=${report.poolK} → final top_n=${report.finalK}`);
  lines.push('');
  lines.push('### 整体聚合');
  lines.push(`- 总数: ${report.aggregate.total} (跳过 stale ${report.aggregate.skippedStale})`);
  lines.push(`- recall@5:  ${(report.aggregate.recallAt5 * 100).toFixed(1)}%`);
  lines.push(`- recall@10: ${(report.aggregate.recallAt10 * 100).toFixed(1)}%`);
  lines.push(`- recall@20: ${(report.aggregate.recallAt20 * 100).toFixed(1)}%`);
  lines.push(`- final-hit: ${(report.aggregate.finalHitRate * 100).toFixed(1)}%`);
  lines.push(`- judge-avg: ${report.aggregate.judgeAvg.toFixed(3)}`);
  lines.push(`- rerank 失败: ${report.aggregate.rerankFailedCount}`);
  lines.push(`- judge 失败: ${report.aggregate.judgeFailedCount}`);
  lines.push('');
  lines.push('### per-query');
  lines.push('| Query | final | recall@20 | rerank | judge |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of report.rows) {
    const judge = r.judgeFailed ? '❌' : r.judgeScore !== null ? `${r.judgeScore}` : '-';
    lines.push(
      `| ${r.queryId} ${r.query.slice(0, 20)} | ${r.finalHit ? '✅' : '❌'} | ${r.recallAt20 ? '✅' : '❌'} | ${r.rerankFailed ? 'fallback' : 'OK'} | ${judge} |`,
    );
  }
  lines.push('');
  lines.push('### 按 query type 维度');
  lines.push('| type | total | final-hit | recall@20 |');
  lines.push('| --- | --- | --- | --- |');
  for (const [k, s] of Object.entries(report.byDimension.type)) {
    lines.push(`| ${k} | ${s.total} | ${s.finalHit} | ${s.recallAt20} |`);
  }
  lines.push('');
  lines.push('### 按 domain 维度');
  lines.push('| domain | total | final-hit | recall@20 |');
  lines.push('| --- | --- | --- | --- |');
  for (const [k, s] of Object.entries(report.byDimension.domain)) {
    lines.push(`| ${k} | ${s.total} | ${s.finalHit} | ${s.recallAt20} |`);
  }
  lines.push('');
  lines.push('### 按 difficulty 维度');
  lines.push('| difficulty | total | final-hit | recall@20 |');
  lines.push('| --- | --- | --- | --- |');
  for (const [k, s] of Object.entries(report.byDimension.difficulty)) {
    lines.push(`| ${k} | ${s.total} | ${s.finalHit} | ${s.recallAt20} |`);
  }
  return lines.join('\n');
}
