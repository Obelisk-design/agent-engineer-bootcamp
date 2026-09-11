/**
 * libs/eval/judge-llm.ts
 *
 * Day 22 — LLM Judge（spec §4.1）。
 *
 * 给 query / 候选答案 / 期望答案 → 让 LLM 给 0-1 二值 + reasoning。
 *
 * 阈值：spec 默认 0.5（老大拍板）
 *
 * 为什么用 0-1 二值：
 *   - 老大拍板（spec §2 决策 5 后默认方案）
 *   - 简单可解释；reasoning 给调试用
 *
 * 不做：
 *   - 不实现模型 prompt 工程（Day 41+ 话题；今天最小 prompt：直接问"对不对"）
 *   - 不做 multi-judge ensemble（Day 41+ 话题）
 */

import { z } from 'zod';

const JudgeResponseSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});
export type JudgeVerdict = z.infer<typeof JudgeResponseSchema>;

const JUDGE_PROMPT = `你是一名严格的答案评分员。给定 query、候选答案、期望答案，判断候选答案是否"实质命中"期望答案的核心事实。
判定为 1（命中）或 0（不命中）。
如果候选答案包含期望答案的所有关键事实（容许同义改写），输出 1。
如果候选答案缺失某个关键事实，或引入与期望答案矛盾的陈述，输出 0。
输出 JSON: {"score": 0 或 1, "reasoning": "一句话说明"}。
不要输出其他内容。`;

export interface JudgeOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

export async function judgeLLM(
  query: string,
  answer: string,
  expectedAnswer: string,
  opts: JudgeOptions,
): Promise<JudgeVerdict> {
  const model = opts.model ?? process.env.MODEL_NAME ?? 'ai-coding';
  const baseUrl = opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? '';
  if (!opts.apiKey) throw new Error('judgeLLM: apiKey required');
  if (!baseUrl) throw new Error('judgeLLM: baseUrl required');

  const messages = [
    { role: 'system' as const, content: JUDGE_PROMPT },
    {
      role: 'user' as const,
      content: `query: ${query}\n\n候选答案: ${answer.slice(0, 1500)}\n\n期望答案: ${expectedAnswer}`,
    },
  ];

  // 与 libs/llm/chat.ts 协议对齐（OpenAI-compatible）
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) {
    throw new Error(`judgeLLM: HTTP ${resp.status} ${await resp.text()}`);
  }
  const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('judgeLLM: empty response');

  // zod 校验 + 容错
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { score: 0, reasoning: `JSON parse failed: ${content.slice(0, 200)}` };
  }
  const result = JudgeResponseSchema.safeParse(parsed);
  if (!result.success) {
    return { score: 0, reasoning: `schema invalid: ${result.error.message.slice(0, 200)}` };
  }
  return result.data;
}

/** judge 回调包装器（run-retrieval-eval 用） */
export function makeJudgeCallback(opts: JudgeOptions) {
  return async (
    query: string,
    answer: string,
    expectedAnswer: string,
    _apiKey: string,
    _baseUrl: string,
    _model: string,
  ): Promise<{ score: number; failed: boolean }> => {
    try {
      const v = await judgeLLM(query, answer, expectedAnswer, opts);
      return { score: v.score, failed: false };
    } catch {
      return { score: 0, failed: true };
    }
  };
}
