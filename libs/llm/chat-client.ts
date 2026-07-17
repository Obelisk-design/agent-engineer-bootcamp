/**
 * libs/llm/chat-client.ts
 *
 * ChatClient 抽象层的最小契约 + 一个 OpenAI 兼容协议的实现。
 *
 * 契约：
 *   chat(messages): 一次对话，传入历史，拿到 assistant 回复（string）。
 *   setModel(model): 运行时切换模型（可选 set；如果不需要切换，可忽略）。
 *
 * 设计取舍（每条都对应 Day 02 的 Review 决策）：
 * - chat 返回 string 而非结构化 response：今天的最小契约；usage / finish_reason / refusal
 *   都不在 ChatClient 基础范围里，需要时再升级。
 * - setModel 失败语义保持 void：模型无效由底层 SDK 抛 validation error，ChatClient 层
 *   不接管校验（这一点就是今天的教学点 — 接口没说失败 ≠ 一定成功）。
 * - 构造函数对象传参：3 个配置项 + 1 个可选 future-proof，对象比位置参数更可扩展。
 * - 空 content 返回 ''：保留"原本是空"的信号给调用方，不静默吞掉。
 *
 * TODO（按 CLAUDE.md "Progressive Design — Leave TODO" 写在这里）：
 * - 单测覆盖（README 强制）：smoke + mock 调用，等 Day 03 一并做。
 * - **Day 03 第二个 provider — AnthropicChatClient**：
 *     同位置新建 libs/llm/anthropic-chat-client.ts，implements ChatClient，
 *     复用 libs/llm/message.ts。Anthropic 协议差异在实现里消化：
 *       - system message → 顶层 system 字段（不进 messages）
 *       - content string  → [{type:'text', text: ...}] content blocks
 *       - max_tokens 强制兜底
 *     装一个 @anthropic-ai/sdk 依赖。本课题 = 验证 ChatClient 接口在
 *     多 provider 下仍然稳定。
 * - streaming / tool_use / structured output：不在前期范围。
 */

import OpenAI from 'openai';

import type { Message } from './message.js';

export interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  setModel(model: string): void;
}

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
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
    });
    // OpenAI SDK 的返回类型对 strict + noUncheckedIndexedAccess 比较宽；
    // 这里用 ?? 把"原本是空"显式暴露给调用方。
    return completion.choices[0]?.message?.content ?? '';
  }

  setModel(model: string): void {
    this.model = model;
  }
}
