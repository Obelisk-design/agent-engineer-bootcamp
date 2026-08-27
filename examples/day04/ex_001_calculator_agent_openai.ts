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
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.MODEL_NAME;

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}
if (!baseURL) {
  throw new Error('OPENAI_BASE_URL is required (set in .env or shell env)');
}
if (!model) {
  throw new Error('MODEL_NAME is required (set in .env or shell env)');
}

console.log(`[openai-calculator] baseURL=${baseURL}`);
console.log(`[openai-calculator] model=${model}`);

const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  model,
});

// 🆕 Day 09: 多轮对话 —— messages 由 caller 自己拼（含 system）
const SYSTEM_PROMPT = 'You are a helpful assistant. Prefer using available tools over guessing.';
const messages = [
  { role: 'system' as const, content: SYSTEM_PROMPT },
  { role: 'user' as const, content: '用 calculator 工具计算 1+2*3' },
];

async function main() {
  // Day 05 起 Agent 推荐用 runEvents() 看完整事件流；这里手动打印 iteration 进度，
  // 不再走 onIteration 回调（回调跟 runEvents 是同一信息的两个出口，已删除）。
  //
  // 🆕 Day 07：final-answer iter 改流式（message_delta 事件），
  //   response 事件携带 usage 字段，累积打印 token 用量。
  let answer = '';
  let totalUsage: { promptTokens: number; completionTokens: number } | undefined;
  for await (const ev of agent.runEvents(messages)) {
    if (ev.kind === 'iteration') {
      console.log(`[openai-calculator] iteration=${ev.n}`);
    } else if (ev.kind === 'tool_call') {
      console.log(`[openai-calculator] tool_call name=${ev.name} args=${JSON.stringify(ev.args)}`);
    } else if (ev.kind === 'tool_result') {
      console.log(`[openai-calculator] tool_result output=${ev.output}`);
    } else if (ev.kind === 'message_delta') {
      // 🆕 Day 07：final-answer iter 流式文本增量
      process.stdout.write(ev.content);
    } else if (ev.kind === 'response' && ev.usage !== undefined) {
      // 🆕 Day 07：单轮 token 用量 → 累积
      totalUsage =
        totalUsage === undefined
          ? ev.usage
          : {
              promptTokens: totalUsage.promptTokens + ev.usage.promptTokens,
              completionTokens: totalUsage.completionTokens + ev.usage.completionTokens,
            };
    } else if (ev.kind === 'message_end') {
      answer = ev.content;
    } else if (ev.kind === 'error') {
      console.error(`[openai-calculator] error: ${ev.message}`);
    }
  }
  if (totalUsage !== undefined) {
    console.log(
      `\n[openai-calculator] total usage: prompt=${totalUsage.promptTokens} completion=${totalUsage.completionTokens}`,
    );
  }
  console.log(`\n[openai-calculator] answer: ${answer}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
