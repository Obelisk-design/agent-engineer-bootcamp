/**
 * libs/eval/classify.ts
 *
 * Day 22 — 三维度分类器（query / chunk / answer）。
 *
 * 设计依据：spec §5
 *
 * 实现策略（YAGNI）：
 *   - **规则分类**（不调 LLM）—— 关键词 + 正则覆盖大多数场景
 *   - 老大能在生成 GT 时直接手填标签（gt-raw.json → gt-dataset.json）
 *   - 规则兜底：标签不确定时填默认值（difficulty=medium）
 *
 * Why 不调 LLM 自动打标：
 *   - 调 LLM 要网络 + 钱 + 不可重现
 *   - 老大写 GT 时同步手填标签最准
 *   - 后续 Day 41+ 才上 LLM 自动打标（路线表话题）
 *
 * 不做：
 *   - 不做 LLM 自动打标（Day 41+ 话题）
 *   - 不做标签版本管理（Day 41+ 话题）
 */

import type {
  AnswerLabels,
  AnswerType,
  ChunkLabels,
  ChunkType,
  QueryLabels,
  QueryType,
} from './schema.js';

// ====== query 维度规则分类 ======

const MULTI_HOP_HINTS = /\b(为什么|怎么|流程|步骤|对比|区别|差异)\b/;
const COMPARATIVE_HINTS = /\b(对比|区别|差异|哪个|哪个更好|vs)\b/;
const DEFINITIONAL_HINTS = /\b(是什么|定义|什么是|什么叫)\b/;
const CROSS_DOMAIN_HINTS = /\b(人事.*财务|IT.*法务|行政.*HR|跨部门|跨领域)\b/;
const NUMERIC_HINTS = /\d|金额|元|天|小时|月|百分比|%|率/;

export function classifyQuery(query: string, domain: QueryLabels['domain']): QueryLabels {
  const lower = query.toLowerCase();
  let type: QueryType = 'factual';
  if (COMPARATIVE_HINTS.test(query)) type = 'comparative';
  else if (DEFINITIONAL_HINTS.test(query)) type = 'definitional';
  else if (MULTI_HOP_HINTS.test(query)) type = 'multi_hop';
  else if (CROSS_DOMAIN_HINTS.test(query)) type = 'cross_domain';

  // 难度 = 字符数 + 多跳标记
  const isMulti = type === 'multi_hop' || type === 'comparative' || type === 'cross_domain';
  const difficulty: QueryLabels['difficulty'] = isMulti
    ? query.length > 30
      ? 'hard'
      : 'medium'
    : query.length > 20
      ? 'medium'
      : 'easy';

  // requiresMultiSource = 比较 / 多跳 / 跨领域
  const requiresMultiSource =
    type === 'comparative' || type === 'multi_hop' || type === 'cross_domain';

  // 兜底：lower 中包含数字或金额相关词
  void lower;
  const requiresNumeric = NUMERIC_HINTS.test(query);

  return {
    type,
    domain,
    difficulty,
    requiresMultiSource,
    requiresNumeric,
  };
}

// ====== chunk 维度规则分类 ======

const TABLE_HINT = /\|.*\|/; // markdown 表格行
const LIST_HINT = /^[\s]*[-*+]\s/m; // markdown 列表行
const HEADING_HINT = /^#{1,6}\s/m; // markdown heading
const TRAP_HINT = /(以旧文为准|本规定废止|最终以.*为准|旧版)/;

export function classifyChunk(
  text: string,
  sourceFormat: ChunkLabels['sourceFormat'],
): ChunkLabels {
  let chunkType: ChunkType = 'paragraph';
  if (TABLE_HINT.test(text)) chunkType = 'table';
  else if (LIST_HINT.test(text)) chunkType = 'list';
  else if (HEADING_HINT.test(text)) chunkType = 'heading';

  const hasNumeric = /\d/.test(text);
  const hasList = LIST_HINT.test(text);
  const isTrapClause = TRAP_HINT.test(text);

  return {
    chunkType,
    sourceFormat,
    hasNumeric,
    hasList,
    isTrapClause,
  };
}

// ====== answer 维度规则分类 ======

const PROCEDURE_HINT = /\b(步骤|流程|依次|首先.*然后.*最后)\b/;
const COMPARISON_ANSWER_HINT = /\b(区别|对比|优缺点|优劣势)\b/;

export function classifyAnswer(expectedAnswer: string, queryType: QueryType): AnswerLabels {
  let answerType: AnswerType = 'factoid';
  if (PROCEDURE_HINT.test(expectedAnswer)) answerType = 'procedure';
  else if (COMPARISON_ANSWER_HINT.test(expectedAnswer)) answerType = 'comparison';
  else if (queryType === 'definitional' || queryType === 'multi_hop') answerType = 'explanation';

  const expectedLength: AnswerLabels['expectedLength'] =
    expectedAnswer.length < 50 ? 'short' : expectedAnswer.length < 200 ? 'medium' : 'long';

  const requiresReasoning = answerType === 'explanation' || answerType === 'comparison';
  const isAmbiguous = /\b(或|可能|视情况)\b/.test(expectedAnswer);

  return {
    answerType,
    expectedLength,
    requiresReasoning,
    isAmbiguous,
  };
}

// ====== 统计工具（用于 ex_004 输出分布）======

export function summarizeQueryLabels(queries: readonly { queryLabels: QueryLabels }[]): string {
  const byType = new Map<QueryType, number>();
  const byDomain = new Map<string, number>();
  const byDifficulty = new Map<string, number>();
  for (const q of queries) {
    byType.set(q.queryLabels.type, (byType.get(q.queryLabels.type) ?? 0) + 1);
    byDomain.set(q.queryLabels.domain, (byDomain.get(q.queryLabels.domain) ?? 0) + 1);
    byDifficulty.set(
      q.queryLabels.difficulty,
      (byDifficulty.get(q.queryLabels.difficulty) ?? 0) + 1,
    );
  }
  const fmt = (m: Map<string, number>) => [...m.entries()].map(([k, v]) => `${k}=${v}`).join(', ');
  return `type: ${fmt(byType as Map<string, number>)} | domain: ${fmt(byDomain)} | difficulty: ${fmt(byDifficulty)}`;
}
