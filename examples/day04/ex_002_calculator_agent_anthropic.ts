/**
 * examples/day04/ex_002_calculator_agent_anthropic.ts
 *
 * Day 04 示例：Anthropic Messages API（Claude Code gateway）+ Agent + CalculatorTool。
 *
 * 本 demo 验证 Anthropic provider 同样能走通：
 *   chatWithTools → tool_use block → 执行 calculator → tool_result block → 最终 content。
 *
 * 环境变量：
 *   ANTHROPIC_AUTH_TOKEN
 *   ANTHROPIC_BASE_URL
 *   ANTHROPIC_MODEL（默认 MiniMax-M3；若不可用，可改为 kimi-for-coding）
 *
 * 用法：
 *   pnpm exec tsx examples/day04/ex_002_calculator_agent_anthropic.ts
 */

import 'dotenv/config';

import { AnthropicChatClient } from '../../libs/llm/index.js';
import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';

const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
const baseURL = process.env.ANTHROPIC_BASE_URL;
const model = process.env.ANTHROPIC_MODEL ?? 'MiniMax-M3';

if (!apiKey) {
  throw new Error('ANTHROPIC_AUTH_TOKEN is required (set in .env or shell env)');
}
if (!baseURL) {
  throw new Error('ANTHROPIC_BASE_URL is required (set in .env or shell env)');
}

console.log(`[anthropic-calculator] baseURL=${baseURL}`);
console.log(`[anthropic-calculator] model=${model}`);

const chat = new AnthropicChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  systemPrompt:
    'You have access to a calculator tool. When arithmetic is needed, call it. Then answer based on the result.',
  onIteration: (iteration, response) => {
    console.log(`[anthropic-calculator] iteration=${iteration} response=${response.kind}`);
  },
});

async function main() {
  const answer = await agent.run('用 calculator 工具计算 1+2*3');
  console.log(`[anthropic-calculator] answer: ${answer}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
