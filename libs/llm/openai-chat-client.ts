/**
 * libs/llm/openai-chat-client.ts
 *
 * ChatClient 接口（libs/llm/chat-client.ts）的 OpenAI 兼容协议实现。
 *
 * 设计取舍（沿用 Day 02 c851ad8 commit 的 Review 决策）：
 * - chat 返回 ChatResponse 而非 string：统一普通聊天和工具调用。
 * - setModel 失败语义保持 void：模型无效由底层 SDK 抛 validation error。
 * - 构造函数对象传参：3 个配置项 + 1 个可选 future-proof，对象比位置参数更可扩展。
 * - 空 content 返回 ''：保留"原本是空"的信号给调用方，不静默吞掉。
 *
 * Day 03 加 stream() —— additive 实现：
 * - stream() 返回 AsyncGenerator<ChatChunk>（满足 AsyncIterable<ChatChunk> 契约）
 * - 用 OpenAI SDK 的 stream: true 路径
 * - 跳过 delta.content 为 null 的 chunk（stream 开头 / 结尾事件常见）
 * - 一次性拿到 delta.content 就 yield，不缓存、不聚合
 *
 * Day 04 重构：统一 chat / stream 接口，移除 chatWithTools
 * - chat({ messages, tools }) 统一处理普通聊天和工具调用
 * - 返回 ChatResponse：{ content?, toolCalls? }
 *
 * TODO（按 CLAUDE.md "Progressive Design — Leave TODO"）：
 * - 单测覆盖（README 强制）：smoke + mock 调用，Day 03 不做（spec 决策）。
 * - AbortSignal 取消：stream() 不支持（YAGNI），未来 day 加。
 * - structured output：不在前期范围。
 */

import OpenAI from 'openai';

import type { ChatClient, ChatRequest, ChatResponse, ChatChunk } from './chat-client.js';
import type { Message } from './message.js';

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

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { messages, tools } = request;

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toOpenAIMessages(messages),
      ...(tools !== undefined && tools.length > 0
        ? {
            tools: tools.map((t) => ({
              type: 'function' as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as unknown as Record<string, unknown>,
              },
            })),
          }
        : {}),
    });

    const choice = completion.choices[0];
    if (!choice) {
      return { content: '' };
    }

    // 工具调用路径
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      return {
        toolCalls: choice.message.tool_calls
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

    // 普通回复路径
    return { content: choice.message.content ?? '' };
  }

  async *stream(request: ChatRequest): AsyncGenerator<ChatChunk, void, undefined> {
    const { messages } = request;

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toOpenAIMessages(messages),
      stream: true,
    });

    for await (const chunk of stream) {
      // OpenAI stream 的首尾 chunk 通常 delta.content = null（role-only 或 finish_reason），
      // 跳过这些 chunk，只 yield 真实的文本增量。
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield { content: delta };
    }
  }

  private toOpenAIMessages(messages: readonly Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      switch (m.role) {
        case 'system':
          return { role: 'system' as const, content: m.content };
        case 'user':
          return { role: 'user' as const, content: m.content };
        case 'assistant': {
          const toolCalls = m.toolCalls;
          if (toolCalls !== undefined && toolCalls.length > 0) {
            return {
              role: 'assistant' as const,
              content: m.content,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.toolName,
                  arguments: JSON.stringify(tc.args),
                },
              })),
            };
          }
          return { role: 'assistant' as const, content: m.content };
        }
        case 'tool':
          return { role: 'tool' as const, content: m.content, tool_call_id: m.toolCallId ?? '' };
      }
    });
  }

  setModel(model: string): void {
    this.model = model;
  }
}
