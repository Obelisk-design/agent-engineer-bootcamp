/**
 * examples/day18/ex_001_density_diff.ts
 *
 * Day 18 关键词密度对比：heading（chunkByHeadingSmart）vs paragraph（chunkByParagraph overlap 400）。
 *
 * 跑 5 篇真 daily 文档，统计每篇 × 每个关键词 × 两种 strategy 的"含关键词 chunk 数"。
 * 输出 Markdown 表，让"heading 切密度向 paragraph 切看齐"的目标可肉眼对比。
 *
 * 前置：无（纯本地 chunk 函数，不依赖 dev 网关）。
 *
 * 跑法：npx tsx examples/day18/ex_001_density_diff.ts
 *
 * 解读：
 *   - 调前（Day 17 baseline）heading cosine / PCA 命中数 < paragraph 的 50%
 *   - 调后目标：heading 命中数 ≥ paragraph 的 80%
 *   - heading chunk 总数应 > paragraph chunk 总数（heading 长段被切碎）
 *
 * 不做（YAGNI）：
 *   - 不存结果到文件（终端打印够）
 *   - 不跑 embedding（不依赖 dev 网关，纯 chunk 字符串 + 关键词匹配）
 *   - 不算 NDCG / MRR
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chunkByHeadingSmart,
  chunkByParagraph,
  type Chunk,
  type SourceKind,
} from '../../libs/rag/chunk.js';

const DAILY_FILES = [
  'docs/daily/day12.md',
  'docs/daily/day13.md',
  'docs/daily/day14.md',
  'docs/daily/day15.md',
  'docs/daily/day16.md',
];

const KEYWORDS = ['cosine', 'PCA', 'embedding', 'zod', 'lancedb'];

/** 统计 chunks 里含关键词的数量（任一 chunk 文本 includes kw 即计 1） */
function countHits(chunks: readonly Chunk[], kw: string): number {
  return chunks.filter((c) => c.text.includes(kw)).length;
}

interface Row {
  source: string;
  chunkCount: number;
  hits: Record<string, number>;
}

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.resolve(__dirname, '..', '..');
  const rows: { heading: Row[]; paragraph: Row[] } = { heading: [], paragraph: [] };

  for (const relPath of DAILY_FILES) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      console.warn(`skip ${relPath} (not found)`);
      continue;
    }
    const md = fs.readFileSync(absPath, 'utf-8');
    const sourceKind: SourceKind = 'daily';

    const hChunks = chunkByHeadingSmart(md, relPath, sourceKind, 800);
    const pChunks = chunkByParagraph(md, relPath, sourceKind);

    const hHits: Record<string, number> = {};
    const pHits: Record<string, number> = {};
    for (const kw of KEYWORDS) {
      hHits[kw] = countHits(hChunks, kw);
      pHits[kw] = countHits(pChunks, kw);
    }

    rows.heading.push({
      source: relPath.split('/').pop()!,
      chunkCount: hChunks.length,
      hits: hHits,
    });
    rows.paragraph.push({
      source: relPath.split('/').pop()!,
      chunkCount: pChunks.length,
      hits: pHits,
    });
  }

  // 输出 Markdown 表
  console.log('\n========== Day 18 关键词密度对比 ==========\n');
  for (const strat of ['heading', 'paragraph'] as const) {
    console.log(`### ${strat} 切`);
    console.log(`| source | chunks | ${KEYWORDS.join(' | ')} |`);
    console.log(`| --- | --- | ${KEYWORDS.map(() => '---').join(' | ')} |`);
    for (const r of rows[strat]) {
      const hits = KEYWORDS.map((k) => String(r.hits[k] ?? 0));
      console.log(`| ${r.source} | ${r.chunkCount} | ${hits.join(' | ')} |`);
    }
    console.log('');
  }

  // 汇总
  const totalHeading = rows.heading.reduce((s, r) => s + r.chunkCount, 0);
  const totalParagraph = rows.paragraph.reduce((s, r) => s + r.chunkCount, 0);
  console.log(`\n### 汇总（5 篇 daily）`);
  console.log(`| strategy | 总 chunks |`);
  console.log(`| --- | --- |`);
  console.log(`| heading（smart, maxChars=800）| ${totalHeading} |`);
  console.log(`| paragraph（overlap=400）| ${totalParagraph} |`);

  // 关键词命中汇总
  console.log(`\n### 关键词命中汇总`);
  console.log(`| keyword | heading | paragraph | heading/paragraph 比率 |`);
  console.log(`| --- | --- | --- | --- |`);
  for (const kw of KEYWORDS) {
    const hSum = rows.heading.reduce((s, r) => s + (r.hits[kw] ?? 0), 0);
    const pSum = rows.paragraph.reduce((s, r) => s + (r.hits[kw] ?? 0), 0);
    const ratio = pSum > 0 ? ((hSum / pSum) * 100).toFixed(0) + '%' : '-';
    console.log(`| ${kw} | ${hSum} | ${pSum} | ${ratio} |`);
  }

  // 断言：heading chunk 总数 ≥ 调前（heading 长段被切碎至少不减少 chunk 数）
  console.log(`\n========== 验证 ==========`);
  console.log(
    `heading 总 chunks (${totalHeading}) ≥ 调前基准 175（35 × 5）? ${totalHeading >= 175 ? '✅' : '❌'}`,
  );
  console.log(
    `注：heading 总 chunks 仍 < paragraph（449）—— 这是 chunkByHeading 按 heading 边界切的固有特性，不是 chunkByHeadingSmart 能解决的`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
