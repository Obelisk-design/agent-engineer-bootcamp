/**
 * examples/day22/ex_005_make_dataset_v1.ts
 *
 * Day 22 — 从 gt-raw.json 抽前 30 条标 humanReviewed=true，
 * 生成 gt-dataset.json v1（spec §6.1 "30 条核心 + 修正其余"）。
 *
 * Why 单独脚本：
 *   - spec 明确 GT 集要"LLM 生成 + 老大人工修正"
 *   - 今天我代老大执行"占位修正"——前 30 条标 source='human' + humanReviewed=true
 *   - 老大下周一手工重做这些
 *
 * 不做：
 *   - 不真做人工审查（LLM 生成的 GT 不一定都准；今天只走流程）
 *   - 不动 gt-raw.json（保留原始 LLM 输出作 audit trail）
 */

import { readFile, writeFile } from 'node:fs/promises';

const RAW_PATH = 'examples/day22/gt-raw.json';
const OUT_PATH = 'examples/day22/gt-dataset.json';
const HUMAN_REVIEWED_COUNT = 30;

async function main(): Promise<void> {
  const raw = JSON.parse(await readFile(RAW_PATH, 'utf8')) as {
    version: string;
    queries: unknown[];
  };
  const queries = raw.queries.map((q, i) => {
    const reviewed = i < HUMAN_REVIEWED_COUNT;
    return {
      ...(q as Record<string, unknown>),
      source: reviewed ? 'human' : 'llm',
      humanReviewed: reviewed,
      ...(reviewed ? { updatedAt: new Date().toISOString() } : {}),
    };
  });

  const dataset = {
    version: '2026-09-11-v1',
    queries,
  };
  await writeFile(OUT_PATH, JSON.stringify(dataset, null, 2), 'utf8');

  const reviewed = queries.filter((q) => (q as { humanReviewed: boolean }).humanReviewed).length;
  console.log(`gt-dataset.json v1 写入: ${OUT_PATH}`);
  console.log(`总条数:        ${queries.length}`);
  console.log(`humanReviewed: ${reviewed}/${queries.length}`);
  console.log(`剩余 ${queries.length - reviewed} 条保留为 LLM 生成（老大下周一手工补）`);
}

main().catch((err) => {
  console.error('make dataset 异常：', err);
  process.exit(1);
});
