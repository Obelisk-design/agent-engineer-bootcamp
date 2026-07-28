# Day 08 — Context Window 观测 + Tailwind CSS 集成 设计

> **日期**：2026-07-28
> **作者**：AI Agent Engineer Bootcamp Day 08
> **状态**：draft（待肥老大 review）

---

## 1. 目标

Day 07 收口了 AbortSignal / 流式 chat / Token Usage 进 meta / error yield 一致化。
Day 08 解决两个独立问题：

1. **Context Window 观测** — 每次 LLM 调用的 prompt 占多少 token / 离模型上限多远 / 多轮迭代中是否在膨胀
2. **Tailwind CSS 集成** — `apps/web` 接入 Tailwind，新组件用 utility classes 写

**简化决策**：原提案的 Cost（按 model 计价）**砍掉**，价格表爆炸面 + 精度 + stale 风险不值。Day 08 集中火力做 Context 一个观测指标 + UI 基建。

**Connection with previous days**：
- Day 06：TraceCollector + meta 扩展点（已留 `Record<string, unknown>`，今天用上）
- Day 07：ChatUsage 进 meta → Day 08 的 `run_summary` 复用 usage 累加
- Day 08：Vue 前端 Day 03 拆出后第一个完整 UI 组件迭代周期

---

## 2. 范围

### 2.1 必须做

**`libs/llm/observability/context-counter.ts`（决策点 1）**

- 新增 `countContextTokens(messages, model, signal?)` 抽象
- Anthropic 适配：调用 `client.messages.count_tokens({model, messages, signal})`
- OpenAI 适配：返回 `undefined`（OpenAI 无公开 count_tokens 接口，YAGNI 自己造轮子）
- 失败（API 错误 / 超时）→ 返回 `undefined`，**不抛**（best-effort 派生）
- 模型清单（输入端限制）：必须先在 `PRICING` 或新加 `MODELS` 注册表里有的 model 才会调用

**`PRICING` 重命名 / 移到 `models.ts` 注册表**

- 新增 `libs/llm/observability/models.ts` — model → `{contextLimit, ...}` 注册表
- **不**留 pricing（cost 砍掉）
- 6 个模型：claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5 / gpt-4o / gpt-4o-mini / gpt-4-turbo
- 未知 model → context 事件不 yield（前端降级到不显示）

**`AgentEvent` 扩展 10 → 11 kind（决策点 2）**

```ts
| { readonly kind: 'context'; readonly iteration: number; readonly promptTokens: number; readonly limit: number }  // 🆕
| { readonly kind: 'run_summary'; readonly totalPromptTokens: number; readonly totalCompletionTokens: number; readonly peakPromptTokens: number; readonly iterations: number }  // 🆕
```

- `context` 在每次 LLM 调用前 yield
- `run_summary` 在 `message_end` / `error` 之前只 yield 一次

**`Agent.runEvents` 计算注入（决策点 2）**

- `Agent` 构造函数补 `model` 字段（**先 grep 现状确认**；如果没字段，改构造函数 + 修所有调用方）
- `runEvents` 在 `request` 事件之后、调用 `chat/stream` 之前调用 `countContextTokens`
- 累积：
  - `peakPromptTokens = max(peakPromptTokens, currentIterationContext)`
  - `totalPromptTokens += response.usage.promptTokens`（如有）
  - `totalCompletionTokens += response.usage.completionTokens`（如有）
- `message_end` 之前 yield `run_summary`
- `error` 之前也 yield `run_summary`（部分累加也能给前端看）

**`apps/api/src/sse-adapter.ts` 增量**

- 新增 `context` / `run_summary` 两个 kind → SSE 帧
- 沿用现有 `{event, data}` 形态

**`apps/api/src/server.ts` Trace meta 增量**

- `run_summary` 事件时 `collector.addMeta(runId, { context: { peakPromptTokens, iterations } })`
- **不**覆盖 Day 07 写的 `meta.usage`

**Tailwind CSS 集成（决策点 3）**

- 根 `package.json` devDeps：`tailwindcss@^4` + `@tailwindcss/vite@^4`
- `apps/web/vite.config.ts`：`plugins: [vue(), tailwindcss()]`
- `apps/web/tailwind.config.ts`：`content: ['./index.html', './src/**/*.{vue,ts}']`
- `apps/web/src/styles.css`：加 `@import "tailwindcss";` 在最顶
- 旧 `:root` CSS 变量保留（兼容 Conversation / Timeline / InputBar）

