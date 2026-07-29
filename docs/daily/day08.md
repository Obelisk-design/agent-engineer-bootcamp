# Day 08 — Context Window 观测 + Tailwind CSS 集成

> 65 天 AI Agent 工程师训练营 · Day 08 / 65
> 主题：把 Day 07 留下的 `meta` 扩展点用上 — 实时观测每次 LLM 调用的 prompt token / context limit 占比；同时引入 Tailwind 4 给 Agent Console 换 UI 技术栈。

---

## 🎯 今日目标

1. ✅ `MODELS` 注册表（6 个 model → `contextLimit`）+ `countContextTokens` 抽象（Anthropic only）
2. ✅ `countContextTokens` 失败不抛、永远返回 `undefined`（best-effort）
3. ✅ `AgentEvent` 加 `context` + `run_summary` 两种 kind（10 → 12 kind）
4. ✅ `Agent.runEvents` 在每次 chat 前 yield `context`，在 `message_end` / `error` 之前 yield `run_summary`
5. ✅ `error` 路径必须也 yield `run_summary`（fix 后的行为）
6. ✅ `apps/api/server.ts` 在 `run_summary` 时 `addMeta({ context: { peakPromptTokens, iterations } })`
7. ✅ `apps/web` 集成 Tailwind 4（`@tailwindcss/vite`）
8. ✅ `HeaderPill` 显示 `iter · peak/limit tok · total` + 颜色进度条
9. ✅ `MetricsSidebar` 每次 iteration 一行 + Peak/Total/Iters 合计
10. ✅ `App.vue` 三栏布局：`MetricsSidebar + Conversation + Timeline`
11. ✅ `isAgentEvent` 类型守卫扩展（12 kind）
12. ✅ examples 全部 `new Agent({ ..., model })` 加上 model 字段
13. ✅ 守住 YAGNI：Cost / USD / latency / cache hit / 持久化全划

---

## 📦 今日产出物

```text
libs/llm/
  observability/
    models.ts                       NEW — MODELS 注册表 + getModelMeta
    context-counter.ts              NEW — countContextTokens + Anthropic 适配
    index.ts                        NEW — barrel export
  index.ts                          MODIFIED — +export observability

libs/agent/
  event.ts                          MODIFIED — +context, +run_summary (10 → 12 kind)
  agent.ts                          MODIFIED — AgentOptions.model + 2 fix commits
  types.ts                          (no change — AgentEvent 是 union)

apps/api/src/
  server.ts                         MODIFIED — run_summary → addMeta(context)

apps/web/
  package.json                      TRANCHED — @tailwindcss/vite 单独提
  vite.config.ts                    MODIFIED — tailwindcss() plugin
  tailwind.config.ts                NEW — content paths
  src/styles.css                    MODIFIED — @import "tailwindcss"
  src/components/
    HeaderPill.vue                  NEW — Tailwind utility
    MetricsSidebar.vue              NEW — Tailwind utility
  src/App.vue                       MODIFIED — 三栏布局 + 新事件路由
  src/api/agentClient.ts            MODIFIED — isAgentEvent 加 2 kind

examples/
  day04/..._openai.ts               MODIFIED — +model
  day04/..._anthropic.ts            MODIFIED — +model
  day05/..._sse_agent.ts            MODIFIED — +model
  day05/..._web_ui.ts               MODIFIED — +model
  day06/..._sse_trace.ts            MODIFIED — +model
  day06/..._web_ui_timeline.ts      MODIFIED — +model
  day06/..._no_llm_smoke.ts         MODIFIED — +model
  day07/..._streaming_agent_openai.ts     MODIFIED — +model
  day07/..._streaming_agent_anthropic.ts  MODIFIED — +model
  day08/agent_server.ts             MODIFIED — +model

tests/
  libs/llm/observability/
    models.test.ts                  NEW — 3 tests
    context-counter.test.ts         NEW — 3 always + 1 conditional
  libs/agent/run-events.test.ts     MODIFIED — 加 run_summary 断言 + 新增 context 条件测试
  apps/api/end-to-end.test.ts       MODIFIED — meta.context 断言
  apps/api/trace-collector.test.ts  MODIFIED — kinds 加 run_summary + meta 含 context
```

