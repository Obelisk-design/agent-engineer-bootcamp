/**
 * libs/llm/openai-chat-client.ts
 *
 * ChatClient 接口（libs/llm/chat-client.ts）的 OpenAI 兼容协议实现。
 *
 * 设计取舍（沿用 Day 02 c851ad8 commit 的 Review 决策）：
 * - chat 返回 string 而非结构化 response：ChatClient 层最克制的契约。
 * - setModel 失败语义保持 void：模型无效由底层 SDK 抛 validation error。
 * - 构造函数对象传参：3 个配置项 + 1 个可选 future-proof，对象比位置参数更可扩展。
 * - 空 content 返回 ''：保留"原本是空"的信号给调用方，不静默吞掉。
 *
 * 多 provider 形态（c851ad8 时只有一个，Day 02 延展后加 Anthropic）：
 * - ChatClient interface：libs/llm/chat-client.ts
 * - OpenAI provider：本文件
 * - Anthropic provider：libs/llm/anthropic-chat-client.ts
 *
 * Day 03 加 stream() —— additive 实现：
 * - async function* stream() 返回 AsyncGenerator<string>（满足 AsyncIterable<string> 契约）
 * - 用 OpenAI SDK 的 stream: true 路径
 * - 跳过 delta.content 为 null 的 chunk（stream 开头 / 结尾事件常见）
 * - 一次性拿到 delta.content 就 yield，不缓存、不聚合
 *
 * Day 04 加 chatWithTools() —— additive 工具调用扩展：
 * - 通过 OpenAI SDK tools 参数发起非流式工具调用
 * - 将 content / tool_calls 映射到 ChatResponse 判别联合
 *
 * TODO（按 CLAUDE.md "Progressive Design — Leave TODO"）：
 * - 单测覆盖（README 强制）：smoke + mock 调用，Day 03 不做（spec 决策）。
 * - AbortSignal 取消：stream() 不支持（YAGNI），未来 day 加。
 * - structured output：不在前期范围。
 *
 * 注：本文件 c851ad8 时叫 chat-client.ts（含 ChatClient interface）。
 *     Day 02 延展加 AnthropicChatClient 后被拆分 —— rename + 拆分见
 *     Day 02 延展 commit。
 */

import OpenAI from 'openai';

import type { ChatClient } from './chat-client.js';
import type { Message } from './message.js';
import type { ChatResponse, ToolDefinition } from './tool-call.js';

export interface OpenAIChatClientOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly model: string;
}

export class OpenAIChatClient implements ChatClient {
  private readonly client: OpenAI;
  private model: string;

  constructor(options: OpenAIChatClientOptions) {
    // exactOptionalPropertyTypes 下不能用 baseURL: undefined；
    // 可选字段存在才注入，否则交给 OpenAI SDK 用默认 baseURL。
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    });
    this.model = options.model;
  }

  async chat(messages: Message[]): Promise<string> {
    // TODO: Day 04 Task 3 chatWithTools will replace this cast with proper tool message mapping
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
    });
    // OpenAI SDK 的返回类型对 strict + noUncheckedIndexedAccess 比较宽；
    // 这里用 ?? 把"原本是空"显式暴露给调用方。
    return completion.choices[0]?.message?.content ?? '';
  }

  async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
    // TODO: Day 04 Task 3 chatWithTools will replace this cast with proper tool message mapping
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
      stream: true,
    });
    for await (const chunk of stream) {
      // OpenAI stream 的首尾 chunk 通常 delta.content = null（role-only 或 finish_reason），
      // 跳过这些 chunk，只 yield 真实的文本增量。
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async chatWithTools(
    messages: Message[],
    tools: ReadonlyArray<ToolDefinition>,
  ): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
      tools: tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as unknown as Record<string, unknown>,
        },
      })),
    });
    const choice = response.choices[0];
    if (!choice) {
      return { kind: 'content', content: '' };
    }
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      return {
        kind: 'tool_calls',
        toolCalls: choice.message.tool_calls
          // Filter custom tool calls — this client only declares function tools,
          // so custom type is theoretically impossible. If SDK ever returns
          // non-function tool calls, they're silently dropped (consider adding
          // diagnostic if Day 04 fix loop finds a real case).
          .filter(
            (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => tc.type === 'function',
          )
          .map((tc) => ({
            id: tc.id,
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments) as unknown,
          })),
      };
    }
    return { kind: 'content', content: choice.message.content ?? '' };
  }

  setModel(model: string): void {
    this.model = model;
  }
}
