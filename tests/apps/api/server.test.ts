import { describe, expect, it } from 'vitest';

import { createAgentApp } from '../../../apps/api/src/index.js';
import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry, calculatorTool } from '../../../libs/tools/index.js';
import type { ChatClient, ChatRequest, ChatResponse, ChatChunk } from '../../../libs/llm/index.js';

class FakeChatClient implements ChatClient {
  private responses: ChatResponse[];
  private callIndex = 0;

  constructor(responses: ChatResponse[]) {
    this.responses = responses;
  }

  async chat(_request: ChatRequest): Promise<ChatResponse> {
    const response = this.responses[this.callIndex];
    if (response === undefined) {
      throw new Error('FakeChatClient: no more mocked responses');
    }
    this.callIndex += 1;
    return response;
  }

  async *stream(): AsyncGenerator<ChatChunk, void, undefined> {
    yield { content: 'fake' };
  }

  setModel(): void {}
}

/**
 * 把 SSE Response 的 body 流读成完整的字符串（含 event:/data:/\n\n）。
 * Node 22 的 fetch API 暴露 ReadableStream<Uint8Array>。
 */
async function readSSEResponse(res: Response): Promise<string> {
  if (res.body === null) {
    throw new Error('expected SSE response to have a body');
  }
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

describe('createAgentApp POST /agent', () => {
  it('streams the full SSE sequence for a calculator tool call', async () => {
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }],
      },
      { content: '3' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'compute 1+2' }),
      }),
    );

    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const body = await readSSEResponse(res);

    // 按事件顺序断言所有 SSE 帧都到达
    expect(body).toContain('event: message_start\ndata: {"kind":"message_start"}\n\n');
    expect(body).toContain('event: iteration\ndata: {"kind":"iteration","n":1}\n\n');
    expect(body).toContain('event: tool_call\ndata:');
    expect(body).toContain('"name":"calculator"');
    expect(body).toContain('event: tool_result\ndata:');
    expect(body).toContain('event: message_end\ndata: {"kind":"message_end","content":"3"}\n\n');
    expect(body).toContain('event: done\ndata: {"kind":"done"}\n\n');
    // request / response 也应出现在 SSE 流（Day 05 追加：调用过程全可视化）
    expect(body).toContain('event: request\ndata:');
    expect(body).toMatch(/"kind":"request"/);
    expect(body).toMatch(/"messages":\[/);
    expect(body).toContain('event: response\ndata:');
    expect(body).toMatch(/"kind":"response"/);
  });

  it('streams message_end + done when LLM answers without tools', async () => {
    const chat = new FakeChatClient([{ content: 'hi back' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'hello' }),
      }),
    );

    const body = await readSSEResponse(res);
    expect(body).toContain('event: message_start\ndata:');
    expect(body).toContain('event: iteration\ndata: {"kind":"iteration","n":1}\n\n');
    expect(body).toContain(
      'event: message_end\ndata: {"kind":"message_end","content":"hi back"}\n\n',
    );
    expect(body).toContain('event: done\ndata: {"kind":"done"}\n\n');
    expect(body).not.toContain('event: tool_call');
  });

  it('returns 400 when input is missing', async () => {
    const chat = new FakeChatClient([]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when input is not a string', async () => {
    const chat = new FakeChatClient([]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 123 }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when input is empty string', async () => {
    const chat = new FakeChatClient([]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: '' }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('GET / returns the Agent Console HTML', async () => {
    const chat = new FakeChatClient([]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const app = createAgentApp({ agent });

    const res = await app.fetch(new Request('http://localhost/'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('Agent Console');
    expect(body).toContain('id="conversation"');
    expect(body).toContain('id="timeline"');
    expect(body).toContain("fetch('/agent'");
  });

  it('emits error event when agent loop throws', async () => {
    // 两次 tool_calls，但 maxIterations=1，第二次 chat 调用会抛 maxIterations 超限
    const chat = new FakeChatClient([
      {
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1' } }],
      },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools, maxIterations: 1 });
    const app = createAgentApp({ agent });

    const res = await app.fetch(
      new Request('http://localhost/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'infinite' }),
      }),
    );

    const body = await readSSEResponse(res);
    expect(body).toContain('event: error\ndata:');
    expect(body).toMatch(/"kind":"error"/);
    expect(body).toMatch(/"message":"Agent loop exceeded 1 iterations/);
  });
});
