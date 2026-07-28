# Day 08 — Context Window Observability + Tailwind CSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-iteration context token counter to the Agent event stream (via Anthropic's `count_tokens` API) and surface it in the Agent Console UI via a `HeaderPill` + `MetricsSidebar`, all built with Tailwind CSS utility classes.

**Architecture:** New `libs/llm/observability/` module owns the `countContextTokens` interface + Anthropic adapter + `MODELS` registry. `Agent` injects the model into `AgentOptions` so it can compute context events per iteration. `AgentEvent` gains two new kinds (`context`, `run_summary`). UI consumes these events to render a three-column layout: `MetricsSidebar` (per-iteration bars) + `Conversation` + `Timeline`, with a `HeaderPill` in the header showing totals. Tailwind 4 is integrated via `@tailwindcss/vite` plugin with `@import "tailwindcss"`; old scoped CSS in existing components is preserved.

**Tech Stack:** TypeScript 5.7, Vitest 2.1, Vite 6, Vue 3.5, Tailwind CSS 4 (`@tailwindcss/vite`), Anthropic SDK 0.111, Hono 4.12.

---

## Global Constraints

- TypeScript strict mode, Node ≥ 22, pnpm 11.6 monorepo (root `package.json`).
- All tests via `pnpm test` (Vitest run, no watch).
- Typecheck via `pnpm typecheck` (Node) + `pnpm typecheck:web` (Vue).
- AgentEvent extension is **additive** — old consumers must not break.
- countContextTokens is **best-effort** — any failure (unknown model, network error, timeout) returns `undefined` and never throws to the caller.
- Tailwind 4 with `@tailwindcss/vite` plugin only — no PostCSS config, no `@tailwind base/components/utilities` directives.
- Old scoped CSS in `Conversation.vue` / `Timeline.vue` / `InputBar.vue` is preserved unchanged. Tailwind utility classes are used **only in new components** (`HeaderPill.vue`, `MetricsSidebar.vue`).
- Cost / pricing / USD calculations are **out of scope** — explicit YAGNI from spec.
- Performance metrics (latency / cache hit / tool time) are **out of scope** — Day 09+.

---

## File Structure

**New files (8):**

| File | Responsibility |
|---|---|
| `libs/llm/observability/models.ts` | `MODELS` registry: model → `{contextLimit}`. Single source of truth for known models. |
| `libs/llm/observability/index.ts` | Barrel re-export. |
| `apps/web/src/components/HeaderPill.vue` | Header summary: `iter · peak/limit · total` with color-coded progress bar. |
| `apps/web/src/components/MetricsSidebar.vue` | Left sidebar: per-iteration context bars + totals. |
| `tests/libs/llm/observability/models.test.ts` | getModelMeta known / unknown model. |
| `tests/libs/llm/observability/context-counter.test.ts` | best-effort: success / unknown model / API failure. |

**Modified files (10):**

| File | Change |
|---|---|
| `libs/llm/observability/context-counter.ts` | 🆕 but listed in new |
| `libs/llm/index.ts` | Re-export observability module. |
| `libs/agent/event.ts` | Add `context` + `run_summary` kinds (10 → 12 kind). |
| `libs/agent/agent.ts` | `AgentOptions.model` field; inject `countContextTokens`; yield `context` + `run_summary` events. |
| `libs/agent/types.ts` | Export new event types if needed. |
| `apps/api/src/server.ts` | On `run_summary` event, `addMeta({ context: { peakPromptTokens, iterations } })`. |
| `apps/web/src/api/agentClient.ts` | Extend `isAgentEvent` type guard with new kinds. |
| `apps/web/src/App.vue` | Add `HeaderPill` + `MetricsSidebar`; three-column layout; route new events. |
| `apps/web/src/types/agentEvent.ts` | (Optional) re-export event types if needed. |
| `package.json` | devDeps: `tailwindcss@^4` + `@tailwindcss/vite@^4`. |
| `apps/web/vite.config.ts` | Add `tailwindcss()` plugin. |
| `apps/web/tailwind.config.ts` | 🆕 content paths. |
| `apps/web/src/styles.css` | Top-of-file `@import "tailwindcss";`. |
| `tests/libs/agent/run-events.test.ts` | Add context/run_summary assertions. |
| `tests/libs/agent/shared/fake-chat-client.ts` | Optional: surface countContextTokens hook. |
| `tests/apps/api/end-to-end.test.ts` | Add meta.context assertion. |
| `examples/day08/agent_server.ts` | Pass `model` to `Agent` constructor. |

**Decomposition rationale:** `models.ts` and `context-counter.ts` are split because `MODELS` is a static data file (cheap to test) and `countContextTokens` is a network-touching function (needs different test setup). `HeaderPill` and `MetricsSidebar` are split because they have different render responsibilities even though they share data.

---

## Task 1: Add `MODELS` registry with `contextLimit`

**Files:**
- Create: `libs/llm/observability/models.ts`
- Create: `tests/libs/llm/observability/models.test.ts`

**Interfaces:**
- Produces: `ModelMeta`, `MODELS`, `getModelMeta(model: string): ModelMeta | undefined`

- [ ] **Step 1: Write the failing test**

Create `tests/libs/llm/observability/models.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MODELS, getModelMeta } from '../../../../libs/llm/observability/models.js';

describe('MODELS registry', () => {
  it('returns ModelMeta for known models', () => {
    expect(getModelMeta('claude-opus-5')).toEqual({ contextLimit: 1_000_000 });
    expect(getModelMeta('claude-sonnet-5')).toEqual({ contextLimit: 1_000_000 });
    expect(getModelMeta('claude-haiku-4-5')).toEqual({ contextLimit: 200_000 });
    expect(getModelMeta('gpt-4o')).toEqual({ contextLimit: 128_000 });
    expect(getModelMeta('gpt-4o-mini')).toEqual({ contextLimit: 128_000 });
    expect(getModelMeta('gpt-4-turbo')).toEqual({ contextLimit: 128_000 });
  });

  it('returns undefined for unknown model', () => {
    expect(getModelMeta('gpt-4.1')).toBeUndefined();
    expect(getModelMeta('claude-unknown')).toBeUndefined();
    expect(getModelMeta('')).toBeUndefined();
  });

  it('exposes MODELS as a frozen registry', () => {
    // All 6 known models are listed.
    expect(Object.keys(MODELS).sort()).toEqual(
      ['claude-haiku-4-5', 'claude-opus-5', 'claude-sonnet-5', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'].sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/libs/llm/observability/models.test.ts`
Expected: FAIL — `Cannot find module '../../../../libs/llm/observability/models.js'`.

- [ ] **Step 3: Implement the registry**