**19 commits** 落地（按 Phase 顺序）：

| Phase | Commit | 内容 |
|---|---|---|
| 1 | `6e77435` | feat(observability): add MODELS registry with contextLimit |
| 1 | `fe2b0e9` | feat(observability): add countContextTokens with anthropic adapter |
| 1 | `daf27c1` | feat(observability): export from libs/llm barrel |
| 2 | `f35aff9` | feat(agent): add context + run_summary event kinds |
| 2 | `3b8f975` | feat(agent): yield context + run_summary events |
| 2 | `0491590` | fix(agent): yield run_summary before all error paths |
| 2 | `e685221` | test(agent): update run-events for context + run_summary kinds |
| 3 | `5ea5e00` | feat(examples): pass model to Agent constructor |
| 3 | `47f1725` | feat(api): write run_summary context to TraceCollector meta |
| 3 | `1d7cbaf` | test(api): assert meta.context in end-to-end e2e |
| 4 | `d102b58` | feat(web): integrate tailwind css via @tailwindcss/vite |
| 4 | `d072260` | chore: update pnpm-lock.yaml for tailwindcss + @tailwindcss/vite |
| 4 | `fd622b1` | feat(web): add HeaderPill vue component |
| 4 | `0fe59a9` | feat(web): add MetricsSidebar vue component |
| 4 | `9f99f5e` | feat(web): render HeaderPill + MetricsSidebar + three-column layout |
| 4 | `c8bd5ac` | fix(test): narrow possibly undefined latestTrace in e2e assertion |
| 5 | `0e72eeb` | test(api): add run_summary to trace-collector expected kinds |
| 5 | `555e722` | fix(web): wire scroll-to-iteration + barColor threshold + run_summary test |

---

## 🔧 关键命令速查

```bash
# === Day 08 demos（真实 LLM + Context Window 观测）===
pnpm exec tsx examples/day08/agent_server.ts  # API + Context meta
cd apps/web && pnpm exec vite --host 127.0.0.1  # 前端 + Tailwind
# 浏览器看 http://127.0.0.1:5173/ → HeaderPill 显示 peak/limit + 进度条

# === 真实跑 Context === 
# 1) 设 ANTHROPIC_API_KEY
# 2) 在 example 里 model 改成 claude-opus-5（已注册）
# 3) 跑起来 → 真 Anthropic count_tokens API 调用 → context 事件出现

# === 质量门 ===
pnpm typecheck       # 0 error
pnpm typecheck:web    # 0 error（bonus fix：Timeline.vue exactOptionalPropertyTypes）
pnpm lint            # dist/ 报错（pre-existing，无 .eslintignore）
pnpm test            # 70 / 70 passed / 2 skipped

# === Spec / Plan / Report 三件套 ===
docs/superpowers/specs/2026-07-28-day08-context-and-cost-observability-design.md
docs/superpowers/plans/2026-07-28-day08-context-window-tailwind.md
.superpowers/sdd/progress.md
```

**如何判断"context 真的起作用"**：
- HeaderPill 进度条变色（绿 < 50% / 黄 50-80% / 红 > 80%）
- MetricsSidebar 每次 iteration 多一行
- `GET /traces/:runId` 的 `meta.context` 有 `peakPromptTokens` + `iterations`

---

## 📚 知识点

### 1. 派生 vs 源 — provider 是 source，context/cost 是 derived

`AgentEvent` 里 12 个 kind 里，`response.usage` 是**源**（你从 provider 拿到），`context` / `run_summary` 是**派生**（你从源推导）。

```ts
// 源：response 事件（每个 LLM 调用的 usage）
yield { kind: 'response', iteration: 1, usage: { promptTokens: 1234, completionTokens: 56 } };

// 派生：context 事件（每个 LLM 调用前的 count_tokens）
yield { kind: 'context', iteration: 1, promptTokens: 1234, limit: 200000 };

// 派生：run_summary 事件（累积的总量）
yield { kind: 'run_summary', totalPromptTokens: 5678, totalCompletionTokens: 123, peakPromptTokens: 5000, iterations: 3 };
```

**为什么派生不替代源？**

