/**
 * libs/llm/observability/context-counter.ts
 *
 * countContextTokens — 调 Anthropic /messages/count_tokens API 获取精确输入 token 数。
 *
 * 设计原则 (Day 08):
 * - best-effort: 任何失败（未知 model / API 错误 / timeout / 用户 abort）返回 undefined，不 throw
 * - 复用 libs/llm/anthropic-chat-client.ts 的 toApiMessages 适配逻辑（system 提升顶层 + tool → tool_result）
 *   —— 但该方法是 private，把等价逻辑在这里重写（3 个 case: system / user / assistant + tool）
 * - 只支持 Anthropic model（OpenAI 无公开 count_tokens 接口，YAGNI 造轮子）
 *
 * 失败路径 (console.warn 不 throw):
 * - 未知 model → return undefined
 * - ANTHROPIC_API_KEY 未设 → catch network error → return undefined
 * - 用户 abort → signal 触发 → SDK 抛错 → catch → return undefined
 *
 * 不做的事 (YAGNI):
 * - 缓存（每次都调，简单优先 —— 缓存留给 Performance 阶段）
 * - 多模型 batch
 * - tools 计入（spec 写明 tool_calls 的 token 归 message tokens，不另计）
 */

import Anthropic from '@anthropic-ai/sdk';

import type { Message } from '../index.js';
import { getModelMeta } from './models.js';

export interface ContextCountResult {
  readonly tokens: number;
}

/**
 * 调 Anthropic count_tokens API 拿精确输入 token 数。
 * 失败 / 未知 model → 返回 undefined（best-effort，调用方必须能处理 undefined）。
 */
export async function countContextTokens(
  messages: ReadonlyArray<Message>,
  model: string,
  signal?: AbortSignal,
): Promise<ContextCountResult | undefined> {
  const meta = getModelMeta(model);
  if (meta === undefined) {
    // 未知 model：静默跳过，前端会降级为不显示 context
    return undefined;
  }

  if (!model.startsWith('claude-')) {
    // OpenAI 暂不实现
    return undefined;
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey === undefined || apiKey === '') {
      // 没有 API key 不应该 throw（测试环境可能没设）
      return undefined;
    }

    const client = new Anthropic({ apiKey });
    const { systemPrompt, apiMessages } = toApiMessages(messages);

    const response = await client.messages.countTokens(
      {
        model,
        ...(systemPrompt !== undefined ? { system: systemPrompt } : {}),
        messages: apiMessages,
      },
      signal !== undefined ? { signal } : {},
    );

    return { tokens: response.input_tokens };
  } catch (err) {
    // best-effort：失败不抛，warn 一下方便调试
    console.warn('[countContextTokens] failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

/**
 * 内部 Message → Anthropic API 形态的适配。
 * 与 libs/llm/anthropic-chat-client.ts 的 toApiMessages 等价，但无法跨文件复用 (private)。
 * 保持 3 个 case: system / user / assistant (+tool_calls) / tool。
 */
function toApiMessages(messages: ReadonlyArray<Message>): {
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
    // m.role === 'tool'
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
