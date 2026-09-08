/**
 * examples/day15/ex_002_edit_agent.ts
 *
 * Day 15 阶段示例：file_read → file_edit → file_read 完整多轮反馈闭环。
 *
 * 流程：
 *   1. mkdtemp 建临时目录 + 写入带唯一目标字符串的 fixture
 *   2. Agent 跑多轮 file_read / file_edit / file_read
 *   3. 打印 AgentEvent JSON 行（content 字段脱敏，仅 kind / 关键元数据）
 *   4. finally 删除临时目录，不动任何仓库真实文件
 *
 * 验证目标：
 *   - 真实 LLM 能不能遵循「先 read 再 edit 再 read」指令
 *   - 看到 tool_call_start / tool_call_end 事件的 yield 节奏
 *   - tokenUsage / latencyMs 字段是否随事件流出来
 *
 * 跑法：pnpm exec tsx examples/day15/ex_002_edit_agent.ts
 *
 * 预期：exit 0；stdout 含至少 1 次 tool_call_start → tool_call → tool_call_end → tool_result；
 *       最终 message_end + done；临时目录 finally 被清掉。
 */

import 'dotenv/config';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { Agent } from '../../libs/agent/agent.js';
import { ToolRegistry } from '../../libs/tools/tool-registry.js';
import { fileReadTool } from '../../libs/tools/repo/file-read-tool.js';
import { fileEditTool } from '../../libs/tools/repo/file-edit-tool.js';
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

async function main(): Promise<void> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'day15-edit-agent-'));
  const fixture = path.join(tmp, 'fixture.ts');
  await writeFile(fixture, 'export const answer = 1;\nexport const label = "before";\n', 'utf8');

  const registry = new ToolRegistry();
  registry.register(fileReadTool);
  registry.register(fileEditTool);

  const chat = new OpenAIChatClient({ apiKey: apiKey!, baseURL: baseURL!, model: model! });
  const agent = new Agent({ chat, tools: registry, model: model! });

  try {
    for await (const ev of agent.runEvents(
      [
        {
          role: 'system',
          content: '你是文件编辑助手。编辑前必须先 file_read，编辑后必须再 file_read 验证。',
        },
        {
          role: 'user',
          content: `读取 ${fixture}，把 answer 从 1 改成 42，再读一遍确认。`,
        },
      ],
      { signal: AbortSignal.timeout(60_000) },
    )) {
      // 打印 kind + 元数据；message_delta / message_end 不打 content（避免污染 stdout）
      if (ev.kind === 'message_delta') continue;
      if (ev.kind === 'message_end') {
        console.log(JSON.stringify({ kind: ev.kind, contentLength: ev.content.length }));
        continue;
      }
      const { kind: _omit, ...rest } = ev;
      console.log(JSON.stringify({ kind: ev.kind, ...rest }));
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