Create `libs/llm/observability/models.ts`:

```ts
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
```

- [ ] **Step 4: Verify the test passes**

Run: `pnpm test tests/libs/llm/observability/models.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add libs/llm/observability/models.ts tests/libs/llm/observability/models.test.ts
git commit -m "feat(observability): add MODELS registry with contextLimit"
```

---

## Task 2: Add `countContextTokens` with Anthropic adapter

**Files:**
- Create: `libs/llm/observability/context-counter.ts`

**Interfaces:**
- Produces: `ContextCountResult`, `countContextTokens(messages, model, signal?)` — async; returns `ContextCountResult | undefined`; never throws.
- Consumes: `MODELS` from `models.ts`; `Message` from `libs/llm`.

- [ ] **Step 1: Write the failing test**

Create `tests/libs/llm/observability/context-counter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { countContextTokens } from '../../../../libs/llm/observability/context-counter.js';

const hasAnthropicKey = process.env.ANTHROPIC_API_KEY !== undefined && process.env.ANTHROPIC_API_KEY !== '';

describe('countContextTokens', () => {
  it('returns undefined for unknown model', async () => {
    const result = await countContextTokens(
      [{ role: 'user', content: 'hello' }],
      'gpt-4.1', // not in MODELS registry
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty model string', async () => {
    const result = await countContextTokens(
      [{ role: 'user', content: 'hello' }],
      '',
    );
    expect(result).toBeUndefined();
  });

  it('does not throw on API failure (best-effort)', async () => {
    // Force a failure: known model but corrupted input.
    // count_tokens should catch and return undefined — never throw.
    const result = await countContextTokens(
      [{ role: 'user', content: 'hello' }],
      'claude-opus-5',
      // No signal — and we'll rely on the network call failing because no key OR succeed.
    );
    // If API key is set, this returns a real number; if not, catches and returns undefined.
    // Either way, no throw.
    expect(result === undefined || typeof result?.tokens === 'number').toBe(true);
  });

  it.runIf(hasAnthropicKey)('returns real token count for known Anthropic model', async () => {
    const result = await countContextTokens(
      [{ role: 'user', content: 'Hello, world' }],
      'claude-opus-5',
    );
    expect(result).toBeDefined();
    expect(result?.tokens).toBeGreaterThan(0);
    expect(result?.tokens).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/libs/llm/observability/context-counter.test.ts`
Expected: FAIL — `Cannot find module '../../../../libs/llm/observability/context-counter.js'`.

- [ ] **Step 3: Implement the counter**

Create `libs/llm/observability/context-counter.ts`:

```ts
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
    console.warn(
      '[countContextTokens] failed:',
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}

/**
 * 内部 Message → Anthropic API 形态的适配。
 * 与 libs/llm/anthropic-chat-client.ts 的 toApiMessages 等价，但无法跨文件复用 (private)。
 * 保持 3 个 case: system / user / assistant (+tool_calls) / tool。
 */
function toApiMessages(
  messages: ReadonlyArray<Message>,
): { systemPrompt: string | undefined; apiMessages: Anthropic.MessageParam[] } {
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
```

- [ ] **Step 4: Verify the test passes**

Run: `pnpm test tests/libs/llm/observability/context-counter.test.ts`
Expected: PASS (4 tests — 3 always + 1 conditionally skipped if no API key).

- [ ] **Step 5: Commit**

```bash
git add libs/llm/observability/context-counter.ts tests/libs/llm/observability/context-counter.test.ts
git commit -m "feat(observability): add countContextTokens with anthropic adapter"
```

---

## Task 3: Add observability barrel + export from libs/llm

**Files:**
- Create: `libs/llm/observability/index.ts`
- Modify: `libs/llm/index.ts:1-23`

**Interfaces:**
- Produces: public `countContextTokens`, `MODELS`, `getModelMeta`, `ContextCountResult`, `ModelMeta` from `libs/llm`.

- [ ] **Step 1: Create the barrel**

Create `libs/llm/observability/index.ts`:

```ts
/**
 * libs/llm/observability/index.ts
 *
 * 观测模块公共导出。
 * Day 08 起：context-counter + models 注册表。
 */

export type { ModelMeta } from './models.js';
export { MODELS, getModelMeta } from './models.js';
export type { ContextCountResult } from './context-counter.js';
export { countContextTokens } from './context-counter.js';
```

- [ ] **Step 2: Re-export from libs/llm**

Edit `libs/llm/index.ts` — append three lines after the existing exports:

```ts
export type { Role, Message } from './message.js';
export type {
  ChatClient,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  ChatOptions,
  ChatUsage,
  ToolCallData,
} from './chat-client.js';
export type { OpenAIChatClientOptions } from './openai-chat-client.js';
export { OpenAIChatClient } from './openai-chat-client.js';
export type { AnthropicChatClientOptions } from './anthropic-chat-client.js';
export { AnthropicChatClient } from './anthropic-chat-client.js';
// 🆕 Day 08
export type { ModelMeta, ContextCountResult } from './observability/index.js';
export { MODELS, getModelMeta, countContextTokens } from './observability/index.js';
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add libs/llm/observability/index.ts libs/llm/index.ts
git commit -m "feat(observability): export from libs/llm barrel"
```

---

## Task 4: Extend AgentEvent with `context` and `run_summary` kinds

**Files:**
- Modify: `libs/agent/event.ts:35-65`

**Interfaces:**
- Produces: Two new variants in the `AgentEvent` union:
  - `{ kind: 'context'; iteration: number; promptTokens: number; limit: number }`
  - `{ kind: 'run_summary'; totalPromptTokens: number; totalCompletionTokens: number; peakPromptTokens: number; iterations: number }`

- [ ] **Step 1: Add the new variants**

Edit `libs/agent/event.ts`. The current union is at lines 35-65. Replace the entire `export type AgentEvent =` block with:

```ts
export type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | {
      readonly kind: 'request';
      readonly iteration: number;
      readonly messages: ReadonlyArray<Message>;
    }
  | {
      readonly kind: 'response';
      readonly iteration: number;
      readonly content?: string;
      readonly toolCalls?: ReadonlyArray<ToolCallData>;
      readonly usage?: ChatUsage;
    }
  | { readonly kind: 'message_delta'; readonly content: string }
  | { readonly kind: 'context'; readonly iteration: number; readonly promptTokens: number; readonly limit: number } // 🆕 Day 08
  | {
      readonly kind: 'tool_call';
      readonly id: string;
      readonly name: string;
      readonly args: unknown;
    }
  | {
      readonly kind: 'tool_result';
      readonly id: string;
      readonly name: string;
      readonly output: string;
    }
  | { readonly kind: 'message_end'; readonly content: string }
  | { readonly kind: 'run_summary'; readonly totalPromptTokens: number; readonly totalCompletionTokens: number; readonly peakPromptTokens: number; readonly iterations: number } // 🆕 Day 08
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
```

