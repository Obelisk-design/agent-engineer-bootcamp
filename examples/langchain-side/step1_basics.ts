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
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.MODEL_NAME ?? 'ai-coding';

if (!apiKey) throw new Error('OPENAI_API_KEY required');

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
 * 关键观察（看完跑通后写 retro）：
 * 1. LangChain 帮你做了什么？__auto-fill___
 * 2. 你需要懂什么 LangChain 才知道发生了什么？___internal___
 * 3. 跟 bootcamp 比，trace / 调试难易度：____
 * 4. provider 切换成本（OpenAI → Anthropic）：____
 */
