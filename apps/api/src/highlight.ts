/**
 * apps/api/src/highlight.ts
 *
 * 给定 query + content，输出 query 关键词在 content 中的 charRange 列表。
 *
 * 实现：把 query 按空格拆词，过滤空字符串 + 去重，对每个 term 在 content
 * 里做大小写不敏感的全局正则匹配，收集所有 (start, end) 区间。
 *
 * YAGNI：不做 fuzzy / 同义词 / 词形还原。
 */

import type { Highlight } from '../../../libs/api-schema/src/index.js';

/** 转义正则元字符。 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function computeHighlight(query: string, content: string): Highlight[] {
  const terms = Array.from(
    new Set(
      query
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );
  if (terms.length === 0) return [];

  const out: Highlight[] = [];
  for (const term of terms) {
    const re = new RegExp(escapeRegExp(term), 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, term });
      // 避免零宽匹配死循环
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  // 按 start 排序
  out.sort((a, b) => a.start - b.start);
  return out;
}