**`HeaderPill.vue` 新组件（决策点 4）**

- 全局 header 右侧固定一行
- 内容：`{iterations} iter · {peakPromptTokens} / {limit} tok · {totalPromptTokens + totalCompletionTokens} total`
- 进度条：`peakPromptTokens / limit` 比例 + 颜色（绿 < 50% / 黄 50-80% / 红 > 80%）
- 数据源：消费 `run_summary` 事件更新 Vue ref

**`MetricsSidebar.vue` 新组件（决策点 4）**

- 左侧 sidebar，宽 240px，固定
- 每次 iteration 一行：迭代号 + token 计数 + 占比条
- 底部 Total 区：总 token / 峰值 token / iter 数
- 点击 iteration 行 → emit `scroll-to-iteration(n)` → App.vue 滚动 Timeline

**`App.vue` 路由新事件**

- `dispatch` switch 加 `context` / `run_summary` 两个 case
- `context`：写 `runContext` ref（push `{iteration, promptTokens, limit}`）
- `run_summary`：写 `runSummary` ref（HeaderPill + MetricsSidebar 消费）
- Header 加 `<HeaderPill :summary="runSummary" />`
- 主内容改成三栏布局：`MetricsSidebar + Conversation + Timeline`

**测试**

- `tests/libs/llm/observability/context-counter.test.ts` — 新增；Anthropic 真实调用（`ANTHROPIC_API_KEY` 跳过）+ 失败降级
- `tests/libs/agent/run-events.test.ts` — 加 context / run_summary 事件 yield 断言
- `tests/apps/api/end-to-end.test.ts` — 加 meta.context 字段断言
- `tests/libs/llm/observability/models.test.ts` — 已知/未知 model 返回

### 2.2 故意不做（YAGNI）

- ❌ **Cost / Token 计价**（价格表爆炸面 + 币种精度 + stale 风险，砍掉）
- ❌ **OpenAI count_tokens**（OpenAI 无公开接口，造轮子不值）
- ❌ **latency / tool time / cache hit**（Performance 维度，Day 09+）
- ❌ **持久化 / Trace 持久化**（Day 10+）
- ❌ **真实 Visual Editor**（降级到 raw JSON 渲染，Tailwind utility 写）
- ❌ **OpenTelemetry / Prometheus**（永不做，超出 bootcamp 范围）
- ❌ **dark mode 切换**（项目本就是深色，无需切换）
- ❌ **重写旧组件（Conversation / Timeline / InputBar）** — 保留 scoped CSS，**只**新组件用 Tailwind
- ❌ **Tailwind preset / 自定义 design token** — 用 Tailwind 默认调色板，零额外配置

---

## 3. 架构

### 3.1 信号流（端到端）

```
Agent Run
  └─ libs/agent/agent.ts
       ├─ model = agent.model (Agent 持有)
       └─ for iter ≤ maxIterations:
             ├─ yield {kind:'iteration', n}
             ├─ yield {kind:'request', messages}
             ├─ 🆕 ctx = await tryCountContext(messages, model, signal)
             │     ├─ 成功 → yield {kind:'context', iteration, promptTokens, limit}
             │     └─ 失败 / 未知 model → 不 yield
             ├─ response = await chatClient.chat(req, {signal})
             ├─ yield {kind:'response', ..., usage}
             ├─ 累积 totalPromptTokens / totalCompletionTokens / peakPromptTokens
             ├─ tool_calls / tool_results
             └─ ...
       └─ message_end 之前：
             └─ yield {kind:'run_summary', totalPromptTokens, totalCompletionTokens, peakPromptTokens, iterations}
       ↓
apps/api/server.ts
  ├─ 监听新事件 → traceCollector.collect(runId, ev)
  ├─ run_summary 时: collector.addMeta(runId, { context: { peakPromptTokens, iterations } })
  └─ SSE 推 → 前端
       ↓
apps/web
  ├─ App.vue dispatch 新事件
  ├─ HeaderPill 消费 run_summary
  ├─ MetricsSidebar 消费 context 列表 + run_summary
  └─ Timeline 复用 TimelineItem 渲染（新事件 detail 字段）
```

### 3.2 AgentEvent 联合（11 kind）