1. provider SDK 的 usage 是事实标准（计费、cache read/write 都从这取）
2. count_tokens API 是**独立的 API 调用**，可能失败（best-effort）——派生不能比源更脆弱
3. run_summary 是终止态的"快照"，给前端 HeaderPill 用（实时更新）

> **教学点**：任何派生字段都应该有"源"。"派生绝不能替代源"是 CLAUDE.md "第一原则"的延伸 —— 消灭 if 兜住的条件，而是让源稳定。

### 2. best-effort 派生的纪律 — count_tokens 失败不卡死 agent

`countContextTokens` 任何失败都返回 `undefined`，**绝不 throw**：

```ts
try {
  // ... call Anthropic client.messages.countTokens
} catch (err) {
  console.warn('[countContextTokens] failed:', err instanceof Error ? err.message : String(err));
  return undefined;  // ← 关键：失败不抛
}
```

**三次失败路径都被静默吞掉**：
- 未知 model → `getModelMeta` 返回 undefined → 直接 return
- `ANTHROPIC_API_KEY` 未设 → 提前 return
- SDK 抛错（网络 / 4xx / 超时）→ catch → return undefined

**为什么必须吞？**

派生指标是**可选观察**。如果 `count_tokens` 失败但 `chat/stream` 正常，agent 还能跑。**让指标 bug 阻断主流程 = 违反"YAGNI 消灭 if 存在的条件"**。

> **教学点**：best-effort 派生 = 把"派生路径"和"主路径"完全隔离。try/catch 是隔离手段，但**catch 块必须 return undefined 而不是 rethrow**。

### 3. AgentEvent 扩展是 additive — 12 kind 的扩展策略

```ts
type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | { readonly kind: 'request'; readonly iteration: number; readonly messages: ReadonlyArray<Message> }
  | { readonly kind: 'response'; readonly iteration: number; readonly content?: string; readonly toolCalls?: ReadonlyArray<ToolCallData>; readonly usage?: ChatUsage }
  | { readonly kind: 'message_delta'; readonly content: string }
  | { readonly kind: 'context'; readonly iteration: number; readonly promptTokens: number; readonly limit: number }  // 🆕
  | { readonly kind: 'tool_call'; ... }
  | { readonly kind: 'tool_result'; ... }
  | { readonly kind: 'message_end'; readonly content: string }
  | { readonly kind: 'run_summary'; readonly totalPromptTokens: number; readonly totalCompletionTokens: number; readonly peakPromptTokens: number; readonly iterations: number }  // 🆕
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
```

**关键不变量**：
- 加新 variant **不改任何已有 variant**（字段名 / 类型 / 顺序）
- `isAgentEvent` 类型守卫在 `apps/web/src/api/agentClient.ts` 同步扩展
- 消费方用 `switch (ev.kind)` 时 TS 自动收窄，老的 default case 仍然工作

> **教学点**：判别联合（discriminated union）扩 variant 是 *additive* 行为。**不会破坏老消费方**。这把"协议演化"的爆炸面从"全网改"降为"新消费方加 case"。

### 4. run_summary 必须在所有 error 路径前 yield — 行为契约

Day 07 加了 `error` 事件代替 throw，Day 08 加 `run_summary` 时**必须**在每条 error 路径前 yield 一次：

```ts
// ✅ 正确
if (signal?.aborted) {
  yield { kind: 'run_summary', ... };  // partial 累加
  yield { kind: 'error', message: 'aborted by signal' };
  return;
}

// ❌ 错误（漏了 run_summary）
if (signal?.aborted) {
  yield { kind: 'error', message: 'aborted by signal' };
  return;
}
```

**spec 原文**：
> `run_summary` 在 `message_end` / `error` 之前 yield 一次（success 路径）
> `run_summary` 在 `error` 之前也 yield 一次（partial 累加）

**为什么 partial 累加也有意义？**

前端 HeaderPill 在 `run_summary` 事件到达时更新一次 "partial peak: 3.2K / 200K"。用户看到 "aborted by signal" 时也看到这个数字，**让人知道走到哪了**。

> **教学点**：行为契约在 spec 文档里写明 = "这里必须 yield X"。代码评审时 reviewer 会查每个终止路径。**Day 08 第一次 review 漏 2 个 error 路径，被 reviewer 抓出 → dispatch fix subagent → 5 个 error 路径全部覆盖**。

