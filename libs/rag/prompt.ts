/**
 * libs/rag/prompt.ts
 *
 * 三段式 RAG prompt：
 *   Context:
 *     [source: <path>]
 *     <chunk text>
 *     ...
 *   Question: <query>
 *   Answer in 2-3 sentences using only the context above. Cite source filenames.
 *
 * 设计要点（决策 C）：
 * - source 标注放在每段 chunk 前 —— 模型回答时能直接说"根据 day12.md"
 * - 末尾"using only the context"约束 —— 防模型胡编（prompt 层面立 flag，不依赖 tool 层）
 * - 字符 cap 8000 —— 防 5 个 2000 字符 chunk 把 token 打爆；超出截到前 k 个
 *
 * 不做：
 * - 不做 multi-turn history（Day 13 不接 agent loop，单轮 prompt）
 * - 不做 system prompt 分离（用 user message 包整段，避免 system vs user 角色不一致）
 * - 不做 token-level 截断（按字符近似；embed 输出固定 4096 维，text 不超 8k 字符约对应 2k token）
 */

import type { SearchHit } from './store.js';

const MAX_PROMPT_CHARS = 8_000;

export function buildRagPrompt(query: string, hits: readonly SearchHit[]): string {
  const ctx = hits.map((h) => `[source: ${h.record.source}]\n${h.record.text}`).join('\n\n');

  let prompt = `Context:\n${ctx}\n\nQuestion: ${query}\n\nAnswer in 2-3 sentences using only the context above. Cite source filenames.`;

  if (prompt.length > MAX_PROMPT_CHARS) {
    // 截断 hits —— 保留前 k 个直到装下
    let kept = 0;
    for (let i = 0; i < hits.length; i++) {
      const trial = buildRagPrompt(query, hits.slice(0, i + 1));
      if (trial.length > MAX_PROMPT_CHARS) break;
      kept = i + 1;
      prompt = trial;
    }
    if (kept === 0) {
      throw new RangeError(
        `buildRagPrompt: first chunk alone exceeds MAX_PROMPT_CHARS=${MAX_PROMPT_CHARS}`,
      );
    }
    if (kept < hits.length) {
      prompt += `\n\n[Note: ${hits.length - kept} later chunks omitted due to prompt length cap.]`;
    }
  }
  return prompt;
}