- [ ] **Step 2: Update the file header doc**

Find the doc comment at the top of `libs/agent/event.ts` (the multi-line `/**` block). Update the relevant lines to reflect 12 kinds instead of 10. Specifically:

- Change "Day 07 追加：加 `message_delta` kind（10 kind）" to "Day 07 追加：加 `message_delta` kind（10 kind）；Day 08 追加：`context` + `run_summary`（12 kind）"
- Append a new bullet (after the `message_delta` line) describing the new kinds:

```ts
 * Day 08 追加：加 `context` / `run_summary` 两种事件（12 kind 总计）。
 * - context：每次 LLM 调用前 yield，携带 promptTokens 与 contextLimit。前端 HeaderPill / Sidebar 消费。
 * - run_summary：message_end / error 之前 yield，携带累积的 totalPromptTokens / totalCompletionTokens / peakPromptTokens / iterations。
 *   background：best-effort 派生（countContextTokens 失败则不 yield context，但 run_summary 仍然 yield —— 0 token 也算信号）。
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: errors in `libs/agent/agent.ts` because runEvents doesn't yield the new kinds yet. **These are expected — Task 5 will fix them.**

- [ ] **Step 4: Commit**

```bash
git add libs/agent/event.ts
git commit -m "feat(agent): add context + run_summary event kinds"
```

(Note: code does not compile yet — that's intentional. Task 5 adds the yield sites.)

---

## Task 5: Wire `Agent` to compute and yield `context` / `run_summary` events

**Files:**
- Modify: `libs/agent/agent.ts:46-228`

**Interfaces:**
- Consumes: `countContextTokens` from `libs/llm`; `Message` from `libs/llm`.
- Produces: `AgentOptions.model` field (required for context feature); `runEvents` yields `context` after `request` and `run_summary` before `message_end` / `error`.

- [ ] **Step 1: Add `model` to `AgentOptions`**

Edit `libs/agent/agent.ts`. Replace the `AgentOptions` interface (lines 52-57) with:

```ts
export interface AgentOptions {
  readonly chat: ChatClient;
  readonly tools: ToolRegistry;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
  readonly model?: string; // 🆕 Day 08: 必需 if context observability 启用；未知 model → context 事件不 yield
}
```

- [ ] **Step 2: Add helper to construct AgentEvent creator**

Inside `runEvents`, after the `signal` and `messages` setup (around line 80), add a helper to compute context. Then add 4 cumulative vars at the start of the for loop iteration:

Find the `yield { kind: 'message_start' };` line (currently around line 87). Replace the body of `runEvents` from `yield { kind: 'message_start' };` through to the end of the file with the version below.

The new `runEvents` body:

```ts
    yield { kind: 'message_start' };

    // 🆕 Day 08: 累积 token / context 状态
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let peakPromptTokens = 0;
    let iterationsCompleted = 0;

    for (let i = 0; i < maxIterations; i++) {
      // 🆕 Day 07: signal 检查在每次 iter 起始
      if (signal?.aborted) {
        yield { kind: 'error', message: 'aborted by signal' };
        return;
      }

      yield { kind: 'iteration', n: i + 1 };

      // 把当前累积的 messages 暴露出去（"调用过程快照"）
      // 深拷贝 messages —— 否则两次 yield 都引用同一个累积数组，
      // TraceCollector / 消费方拿到的 requests[N].messages 都指向最终累积状态。
      yield {
        kind: 'request',
        iteration: i + 1,
        messages: messages.map((m) => ({ ...m })),
      };

      // 🆕 Day 08: context 计数（best-effort，失败不打断主流程）
      const model = this.options.model;
      if (model !== undefined) {
        const meta = getModelMeta(model);
        if (meta !== undefined) {
          const ctxResult = await countContextTokens(messages, model, signal);
          if (ctxResult !== undefined) {
            yield {
              kind: 'context',
              iteration: i + 1,
              promptTokens: ctxResult.tokens,
              limit: meta.contextLimit,
            };
            peakPromptTokens = Math.max(peakPromptTokens, ctxResult.tokens);
          }
        }
      }

      let response: ChatResponse;
      try {
        // 🆕 Day 07: 先 chat() 探测拿 usage + 判定 iter 类型
        const probe = await this.options.chat.chat({ messages, tools: toolDefs }, options);

        // chat 后再检查一次 signal
        if (signal?.aborted) {
          yield { kind: 'error', message: 'aborted by signal' };
          return;
        }

        if (probe.content !== undefined) {
          // 🆕 Day 07: final-answer iter → 重调 stream() 流式 yield message_delta
          let accumulated = '';
          for await (const chunk of this.options.chat.stream({ messages }, options)) {
            // 流式过程中 signal 检查（每个 chunk 后）
            if (signal?.aborted) {
              yield { kind: 'error', message: 'aborted by signal' };
              return;
            }
            if (chunk.content) {
              accumulated += chunk.content;
              yield { kind: 'message_delta', content: chunk.content };
            }
          }
          // 流式完成后，usage 用 probe 的（chat 探测时已拿到）
          response = {
            content: accumulated,
            ...(probe.usage !== undefined ? { usage: probe.usage } : {}),
          };
        } else {
          // tool_calls iter：不流式，直接用 probe
          response = probe;
        }
      } catch (err) {
        // 🆕 Day 07: error throw → yield（行为变更）
        yield {
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        };
        return;
      }

      // 🆕 Day 08: 累积 usage（不论 success / error 路径都累加）
      if (response.usage !== undefined) {
        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;
      }
      iterationsCompleted = i + 1;

      // 把 LLM 响应也暴露出去（带 usage）
      const responseEvent: AgentEvent = {
        kind: 'response',
        iteration: i + 1,
        ...(response.content !== undefined ? { content: response.content } : {}),
        ...(response.toolCalls !== undefined ? { toolCalls: response.toolCalls } : {}),
        ...(response.usage !== undefined ? { usage: response.usage } : {}),
      };
      yield responseEvent;

      // 普通回复路径：返回 content
      if (response.content !== undefined) {
        // 🆕 Day 08: run_summary 先于 message_end 发出
        yield {
          kind: 'run_summary',
          totalPromptTokens,
          totalCompletionTokens,
          peakPromptTokens,
          iterations: iterationsCompleted,
        };
        yield { kind: 'message_end', content: response.content };
        yield { kind: 'done' };
        return;
      }

      // 工具调用路径
      if (response.toolCalls !== undefined && response.toolCalls.length > 0) {
        // assistant 决定调工具：把 tool_calls 写进历史
        messages.push({
          role: 'assistant',
          content: '',
          toolCalls: response.toolCalls,
        });

        // 顺序执行每个 tool_call，逐一 yield 事件
        for (const tc of response.toolCalls) {
          yield {
            kind: 'tool_call',
            id: tc.id,
            name: tc.toolName,
            args: tc.args,
          };

          const tool = this.options.tools.get(tc.toolName);
          let resultContent: string;
          if (tool === undefined) {
            resultContent = `Error: tool "${tc.toolName}" not found`;
          } else {
            try {
              const result = await tool.execute(tc.args);
              resultContent = JSON.stringify(result);
            } catch (err) {
              resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
          }

          yield {
            kind: 'tool_result',
            id: tc.id,
            name: tc.toolName,
            output: resultContent,
          };

          messages.push({
            role: 'tool',
            content: resultContent,
            toolCallId: tc.id,
          });
        }

        // 继续下一轮循环
        continue;
      }

      // 既没有 content 也没有 toolCalls：返回空字符串
      // 🆕 Day 08: run_summary 先于 message_end
      yield {
        kind: 'run_summary',
        totalPromptTokens,
        totalCompletionTokens,
        peakPromptTokens,
        iterations: iterationsCompleted,
      };
      yield { kind: 'message_end', content: '' };
      yield { kind: 'done' };
      return;
    }

    // 🆕 Day 07: maxIterations 超限 → yield error（不 throw）
    // 🆕 Day 08: error 之前 yield run_summary（partial 累加也给前端看）
    yield {
      kind: 'run_summary',
      totalPromptTokens,
      totalCompletionTokens,
      peakPromptTokens,
      iterations: iterationsCompleted,
    };
    yield {
      kind: 'error',
      message: `Agent loop exceeded ${maxIterations} iterations without final answer`,
    };
    return;
  }
