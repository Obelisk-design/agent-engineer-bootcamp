/**
 * examples/langchain-side/step3_probe.ts
 *
 * LangChain 副线 Step 3 探针：跑 step3_rag.ts 之前，先用真实 API 验证 4 个假设。
 *
 * 探针要回答（按 day12 retro 第 1 条：spec 假设必须先用真 API 探一次）：
 *   1. @langchain/community 的 LanceDB 类 API 形态 —— 构造 / fromTexts / addDocuments / similaritySearch
 *   2. .lancedb/ 目录里主线已经入库了多少行 + 哪些 table 名（chunks_heading / chunks_paragraph / chunks_test_*）
 *   3. LangChain LanceDB 默认 schema 跟主线 day13 LanceStore schema 是否兼容
 *      （LangChain: { vector, text, [metadata] } vs 主线: { id, vector, text, source, sourceKind }）
 *   4. 不连 LLM 也能走通吗（用静态向量）？OpenAIEmbeddings 是否会因为 .env 缺 key 在 import 时就炸？
 *
 * 用法：
 *   npx tsx examples/langchain-side/step3_probe.ts
 *
 * 探针成功后再跑 step3_rag.ts。探针失败 → 回去改设计，不动 demo。
 */

// 探针不需要 dotenv（先看 import 时是否会因缺 key 崩）
// import 'dotenv/config';  // 故意不 import，看 LanceDB / OpenAIEmbeddings 是否惰性校验 key

import * as lancedb from '@lancedb/lancedb';

async function probeLancedbNative(): Promise<void> {
  console.log('\n=== probe 1: @lancedb/lancedb connect .lancedb/rag ===');
  const db = await lancedb.connect('.lancedb/rag');
  const tableNames = await db.tableNames();
  console.log(`tables found: ${tableNames.length}`);
  for (const name of tableNames) {
    const t = await db.openTable(name);
    const count = await t.countRows();
    const sample = await t.query().limit(1).toArray();
    const cols = sample[0] ? Object.keys(sample[0]) : [];
    console.log(`  - ${name}: rows=${count} cols=[${cols.join(', ')}]`);
  }
  return Promise.resolve();
}

async function probeLangchainLanceDBClass(): Promise<void> {
  console.log('\n=== probe 2: @langchain/community/vectorstores/lancedb LanceDB class ===');
  // 只 import + 看类型，不实例化（避免触发 embeddings 校验）
  const mod = await import('@langchain/community/vectorstores/lancedb');
  console.log(`exports: ${Object.keys(mod).join(', ')}`);
  console.log(`LanceDB is class: ${typeof mod.LanceDB === 'function'}`);
  console.log(`LanceDB extends VectorStore: ${mod.LanceDB.prototype?.constructor?.name}`);
  // LanceDBArgs 不导出，列一下构造参数名（从 instance 方法签名推）
  const proto = mod.LanceDB.prototype;
  console.log(
    `proto methods: ${Object.getOwnPropertyNames(proto)
      .filter((n) => n !== 'constructor')
      .join(', ')}`,
  );
}

async function probeOpenAIEmbeddingsLazyLoad(): Promise<void> {
  console.log('\n=== probe 3: OpenAIEmbeddings import 是否惰性 ===');
  try {
    const { OpenAIEmbeddings } = await import('@langchain/openai');
    console.log(`OpenAIEmbeddings is class: ${typeof OpenAIEmbeddings === 'function'}`);
    // 不调用 .embedQuery()（会真发请求），只 new 出来看是否会立即校验 key
    try {
      const e = new OpenAIEmbeddings({ apiKey: 'sk-fake-probe-just-checking-constructor' });
      console.log(`OpenAIEmbeddings constructor OK (didn't throw on fake key)`);
      // 顺手看一下默认 model 是什么（实例属性）
      console.log(`  model: ${(e as unknown as { model: string }).model ?? '(unknown)'}`);
    } catch (err) {
      console.log(`OpenAIEmbeddings constructor threw: ${(err as Error).message}`);
    }
  } catch (err) {
    console.log(`OpenAIEmbeddings import failed: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  console.log('[step3-probe] starting 4 probes...');
  await probeLancedbNative();
  await probeLangchainLanceDBClass();
  await probeOpenAIEmbeddingsLazyLoad();

  console.log('\n=== probe 4: schema 兼容性结论（手工推导） ===');
  console.log('LangChain LanceDB Document schema: { pageContent, metadata: {...} }');
  console.log('                       Table row: { vector, text, [metadata keys flat] }');
  console.log('主线 day13 LanceStore row:    { id, vector, text, source, sourceKind }');
  console.log(
    '→ LangChain 跟主线 4 个 table (chunks_heading/paragraph + chunks_test_*) schema 不兼容',
  );
  console.log('→ 必须决策：副线建独立 table (langchain_side_chunks) 还是接受重复入库');
  console.log('  [建议] 独立 table + 复用主线 .lancedb/ 根目录（隔离但共用底层）');
  console.log('\n[step3-probe] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