### 5. Tailwind 4 + Vue 3 SFC 共存 — 渐进式迁移策略

`@tailwindcss/vite` 插件 + `@import "tailwindcss"` 一行搞定，**无 PostCSS 配置**：

```ts
// apps/web/vite.config.ts
plugins: [vue(), tailwindcss()]

// apps/web/src/styles.css
@import "tailwindcss";
/* 旧 :root 变量保留 —— 兼容旧组件 */
:root { --bg: #0f1115; ... }
```

**组件级策略**：
- **新组件** (`HeaderPill.vue`, `MetricsSidebar.vue`)：纯 Tailwind utility classes，**无 `<style>` block**
- **旧组件** (`Conversation.vue`, `Timeline.vue`, `InputBar.vue`)：保留 scoped CSS，**不动**

```vue
<!-- 新组件：纯 utility -->
<template>
  <div class="flex items-center gap-3 px-4 py-2 bg-zinc-900 text-zinc-100 text-sm rounded-md">
```

```vue
<!-- 旧组件：保留 scoped -->
<style scoped>
.conversation-bubble { ... }
</style>
```

**为什么渐进式？**

- 一次性重写 3 个组件 = 24 小时内"美但不工作"风险
- 渐进式 = 新组件立刻收益（Tailwind 写起来快），旧组件稳如山
- YAGNI 兑现："未来要不要统一？等真统一时再统一"

> **教学点**：技术栈迁移不是一刀切。**新组件用新栈 + 旧组件留旧栈 = 渐进式**。 等业务稳定 + 团队 ready 之后才能统一。

### 6. 单一 `data-iteration` 锚点 — scroll-to-iteration 的实现

Final review 抓出的 Important：scroll-to-iteration "wired but non-functional"。

**为什么 `querySelector('[data-iteration="N"]')` 找不到？**

```vue
<!-- Timeline.vue 当前渲染 -->
<TimelineItemVue :title="..." :detail="..." :status="..." :kind="..." />
<!-- 没有 data-iteration 属性 -->
```

**修法**：在 `App.vue` 维护 `iterationToTimelineId: Map<number, number>`，在 `request` 事件触发时记录映射：

```ts
case 'request': {
  const timelineId = timelineIdCounter++;
  iterationToTimelineId.set(ev.iteration, timelineId);
  createTimelineEntry(`LLM Request · ${ev.iteration}`, ..., 'request', { iteration: ev.iteration, ... });
  break;
}

function scrollToIteration(n: number): void {
  nextTick(() => {
    const timelineId = iterationToTimelineId.get(n);
    if (timelineId !== undefined) {
      const el = document.querySelector(`[data-timeline-id="${timelineId}"]`);
      if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
```

**为什么不用 `data-iteration` 直接挂在 Timeline 元素？**

- Timeline 可能有多条 event 对应同一 iteration（response, context, ...）→ 用 `data-iteration` 会 hover 到 "随便哪条"
- 用 `data-timeline-id` 精准锚点 = "跳到 LLm Request 那条"

> **教学点**：**"wired but non-functional"** 是最危险的 bug 类型 —— 代码看起来完整，UI 没崩溃，但功能从来不工作。Day 08 final review 抓出来 = spec 条款不能少。

---

## ⚠️ 今日踩坑

### 1. Generators don't get exhaustiveness-checked

**症状**：Task 4 加 `context` / `run_summary` 两种新 kind，期待 `pnpm typecheck` 报 "agent.ts 没 yield 新 kind" 错误 → 实际 0 错误。

**根因**：`async *runEvents(...)` 是 generator yielding literal-kind objects，TS 不对 generator 做 exhaustiveness check——加新 variant 后，老 generator 即使不 yield 新 kind，类型依然 valid。

**修法**：依赖"行为正确性"而不是"类型推断"。Task 5 任务就是显式 add yield sites。

**Why**：spec "加新 event" 的实现路径 = ① AgentEvent 联合加新 variant（purely additive）→ ② generator 添加 yield site（手动）。两步独立，类型系统验证不了第二步。

> **学习**：类型系统验证的是"调用端能处理所有 kind"，不是"源端 yield 了所有 kind"。**派生类型系统的能力边界，比想象的小**。

### 2. run_summary 漏 4 个 error 路径 —— 反例带来的启示