```ts
type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | { readonly kind: 'request'; readonly iteration: number; readonly messages: ReadonlyArray<Message> }
  | { readonly kind: 'response'; readonly iteration: number; readonly content?: string; readonly toolCalls?: ReadonlyArray<ToolCallData>; readonly usage?: ChatUsage }
  | { readonly kind: 'message_delta'; readonly content: string }
  | { readonly kind: 'context'; readonly iteration: number; readonly promptTokens: number; readonly limit: number }  // 🆕
  | { readonly kind: 'tool_call'; readonly id: string; readonly name: string; readonly args: unknown }
  | { readonly kind: 'tool_result'; readonly id: string; readonly name: string; readonly output: string }
  | { readonly kind: 'message_end'; readonly content: string }
  | { readonly kind: 'run_summary'; readonly totalPromptTokens: number; readonly totalCompletionTokens: number; readonly peakPromptTokens: number; readonly iterations: number }  // 🆕
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
```

**关键不变量**：
- `context` 仅在能查到的 model + count_tokens 成功时 yield；任何失败路径静默
- `run_summary` 在 `message_end` **之前** yield 一次（success 路径）
- `run_summary` 在 `error` **之前** 也 yield 一次（partial 累加）
- `run_summary` 与 `done`/`error` 配套：summary 一定先于终止事件

### 3.3 `models.ts` 注册表

```ts
// libs/llm/observability/models.ts
export interface ModelMeta {
  readonly contextLimit: number;  // tokens
}

export const MODELS: Readonly<Record<string, ModelMeta>> = {
  'claude-opus-5':    { contextLimit: 1_000_000 },
  'claude-sonnet-5':  { contextLimit: 1_000_000 },
  'claude-haiku-4-5': { contextLimit: 200_000 },
  'gpt-4o':           { contextLimit: 128_000 },
  'gpt-4o-mini':      { contextLimit: 128_000 },
  'gpt-4-turbo':      { contextLimit: 128_000 },
};

export function getModelMeta(model: string): ModelMeta | undefined {
  return MODELS[model];
}
```

### 3.4 `context-counter.ts` 抽象

```ts
// libs/llm/observability/context-counter.ts
export interface ContextCountResult {
  readonly tokens: number;
}

export async function countContextTokens(
  messages: ReadonlyArray<Message>,
  model: string,
  signal?: AbortSignal,
): Promise<ContextCountResult | undefined> {
  const meta = getModelMeta(model);
  if (meta === undefined) return undefined;  // 未知 model → 不调用

  try {
    if (model.startsWith('claude-')) {
      return await countAnthropicContext(messages, model, signal);
    }
    // OpenAI / 其他 → 暂不实现
    return undefined;
  } catch (err) {
    // best-effort：失败不打断主流程
    console.warn('[context-counter] failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

async function countAnthropicContext(
  messages: ReadonlyArray<Message>,
  model: string,
  signal?: AbortSignal,
): Promise<ContextCountResult | undefined> {
  // 复用 ANTHROPIC_API_KEY 环境变量
  // 调用 client.messages.count_tokens({model, messages, signal})
  // 失败 throw → 由外层 catch
}
```

**关键不变量**：
- **不抛**（catch 静默 + warn 日志）
- **不阻塞**主流程（不重试、不 sleep）
- **不缓存**（每次都调，简单优先 —— 缓存留给 Performance 阶段）

### 3.5 Tailwind 集成

```ts
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // ... 现有 server / build config 不变
});
```

```ts
// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

```css
/* apps/web/src/styles.css —— 顶部加 */
@import "tailwindcss";

/* 保留旧 :root 变量（兼容旧组件） */
:root { /* ... existing ... */ }
```

**关键不变量**：
- 旧 scoped CSS 全部保留（不重写 Conversation / Timeline / InputBar）
- 新组件（HeaderPill / MetricsSidebar）只写 Tailwind utility classes
- Tailwind 4 的 CSS-first 配置（`@import "tailwindcss"`）一行搞定，无 `@tailwind base/components/utilities` 旧式三段

---

## 4. UI 设计

### 4.1 HeaderPill

固定在 `<header>` 区域右侧。响应式：

| 字段 | 渲染 |
|---|---|
| `iterations` | "3 iter" |
| `peakPromptTokens` / `limit` | "4.2K / 200K tok" |
| `totalTokens` | "5.1K total" |
| 进度条 | Tailwind: `h-1.5 bg-zinc-800` 内嵌 `bg-{green/yellow/red}-500` 宽度 = `peakPromptTokens / limit` |

```vue
<template>
  <div class="flex items-center gap-3 px-4 py-2 bg-zinc-900 text-zinc-100 text-sm rounded-md">
    <span>{{ iterations ?? '—' }} iter</span>
    <span class="text-zinc-500">·</span>
    <span>{{ formatTokens(peak) }} / {{ formatTokens(limit) }} tok</span>
    <div class="w-24 h-1.5 bg-zinc-800 rounded">
      <div class="h-full rounded" :class="barColor" :style="{ width: `${barPct}%` }" />
    </div>
    <span class="text-zinc-500">·</span>
    <span>{{ formatTokens(total) }} total</span>
  </div>
