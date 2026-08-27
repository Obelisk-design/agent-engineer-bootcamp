/**
 * examples/langchain-side/step4_compare_chunks.ts
 *
 * LangChain 副线 Step 4：对比 3 种 chunk 策略的 hit-rate（同 embedding 模型）。
 *
 * 目的：评估副线 RecursiveCharacterTextSplitter (500/50) vs 主线 heading / paragraph 切分。
 *
 * 为什么是 chunk 策略对比（不是 embedding 模型对比）：
 *   step4_probe_embeddings.ts 探针发现 dev 网关 admin 白名单只允许一个 embedding 模型（见 .env），
 *   其它 embedding 模型（text-embedding-3-* / bge-large-*）HTTP 403 team not allowed。
 *   所以"真对比 embedding"被外部约束锁死 → 转向"同 embedding 不同 chunk 策略"对比。
 *
 * 数据源（全部已存在于 .lancedb/rag/，无需重新入库）：
 *   - chunks_heading        (381 rows,  heading 切分)
 *   - chunks_paragraph      (1420 rows, paragraph 切分)
 *   - langchain_side_chunks (547 rows,  RecursiveCharacterTextSplitter 500/50)
 *
 * 同 embedding：EMBEDDING_MODEL_NAME（dev 网关白名单内唯一允许的模型，由 .env 注入）
 *
 * 评估口径：复用 libs/rag/evaluate.ts 的 judgeHit 逻辑（不引，复刻避免 libs 污染）
 *   hit = top-3 内任一 chunk text 全中 expectedKeywords（默认 all；Q1/Q2/Q3 用 any）
 *
 * 用法：
 *   npx tsx examples/langchain-side/step4_compare_chunks.ts
 *
 * 关键观察（看完跑通后写 retro）：
 *   1. RecursiveCharacterTextSplitter (500/50) vs heading/paragraph 在 hit-rate 上谁强？
 *   2. 3 策略在同一 query 上的平均延迟差异？
 *   3. 公平性提醒：chunk 数差异巨大（381 / 1420 / 547）—— hit 数对比时不能直接拿命中数比
 */

import 'dotenv/config';
import * as lancedb from '@lancedb/lancedb';
import { OpenAIEmbeddings } from '@langchain/openai';

// ─── 1. 复刻 evaluate.ts 的 judgeHit（不进 libs/）───
// 不引 libs/rag 的 ChunkStrategy 类型（副线不进 libs），用本地 string literal
type ChunkStrategy = 'heading' | 'paragraph' | 'langchain-recursive';
type MatchMode = 'all' | 'any';
interface EvalQuery {
  readonly id: string;
  readonly query: string;
  readonly expectedKeywords: readonly string[];
  readonly matchMode?: MatchMode;
}

// 复用 DEFAULT_EVAL_QUERIES 的 Q1-Q5（main corpus，跳过 test corpus Q6/Q7）
const EVAL_QUERIES: readonly EvalQuery[] = [
  {
    id: 'Q1',
    query: '4闸必跑是哪4 个',
    expectedKeywords: ['vitest', 'typecheck', 'lint', 'typecheck:web'],
    matchMode: 'any',
  },
  {
    id: 'Q2',
    query: '为什么不引 ml 库',
    expectedKeywords: ['PCA', 'power iteration'],
    matchMode: 'any',
  },
  { id: 'Q3', query: 'tool 参数契约的事实源是什么', expectedKeywords: ['zod'], matchMode: 'any' },
  { id: 'Q4', query: 'zod union 怎么写', expectedKeywords: ['z.union'] },
  { id: 'Q5', query: 'Agent.runEvents messages 边界', expectedKeywords: ['runEvents'] },
];

interface SearchHit {
  readonly text: string;
  readonly source: string;
  readonly _distance: number;
}

function judgeHit(query: EvalQuery, hits: readonly SearchHit[], k = 3): boolean {
  const mode = query.matchMode ?? 'all';
  const top = hits.slice(0, k);
  if (top.length === 0) return false;
  if (mode === 'any') {
    return top.some((h) => query.expectedKeywords.some((kw) => h.text.includes(kw)));
  }
  return top.some((h) => query.expectedKeywords.every((kw) => h.text.includes(kw)));
}

// ─── 2. 3 个 collection 定义 ───
const COLLECTIONS: ReadonlyArray<{ strategy: ChunkStrategy; tableName: string; label: string }> = [
  { strategy: 'heading', tableName: 'chunks_heading', label: 'heading (381)' },
  { strategy: 'paragraph', tableName: 'chunks_paragraph', label: 'paragraph (1420)' },
  { strategy: 'langchain-recursive', tableName: 'langchain_side_chunks', label: 'recursive (547)' },
];