**症状**：Task 5 第一版只 yield `run_summary` 在 `maxIterations` 错误前。Reviewer 抓到：还有 4 个 error 路径（3 个 signal abort + 1 个 chat/stream exception）漏 yield。

**根因**：写 happy path + maxIterations 2 个终止 case 时，**没枚举完所有终止 case**：
- success (content) → message_end ✓
- success (empty) → message_end ✓
- maxIterations → error ✓
- chat/stream exception → error ✗
- signal abort (iter start) → error ✗
- signal abort (after chat) → error ✗
- signal abort (in stream) → error ✗

**修法**：dispatch fix subagent 加 4 个 `run_summary` yields。

**Why**：agent.ts:119-228 的 runEvents 是 153 行函数，5 条终止路径散落各处。**枚举所有终止路径的唯一方法 = 读整段，写全一遍**。

> **学习**：行为变更类 task（Day 07 error yield、Day 08 run_summary 扩展）必须**明示所有终止 case**。Reviewer 兜底 = 一次性抓全。

### 3. tests/apps/api/trace-collector.test.ts 没自动更新

**症状**：Task 9 + Task 15 跑全套测试，发现 `trace-collector.test.ts:81` 失败 —— 硬编码的 kind 数组没加 `run_summary`。

**根因**：Day 07 写 test 时没把"未来加新 kind 时必须更新这里"写进注释。Day 08 加 `run_summary` 后，**这条测试默默腐化**。

**修法**：Task 15 regression sweep 时由 reviewer 抓到，加 `run_summary` 到 hard-coded 数组 + 更新 meta 断言（`context` 字段不该空了）。

**Why**：硬编码的 kind 序列 = 协议契约的"反面记录"。**任何时候扩 AgentEvent union，都必须搜 "kinds.toEqual" / "kinds.map" 类型的代码**。

> **学习**：golden test 用 `expect(kinds).toEqual([...])` 是 blessing（防意外扩张）+ curse（声名漂移）。**最稳的写法是 `kinds.includes('run_summary')` 而不是 `kinds === [...]`**，但目前这条没改。

### 4. pnpm-lock.yaml 第一次没 commit

**症状**：Task 10 implementer 跑 `pnpm add -D tailwindcss@^4 @tailwindcss/vite@^4`，但只 commit 了 `package.json` + 3 个 config 文件，**漏了 pnpm-lock.yaml**。

**根因**：Brief 的 git add 列表只列了 4 个文件，没列 lockfile。

**修法**：手动 `git add pnpm-lock.yaml && git commit` 跟上。

**Why**：pnpm-lock.yaml 是**依赖图的真相源**。package.json 写 `^4`，lockfile 写 `4.1.4`。CI 跑 `pnpm install --frozen-lockfile` 会校验 lockfile。如果 lockfile 没 commit，CI 拿到的是"latest 4.x"，可能跟本地不一致。

> **学习**：deno / pnpm / npm 装任何 deps → 必带 lockfile。**Day 09+ 装 deps 都检查 lockfile 是否进 git**。

### 5. `scroll-to-iteration` wired but non-functional

**症状**：Final review 抓到。"emits scroll-to-iteration → App.vue 监听 → querySelector 无果 → scrollIntoView 不触发 → 静默失败"。

**根因**：Brief 写了 `scrollToIteration` 函数 + emit 链，但没明确"Timeline.vue 元素要加 `data-iteration` 属性"。**功能链断了最后一步**。

**修法**：Fix commit `555e722` 在 App.vue 新增 `iterationToTimelineId: Map<number, number>`，在 `request` 事件时记录映射，scrollToIteration 用 `data-timeline-id` 锚点。

**Why**：**spec §4.2 写了 "点击 iteration 行 → emit scroll-to-iteration → App.vue 滚动 Timeline"**，但实现端只接了一半。这是"wired but non-functional" bug —— 编译过、跑起来、UI 不报错，但功能永远不触发。

> **学习**：UI 互动的功能链 = 4 步（emit → handler → DOM selector → scroll API）。**每一步单独验证** = 验收清单的最小单元。

---

## 📋 验收清单