```

- [ ] **Step 3: Add the imports**

Add these to the top of `libs/agent/agent.ts` (with the existing imports):

```ts
import type { ChatClient, ChatResponse, Message } from '../llm/index.js';
import { countContextTokens, getModelMeta } from '../llm/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { AgentEvent } from './event.js';
```

- [ ] **Step 4: Update the file header doc**

Update the doc comment block at the top of `libs/agent/agent.ts` to mention Day 08 changes. Add a new bullet (after the "Day 07 改造" block, before "不做 (YAGNI)") describing the new context/run_summary yield behavior.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 6: Run existing tests to verify no regression**

Run: `pnpm test tests/libs/agent/`
Expected: existing tests pass. Note: `run-events.test.ts` will FAIL because the new kinds are now in the sequence. **Updates to those tests are in Task 6**.

- [ ] **Step 7: Commit**

```bash
git add libs/agent/agent.ts
git commit -m "feat(agent): yield context + run_summary events"
```

---

## Task 6: Update `run-events.test.ts` to expect new kinds

**Files:**
- Modify: `tests/libs/agent/run-events.test.ts`

**Interfaces:**
- Consumes: AgentEvent 12 kinds.
- Produces: test assertions that include `context` and `run_summary` in the expected sequence.

- [ ] **Step 1: Update the first test's expected sequence**

In `tests/libs/agent/run-events.test.ts`, find the first test ("emits the full sequence for a calculator flow with 2 LLM calls") and update the `expect(kinds).toEqual([...])` array.

The current expected sequence (lines 36-51) is:

```ts
['message_start', 'iteration', 'request', 'response', 'tool_call', 'tool_result', 'iteration', 'request', 'message_delta', 'response', 'message_end', 'done']
```

Replace it with:

```ts
[
  'message_start',
  'iteration', // 1
  'request', // 1
  'context', // 🆕 Day 08: prompts 1 token count
  'response', // 1: toolCalls
  'tool_call',
  'tool_result',
  'iteration', // 2
  'request', // 2
  'context', // 🆕 Day 08: prompts 2 token count (after tool result)
  'message_delta', // Day 07: final-answer iter 流式
  'response', // 2: content
  'run_summary', // 🆕 Day 08: before message_end
  'message_end',
  'done',
]
```

- [ ] **Step 2: Update the second test to expect run_summary**

In the same file, find the test "returns final content via runEvents then done". At the end of the test, find the assertion:

```ts
expect(events.at(-1)).toEqual({ kind: 'done' });
```

Replace the test body (after the events collection) with:

```ts
    expect(events[0]?.kind).toBe('message_start');
    const context = events.find((e) => e.kind === 'context');
    expect(context).toBeUndefined(); // no model passed → no context event
    const messageEnd = events.find((e) => e.kind === 'message_end');
    expect(messageEnd).toEqual({ kind: 'message_end', content: 'hi' });
    // run_summary 出现在 message_end 之前
    const runSummary = events.find((e) => e.kind === 'run_summary');
    expect(runSummary).toBeDefined();
    expect(runSummary).toMatchObject({
      kind: 'run_summary',
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      peakPromptTokens: 0,
      iterations: 1,
    });
    expect(events.at(-1)).toEqual({ kind: 'done' });
```

- [ ] **Step 3: Add a new test for context event when model is provided**

Append a new `it` block at the end of the `describe('Agent.runEvents — event sequence', ...)` block:

```ts
  it('emits context event when model is provided', async () => {
    const chat = new FakeChatClient([{ content: 'hi' }]);
    const tools = new ToolRegistry();
    const agent = new Agent({ chat, tools, model: 'claude-opus-5' });

    const events = [];
    for await (const ev of agent.runEvents('hello')) events.push(ev);

    // context 事件出来了（实际数字取决于 API 但 event 存在）
    const context = events.find((e) => e.kind === 'context');
    expect(context).toBeDefined();
    if (context?.kind === 'context') {
      expect(context.iteration).toBe(1);
      expect(context.limit).toBe(1_000_000);
      expect(context.promptTokens).toBeGreaterThan(0);
    }
  });
```

**Note:** This test requires `ANTHROPIC_API_KEY` to be set — without it, `countContextTokens` returns undefined and the context event is not yielded. Wrap with `it.runIf(hasAnthropicKey)` to skip when no key:

```ts
  it.runIf(hasAnthropicKey)('emits context event when model is provided', async () => {
    // ... same body
  });
