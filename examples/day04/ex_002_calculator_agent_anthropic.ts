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
  systemPrompt: 'You are a helpful assistant. Prefer using available tools over guessing.',
});

async function main() {
  // Day 05 起 Agent 推荐用 runEvents() 看完整事件流；这里手动打印 iteration 进度，
  // 不再走 onIteration 回调（回调跟 runEvents 是同一信息的两个出口，已删除）。
  let answer = '';
  for await (const ev of agent.runEvents('用 calculator 工具计算 1+2*3')) {
    if (ev.kind === 'iteration') {
      console.log(`[anthropic-calculator] iteration=${ev.n}`);
    } else if (ev.kind === 'tool_call') {
      console.log(
        `[anthropic-calculator] tool_call name=${ev.name} args=${JSON.stringify(ev.args)}`,
      );
    } else if (ev.kind === 'tool_result') {
      console.log(`[anthropic-calculator] tool_result output=${ev.output}`);
    } else if (ev.kind === 'message_end') {
      answer = ev.content;
    }
  }
  console.log(`[anthropic-calculator] answer: ${answer}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