</template>
```

### 4.2 MetricsSidebar

固定 sidebar，宽度 240px。主区域三栏：`MetricsSidebar + Conversation + Timeline`。

```vue
<template>
  <aside class="w-60 bg-zinc-900 border-r border-zinc-800 p-4 overflow-y-auto">
    <h3 class="text-xs uppercase text-zinc-500 mb-3">Context Window</h3>
    <ul class="space-y-2">
      <li v-for="ctx in contextRows" :key="ctx.iteration" class="cursor-pointer hover:bg-zinc-800 p-2 rounded"
          @click="$emit('scroll-to-iteration', ctx.iteration)">
        <div class="flex justify-between text-xs">
          <span class="text-zinc-400">Iter {{ ctx.iteration }}</span>
          <span class="text-zinc-100">{{ formatTokens(ctx.promptTokens) }}</span>
        </div>
        <div class="w-full h-1 bg-zinc-800 rounded mt-1">
          <div class="h-full rounded" :class="barColor(ctx.promptTokens, ctx.limit)" :style="{ width: `${pct(ctx.promptTokens, ctx.limit)}%` }" />
        </div>
      </li>
    </ul>
    <hr class="border-zinc-800 my-4" />
    <div class="text-xs text-zinc-400 space-y-1">
      <div class="flex justify-between"><span>Peak</span><span class="text-zinc-100">{{ formatTokens(peak) }}</span></div>
      <div class="flex justify-between"><span>Total</span><span class="text-zinc-100">{{ formatTokens(total) }}</span></div>
      <div class="flex justify-between"><span>Iters</span><span class="text-zinc-100">{{ iterations ?? '—' }}</span></div>
    </div>
  </aside>
</template>
```

### 4.3 三栏布局

`App.vue` 主区域：

```vue
<template>
  <header class="app-header">
    <div class="title">Agent Console</div>
    <HeaderPill :summary="runSummary" />
    <div class="actions">
      <button v-if="isStreaming" @click="stop">Stop</button>
      <button @click="clear">Clear</button>
    </div>
  </header>
  <main class="panels grid grid-cols-[240px_1fr_360px]">
    <MetricsSidebar :contexts="runContexts" :summary="runSummary" @scroll-to-iteration="scrollToIter" />
    <Conversation :items="conversation" />
    <Timeline :items="timeline" />
  </main>
  <InputBar :busy="isStreaming" @send="send" />