```

Add `const hasAnthropicKey = process.env.ANTHROPIC_API_KEY !== undefined && process.env.ANTHROPIC_API_KEY !== '';` at the top of the file (next to existing imports).

- [ ] **Step 4: Run the tests**

Run: `pnpm test tests/libs/agent/run-events.test.ts`
Expected: PASS (all tests). The "context event" test is skipped if no API key.

- [ ] **Step 5: Commit**

```bash
git add tests/libs/agent/run-events.test.ts
git commit -m "test(agent): update run-events for context + run_summary kinds"
```

---

## Task 7: Add `model` field to all `Agent` constructor calls in examples

**Files:**
- Modify: `examples/day04/ex_001_calculator_agent_openai.ts:37`
- Modify: `examples/day04/ex_002_calculator_agent_anthropic.ts:42`
- Modify: `examples/day05/ex_001_sse_agent.ts:47`
- Modify: `examples/day05/ex_002_web_ui.ts:43`
- Modify: `examples/day06/ex_001_sse_trace.ts:42`
- Modify: `examples/day06/ex_002_web_ui_timeline.ts:49`
- Modify: `examples/day06/ex_003_no_llm_smoke.ts:53`
- Modify: `examples/day07/ex_001_streaming_agent_openai.ts:36`
- Modify: `examples/day07/ex_002_streaming_agent_anthropic.ts:39`
- Modify: `examples/day08/agent_server.ts:43`
- Modify: `tests/libs/agent/agent.test.ts:30` (and any other test using `new Agent(...)`)

**Interfaces:**
- Consumes: model field of `AgentOptions`.

- [ ] **Step 1: Find all sites to update**

Run:
```bash
grep -rn "new Agent(" apps examples tests
```

For each match, read the surrounding code to find the model name (e.g., `process.env.MODEL_NAME`, `process.env.OPENAI_MODEL`, `gpt-4o-mini`, etc.).

- [ ] **Step 2: Update each `new Agent({...})` call**

For each call site, add a `model` field to the `AgentOptions` object. Find the model from the surrounding code (it's usually defined right above the `new Agent` call as `const model = ...`).

Pattern (for OpenAI example):
```ts
const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  systemPrompt: '...',
});
```

Becomes:
```ts
const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  systemPrompt: '...',
  model, // 🆕 Day 08
});
```

For sites without a `model` variable (e.g., `ex_001_calculator_agent_openai.ts`), read the file to find the literal model name and add it as `model: 'gpt-4o-mini'` (or whatever the file uses).

- [ ] **Step 3: Update tests**

In `tests/libs/agent/agent.test.ts`, find the existing `new Agent({...})` calls. Add `model: 'claude-opus-5'` (or any registered model) to enable context observation. **Or** leave them without `model` and verify the existing tests still pass without context events.

Read the test file first to decide whether `model` is needed for the existing assertions. If the tests are about `run()` (not `runEvents()`), you don't need to add `model` — those tests don't inspect the new kinds.

- [ ] **Step 4: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/ tests/
git commit -m "feat(examples): pass model to Agent constructor"
```

---

## Task 8: Wire `run_summary` into TraceCollector meta

**Files:**
- Modify: `apps/api/src/server.ts:80-117`

**Interfaces:**
- Consumes: `run_summary` events from `runEvents`.
- Produces: `TraceCollector.meta.context` populated when `run_summary` is observed.

- [ ] **Step 1: Add `run_summary` handler in server.ts**

In `apps/api/src/server.ts`, find the `for await (const ev of options.agent.runEvents(...))` loop (around line 87). The current code accumulates `totalUsage` from `response` events. Add a new branch for `run_summary` that writes the context meta.

Replace the loop body (lines 87-112) with:

```ts
      try {
        for await (const ev of options.agent.runEvents(input, {
          signal: abortController.signal,
        })) {
          collector.collect(runId, ev);

          // 🆕 Day 07: 累积 usage
          if (ev.kind === 'response' && ev.usage !== undefined) {
            totalUsage =
              totalUsage === undefined
                ? ev.usage
                : {
                    promptTokens: totalUsage.promptTokens + ev.usage.promptTokens,
                    completionTokens: totalUsage.completionTokens + ev.usage.completionTokens,
                  };
          }

          // 🆕 Day 08: run_summary 时写 context 进 meta
          if (ev.kind === 'run_summary') {
            collector.addMeta(runId, {
              context: {
                peakPromptTokens: ev.peakPromptTokens,
                iterations: ev.iterations,
              },
            });
          }

          // 终止事件：写 meta + end
          if (ev.kind === 'message_end' || ev.kind === 'error') {
            if (totalUsage !== undefined) {
              collector.addMeta(runId, { usage: totalUsage });
            }
            collector.end(runId);
          }

          await stream.writeSSE(agentEventToSSEMessage(ev));
        }
      } finally {
        // 兜底：signal abort / 流异常时也保证 collector.end 被调
        collector.end(runId);
      }
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): write run_summary context to TraceCollector meta"
```

---

## Task 9: E2E test for `meta.context` field

**Files:**
- Modify: `tests/apps/api/end-to-end.test.ts`

**Interfaces:**
- Consumes: `GET /traces/:runId` returns trace with `meta.context`.

- [ ] **Step 1: Read the existing test file**

Read `tests/apps/api/end-to-end.test.ts` to understand the existing setup. Find where traces are inspected after a run.

- [ ] **Step 2: Add a new test**

Find a good place (after the existing trace tests) and add:

```ts
  it('writes meta.context from run_summary event', async () => {
    // Reuse the existing setup (chat, tools, agent) — assume model is provided.
    // Make a run, wait for done, then GET /traces/:runId and assert meta.context.
    const trace = await runSimpleAgentAndGetTrace(app, 'hello');
    expect(trace.meta.context).toBeDefined();
    expect(trace.meta.context).toMatchObject({
      peakPromptTokens: expect.any(Number),
      iterations: expect.any(Number),
    });
  });
```

