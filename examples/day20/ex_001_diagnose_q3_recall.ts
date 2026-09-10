/**
 * examples/day20/ex_001_diagnose_q3_recall.ts
 *
 * Day 20 真活 1：Q3 "tool 参数事实源" 召回失败根因诊断。
 *
 * Day 19 eval 显示 Q3 GT (docs/adr/0003-...md) 不在 chunks_heading K=20 池内。
 * 三种可能病因：
 *   A. ADR 未入库 → chunks_heading + chunks_paragraph 都查不到 source 含 'docs/adr/' 的 chunk
 *   B. ADR 入库但 heading 切把整篇切为 0 段（ADR 全文 < maxChars=800 且无 ## 标题）
 *   C. ADR 入库但与 Q3 query 的 cosine 距离 > 候选池截距（embedding 排序失败）
 *
 * 跑法：npx tsx examples/day20/ex_001_diagnose_q3_recall.ts
 * 准备：.env（OPENAI_API_KEY/BASE_URL/EMBEDDING_MODEL_NAME），Day 18 force reindex 已跑
 *
 * 不做（YAGNI）：
 *   - 不改 chunkByHeadingSmart / 不写 ADR-specific chunking
 *   - 不动 evaluate.ts
 *   - 不写 LLM-judge
 */

import 'dotenv/config';
import * as lancedb from '@lancedb/lancedb';
import * as path from 'node:path';

const STORE_URI = path.resolve(process.cwd(), '.lancedb/rag');
const ADRS = [
  '0001-tool-capability-must-not-embed-in-system-prompt.md',
  '0002-run-events-accepts-messages-caller-injects-system-prompt.md',
  '0003-tool-params-single-source-of-truth-zod.md',
  '0004-rag-table-naming-follows-implementation.md',
  '0005-agent-event-tool-call-start-end.md',
];

interface Row {
  id: string;
  text: string;
  source: string;
}

async function listAdrChunks(tableName: string): Promise<readonly Row[]> {
  const db = await lancedb.connect(STORE_URI);
  try {
    const names = await db.tableNames();
    if (!names.includes(tableName)) return [];
    const t = await db.openTable(tableName);
    // lancedb JS query().where('source LIKE "docs/adr/%"').toArray()
    const all = await t.query().where("source LIKE 'docs/adr/%'").toArray();
    return all.map((r) => ({
      id: String(r.id),
      text: String(r.text),
      source: String(r.source),
    }));
  } finally {
    // lancedb JS 无显式 close
    void db;
  }
}

async function main(): Promise<void> {
  console.log(`========== Day 20 Q3 RECALL DIAGNOSIS ==========\n`);
  console.log(`store uri: ${STORE_URI}\n`);

  for (const table of [
    'chunks_heading',
    'chunks_paragraph',
    'chunks_test_heading',
    'chunks_test_paragraph',
  ]) {
    const rows = await listAdrChunks(table);
    console.log(`--- ${table}: ${rows.length} ADR chunks ---`);
    if (rows.length === 0) {
      console.log('  (none)\n');
      continue;
    }
    // 按 source 聚合
    const bySource = new Map<string, number>();
    for (const r of rows) {
      bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
    }
    for (const [src, n] of [...bySource.entries()].sort()) {
      console.log(`  ${src}: ${n} chunk(s)`);
    }
    console.log();
  }

  console.log('========== 期望 ADR 清单 vs 入库对比 ==========\n');
  const expected = ADRS.map((a) => `docs/adr/${a}`);
  console.log(`期望入库 ${expected.length} 个 ADR（0001-0005）：`);
  for (const e of expected) console.log(`  - ${e}`);
  console.log();

  const headingChunks = await listAdrChunks('chunks_heading');
  const paragraphChunks = await listAdrChunks('chunks_paragraph');
  const sources = new Set([
    ...headingChunks.map((r) => r.source),
    ...paragraphChunks.map((r) => r.source),
  ]);
  console.log(`实际入库（heading ∪ paragraph source 集合）：${sources.size}`);
  for (const s of [...sources].sort()) console.log(`  - ${s}`);
  console.log();

  // 诊断结论
  console.log('========== 诊断结论 ==========\n');
  if (sources.size === 0) {
    console.log(
      'A. ADR 未入库 → Day 18 force reindex 没扫到 docs/adr/（fixture 默认扫 daily + adr，**可能 fixture 当时为 0**）',
    );
    console.log('   后续决策：先看 force reindex 报告里的 "loaded N docs" 是否含 ADR');
  } else {
    const gt0003 = 'docs/adr/0003-tool-params-single-source-of-truth-zod.md';
    const inHeading = headingChunks.filter((r) => r.source === gt0003).length;
    const inParagraph = paragraphChunks.filter((r) => r.source === gt0003).length;
    console.log(`0003 ADR 在 heading 池：${inHeading} chunk(s)`);
    console.log(`0003 ADR 在 paragraph 池：${inParagraph} chunk(s)`);

    if (inHeading === 0 && inParagraph === 0) {
      console.log('→ A. ADR 0003 完全未入库（fixture 没扫到）');
    } else if (inHeading > 0) {
      // heading 切法把 ADR 切成几个 chunk？单 chunk vs 多 chunk
      const all0003 = headingChunks.filter((r) => r.source === gt0003);
      const avgLen = all0003.reduce((s, r) => s + r.text.length, 0) / all0003.length;
      console.log(`→ ADR 0003 heading 切为 ${inHeading} chunk(s)，平均 ${avgLen.toFixed(0)} 字符`);
      if (inHeading === 1 && avgLen < 800) {
        console.log(
          '→ 形态：单 chunk < 800 字符 → heading 切 + heading Smart 都没二次切（无 ## 标题）',
        );
        console.log(
          '→ Day 19 Q3 recall miss = chunk 内文 cosine 距离 > 候选池截距（**病因 C：embedding 排序失败**）',
        );
      } else {
        console.log(`→ heading 切分段正常，召回失败需另查（可能是 chunk 内文 query 关键词弱）`);
      }
    } else {
      console.log(
        '→ ADR 0003 只在 paragraph 池 → Day 19 heading-only retrieve 召回不到，retrieveMerged 双 strategy 候选 3 应能修',
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
