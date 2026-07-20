/**
 * libs/llm/chat-client.ts
 *
 * ChatClient 抽象层的最小契约 —— libs/llm 的中心接口定义。
 *
 * 契约：
 *   chat(messages): 一次对话，传入历史，拿到 assistant 回复（string）。
 *   stream(messages): 流式对话，传入历史，逐 chunk yield 文本增量（AsyncIterable<string>）。
 *   setModel(model): 运行时切换模型（可选 set；如果不需要切换，可忽略）。
 *
 * Day 02 c851ad8 commit 时跟 OpenAI 实现共占 chat-client.ts。
 * Day 02 延展加 AnthropicChatClient 后，OpenAI 实现拆到 openai-chat-client.ts，
 * 本文件只保留契约 —— 每个 provider 一个对称文件的命名 pattern 由此立下。
 *
 * 设计取舍（对应 Day 02 Review 决策）：
 * - chat 返回 string 而非结构化 response：ChatClient 最克制的契约；
 *   usage / finish_reason / refusal 都不在基础范围里，需要时再升级。
 * - setModel 失败语义保持 void：模型无效由底层 SDK 抛 validation error，
 *   ChatClient 层不接管校验。
 *
 * Day 03 加 stream() —— additive 增强（不改 chat() 契约）：
 * - 返回 AsyncIterable<string>（不是 AsyncGenerator）= 接口层只承诺可被 for await 消费，
 *   不锁定实现策略。Provider 实现可以用 async function*（AsyncGenerator 是子类型）。
 * - chunk = 纯文本增量，不暴露 SDK 原始事件（Anthropic 事件流在 provider 内过滤）。
 * - 取消 / AbortSignal / 结构化事件 chunk 都不在 Day 03 范围，留 TODO。
 *
 * provider 实现目录：
 * - libs/llm/openai-chat-client.ts       —— OpenAI 兼容协议（含 stream）
 * - libs/llm/anthropic-chat-client.ts    —— Anthropic Messages API（含 stream + 事件过滤）
 * - 未来新 provider：libs/llm/<name>-chat-client.ts，implements ChatClient，
 *   复用 libs/llm/message.ts
 */

import type { Message } from './message.js';

export interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;
  setModel(model: string): void;
}