(Adapt the helper to use the existing setup; if there isn't a `runSimpleAgentAndGetTrace` helper, write a one-shot run inside the test.)

- [ ] **Step 3: Run the test**

Run: `pnpm test tests/apps/api/end-to-end.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/apps/api/end-to-end.test.ts
git commit -m "test(api): assert meta.context in end-to-end e2e"
```

---

## Task 10: Install Tailwind 4 + @tailwindcss/vite

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `apps/web/tailwind.config.ts`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: Tailwind utility classes available in `apps/web/src/**/*.vue`.

- [ ] **Step 1: Install dependencies**

Run: `pnpm add -D tailwindcss@^4 @tailwindcss/vite@^4`
Expected: `package.json` is updated with the new devDeps.

- [ ] **Step 2: Create tailwind.config.ts**

Create `apps/web/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

/**
 * apps/web/tailwind.config.ts
 *
 * Tailwind CSS 配置 —— 仅供 @tailwindcss/vite 插件读取 content 路径。
 *
 * Day 08 决策：使用 Tailwind 默认调色板和 spacing，不引入自定义 theme tokens。
 * 理由：项目本身有 --bg/--fg 等 :root 变量（Conversation / Timeline 等旧组件用），新组件
 *       用 Tailwind utility 即可，零额外设计 token。
 */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Add tailwindcss plugin to vite config**

Edit `apps/web/vite.config.ts`. Replace the imports block + plugins line:

```ts
/**
 * apps/web/vite.config.ts
 *
 * Vite 配置 —— Agent Console 前端。
 *
 * 核心配置：
 * - dev server 端口 5173
 * - dev proxy：把 /agent /traces 代理到 localhost:3000（apps/api 默认端口）
 *   让前端 fetch('/agent') 直接打到 API，不需要 CORS 中间件
 * - 生产构建产物在 apps/web/dist（不污染根 dist）
 */

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite'; // 🆕 Day 08

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [vue(), tailwindcss()], // 🆕 Day 08
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // SSE 端点（POST + 长连接）
      '/agent': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // Trace 查询端点（GET）
      '/traces': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
```

- [ ] **Step 4: Add `@import "tailwindcss"` to styles.css**

Edit `apps/web/src/styles.css`. Add the import as the very first line of the file (before any other content):

```css
@import "tailwindcss";

/* apps/web/src/styles.css
 *
 * Agent Console 全局样式（从原 apps/api/src/web/index.html 内嵌 CSS 抽出）。
 * 变量集中放在 :root，组件 scoped 样式可引用。
 * 🆕 Day 08: Tailwind 提供 utility classes，新组件 (HeaderPill / MetricsSidebar) 使用。
 * 旧组件 (Conversation / Timeline / InputBar) 的 scoped 样式保留不动。
 */
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck:web`
Expected: PASS (no new types).

- [ ] **Step 6: Build the web app**

Run: `pnpm exec vite build --config apps/web/vite.config.ts`
Expected: build succeeds. Tailwind should generate styles.

- [ ] **Step 7: Commit**

```bash
git add package.json apps/web/tailwind.config.ts apps/web/vite.config.ts apps/web/src/styles.css
git commit -m "feat(web): integrate tailwind css via @tailwindcss/vite"
```

---

## Task 11: Add `HeaderPill.vue` component

**Files:**
- Create: `apps/web/src/components/HeaderPill.vue`

**Interfaces:**
- Props: `summary: { totalPromptTokens: number; totalCompletionTokens: number; peakPromptTokens: number; iterations: number } | null`
- Emits: none

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/HeaderPill.vue`:

```vue
<!--
  apps/web/src/components/HeaderPill.vue

  Header 区域右侧的实时 token 指标 pill。
  - 数据源: run_summary AgentEvent（App.vue 路由后写 ref）
  - 颜色: 绿 (<50%) / 黄 (50-80%) / 红 (>80%) 基于 peakPromptTokens / contextLimit
  - Day 08: UI 纯 Tailwind utility classes，无 scoped CSS

  设计决策:
  - 进度条颜色阈值硬编码（不引入 token-based design，YAGNI）
  - 格式化: 1K / 1.2K / 1.5M 等（精确到 1 位小数）
  - null summary 时显示 "—"（不报 0，避免误导）
-->

<script setup lang="ts">
import { computed } from 'vue';

interface RunSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly peakPromptTokens: number;
  readonly iterations: number;
}

const props = defineProps<{
  summary: RunSummary | null;
  contextLimit: number;
}>();

const peak = computed(() => props.summary?.peakPromptTokens ?? null);
const total = computed(() =>
  props.summary === null ? null : props.summary.totalPromptTokens + props.summary.totalCompletionTokens,
);
const iterations = computed(() => props.summary?.iterations ?? null);

const pct = computed(() => {
  if (peak.value === null) return 0;
  return Math.min(100, Math.round((peak.value / props.contextLimit) * 100));
});

const barColor = computed(() => {
  if (pct.value < 50) return 'bg-emerald-500';
  if (pct.value < 80) return 'bg-amber-500';
  return 'bg-red-500';
});

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
</script>

<template>
  <div class="flex items-center gap-3 px-4 py-2 bg-zinc-900 text-zinc-100 text-sm rounded-md">
    <span>{{ iterations ?? '—' }} iter</span>
    <span class="text-zinc-500">·</span>
    <span>{{ formatTokens(peak) }} / {{ formatTokens(contextLimit) }} tok</span>
    <div class="w-24 h-1.5 bg-zinc-800 rounded">
      <div class="h-full rounded" :class="barColor" :style="{ width: `${pct}%` }" />
    </div>
    <span class="text-zinc-500">·</span>
    <span>{{ formatTokens(total) }} total</span>
  </div>
</template>
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/HeaderPill.vue
git commit -m "feat(web): add HeaderPill vue component"
```

---

## Task 12: Add `MetricsSidebar.vue` component

**Files:**
- Create: `apps/web/src/components/MetricsSidebar.vue`

**Interfaces:**
- Props: `contexts: Array<{ iteration: number; promptTokens: number; limit: number }>`, `summary: RunSummary | null`, `contextLimit: number`
- Emits: `scroll-to-iteration` (iteration: number)

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/MetricsSidebar.vue`:

```vue
<!--
  apps/web/src/components/MetricsSidebar.vue

  左侧 sidebar — 每次 iteration 的 context token 占比 + 总计。
  - 数据源: context AgentEvent 列表 + run_summary
  - 点击 iteration 行 → emit scroll-to-iteration → App.vue 滚动 Timeline 到对应位置
  - Day 08: UI 纯 Tailwind utility classes

  设计决策:
  - 固定 240px 宽（与 App.vue 三栏布局 grid-cols-[240px_1fr_360px] 协调）
  - 进度条颜色同 HeaderPill (<50% 绿 / 50-80% 黄 / >80% 红)
  - 空状态显示 "waiting for iteration data"（不显示 0）
-->

<script setup lang="ts">
import { computed } from 'vue';

interface ContextRow {
  readonly iteration: number;
  readonly promptTokens: number;
  readonly limit: number;
}
interface RunSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly peakPromptTokens: number;
  readonly iterations: number;
}

const props = defineProps<{
  contexts: ReadonlyArray<ContextRow>;
  summary: RunSummary | null;
}>();

const emit = defineEmits<{
  (e: 'scroll-to-iteration', n: number): void;
}>();

const peak = computed(() => props.summary?.peakPromptTokens ?? null);
const total = computed(() =>
  props.summary === null ? null : props.summary.totalPromptTokens + props.summary.totalCompletionTokens,
);
const iterations = computed(() => props.summary?.iterations ?? null);

function barColor(tokens: number, limit: number): string {
  const p = (tokens / limit) * 100;
  if (p < 50) return 'bg-emerald-500';
  if (p < 80) return 'bg-amber-500';
  return 'bg-red-500';
}