// ─── 3. main ───
async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY required');
  if (!baseURL) throw new Error('OPENAI_BASE_URL is required');
  if (!model) throw new Error('EMBEDDING_MODEL_NAME is required');

  console.log('[step4] baseURL=' + baseURL);
  console.log('[step4] embedding model=' + model);
  console.log(`[step4] collections: ${COLLECTIONS.map((c) => c.label).join(' / ')}`);

  const embeddings = new OpenAIEmbeddings({
    apiKey,
    configuration: baseURL ? { baseURL } : {},
    model,
  });

  const db = await lancedb.connect('.lancedb/rag');

  // 预热：打开 3 个 table + 统计行数
  const tables = new Map<string, lancedb.Table>();
  const sizes = new Map<string, number>();
  for (const c of COLLECTIONS) {
    const t = await db.openTable(c.tableName);
    tables.set(c.tableName, t);
    sizes.set(c.tableName, await t.countRows());
  }
  console.log('\n[step4] table sizes:');
  for (const c of COLLECTIONS) {
    console.log(`  ${c.tableName.padEnd(25)} ${sizes.get(c.tableName)} rows`);
  }

  // 跑 5 query × 3 collection = 15 次 retrieve
  type Row = { qid: string; strategy: string; hit: boolean; ms: number; sources: string[] };
  const rows: Row[] = [];

  for (const q of EVAL_QUERIES) {
    console.log(`\n--- ${q.id}: "${q.query}" ---`);
    const t0 = Date.now();
    const queryVec = await embeddings.embedQuery(q.query);
    const embedMs = Date.now() - t0;
    console.log(`  embed: ${embedMs}ms`);

    for (const c of COLLECTIONS) {
      const t = tables.get(c.tableName)!;
      const t1 = Date.now();
      const hits = (await t.vectorSearch(queryVec).limit(3).toArray()) as unknown as SearchHit[];
      const ms = Date.now() - t1;
      const hit = judgeHit(q, hits, 3);
      const sources = hits.map((h) => h.source.split(/[\\/]/).slice(-2).join('/'));
      rows.push({ qid: q.id, strategy: c.strategy, hit, ms, sources });
      console.log(
        `  [${c.strategy.padEnd(18)}] ${hit ? '✅' : '❌'} ${ms}ms  → ${sources.join(' | ')}`,
      );
    }
  }

  // ─── 4. 报告 ───
  console.log('\n\n=== step4 hit-rate report ===\n');
  const header = ['Query', 'heading', 'paragraph', 'recursive'];
  const lines: string[] = [];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| --- | --- | --- | --- |`);

  for (const q of EVAL_QUERIES) {
    const cellFor = (s: string): string => {
      const r = rows.find((x) => x.qid === q.id && x.strategy === s);
      if (!r) return '-';
      return r.hit ? `✅ ${r.ms}ms` : `❌ ${r.ms}ms`;
    };
    lines.push(
      `| ${q.id} | ${cellFor('heading')} | ${cellFor('paragraph')} | ${cellFor('langchain-recursive')} |`,
    );
  }
  console.log(lines.join('\n'));

  const summary = (s: string): string => {
    const rs = rows.filter((r) => r.strategy === s);
    const hit = rs.filter((r) => r.hit).length;
    const avgMs = rs.reduce((sum, r) => sum + r.ms, 0) / rs.length;
    return `${hit}/${rs.length} (avg ${avgMs.toFixed(0)}ms)`;
  };
  console.log(`\n**heading**: ${summary('heading')}`);
  console.log(`**paragraph**: ${summary('paragraph')}`);
  console.log(
    `**langchain-recursive (RecursiveCharacterTextSplitter 500/50)**: ${summary('langchain-recursive')}`,
  );

  console.log('\n公平性提醒：');
  console.log('  - 3 个 collection chunk 数差异巨大（381 / 1420 / 547），hit 数本身不能直接对比');
  console.log(
    '  - 所有 chunk 共用同一个 embedding 模型 (EMBEDDING_MODEL_NAME)，对比的是 chunk 策略',
  );
  console.log('  - 真对比 embedding 模型需等网关 admin 解锁更多白名单');

  /**
   * 关键观察（看完跑通后写 retro）：
   * 1. RecursiveCharacterTextSplitter 在中文 markdown 上的 hit-rate vs heading/paragraph 优劣？
   * 2. avg elapsedMs 差异？chunk 数越多 = vectorSearch 越慢？
   * 3. 探针发现的 admin 锁定 → 副线"真对比 embedding"暂不可能 → 副线价值转向 chunk 对比
   */
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
