/**
 * libs/llm/anthropic-chat-client.ts
 *
 * ChatClient 接口的第二个 provider —— Anthropic Messages API 实现。
 *
 * 课题 = 验证 ChatClient 接口在多 provider 下仍然稳定。
 *
 * Anthropic Messages API 与 Chat Completions API 三个关键差异，本文件消化：
 *   1. system 不在 messages 里，是顶层字段
 *   2. content 是 blocks 数组（{ type: 'text', text: ... }），不是 string
 *   3. max_tokens 强制要求（本文件提供 1024 兜底）
 *
 * 业务方代码（`client.chat({ messages })`）与 OpenAIChatClient 完全一致 —— 这是
 * ChatClient 抽象层的核心价值兑现。
 *
 * Day 03 加 stream() —— Anthropic SDK 的特殊形态：
 *   client.messages.stream() 返回 MessageStream（implements AsyncIterable<MessageStreamEvent>）。
 *   事件是判别联合，包括 message_start / content_block_start /
 *   content_block_delta / content_block_stop / message_delta / message_stop。
 *
 *   ChatClient.stream() 契约要求只 yield ChatChunk，所以本文件内部：
 *   - 只在 event.type === 'content_block_delta' && event.delta.type === 'text_delta'
 *     时 yield { content: event.delta.text }
 *   - 其它所有事件类型全部跳过（调用方看不到协议细节）
 *
 * Day 04 重构：统一 chat / stream 接口，移除 chatWithTools
 * - chat({ messages, tools }) 统一处理普通聊天和工具调用
 * - 返回 ChatResponse：{ content?, toolCalls? }
 *
 * 注意：调用方应通过环境变量提供 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL /
 * ANTHROPIC_MODEL，永远不要硬编码到任何源文件。
 */

import Anthropic from '@anthropic-ai/sdk';

import type { ChatClient, ChatRequest, ChatResponse, ChatChunk } from './chat-client.js';
import type { Message } from './message.js';

export interface AnthropicChatClientOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly model: string;
  readonly maxTokens?: number;
}

export class AnthropicChatClient implements ChatClient {
  private readonly client: Anthropic;
  private model: string;
  private readonly maxTokens: number;

  constructor(options: AnthropicChatClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 1024;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { messages, tools } = request;
    const { systemPrompt, apiMessages } = this.toApiMessages(messages);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      ...(systemPrompt !== undefined ? { system: systemPrompt } : {}),
      messages: apiMessages,
      ...(tools !== undefined && tools.length > 0
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters as unknown as Anthropic.Tool.InputSchema,
            })),
          }
        : {}),
    });

    // Anthropic response.content 是 ContentBlock[] 判别联合；
    // tool_use 块表示模型决定调用工具。多个 tool_use = 一次返回多个并行调用。
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (toolUseBlocks.length > 0) {
      return {
        toolCalls: toolUseBlocks.map((b) => ({
          id: b.id,
          toolName: b.name,
          args: b.input as unknown,
        })),
      };
    }

    // 普通回复路径：取首个 text block
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return { content: textBlock?.text ?? '' };
  }

  async *stream(request: ChatRequest): AsyncGenerator<ChatChunk, void, undefined> {
    const { messages } = request;
    const { systemPrompt, apiMessages } = this.toApiMessages(messages);

    // MessageStream implements AsyncIterable<MessageStreamEvent>。
    // MessageStreamEvent 是判别联合（RawMessageStreamEvent）：
    //   - 'message_start' / 'content_block_start' / 'content_block_stop' /
    //     'message_delta' / 'message_stop' —— 框架/元信息事件，跳过
    //   - 'content_block_delta' —— 携带 delta: RawContentBlockDelta
    //       RawContentBlockDelta 也是判别联合：
    //         - TextDelta       (type: 'text_delta')        —— yield { content: event.delta.text }
    //         - InputJSONDelta  (type: 'input_json_delta')  —— 跳过（未来 tool_use）
    //         - CitationsDelta  (type: 'citations_delta')    —— 跳过
    //         - ThinkingDelta   (type: 'thinking_delta')     —— 跳过
    //         - SignatureDelta  (type: 'signature_delta')    —— 跳过
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      ...(systemPrompt !== undefined ? { system: systemPrompt } : {}),
      messages: apiMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { content: event.delta.text };
      }
    }
  }

  /**
   * 把内部 Message[] 适配成 Anthropic Messages API 的入参形态：
   *   - 'system' 消息提升到顶层 `system` 字段
   *   - 'user' 消息 → [{type:'text', text}] blocks
   *   - 'assistant' 消息 → text blocks + tool_use blocks（如有 toolCalls）
   *   - 'tool' 消息 → user role 下的 tool_result blocks
   *
   * chat() / stream() 共用这一份协议适配，避免工具路径与非工具路径
   * 各自维护一份转换规则。
   */
  private toApiMessages(messages: Message[]): {
    systemPrompt: string | undefined;
    apiMessages: Anthropic.MessageParam[];
  } {
    let systemPrompt: string | undefined;
    const apiMessages: Anthropic.MessageParam[] = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemPrompt = m.content;
        continue;
      }

      if (m.role === 'user') {
        apiMessages.push({
          role: 'user',
          content: [{ type: 'text' as const, text: m.content }],
        });
        continue;
      }

      if (m.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = [];
        if (m.content) {
          content.push({ type: 'text' as const, text: m.content });
        }
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            content.push({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.toolName,
              input: tc.args as Record<string, unknown>,
            });
          }
        }
        apiMessages.push({ role: 'assistant', content });
        continue;
      }

      // m.role === 'tool': Anthropic 把 tool 结果放在 user 消息的 tool_result block 里。
      apiMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: m.toolCallId ?? '',
            content: m.content,
          },
        ],
      });
    }

    return { systemPrompt, apiMessages };
  }

  setModel(model: string): void {
    this.model = model;
  }
}
