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
 * 业务方代码（`client.chat([...])`）与 OpenAIChatClient 完全一致 —— 这是
 * ChatClient 抽象层的核心价值兑现。
 *
 * Day 02 commit c851ad8 (OpenAI provider) 落地时已经在头注释里写了 Day 03
 * 的 AnthropicChatClient 设计路径。这份文件 = 把那条 TODO 实装起来。
 *
 * Day 03 加 stream() —— Anthropic SDK 的特殊形态：
 *   client.messages.stream() 返回 MessageStream（implements AsyncIterable<MessageStreamEvent>）。
 *   事件是判别联合，包括 message_start / content_block_start /
 *   content_block_delta / content_block_stop / message_delta / message_stop。
 *
 *   ChatClient.stream() 契约要求只 yield 文本增量（string），所以本文件内部：
 *   - 只在 event.type === 'content_block_delta' && event.delta.type === 'text_delta'
 *     时 yield event.delta.text
 *   - 其它所有事件类型全部跳过（调用方看不到协议细节）
 *
 * Day 04 加 chatWithTools() —— additive 工具调用扩展：
 *   - 通过 Anthropic SDK tools 参数发起非流式工具调用
 *   - 解析 ContentBlock[]，过滤 tool_use 块映射到 ChatResponse.tool_calls
 *   - 无 tool_use 时取首个 text 块 yield ChatResponse.content
 *
 * 注意：调用方应通过环境变量提供 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL /
 * ANTHROPIC_MODEL，永远不要硬编码到任何源文件。
 */

import Anthropic from '@anthropic-ai/sdk';

import type { Message } from './message.js';
import type { ChatClient } from './chat-client.js';
import type { ChatResponse, ToolDefinition } from './tool-call.js';

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

  async chat(messages: Message[]): Promise<string> {
    const { systemPrompt, apiMessages } = this.toApiMessages(messages);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      ...(systemPrompt !== undefined ? { system: systemPrompt } : {}),
      messages: apiMessages,
    });

    // 提取首个 text block 的 text（response.content 是 ContentBlock[]）
    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return '';
  }

  async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
    const { systemPrompt, apiMessages } = this.toApiMessages(messages);

    // MessageStream implements AsyncIterable<MessageStreamEvent>。
    // MessageStreamEvent 是判别联合（RawMessageStreamEvent）：
    //   - 'message_start' / 'content_block_start' / 'content_block_stop' /
    //     'message_delta' / 'message_stop' —— 框架/元信息事件，跳过
    //   - 'content_block_delta' —— 携带 delta: RawContentBlockDelta
    //       RawContentBlockDelta 也是判别联合：
    //         - TextDelta       (type: 'text_delta')        —— yield event.delta.text
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
        yield event.delta.text;
      }
    }
  }

  async chatWithTools(
    messages: Message[],
    tools: ReadonlyArray<ToolDefinition>,
  ): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: messages as unknown as Anthropic.MessageParam[],
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as unknown as Anthropic.Tool.InputSchema,
      })),
    });

    // Anthropic response.content 是 ContentBlock[] 判别联合；
    // tool_use 块表示模型决定调用工具。多个 tool_use = 一次返回多个并行调用。
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (toolUseBlocks.length > 0) {
      return {
        kind: 'tool_calls',
        toolCalls: toolUseBlocks.map((b) => ({
          id: b.id,
          toolName: b.name,
          args: b.input as unknown,
        })),
      };
    }

    // 最终答复路径：取首个 text block（与 chat() 行为一致）。
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return { kind: 'content', content: textBlock?.text ?? '' };
  }

  /**
   * 把内部 Message[] 适配成 Anthropic Messages API 的入参形态：
   *   - 'system' 消息提升到顶层 `system` 字段
   *   - string content → [{type:'text', text}] blocks
   *
   * chat() 与 stream() 共用这一份协议适配，避免 Day 03 streaming 时暴露的
   * "system 顶层化 / content blocks 转换" 重复代码。
   *
   * 注意：本 helper 仅服务 chat() / stream() 的非工具路径。
   * chatWithTools() 不走这里 —— 工具路径需要保留 tool_use / tool_result blocks
   * 在 messages 里（SDK 内置工具结果路由），所以直接 cast Message[] 到 SDK 入参。
   */
  private toApiMessages(messages: Message[]): {
    systemPrompt: string | undefined;
    apiMessages: Array<{
      role: 'user' | 'assistant';
      content: Array<{ type: 'text'; text: string }>;
    }>;
  } {
    let systemPrompt: string | undefined;
    const convoMessages = messages.flatMap((m) => {
      if (m.role === 'system') {
        systemPrompt = m.content;
        return [];
      }
      return [m];
    });

    const apiMessages = convoMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: [{ type: 'text' as const, text: m.content }],
    }));

    return { systemPrompt, apiMessages };
  }

  setModel(model: string): void {
    this.model = model;
  }
}