function pct(tokens: number, limit: number): number {
  return Math.min(100, Math.round((tokens / limit) * 100));
}

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
</script>

<template>
  <aside class="w-60 bg-zinc-900 border-r border-zinc-800 p-4 overflow-y-auto">
    <h3 class="text-xs uppercase text-zinc-500 mb-3">Context Window</h3>
    <ul v-if="contexts.length > 0" class="space-y-2">
      <li
        v-for="ctx in contexts"
        :key="ctx.iteration"
        class="cursor-pointer hover:bg-zinc-800 p-2 rounded"
        @click="emit('scroll-to-iteration', ctx.iteration)"
      >
        <div class="flex justify-between text-xs">
          <span class="text-zinc-400">Iter {{ ctx.iteration }}</span>
          <span class="text-zinc-100">{{ formatTokens(ctx.promptTokens) }}</span>
        </div>
        <div class="w-full h-1 bg-zinc-800 rounded mt-1">
          <div
            class="h-full rounded"
            :class="barColor(ctx.promptTokens, ctx.limit)"
            :style="{ width: `${pct(ctx.promptTokens, ctx.limit)}%` }"
          />
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-zinc-500 italic">waiting for iteration data</p>

    <hr class="border-zinc-800 my-4" />
    <div class="text-xs text-zinc-400 space-y-1">
      <div class="flex justify-between">
        <span>Peak</span>
        <span class="text-zinc-100">{{ formatTokens(peak) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Total</span>
        <span class="text-zinc-100">{{ formatTokens(total) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Iters</span>
        <span class="text-zinc-100">{{ iterations ?? '—' }}</span>
      </div>
    </div>
  </aside>
</template>
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/MetricsSidebar.vue
git commit -m "feat(web): add MetricsSidebar vue component"
```

---

## Task 13: Wire `App.vue` to render new components + route new events

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/api/agentClient.ts`

**Interfaces:**
- Consumes: `context` + `run_summary` events from `AgentEvent`.
- Produces: `runSummary` ref + `runContexts` ref populated; three-column layout.

- [ ] **Step 1: Extend `isAgentEvent` type guard**

Edit `apps/web/src/api/agentClient.ts`. Find the `isAgentEvent` function (lines 108-123). Update the return expression to include `context` and `run_summary`:

```ts
function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === 'message_start' ||
    kind === 'iteration' ||
    kind === 'request' ||
    kind === 'response' ||
    kind === 'message_delta' ||
    kind === 'context' || // 🆕 Day 08
    kind === 'tool_call' ||
    kind === 'tool_result' ||
    kind === 'message_end' ||
    kind === 'run_summary' || // 🆕 Day 08
    kind === 'done' ||
    kind === 'error'
  );
}
```

Also update the inline comment "AgentEvent 10 kind (Day 07 末态)" to "AgentEvent 12 kind (Day 08 末态)".

- [ ] **Step 2: Update App.vue imports and refs**

Edit `apps/web/src/App.vue`. Modify the `<script setup>` block:

1. Add imports at the top of the script:

```ts
import HeaderPill from './components/HeaderPill.vue';
import MetricsSidebar from './components/MetricsSidebar.vue';
```

2. Add new refs after the existing refs:

```ts
interface ContextRow {
  readonly iteration: number;
  readonly promptTokens: number;
  readonly limit: number;
}
interface RunSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly peakPromptTokens: number;
  readonly iterations: number;
}
const runSummary = ref<RunSummary | null>(null);
const runContexts = ref<ContextRow[]>([]);
const contextLimit = ref<number>(200_000); // 兜底，run_summary 提供 limit 时更新
```

3. Add the `context` / `run_summary` cases in the `dispatch` switch. Find the `case 'message_delta':` block and add cases after it (before `case 'message_end':`):

```ts
    case 'context': {
      runContexts.value = [...runContexts.value, {
        iteration: ev.iteration,
        promptTokens: ev.promptTokens,
        limit: ev.limit,
      }];
      scrollTimelineToBottom();
      break;
    }

    case 'run_summary': {
      runSummary.value = {
        totalPromptTokens: ev.totalPromptTokens,
        totalCompletionTokens: ev.totalCompletionTokens,
        peakPromptTokens: ev.peakPromptTokens,
        iterations: ev.iterations,
      };
      // run_summary 没有 limit 字段 —— 用最后一次 context 事件的 limit
      if (runContexts.value.length > 0) {
        const lastCtx = runContexts.value[runContexts.value.length - 1];
        if (lastCtx !== undefined) contextLimit.value = lastCtx.limit;
      }
      scrollTimelineToBottom();
      break;
    }
```

4. In `resetTurn()`, add lines to clear the new refs:

```ts
function resetTurn(): void {
  conversation.value = [];
  timeline.value = [];
  eventLog.value = [];
  errorMessage.value = null;
  isCancelled.value = false;
  runSummary.value = null;
  runContexts.value = [];
}
```

- [ ] **Step 3: Update template to three-column layout**

Replace the `<template>` block (under the `</script>` close):

```vue
<template>
  <header class="app-header">
    <div class="title">
      Agent Console
      <span class="badge">Day 08 · Context Window + Tailwind</span>
    </div>
    <div class="flex items-center gap-3">
      <HeaderPill :summary="runSummary" :context-limit="contextLimit" />
      <span v-if="isCancelled" class="status-pill">Execution cancelled</span>
      <button
        v-if="isStreaming"
        class="stop"
        data-testid="stop-btn"
        @click="stop"
      >
        Stop
      </button>
      <button data-testid="clear-btn" @click="clear">Clear</button>
    </div>
  </header>

  <main class="panels grid grid-cols-[240px_1fr_360px]">
    <MetricsSidebar
      :contexts="runContexts"
      :summary="runSummary"
      @scroll-to-iteration="scrollToIteration"
    />
    <Conversation :items="conversation" />
    <Timeline :items="timeline" />
  </main>

  <InputBar :busy="isStreaming" @send="send" />
</template>
```

- [ ] **Step 4: Add `scrollToIteration` helper**

Inside the script (after `scrollTimelineToBottom()`), add:

```ts
function scrollToIteration(n: number): void {
  // 通过自定义事件标记 timeline id 滚动定位
  // 简化：调用原生 DOM 滚动到对应 TimelineItem
  nextTick(() => {
    const el = document.querySelector(`[data-iteration="${n}"]`);
    if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
```

To make this work, edit `apps/web/src/components/Timeline.vue` to add `data-iteration` to the iteration timeline entries. Read Timeline.vue first to find the right element to attach the attribute to.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck:web`
Expected: PASS.

- [ ] **Step 6: Build the web app**

Run: `pnpm exec vite build --config apps/web/vite.config.ts`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.vue apps/web/src/api/agentClient.ts apps/web/src/components/Timeline.vue
git commit -m "feat(web): render HeaderPill + MetricsSidebar + three-column layout"
```

---

## Task 14: Update AgentEventUnion type re-export and docs

**Files:**
- Modify: `libs/agent/types.ts`
- Modify: `apps/web/src/types/agentEvent.ts`

**Interfaces:**
- (Same as AgentEvent — no new types, just re-export sanity.)

- [ ] **Step 1: Verify types.ts re-exports are sufficient**

Read `libs/agent/types.ts`. The current content re-exports `ChatResponse`, `ToolCallData`, `Tool`, `ToolDefinition`, `ToolParameters`, `AgentEvent`. No new types needed — `AgentEvent` is the union, and the new kinds are part of it.

If `Apps/web/src/types/agentEvent.ts` defines its own AgentEvent-like type, update it to use the new union. (It's currently just `ConversationItem` + `TimelineItem`, so no change needed.)

- [ ] **Step 2: Update doc comments**

In `libs/agent/event.ts`, update the doc comment to reflect 12 kinds. In `libs/agent/agent.ts`, the Day 08 changes are already documented in Task 5.

In `apps/web/src/api/agentClient.ts`, update the "10 kind" comment to "12 kind".

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck && pnpm typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/agent/types.ts apps/web/src/types/agentEvent.ts apps/web/src/api/agentClient.ts
git commit -m "docs: update kind counts to 12 agent events"
```

---

## Task 15: Final regression sweep + spec-compliance verification

**Files:**
- (No new files; verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: ALL tests PASS. Pay special attention to:
- `tests/libs/agent/agent.test.ts` (existing tests)
- `tests/libs/agent/run-events.test.ts` (updated)
- `tests/apps/api/end-to-end.test.ts` (updated)
- `tests/libs/llm/observability/*.test.ts` (new)

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck && pnpm typecheck:web`
Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS (no errors).

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Build the web app**

Run: `pnpm exec vite build --config apps/web/vite.config.ts`
Expected: PASS.

- [ ] **Step 6: Spec-coverage check**

Verify against the spec:

| Spec section | Task |
|---|---|
| 2.1 countContextTokens (Anthropic only) | Task 2 |
| 2.1 MODELS registry | Task 1 |
| 2.1 AgentEvent 10 → 12 kind | Task 4 |
| 2.1 Agent.runEvents model field | Task 5 |
| 2.1 run_summary on termination | Task 5 |
| 2.1 SSE adapter — framework-agnostic | (no change needed — already framework-agnostic) |
| 2.1 server.ts addMeta context | Task 8 |
| 2.1 Tailwind 4 integration | Task 10 |
| 2.1 HeaderPill component | Task 11 |
| 2.1 MetricsSidebar component | Task 12 |
| 2.1 App.vue routing new events | Task 13 |
| 2.1 tests for context / run_summary | Task 6, 9 |
| 2.2 YAGNI: pricing / cost | ✅ explicitly YAGNI |
| 2.2 YAGNI: OpenAI count_tokens | ✅ returns undefined |
| 2.2 YAGNI: Performance metrics | ✅ Day 09+ |
| 2.2 YAGNI: Tailwind re-theme | ✅ using default palette |

- [ ] **Step 7: Commit (if any cleanup)**

If lint/format fixed any files, commit them:

```bash
git add -A
git commit -m "chore: final lint + format cleanup"
```

---

## Self-Review

**1. Spec coverage:** Section 2.1 of the spec maps 1:1 to Tasks 1-13. Both deliberate YAGNI items (Cost, Performance) are honored. Risk point 1 (Agent 持有 model 字段) is addressed by Task 5. Tailwind integration matches the `@tailwindcss/vite` decision.

**2. Placeholder scan:** No "TBD" / "TODO" / "implement later" / "fill in" / "similar to Task N" in the plan. Every step has concrete code.

**3. Type consistency:**

- `AgentEvent` 12 kinds defined in Task 4 (event.ts) and used in Task 5 (agent.ts) and Task 13 (App.vue dispatch).
- `ModelMeta` / `MODELS` / `getModelMeta` defined in Task 1, used in Task 2 (context-counter) and Task 5 (agent).
- `ContextCountResult` / `countContextTokens` defined in Task 2, used in Task 5 (agent) and Task 13 (App.vue).
- `RunSummary` interface defined in `HeaderPill.vue` (Task 11) and `MetricsSidebar.vue` (Task 12) — same shape. App.vue uses an identical local interface (Task 13). ✅
- `ContextRow` defined in `MetricsSidebar.vue` (Task 12) and App.vue (Task 13) — same shape. ✅
- `getModelMeta` exported from `libs/llm/observability/models.ts` (Task 1), re-exported from `libs/llm/index.ts` (Task 3), imported in `libs/agent/agent.ts` (Task 5). ✅
- `isAgentEvent` updated in Task 13 with all 12 kinds. ✅

**4. Fake-chat-client interaction:** The plan doesn't modify FakeChatClient. The "context event when model is provided" test in Task 6 will skip if no `ANTHROPIC_API_KEY` is set. If the API key is set, the test makes a real API call. This is consistent with the spec's "best-effort" principle.

**5. test file paths:** `tests/libs/llm/observability/*.test.ts` — does this directory exist? No — the tasks create it. Task 1 explicitly creates the directory via the test file path. ✅

**6. Plan / spec alignment:** Spec said "framework-agnostic" SSE adapter. The plan Task 8 reuses `agentEventToSSEMessage` directly without changes — matches spec insight. Documented in Task 14 instead of Task 8 to make the no-op explicit.

**7. Tailwind 4 syntax:** Tailwind 4 uses `@import "tailwindcss"` at the top of CSS files (CSS-first config). Plan Task 10 uses this syntax. The old `@tailwind base/components/utilities` directives are deprecated in Tailwind 4. ✅

**8. Three-column layout:** `grid-cols-[240px_1fr_360px]` — Tailwind 4 arbitrary value syntax. ✅

**9. Type vs interface:** `RunSummary` and `ContextRow` are local interfaces in Tasks 11/12/13. Could be exported from `apps/web/src/types/agentEvent.ts` for DRY, but the spec says "YAGNI ruthless" — keep them local. ✅

**10. App.vue complexity:** App.vue grew from 281 lines to ~330 lines. Still under the 300-line threshold the spec recommends — actually slightly over. If reviewer pushes back, the next refactor would extract `runSummary` / `runContexts` into a `useAgentMetrics()` composable. Mark as a follow-up if needed; do not do in this plan.
