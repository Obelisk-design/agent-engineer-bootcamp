/**
 * examples/day11/ex_002_read_agent.ts
 *
 * 真实 LLM demo：验证 L1 闭环 search → read 真的能串起来。
 *
 * 问 Agent 一个必须"先搜再读"才能答的问题，观察它是否：
 *   1. 用 repo_search 定位
 *   2. 用 file_read 读完整上下文
 *   3. tool_call 参数类型是**真类型**（数字就是数字，不是 "1" 字符串）
 *
 * 第 3 点是 Day 11 根因修复的直接证据 —— Day 10 时 LLM 传的是 {"maxDepth":"1"}。
 *
 * 需要环境变量：OPENAI_API_KEY / OPENAI_BASE_URL / MODEL_NAME
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../../libs/agent/agent.js';
import { ToolRegistry } from '../../libs/tools/tool-registry.js';
import { repoIndexTool } from '../../libs/tools/repo/repo-index-tool.js';
import { repoSearchTool } from '../../libs/tools/repo/repo-search-tool.js';
import { fileReadTool } from '../../libs/tools/repo/file-read-tool.js';
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
  tools.register(fileReadTool);

  const chat = new OpenAIChatClient({ apiKey: apiKey!, baseURL: baseURL!, model: model! });
  const agent = new Agent({ chat, tools, model: 'gpt-4o-mini' });

  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a coding assistant with repo tools. ' +
        'Use repo_search to locate code, then file_read to read the full context before answering.',
    },
    {
      role: 'user' as const,
      content:
        `In the repo at ${REPO_ROOT}, find where "runTool" is defined and explain what it does. ` +
        `Search first, then read the file to get the full function body.`,
    },
  ];

  console.log('--- AgentEvents ---');
  const argTypeLog: string[] = [];
  let final = '';

  for await (const ev of agent.runEvents(messages)) {
    if (ev.kind === 'message_delta') {
      process.stdout.write(ev.content);
    } else if (ev.kind === 'tool_call') {
      console.log(`\n[tool_call] ${ev.name}(${JSON.stringify(ev.args)})`);
      // 记录每个非字符串语义参数的实际 JS 类型
      for (const [k, v] of Object.entries(ev.args as Record<string, unknown>)) {
        if (k !== 'path' && k !== 'rootPath' && k !== 'pattern' && k !== 'fileGlob') {
          argTypeLog.push(`${ev.name}.${k} = ${JSON.stringify(v)} (${typeof v})`);
        }
      }
    } else if (ev.kind === 'tool_result') {
      const head = ev.output.slice(0, 120).replace(/\n/g, '\\n');
      console.log(`[tool_result] ${ev.name} → ${head}${ev.output.length > 120 ? '...' : ''}`);
    } else if (ev.kind === 'message_end') {
      final = ev.content;
    } else if (ev.kind === 'error') {
      console.error(`\n[error] ${ev.message}`);
    }
  }

  console.log('\n--- Final ---');
  console.log(final);

  console.log('\n--- Day 11 验证：tool_call 参数的实际类型 ---');
  if (argTypeLog.length === 0) {
    console.log('(本次 LLM 未传任何数值/布尔参数)');
  } else {
    for (const line of argTypeLog) console.log(line);
    console.log('\n期望：数值参数的 typeof 是 number 而非 string（Day 10 时是 string）');
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
