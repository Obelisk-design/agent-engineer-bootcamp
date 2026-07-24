/**
 * tests/libs/agent/shared/fake-chat-client.ts
 *
 * FakeChatClient —— 用于 Agent / ChatClient 测试的可控响应客户端。
 *
 * 设计：
 * - 接受 ChatResponse[] 数组，按 chat() 调用顺序消费（顺序可控）
 * - 公开 `requests: ChatRequest[]`，记录每次 chat() 的入参（包括累积的 messages），
 *   测试可以断言"第 N 次调用时 LLM 收到的 messages 是什么"
 *
 * 不做的事（YAGNI）：
 * - 不支持动态响应（按 messages 内容决定响应）—— 如果 Day 06+ 真需要再加
 * - 不 mock HTTP 层 —— Agent / app.fetch 集成测试已经够覆盖
 * - 不放 libs/ —— 仅测试用，放在 tests/ 下避免被生产代码 import
 */

import type {
  ChatClient,
  ChatRequest,
  ChatResponse,
  ChatChunk,
} from '../../../../libs/llm/index.js';

export class FakeChatClient implements ChatClient {
  public readonly requests: ChatRequest[] = [];

  constructor(private readonly responses: ChatResponse[]) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Deep-copy messages so later Agent mutations (push assistant / tool
    // messages) don't leak back into earlier recorded requests. Tests
    // assert against requests[N].messages which would otherwise always
    // reflect the final accumulated state.
    this.requests.push({
      ...request,
      messages: request.messages.map((m) => ({ ...m })),
    });
    const response = this.responses[this.requests.length - 1];
    if (response === undefined) {
      throw new Error(
        `FakeChatClient: no more mocked responses (called ${this.requests.length} times, only ${this.responses.length} mocked)`,
      );
    }
    return response;
  }

  async *stream(): AsyncGenerator<ChatChunk, void, undefined> {
    yield { content: 'fake' };
  }

  setModel(): void {}
}