- [x] `countContextTokens` 抽象 + Anthropic 适配 + 失败降级（永远 return undefined）
- [x] `MODELS` 注册表 6 个 model（claude-opus-5 / sonnet-5 / haiku-4-5 / gpt-4o / gpt-4o-mini / gpt-4-turbo）
- [x] `AgentEvent` 10 → 12 kind（加 `context` + `run_summary`，不破老消费方）
- [x] `AgentOptions.model` 字段 + `runEvents` 在请求前 yield `context`（best-effort，失败/未知 model 不 yield）
- [x] `runEvents` 在 `message_end` + **5 个 error 路径** 都 yield `run_summary`
- [x] `apps/api/server.ts` 在 `run_summary` 时 `addMeta({ context: { peakPromptTokens, iterations } })`
- [x] `apps/web` 集成 Tailwind 4（`@tailwindcss/vite` + `@import "tailwindcss"`，无 PostCSS 配置）
- [x] `HeaderPill.vue` / `MetricsSidebar.vue` 用 Tailwind utility classes（无 scoped CSS）
- [x] `App.vue` 三栏布局 `grid-cols-[240px_1fr_360px]` + 接 HeaderPill + MetricsSidebar
- [x] `isAgentEvent` 类型守卫扩展（12 kind）
- [x] 10 个 example 文件 `new Agent({ ..., model })` 加 model 字段
- [x] `pnpm typecheck` 0 error
- [x] `pnpm typecheck:web` 0 error（bonus fix：Timeline.vue exactOptionalPropertyTypes）
- [x] `pnpm test` **70 / 70 passed**（Day 07 74 + Day 08 -4 老 stub + Day 08 添加的部分）
- [x] `pnpm exec vite build` PASS（Tailwind 8.89 kB CSS 生成）
- [x] Cost / USD / latency / cache hit / 持久化 / OpenAI count_tokens **全 YAGNI**
- [x] `scroll-to-iteration` 修复（querySelector 找 `data-timeline-id` 而非 `data-iteration`）
- [x] `barColor` 80% 边界 off-by-one 修复（用 `<= 80` 而非 `< 80`）
- [x] 已 push 到 origin/master (`0e72eeb..555e722`)

---

## 🆕 与 Day 07 复盘路线对照

| Day 07 复盘路线 | Day 08 状态 |
|---|---|
| Context Window 观测 | ✅ **Day 08 完成**（`context` + `run_summary` 事件 + HeaderPill + MetricsSidebar） |
| Tailwind 集成 | ✅ **Day 08 完成**（`@tailwindcss/vite` + 2 个新组件） |
| 多轮对话历史 | ⏳ 推迟到 Day 09+ |
| 持久化 Trace | ⏳ Day 10+ |

**Day 08 完成"把 Day 07 的 meta 扩展点用上" + 一次 UI 技术栈换血**：

1. `meta.context` 字段落地（`peakPromptTokens` + `iterations`）
2. 前端 HeaderPill 实时显示 token / 进度条 / 颜色
3. MetricsSidebar 每次 iteration 一行 + 累计
4. Tailwind 4 集成（`@tailwindcss/vite`）

**关键技术债**：

```
+ 新增 libs/llm/observability/ 模块 —— 维护成本 低，3 年存活率 高
+ 新增 MODELS 注册表（6 model） —— 维护成本 低，3 年存活率 中（价格变动需更新）
+ 新增 countContextTokens 抽象 —— 维护成本 低，3 年存活率 高
+ 新增 context / run_summary event kinds —— 维护成本 低，3 年存活率 高
+ 新增 Tailwind 4 集成 —— 维护成本 中（Tailwind 版本可能带来 breaking class），3 年存活率 高
+ 新增 HeaderPill + MetricsSidebar 组件 —— 维护成本 中，3 年存活率 高
+ 新增 scroll-to-iteration 互动 —— 维护成本 低，3 年存活率 高
+ 新增 19 commits —— 维护成本 中，3 年存活率 高
+ 修复 5 个 error 路径遗漏 run_summary —— 维护成本 低，3 年存活率 高
+ 修复 trace-collector.test.ts 硬编码数组 —— 维护成本 低，3 年存活率 高
+ 修复 pre-existing Timeline.vue exactOptionalPropertyTypes —— 维护成本 低，3 年存活率 高
净增：+11 能力 / -0 重复
反驳记录：
  - Cost / pricing 砍掉（价格表爆炸面 + 币种精度 + stale 风险）—— spec 已 ack
  - Performance 维度（latency / cache）—— 留 Day 09+，spec §2.2 已划
  - callChain.ts 死代码（switch default: break）—— grep 没人调用，no impact
  - .eslintignore 缺 dist/ —— pre-existing，不在 Day 08 scope
```

