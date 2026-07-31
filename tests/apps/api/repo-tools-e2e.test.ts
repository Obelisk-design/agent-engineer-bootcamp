import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentApp } from '../../../apps/api/src/index.js';
import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry, repoIndexTool } from '../../../libs/tools/index.js';
import { FakeChatClient } from '../../libs/agent/shared/fake-chat-client.js';
import type { ToolCallData } from '../../../libs/llm/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../../fixtures/sample-repo');

async function readSSEResponse(res: Response): Promise<string> {
  if (res.body === null) throw new Error('expected response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) out += decoder.decode(value);
  }
  return out;
}

function buildToolCall(toolCallId: string, toolName: string, args: unknown): ToolCallData {
  return { id: toolCallId, toolName, args };
}

describe('POST /agent end-to-end with repo tools', () => {
  it('streams tool_call + tool_result for repo_index', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [buildToolCall('tc_1', 'repo_index', { rootPath: FIXTURE, maxDepth: 3 })],
      },
      { content: 'I found 2 files in the repo.' },
    ]);

    const tools = new ToolRegistry();
    tools.register(repoIndexTool);
    const agent = new Agent({ chat, tools, maxIterations: 3 });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'What files are in the repo?' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await readSSEResponse(res);

    // 关键不变量：repo_index 的 tool_call + tool_result 都在 SSE 里
    expect(body).toContain('event: tool_call\ndata:');
    expect(body).toContain('"name":"repo_index"');
    expect(body).toContain('event: tool_result\ndata:');
    expect(body).toContain('"name":"repo_index"');

    // tool_result 里能看到 fixture 文件名
    expect(body).toContain('src/foo.ts');
    expect(body).toContain('src/bar.test.ts');

    // 顺序：tool_call 在 tool_result 之前
    const toolCallIdx = body.indexOf('event: tool_call\ndata:');
    const toolResultIdx = body.indexOf('event: tool_result\ndata:');
    expect(toolCallIdx).toBeGreaterThanOrEqual(0);
    expect(toolResultIdx).toBeGreaterThan(toolCallIdx);
  });

  it('tool result JSON contains the RepoIndexResult shape', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [buildToolCall('tc_1', 'repo_index', { rootPath: FIXTURE, maxDepth: 3 })],
      },
      { content: 'done' },
    ]);

    const tools = new ToolRegistry();
    tools.register(repoIndexTool);
    const agent = new Agent({ chat, tools, maxIterations: 3 });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'list files' }),
      }),
    );

    await readSSEResponse(res);

    // FakeChatClient 第二次 chat 应该收到包含 tool result 的 messages
    expect(chat.requests).toHaveLength(2);
    const secondMessages = chat.requests[1]?.messages ?? [];
    const toolResultMessage = secondMessages.find((m) => m.role === 'tool');
    expect(toolResultMessage).toBeDefined();
    const parsed = JSON.parse((toolResultMessage as { content: string }).content);
    expect(parsed.files).toEqual(expect.arrayContaining(['src/foo.ts', 'src/bar.test.ts']));
    expect(parsed.total).toBeGreaterThanOrEqual(2);
    expect(parsed.truncated).toBe(false);
  });
});
