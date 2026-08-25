/**
 * examples/langchain-side/step3_rag.ts
 *
 * LangChain 副线 Step 3：重写 Day 13 ex_001_index_corpus + ex_003_query_topk 用 LangChain 写法。
 *
 * 目的：对比 bootcamp 手写 fetch + 手写 LanceStore vs LangChain 抽象的差异。
 * 预期产出：
 *   - 看到 LangChain 的 RecursiveCharacterTextSplitter / OpenAIEmbeddings / LanceDB.fromDocuments 链
 *   - 看到 LangChain 抽象帮你做了什么（chunking + embedding + 入库 + retrieve 一条龙）
 *   - 看到 LangChain 抽象必须付出的代价（独立 table + 重复入库）
 *
 * 用法：
 *   npx tsx examples/langchain-side/step3_rag.ts
 *
 * 对照 bootcamp 版（libs/rag/store.ts + examples/day13/ex_001_index_corpus.ts）：
 *   bootcamp: 84 行手写 LanceStore + incrementalIndex 增量入库 + 复杂 hash 比较
 *   LangChain: ~70 行，RecursiveCharacterTextSplitter + OpenAIEmbeddings + LanceDB.fromDocuments
 *
 * 关键事实（探针实测）：
 *   - LangChain LanceDB Document schema { pageContent, metadata } 跟主线 day13
 *     LanceStore row { id, vector, text, source, sourceKind } 不兼容
 *   - 必须独立 table（langchain_side_chunks）+ 重复入库一次
 *   - 这是 LangChain 抽象税的一部分（不是 bug，是设计取舍）
 *
 * 准备：.env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME（沿用主线 day12 网关）。
 * 产物：仓库根 .lancedb/rag/langchain_side_chunks（gitignored，与主线 4 个表共存）。
 */

import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { LanceDB } from '@langchain/community/vectorstores/lancedb';
import type { Document } from '@langchain/core/documents';

// ─── 1. repo root 解析（不引 libs/rag/fixtures/docs-corpus.ts，副线不进 libs）───
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..');

async function loadDocs(): Promise<{ absPath: string; content: string }[]> {
  const dailyDir = path.join(REPO_ROOT, 'docs', 'daily');
  const adrDir = path.join(REPO_ROOT, 'docs', 'adr');
  const out: { absPath: string; content: string }[] = [];
  for (const dir of [dailyDir, adrDir]) {
    const files = await fs.readdir(dir);
    for (const f of files.filter((n) => n.endsWith('.md'))) {
      const abs = path.join(dir, f);
      const content = await fs.readFile(abs, 'utf8');
      out.push({ absPath: abs, content });
    }
  }
  return out;
}

// ─── 2. env 校验 ───
const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.EMBEDDING_MODEL_NAME ?? 'text-embedding-3-small';
if (!apiKey) throw new Error('OPENAI_API_KEY required');

// ─── 3. main ───
async function main(): Promise<void> {
  console.log('[langchain-step3] baseURL=' + baseURL);
  console.log('[langchain-step3] embedding model=' + model);

  console.log('\n[1/4] loading docs/daily/*.md + docs/adr/*.md...');
  const docs = await loadDocs();
  console.log(`      loaded ${docs.length} files`);

  console.log('\n[2/4] chunking via RecursiveCharacterTextSplitter (chunkSize=500, overlap=50)...');
  // LangChain 默认按 ["\n\n", "\n", " ", ""] 递归切；不保护代码块 / 表格
  // 这跟 bootcamp 主线 heading/paragraph 切分策略不同 —— 切分策略本身是观察点
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  const lcDocs: Document[] = [];
  for (const d of docs) {
    const chunks = await splitter.createDocuments(
      [d.content],
      [{ source: path.relative(REPO_ROOT, d.absPath) }],
    );
    lcDocs.push(...chunks);
  }
  console.log(
    `      produced ${lcDocs.length} chunks (avg ${Math.round(docs.reduce((s, d) => s + d.content.length, 0) / lcDocs.length)} chars/chunk)`,
  );

  console.log(
    '\n[3/4] embedding + indexing via LanceDB.fromDocuments → .lancedb/rag/langchain_side_chunks',
  );
  const embeddings = new OpenAIEmbeddings({
    apiKey,
    configuration: baseURL ? { baseURL } : {},
    model,
  });
  const t0 = Date.now();
  // ⚠️ LangChain LanceDB 类的坑：新 `new LanceDB({uri, tableName})` 不会从磁盘 reopen table
  // （构造函数只看 args.table，不调 connect + openTable）→ similaritySearch 报 "Table not found"
  // 唯一解法：保留 fromDocuments 返回的实例直接用，table 字段已 in-memory 持有
  const vectorStore = await LanceDB.fromDocuments(lcDocs, embeddings, {
    uri: '.lancedb/rag',
    tableName: 'langchain_side_chunks',
    mode: 'overwrite', // 副线独立 collection，每次跑覆盖
  });
  console.log(`      indexed in ${Date.now() - t0}ms`);

  console.log('\n[4/4] query → similaritySearch(k=3)...');
  // 复用 day13 evaluate 里的 query：'4 闸必跑是哪 4 个'
  const query = '4 闸必跑是哪 4 个';
  const t1 = Date.now();
  const results = await vectorStore.similaritySearch(query, 3);
  console.log(`      retrieved ${results.length} hits in ${Date.now() - t1}ms`);

  console.log('\n=== top-3 chunks ===');
  for (let i = 0; i < results.length; i++) {
    const d = results[i]!;
    console.log(`\n[hit #${i + 1}] source=${d.metadata.source ?? '(unknown)'}`);
    console.log('  content (first 200 chars):');
    console.log('  ' + d.pageContent.slice(0, 200).replace(/\n/g, '\n  '));
  }

  /**
   * 关键观察（看完跑通后写 retro）：
   * 1. LangChain 帮你做了什么？auto chunk + embed + index 一条龙，~10 行抽象
   * 2. 你需要懂什么 LangChain 才知道发生了什么？Document schema / metadata 字段 / LanceDB mode 语义
   * 3. 跟 bootcamp 比，trace / 调试难易度：pipe 链优雅但缺 hash 比较 / 增量入库这种"工程能力"
   * 4. provider 切换成本（OpenAI → Anthropic）：换 OpenAIEmbeddings → ChatOpenAI 1 行；但 Anthropic 没 embeddings，得混 provider
   * 5. 真实代价：独立 table + 重复入库（5-10min），不是 bug 是 schema 不兼容
   */
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
