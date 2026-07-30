/**
 * apps/web/src/lib/sessionUsage.ts
 *
 * Day 09+ :session 跨 turn 累计 token 累加器。
 *
 * 为什么要抽出来：
 * - response 事件 → 累加 in/out
 * - run_summary 事件 → 更新 peak (Math.max)
 * - 两处逻辑组合,inline 在 App.vue 难测
 * - 抽成 pure function 后,可单测
 *
 * 累加规则（Q2/Q3 决策）：
 * - in/out: sum (每个 LLM 调用的 usage.promptTokens / completionTokens 累加)
 * - peak: Math.max(本 turn peak, 之前 session peak) —— "session 内任意一次调用的最大 prompt tokens"
 *
 * 不做（YAGNI）：
 * - 不持久化到 localStorage —— 跟 conversation 一样,刷页面清
 * - 不暴露 reset 函数 —— 刷页面自然清
 */

export interface SessionUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly peakPromptTokens: number;
}

export const emptySessionUsage: SessionUsage = {
  promptTokens: 0,
  completionTokens: 0,
  peakPromptTokens: 0,
};

/**
 * 处理一次 response 事件 → 返回新的 SessionUsage。
 *
 * 输入：当前 sessionUsage + 本次 LLM 调用的 usage。
 * 输出：新 sessionUsage（in/out 累加，peak 不变 —— peak 由 run_summary 事件更新）。
 */
export function accumulateFromResponse(
  prev: SessionUsage,
  usage: { promptTokens: number; completionTokens: number } | undefined,
): SessionUsage {
  if (usage === undefined) return prev;
  return {
    promptTokens: prev.promptTokens + usage.promptTokens,
    completionTokens: prev.completionTokens + usage.completionTokens,
    peakPromptTokens: prev.peakPromptTokens,
  };
}

/**
 * 处理一次 run_summary 事件 → 返回新的 SessionUsage。
 *
 * 跨 turn 取 Math.max：本 turn peak 大就更新，小就保持。
 */
export function accumulateFromRunSummary(
  prev: SessionUsage,
  thisTurnPeakPromptTokens: number,
): SessionUsage {
  return {
    ...prev,
    peakPromptTokens: Math.max(prev.peakPromptTokens, thisTurnPeakPromptTokens),
  };
}
