/**
 * langchain-cmp/scenarios/happy_path.ts
 *
 * 真实场景：让 LangChain agent 顺序执行 file_read → file_edit → file_read，
 * 验证最终文件内容含 42。
 *
 * 跑前需要仓库根 .env 含 OPENAI_API_KEY / OPENAI_BASE_URL / MODEL_NAME。
 * dev 网关未配置或白名单不通过：exit 1，dev 网关失败不破坏 CI（CI 默认不跑）。
 */

import 'dotenv/config';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createAgent } from 'langchain';
import { createChatModel } from '../src/chat_model.js';
import { fileReadLangChainTool } from '../tools/file_read_tool.js';
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';

async function main() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'langchain-cmp-happy-'));
  const fixture = path.join(tmp, 'fixture.ts');
  await writeFile(fixture, 'export const answer = 1;\n', 'utf8');

  const llm = createChatModel();
  const tools = [fileReadLangChainTool, fileEditLangChainTool];

  const agent = createAgent({ model: llm, tools });

  try {
    const events: string[] = [];
    for await (const chunk of await agent.stream(
      {
        messages: [
          {
            role: 'system',
            content: '你必须先用 file_read，再用 file_edit，最后再 file_read 确认。',
          },
          { role: 'user', content: `读取 ${fixture}，把 answer 从 1 改成 42，再读一遍确认。` },
        ],
      },
      { streamMode: 'values', recursionLimit: 20 },
    )) {
      const last = (
        chunk as { messages?: Array<{ tool_calls?: Array<{ name: string }>; content?: unknown }> }
      ).messages?.at(-1);
      if (last?.tool_calls?.length) {
        for (const tc of last.tool_calls) events.push(`tool_call:${tc.name}`);
      } else if (typeof last?.content === 'string' && last.content.length > 0) {
        events.push('assistant');
      }
    }

    const finalContent = await readFile(fixture, 'utf8');
    console.log(JSON.stringify({ events, finalContent }, null, 2));
    if (!finalContent.includes('42')) throw new Error('fixture not updated');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