</template>
```

---

## 5. 触达文件清单（修改五问 #3 同类扫描）

| 文件 | 改动 |
|---|---|
| `libs/llm/observability/models.ts` | 🆕 ModelMeta 注册表 + getter |
| `libs/llm/observability/context-counter.ts` | 🆕 抽象 + Anthropic 适配 + 失败降级 |
| `libs/llm/observability/index.ts` | 🆕 barrel |
| `libs/llm/index.ts` | export 新增模块 |
| `libs/agent/event.ts` | AgentEvent 10 → 11 kind |
| `libs/agent/agent.ts` | Agent 构造函数加 `model` 字段；runEvents 插 context / run_summary 事件 |
| `libs/agent/index.ts` | export 新 event 类型（如需） |
| `apps/api/src/sse-adapter.ts` | 2 个新 kind 适配 |
| `apps/api/src/server.ts` | run_summary 时 addMeta context |
| `apps/web/vite.config.ts` | 加 tailwindcss 插件 |
| `apps/web/tailwind.config.ts` | 🆕 content 配置 |
| `apps/web/src/styles.css` | 顶部加 `@import "tailwindcss";` |
| `apps/web/src/components/HeaderPill.vue` | 🆕 Tailwind utility 写 |
| `apps/web/src/components/MetricsSidebar.vue` | 🆕 Tailwind utility 写 |
| `apps/web/src/App.vue` | 引入 2 个组件 + 路由新事件 + 三栏布局 |
| `apps/web/src/types/agentEvent.ts` | 类型同步（如需） |
| `package.json` | devDeps: `tailwindcss@^4` + `@tailwindcss/vite@^4` |
| `tests/libs/llm/observability/models.test.ts` | 🆕 getModelMeta 已知/未知 |
| `tests/libs/llm/observability/context-counter.test.ts` | 🆕 best-effort + 失败降级 |
| `tests/libs/agent/run-events.test.ts` | 加 context / run_summary 断言 |
| `tests/apps/api/end-to-end.test.ts` | 加 meta.context 字段断言 |

**预估 commit 数**：~14（6 个新模块 + 5 个改 + 3 个测试）

---

## 6. 教学要点（day08.md 要展开）

1. **派生 vs 源** — provider 的 usage 是源，context / total 是派生；派生绝不能替代源
2. **best-effort 派生** — count_tokens 失败不能卡死主 agent run；派生路径独立 try/catch
3. **additive schema 扩展** — AgentEvent 10 → 11 kind 是 additive，老消费方不破；meta 字段持续 merge 不重写
4. **简化决策的力量** — 砍掉 Cost 不影响核心价值（理解 token 用量），避免价格表 + 精度 + stale 三个爆炸面
5. **Tailwind 与 scoped CSS 共存** — 新组件 utility-first，旧组件保留 scoped，渐进式迁移
6. **观测为开发体验服务** — HeaderPill 不只是好看，是"一眼看到 prompt 在膨胀 / 接近 context 上限"的实时警告

---

## 7. 风险点

1. **Agent 持有 model 字段** — 当前 `Agent` 构造函数（Day 04 修改）我还没看代码；如没 model 字段要补，改构造函数 + 修所有调用方。**开工前必须先 grep 现状**。
2. **count_tokens 失败降级** — 必须 try/catch 静默 + console.warn，**绝不 throw**。测试要专门覆盖"网络错误 / API 4xx / 超时"三种降级路径。
3. **Anthropic API key 依赖** — 跑测试时若 `ANTHROPIC_API_KEY` 未设，context-counter 真实调用测试必须 skip（不要 fail）。
4. **week 4 超时** — count_tokens 自身可能慢（~100ms）。**带 signal** 让 abort 路径快速失败。
5. **未知 model 静默** — 用户用了 `MODELS` 注册表里没有的 model（如 `gpt-4.1`），context 事件不 yield，UI 显示空。**不在 UI 报错**（避免误导），但前端 console.warn 提示。
6. **Tailwind 4 与 Vue SFC 兼容性** — `@tailwindcss/vite` 是官方 Vite 插件，Vite 项目主流方案；旧 scoped CSS 在 Vue 3 SFC 与 Tailwind 4 无冲突（utility 全局、scoped 局部）。
7. **三栏布局响应式** — 移动端 240px sidebar 会挤掉 conversation。**Day 08 不做移动端适配**（CLAUDE.md 不要求），viewport < 768px 时 sidebar 仍占 240px（横滚动），未来再 fold。
8. **`run_summary` 累积精度** — 多次 iter 累加 token 可能浮点漂移。但 token 是整数，**无浮点问题**（仅 cost 才需要担心）。
9. **run_summary 在 error 路径** — tool_calls 失败 / network abort 时，totalToken 是 partial。在 UI 上明确标"partial"（橙色 badge），不误导。

---

## 8. 待肥老大 review 决策（已经在对话中 ack）

| 决策点 | 选择 |
|---|---|
| 1. count_tokens 拿法 | (a) 调 Anthropic `/messages/count_tokens` ✅ |
| 2. Context 暴露 | (b) AgentEvent 加 `context` + `run_summary` 事件 ✅ |
| 3. Tailwind 接入 | (a) `@tailwindcss/vite` 插件 ✅ |
| 4. UI 位置 | (a) HeaderPill + MetricsSidebar ✅ |
| 5. Cost 维度 | (a) 砍掉，只做 token ✅ |

---

## 9. 待补充（spec review 后写）

- 测试场景详细列表（每条测试断言什么）
- plan（实施步骤 + commit 拆分 + 验收门）
