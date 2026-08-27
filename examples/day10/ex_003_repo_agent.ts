/**
 * examples/day10/ex_003_repo_agent.ts
 *
 * 真实 LLM Agent 跑一轮：问 "libs/tools/ 下面有哪些文件"。
 *
 * Agent 用 repo_index tool 答问题 —— 打印 AgentEvent 流 + 最终回答。
 *
 * 运行需要环境变量：
 * - OPENAI_API_KEY（用 gpt-4o-mini）
 * - 或 ANTHROPIC_API_KEY（改为 AnthropicChatClient）
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../../libs/agent/agent.js';
import { ToolRegistry } from '../../libs/tools/tool-registry.js';
import { repoIndexTool } from '../../libs/tools/repo/repo-index-tool.js';
import { repoSearchTool } from '../../libs/tools/repo/repo-search-tool.js';
import { OpenAIChatClient } from '../../libs/llm/openai-chat-client.js';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function main(): Promise<void> {
  const tools = new ToolRegistry();
  tools.register(repoIndexTool);
  tools.register(repoSearchTool);

  const chat = new OpenAIChatClient({ apiKey: apiKey!, baseURL: baseURL!, model: model! });
  const agent = new Agent({ chat, tools, model: 'gpt-4o-mini' });

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a helpful coding assistant with access to repo tools.',
    },
    {
      role: 'user' as const,
      content: `What files are in ${REPO_ROOT}/libs/tools/? List the top 5. Use the repo_index tool.`,
    },
  ];

  console.log('--- AgentEvents ---');
  let final = '';
  for await (const ev of agent.runEvents(messages)) {
    if (ev.kind === 'message_delta') {
      process.stdout.write(ev.content);
    } else if (ev.kind === 'tool_call') {
      console.log(`\n[tool_call] ${ev.name}(${JSON.stringify(ev.args)})`);
    } else if (ev.kind === 'tool_result') {
      console.log(
        `[tool_result] ${ev.name} → ${ev.output.slice(0, 100)}${ev.output.length > 100 ? '...' : ''}`,
      );
    } else if (ev.kind === 'message_end') {
      final = ev.content;
    } else if (ev.kind === 'error') {
      console.error(`\n[error] ${ev.message}`);
    }
  }
  console.log('\n--- Final ---');
  console.log(final);
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
