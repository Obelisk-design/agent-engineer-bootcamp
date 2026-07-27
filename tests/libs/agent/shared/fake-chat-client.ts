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
 * Day 07 加 stream() + signal 透传：
 * - stream() 默认行为：自动 yield chat response 的 content 作为单 chunk（真实 LLM 也这样流式发出）
 * - 精细控制路径：streamChunks 队列非空时优先消费（特定测试场景）
 * - signal.aborted 检查在 yield 之前
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
  ChatOptions,
} from '../../../../libs/llm/index.js';

export class FakeChatClient implements ChatClient {
  public readonly requests: ChatRequest[] = [];
  /** 精细控制 stream chunks 的队列（每项是 ChatChunk[]，表示一次 stream() 调用 yield 的所有 chunks） */
  public readonly streamChunks: ChatChunk[][] = [];

  constructor(private readonly responses: ChatResponse[]) {}

  async chat(request: ChatRequest, _options?: ChatOptions): Promise<ChatResponse> {
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

  async *stream(
    _request: ChatRequest,
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk, void, undefined> {
    // 精细控制路径：streamChunks 队列非空 → 消费之
    const streamQueue = this.streamChunks.shift();
    if (streamQueue !== undefined) {
      for (const chunk of streamQueue) {
        if (options?.signal?.aborted) return;
        yield chunk;
      }
      return;
    }

    // 🆕 Day 07 fallback：自动 yield chat response 的 content 作为单 chunk
    // 真实 LLM 流式行为是把 chat content 分块发出，对测试等价。
    const lastIndex = this.requests.length - 1;
    const lastResponse = this.responses[lastIndex];
    if (lastResponse?.content !== undefined) {
      if (options?.signal?.aborted) return;
      yield { content: lastResponse.content };
    }
  }

  setModel(): void {}
}