---

## 🚀 Day 09 预告

**推荐**：多轮对话历史（Day 06 复盘路线标 Day 09+，前置条件已全部就绪）。

**核心课题**：
- `Conversation` 类（messages: Message[] 持久化）
- session 隔离（按 sessionId 区分，按天 / 按用户）
- Web UI scrollback（不每次 send 清空 conversation）
- 与 Day 07 signal + Day 08 context 配合

**前置条件全部就绪**：
- ✅ AbortSignal（Day 07）
- ✅ message_delta 流式（Day 07）
- ✅ error yield 终止态（Day 07）
- ✅ response.usage 累积（Day 07）
- ✅ context / run_summary 观测（Day 08）
- ✅ HeaderPill + MetricsSidebar（Day 08）

**关键决策待 ack**：
1. 持久化策略（in-memory session vs localStorage vs server-side）
2. session ID 传递方式（cookie / URL param / body field）
3. message ID 体系（要不要给每条 message 唯一 ID 用于 deduplication）
4. AbortSignal 跨 turn 行为（同一 turn 内 abort 全部 message，还是 abort 当前 turn）
5. context / run_summary 在多轮场景下是否需要"按 turn 拆分"（Day 08 当前是按 run 累计，多轮后 run 怎么定义？）

---

## 🔗 相关引用

- 设计 spec：[docs/superpowers/specs/2026-07-28-day08-context-and-cost-observability-design.md](../superpowers/specs/2026-07-28-day08-context-and-cost-observability-design.md)
- 实施 plan：[docs/superpowers/plans/2026-07-28-day08-context-window-tailwind.md](../superpowers/plans/2026-07-28-day08-context-window-tailwind.md)
- SDD 进度：[.superpowers/sdd/progress.md](../../.superpowers/sdd/progress.md)
- 全局约束：[CLAUDE.md](../../CLAUDE.md) — "内部统一使用 AgentEvent，对外统一通过 SSE 传输 AgentEvent"
- Day 07 笔记：[day07.md](day07.md) — AgentEvent 10 kind / signal / error yield 来源
- Day 06 笔记：[day06.md](day06.md) — TraceCollector / snapshot 语义来源
- 复盘路线：[docs/review/2026-07-22-day01-05-architecture-review.md](../review/2026-07-22-day01-05-architecture-review.md)
- Day 01-07 复盘：[docs/review/2026-07-27-day01-07-seven-day-retrospective.md](../review/2026-07-27-day01-07-seven-day-retrospective.md)
- 代码锚点：
  - [libs/llm/observability/models.ts](../../libs/llm/observability/models.ts) — MODELS 注册表
  - [libs/llm/observability/context-counter.ts](../../libs/llm/observability/context-counter.ts) — countContextTokens
  - [libs/agent/event.ts](../../libs/agent/event.ts) — 12 kind 联合
  - [libs/agent/agent.ts](../../libs/agent/agent.ts) — runEvents 全 5 终止路径
  - [apps/api/src/server.ts](../../apps/api/src/server.ts) — run_summary → addMeta
  - [apps/web/src/components/HeaderPill.vue](../../apps/web/src/components/HeaderPill.vue) — 实时进度条
  - [apps/web/src/components/MetricsSidebar.vue](../../apps/web/src/components/MetricsSidebar.vue) — per-iteration 柱状条
  - [apps/web/src/App.vue](../../apps/web/src/App.vue) — 三栏布局 + 新事件路由
  - [apps/web/tailwind.config.ts](../../apps/web/tailwind.config.ts) — Tailwind 4 content paths

---

> 教学点：今天的 5 个踩坑都是"行为契约"型 —— **类型系统验证不了的、reviewer 才能抓的、写代码时容易漏的**。spec 文档把这些写明 + reviewer 兜底 + tests 覆盖 = 完整的合同网。
