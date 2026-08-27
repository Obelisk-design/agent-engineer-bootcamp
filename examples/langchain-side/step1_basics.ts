/**
 * examples/langchain-side/step1_basics.ts
 *
 * LangChain 副线 Step 1：重写 Day 02 ex_001_chat_client 用 LangChain 写法。
 *
 * 目的：对比 bootcamp 手写 fetch vs LangChain 抽象的差异。
 * 预期产出：
 *   - 看到 LangChain 的 ChatOpenAI / PromptTemplate / StrOutputParser 链
 *   - 看到 "3 行抽象" 的成本与收益
 *
 * 用法：
 *   npx tsx examples/langchain-side/step1_basics.ts
 *
 * 对照 bootcamp 版（examples/day02/ex_001_chat_client.ts）：
 *   bootcamp: 48 行，直接 fetch，provider 硬绑
 *   LangChain: ~25 行，3 个抽象对象，自动 trace
 */

import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.MODEL_NAME;

if (!apiKey) throw new Error('OPENAI_API_KEY required');
if (!baseURL) throw new Error('OPENAI_BASE_URL is required');
if (!model) throw new Error('MODEL_NAME is required');

// ─── bootcamp 风格 ───
// const client = new OpenAIChatClient({ apiKey, baseURL, model });
// const reply = await client.chat({ messages: [...] });

// ─── LangChain 风格 ───
console.log(`[langchain] baseURL=${baseURL}`);
console.log(`[langchain] model=${model}`);
console.log('[langchain] sending request...');

const chatModel = new ChatOpenAI({
  apiKey,
  configuration: { baseURL },
  model,
  temperature: 0,
});

// LangChain v1.x: ChatPromptTemplate 替代了旧 PromptTemplate.fromMessages
// 旧文档里大量 .fromMessages 都是 v0.x API
const prompt = ChatPromptTemplate.fromMessages([
  ['system', '我是一只刺猬.'],
  ['user', '用一句话介绍你自己。'],
]);

// pipe 语法 = 函数式 chain
const outputParser = new StringOutputParser();
const chain = prompt.pipe(chatModel).pipe(outputParser);

const reply = await chain.invoke({});

console.log('[langchain] response:');
console.log(reply);

/**
 * 关键观察（Step 3 探针 + Step 3 demo 跑通后补全）：
 * 1. LangChain 帮你做了什么？__auto-fill___—— 一条龙：chunk → embed → index → retrieve，
 *    你不需要懂 chunkSize、overlap、table createTable mode、search.score 计算 —— 全藏 pipe 后面。
 * 2. 你需要懂什么 LangChain 才知道发生了什么？—— Document { pageContent, metadata } 抽象、
 *    LanceDB.fromDocuments 内部 addVectors + createTable({mode: 'overwrite'})、
 *    LanceDB 实例的 table 字段是 in-memory 引用（不重新 openTable）—— 这 3 件事 LangChain 不告诉你。
 * 3. 跟 bootcamp 比，trace / 调试难易度：—— LangChain 抛 'Table not found. Please add vectors to the table first.'
 *    你得看 dist/lancedb.js 才知道是 fromDocuments 没被复用 + new 实例 table 字段是 undefined。
 *    bootcamp 手写链路过 stack trace 直奔自己写的 LanceStore.tbl() / openTable —— 调试粒度更细。
 * 4. provider 切换成本（OpenAI → Anthropic）：—— chatModel 换 ChatAnthropic 1 行；但
 *    embeddings 切换：Anthropic **没有** embeddings 模型 → 必须混 provider（OpenAIEmbeddings + ChatAnthropic）。
 *    bootcamp 这边换 provider 是改 model 字段 + baseURL，**切换成本 0**。
 * 5. 真实代价（Step 3 才发现）：LangChain LanceDB schema 不兼容 bootcamp LanceStore，独立 collection + 重复入库 13s；
 *    LangChain LanceDB new 实例不会从磁盘 reopen table（设计缺陷）。
 */
