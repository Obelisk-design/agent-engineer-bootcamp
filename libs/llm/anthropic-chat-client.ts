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
 * 注意：调用方应通过环境变量提供 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL /
 * ANTHROPIC_MODEL，永远不要硬编码到任何源文件。
 */

import Anthropic from '@anthropic-ai/sdk';

import type { Message } from './message.js';
import type { ChatClient } from './chat-client.js';

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
    // (1) system 从 messages 抽到顶层字段
    let systemPrompt: string | undefined;
    const convoMessages = messages.flatMap((m) => {
      if (m.role === 'system') {
        systemPrompt = m.content;
        return [];
      }
      return [m];
    });

    // (2) content string → [{type:'text', text}] blocks
    const apiMessages = convoMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: [{ type: 'text' as const, text: m.content }],
    }));

    // (3) 调 Messages API
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

  setModel(model: string): void {
    this.model = model;
  }
}
