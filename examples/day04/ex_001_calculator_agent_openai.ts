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
});

async function main() {
  // Day 05 起 Agent 推荐用 runEvents() 看完整事件流；这里手动打印 iteration 进度，
  // 不再走 onIteration 回调（回调跟 runEvents 是同一信息的两个出口，已删除）。
  let answer = '';
  for await (const ev of agent.runEvents('用 calculator 工具计算 1+2*3')) {
    if (ev.kind === 'iteration') {
      console.log(`[openai-calculator] iteration=${ev.n}`);
    } else if (ev.kind === 'tool_call') {
      console.log(`[openai-calculator] tool_call name=${ev.name} args=${JSON.stringify(ev.args)}`);
    } else if (ev.kind === 'tool_result') {
      console.log(`[openai-calculator] tool_result output=${ev.output}`);
    } else if (ev.kind === 'message_end') {
      answer = ev.content;
    }
  }
  console.log(`[openai-calculator] answer: ${answer}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
