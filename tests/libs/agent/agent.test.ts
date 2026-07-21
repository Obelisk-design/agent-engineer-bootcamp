import { describe, expect, it } from 'vitest';

import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry, calculatorTool } from '../../../libs/tools/index.js';
import type { ChatClient, ChatResponse, Message } from '../../../libs/llm/index.js';
import type { ToolDefinition } from '../../../libs/tools/index.js';

class FakeChatClient implements ChatClient {
  private responses: ChatResponse[];
  private callIndex = 0;

  constructor(responses: ChatResponse[]) {
    this.responses = responses;
  }

  async chat(): Promise<string> {
    return 'fake';
  }

  async *stream(): AsyncGenerator<string, void, undefined> {
    yield 'fake';
  }

  async chatWithTools(
    _messages: Message[],
    _tools: ReadonlyArray<ToolDefinition>,
  ): Promise<ChatResponse> {
    const response = this.responses[this.callIndex];
    if (response === undefined) {
      throw new Error('FakeChatClient: no more mocked responses');
    }
    this.callIndex += 1;
    return response;
  }

  setModel(): void {}
}

describe('Agent', () => {
  it('returns content immediately when LLM answers without tool', async () => {
    const chat = new FakeChatClient([{ kind: 'content', content: 'hi' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const answer = await agent.run('hello');
    expect(answer).toBe('hi');
  });

  it('runs tool loop and returns final content', async () => {
    const chat = new FakeChatClient([
      {
        kind: 'tool_calls',
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1+2' } }],
      },
      { kind: 'content', content: '3' },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools });
    const answer = await agent.run('compute');
    expect(answer).toBe('3');
  });

  it('returns error string for unknown tool and continues loop', async () => {
    const chat = new FakeChatClient([
      {
        kind: 'tool_calls',
        toolCalls: [{ id: 'tc_1', toolName: 'nonexistent', args: {} }],
      },
      { kind: 'content', content: 'done' },
    ]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools });
    const answer = await agent.run('call missing tool');
    expect(answer).toBe('done');
  });

  it('throws when loop exceeds maxIterations', async () => {
    const chat = new FakeChatClient([
      {
        kind: 'tool_calls',
        toolCalls: [{ id: 'tc_1', toolName: 'calculator', args: { expression: '1' } }],
      },
      {
        kind: 'tool_calls',
        toolCalls: [{ id: 'tc_2', toolName: 'calculator', args: { expression: '2' } }],
      },
    ]);
    const tools = new ToolRegistry();
    tools.register(calculatorTool);
    const agent = new Agent({ chat, tools, maxIterations: 2 });
    await expect(agent.run('infinite')).rejects.toThrow('exceeded 2 iterations');
  });
});
