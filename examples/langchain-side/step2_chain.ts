/**
 * examples/langchain-side/step2_chain.ts
 *
 * LangChain 副线 Step 2：3 步 chain（翻译 → 总结 → 翻译回）。
 * 跟 Step1 比，Step1 是"单次 LLM 调用"，Step2 是"串多个 LLM 调用"。
 *
 * 目的：看 LangChain pipe 语法（chain 组合）相对"手写循环"的优雅度。
 *
 * 用法：
 *   npx tsx examples/langchain-side/step2_chain.ts
 *
 * 对照 bootcamp：bootcamp 没有专门的"chain demo"（Day 03-04 都是单次调用 + tool）。
 * 如果要在 bootcamp 实现同等功能，需要：
 *   - 写循环（while / for await / reduce）
 *   - 自己管理 messages 累积
 *   - 自己处理错误 retry
 */

import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY required');

const baseURL = process.env.OPENAI_BASE_URL;
const modelName = process.env.MODEL_NAME;
if (!apiKey) throw new Error('OPENAI_API_KEY required');
if (!baseURL) throw new Error('OPENAI_BASE_URL is required');
if (!modelName) throw new Error('MODEL_NAME is required');

const model = new ChatOpenAI({
  apiKey,
  configuration: { baseURL },
  model: modelName,
  temperature: 0,
});
const parser = new StringOutputParser();

const INPUT_TEXT = `
人工智能工程师训练营是一套 65 天的进阶课程，每天学一个 AI agent 相关的主题。
前 12 天覆盖 LLM API、流式响应、agent loop、tool 抽象、schema 校验、embedding 等基础。
接下来会进入 RAG、memory、MCP、multi-agent、code agent 等高级主题。
最终目标是能自己从零搭建一个生产级的 coding agent。
`.trim();

// ─── 3 个独立 step ───
const translatePrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个专业翻译。把中文翻译成英文，保持原意。'],
  ['user', '{text}'],
]);

const summarizePrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个编辑。把英文文章总结成 3 个 bullet points。'],
  ['user', '{text}'],
]);

const backPrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个翻译。把英文翻译回中文。'],
  ['user', '{text}'],
]);

// ─── bootcamp 写法（如果手写）───
// async function bootcampStyle(text: string): Promise<string> {
//   const en = await chat([{ role: 'user', content: `翻译：${text}` }]);
//   const summary = await chat([{ role: 'user', content: `总结：${en}` }]);
//   const zh = await chat([{ role: 'user', content: `翻译回中文：${summary}` }]);
//   return zh;
// }

// ─── LangChain pipe 写法 ───
// 每个 step 独立可调，pipe 把它"组合"成函数
const translateStep = translatePrompt.pipe(model).pipe(parser);
const summarizeStep = summarizePrompt.pipe(model).pipe(parser);
const backStep = backPrompt.pipe(model).pipe(parser);

// 串行调 3 次 invoke —— 最直白的 chain 写法
async function langChainStyle(input: string): Promise<string> {
  const en = await translateStep.invoke({ text: input });
  console.log('[step 1: 翻译成英文]', en.slice(0, 80), '...');

  const summary = await summarizeStep.invoke({ text: en });
  console.log('[step 2: 总结成 3 点]', summary.slice(0, 80), '...');

  const zh = await backStep.invoke({ text: summary });
  console.log('[step 3: 翻译回中文]', zh.slice(0, 80), '...');

  return zh;
}

console.log(`[input] 原文长度: ${INPUT_TEXT.length} 字符\n`);
const t0 = Date.now();
const finalOutput = await langChainStyle(INPUT_TEXT);
const elapsed = Date.now() - t0;

console.log('\n[final output]');
console.log(finalOutput);
console.log(`\n[time] 总耗时: ${elapsed}ms（3 次串行 LLM 调用）`);

/**
 * 关键观察（看完跑通后写 retro）：
 * 1. pipe 链式 vs 手写循环，可读性差异多大？____
 * 2. 中间步骤的输出怎么传给下一步（.invoke({ text: prev })）?____
 * 3. 如果某一步出错（比如 step 2 timeout），整条链会怎样？____
 * 4. 如果你想"并行"跑 step 1 和 step 2（拿到两个独立结果），LangChain 怎么写？____
 */
