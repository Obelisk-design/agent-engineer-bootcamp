/**
 * libs/llm/observability/models.ts
 *
 * Model registry — single source of truth for known LLM models.
 *
 * 用途 (Day 08): context-counter 拿到 model 后查这里，决定：
 *   1. 是否调用 Anthropic count_tokens API（仅 model 存在于 MODELS 时）
 *   2. context 上限是多少（contextLimit）—— 渲染 HeaderPill 进度条要用
 *
 * 不做的事 (YAGNI):
 * - 价格 / token 计价（Day 08 砍掉）
 * - capability 检测（vision / tool use / streaming）—— ChatClient 接口本身已抽象
 * - 100+ model 列表穷举 —— 只覆盖 bootcamp 用到的 6 个
 *
 * 何时扩 model：新增 provider / bootcamp 换模型时手动加。不要自动探测 —— 维护成本不值。
 */

export interface ModelMeta {
  readonly contextLimit: number;
}

export const MODELS: Readonly<Record<string, ModelMeta>> = {
  'claude-opus-5': { contextLimit: 1_000_000 },
  'claude-sonnet-5': { contextLimit: 1_000_000 },
  'claude-haiku-4-5': { contextLimit: 200_000 },
  'gpt-4o': { contextLimit: 128_000 },
  'gpt-4o-mini': { contextLimit: 128_000 },
  'gpt-4-turbo': { contextLimit: 128_000 },
};

export function getModelMeta(model: string): ModelMeta | undefined {
  return MODELS[model];
}
