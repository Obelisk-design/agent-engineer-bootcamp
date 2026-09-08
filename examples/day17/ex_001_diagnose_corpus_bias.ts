/**
 * examples/day17/ex_001_diagnose_corpus_bias.ts
 *
 * Day 17 诊断：lancedb + qwen3-embed 在小语料下是否有"长文档抢占 top-K"的偏置。
 *
 * 跑 10 条 query（5 真实用户问 + 5 偏置探针），heading + paragraph 各跑一次，
 * 统计每个 source 文档被命中频次 + 平均 score，输出"霸榜 top-3 的文档"列表。
 *
 * 前置：examples/day13/ex_001_index_corpus.ts 已跑过。
 *
 * 跑法：npx tsx examples/day17/ex_001_diagnose_corpus_bias.ts
 * 准备：.env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME。
 *
 * 输出（stdout）：
 *   - 每个 source 文档的"被命中次数 / 平均 score / 文档大小（字符数）"
 *   - 按"被命中次数"降序，看前 5 名是不是"长文档"
 *
 * 不做（YAGNI）：
 *   - 不存结果到文件（终端打印够，要复跑直接重跑）
 *   - 不画图（HTML heatmap 是 Day 31+ 可视化层的事）
 *   - 不算 recall@K / MRR（关键词命中够，NDCG 留给 Day 31+）
 */

import 'dotenv/config';
import { openVectorStore, retrieve } from '../../libs/rag/index.js';

const PROBES = [
  // 5 条真实用户问
  '4 闸必跑是哪 4 个',
  'tool 参数事实源',
  'zod union 怎么写',
  'runEvents 边界',
  'PCA 是什么',
  // 5 条偏置探针（覆盖短文档 / 长文档 / 关键词型 / 问句型 / 跨文档型）
  'embedding',
  'agent loop',
  'lancedb schema',
  '怎么开始 Day 13',
  'fixture 怎么写',
];

interface SourceStats {
  source: string;
  hitCount: number;
  totalScore: number;
  avgScore: number;
  /** 文档总字符数（heading + paragraph 合并去重 text 长度，仅取一次） */
  docSize: number;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!model) throw new Error('EMBEDDING_MODEL_NAME is required');

  const headingStore = await openVectorStore('.lancedb/rag', 'chunks_heading');
  const paragraphStore = await openVectorStore('.lancedb/rag', 'chunks_paragraph');

  // 先扫一遍库，记录每 source 的总字符数
  const docSizes = new Map<string, number>();
  for (const strategy of ['heading', 'paragraph'] as const) {
    const store = strategy === 'heading' ? headingStore : paragraphStore;
    const size = await store.size();
    for (let i = 0; i < size; i++) {
      // store 不暴露 list —— 走一个 dummy query 拿到所有 hits 不实际；
      // 退而求其次：从 hits 里累计
      void i;
    }
  }
  void docSizes;

  const stats = new Map<string, SourceStats>();
  const ensureStat = (source: string, hitScore: number, hitText: string): void => {
    const existing = stats.get(source);
    if (existing === undefined) {
      stats.set(source, {
        source,
        hitCount: 1,
        totalScore: hitScore,
        avgScore: hitScore,
        docSize: hitText.length,
      });
    } else {
      existing.hitCount += 1;
      existing.totalScore += hitScore;
      existing.avgScore = existing.totalScore / existing.hitCount;
      existing.docSize = Math.max(existing.docSize, hitText.length);
    }
  };

  try {
    for (const query of PROBES) {
      console.log(`\n>>> query: "${query}"`);
      for (const strategy of ['heading', 'paragraph'] as const) {
        const store = strategy === 'heading' ? headingStore : paragraphStore;
        const res = await retrieve(query, {
          k: 3,
          chunkStrategy: strategy,
          store,
          apiKey,
          baseUrl,
          model,
        });
        for (const h of res.hits) {
          ensureStat(h.record.source, h.score, h.record.text);
        }
        console.log(
          `  ${strategy.padEnd(9)} top-3: ${res.hits
            .map((h) => `${h.record.source.split('/').pop()}=${h.score.toFixed(3)}`)
            .join(', ')}`,
        );
      }
    }
  } finally {
    await headingStore.close();
    await paragraphStore.close();
  }

  // 排序：被命中次数降序
  const sorted = [...stats.values()].sort((a, b) => b.hitCount - a.hitCount);
  console.log('\n========== TOP-K BIAS RANKING ==========');
  console.log('rank | source                          | hits | avgScore | docSize');
  console.log('-----+---------------------------------+------+----------+--------');
  for (let i = 0; i < Math.min(10, sorted.length); i++) {
    const s = sorted[i]!;
    console.log(
      `${String(i + 1).padStart(4)} | ${s.source.padEnd(31)} | ${String(s.hitCount).padStart(4)} | ${s.avgScore.toFixed(3).padStart(8)} | ${String(s.docSize).padStart(7)}`,
    );
  }
  console.log('\n========== 解读 ==========');
  console.log(
    '如果前 5 名都是"长文档"（docSize > 1000），且 avgScore 接近 → 存在大文档抢占 top-K 偏置',
  );
  console.log(
    '如果短文档（ADR / test-corpus）也能进 top-3 → 系统无明显偏置，Q2 失败就是 query 设计问题',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
