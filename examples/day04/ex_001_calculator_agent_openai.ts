/**
 * examples/day04/ex_001_calculator_agent_openai.ts
 *
 * Day 04 示例：OpenAI 兼容协议 + Agent + CalculatorTool 端到端。
 *
 * 本 demo 验证：
 *   1. ChatClient.chatWithTools 能触发 tool_calls。
 *   2. Agent 执行 calculator 工具并把结果回传 LLM。
 *   3. 第二轮 LLM 返回最终 content，loop 收敛。
 *
 * 用法：
 *   确认 .env 中 OPENAI_API_KEY / OPENAI_BASE_URL / MODEL_NAME 已填
 *   pnpm exec tsx examples/day04/ex_001_calculator_agent_openai.ts
 */

import 'dotenv/config';

import { OpenAIChatClient } from '../../libs/llm/index.js';
import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.MODEL_NAME ?? 'ai-coding';

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}

console.log(`[openai-calculator] baseURL=${baseURL}`);
console.log(`[openai-calculator] model=${model}`);

const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  systemPrompt:
    'You have access to a calculator tool. When arithmetic is needed, call it. Then answer based on the result.',
  onIteration: (iteration, response) => {
    console.log(
      `[openai-calculator] iteration=${iteration} response=${response.content !== undefined ? 'content' : 'tool_calls'}`,
    );
  },
});

async function main() {
  const answer = await agent.run('用 calculator 工具计算 1+2*3');
  console.log(`[openai-calculator] answer: ${answer}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
