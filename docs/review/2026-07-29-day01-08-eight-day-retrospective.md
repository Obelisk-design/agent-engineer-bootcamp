# Day 01–08 八天深度复盘 — 2026-07-29

> 65 天 AI Agent 工程师训练营 · 第 3 篇 review（5 天 / 7 天 / 8 天节奏）
>
> 目的：在 [day01-05](2026-07-22-day01-05-architecture-review.md) 与 [day01-07](2026-07-27-day01-07-seven-day-retrospective.md) 的基础上，聚焦 **Day 07-08 新增**（Streaming + AbortSignal + Usage + Context Window 观测 + Tailwind 集成），用 STAR 法则整理 4 个亮点故事。
>
> 数据源优先级：**git commit > day docs > 当前代码**。

---

## 📊 一览

| 维度 | 数据 |
|---|---|
| 学习天数 | 8 / 65 |
| 累计 commit | 107 |
| 总测试 | **70 / 70 通过**（Day 08 末态） |
| 引入新依赖 | 4（`openai` / `@anthropic-ai/sdk` / `hono` + `@hono/node-server` / `tailwindcss` + `@tailwindcss/vite`） |
| 触发的 YAGNI 边界 | 多轮历史 / 持久化 / RAG / MCP / 多 Agent / WebSocket / parallel tool / streaming tool_call / latency-cost / schema validation / Cost-USD / OpenAI count_tokens |
| 守住的核心原则 | ChatClient 抽象 / 判别联合 / 单向依赖 / snapshot 语义 / source vs derived 双写 / best-effort 派生 |
| AgentEvent kind 数 | 7 → 10 → 12（每加一种都走修改五问 + ADR 路径） |
| 临时 API 残留 | 0（`onIteration` Day 04 加 / Day 05 删 / `chatWithTools` Day 04 加 / Day 04 末删） |

---

## 📌 8 天路线总览

> 用 **commit + 演进** 双时间线还原"每天解决什么问题"。day01-06 简略（详见 [day01-07 §1](2026-07-27-day01-07-seven-day-retrospective.md#1-七天路线总览)）；**day07-08 详细展开**（本次 review 重点）。

### Day 01 — 工程脚手架 + 第一个 LLM 调用

- **代码产物**：`pnpm-workspace.yaml` + `tsconfig.json`（strict + NodeNext + ES2023）+ `examples/day01/ex_001_chat_completion.ts` + CI matrix + Husky pre-commit
- **关键 commit**：`839ab30` / `17ea51b` / `5385d6b` / `5a06243`
- **一句话总结**：立 monorepo + 真实 LLM smoke test 工作流。详见 [day01-07 §1 Day 01](2026-07-27-day01-07-seven-day-retrospective.md#day-01-工程脚手架-第一个-llm-调用)。

### Day 02 — ChatClient 抽象 + 多 Provider

- **代码产物**：`libs/llm/{message,chat-client,openai-chat-client,anthropic-chat-client,index}.ts`
- **关键 commit**：`c851ad8` / `0e6bf1f` / `fef2331` / `a7bb68f`
- **一句话总结**：抽象 ≠ 给 SDK 换名字，调用方"换 provider 零改动"。详见 [day01-07 §1 Day 02](2026-07-27-day01-07-seven-day-retrospective.md#day-02-chatclient-抽象-多-provider)。

### Day 03 — Streaming（additive，不 replace）

- **代码产物**：`libs/llm/chat-client.ts` 加 `stream(messages): AsyncIterable<string>` + OpenAI/Anthropic 实现 + `toApiMessages()` helper
- **关键 commit**：`471469c` / `4628c01` / `b228718` / `c1e8696` / `7987bac`（抽 helper，review 抓 duplication）
- **一句话总结**：add `stream()` 赢改 `chat()` 返回 AsyncIterable —— Day 02 调用方 0 行修改。详见 [day01-07 §1 Day 03](2026-07-27-day01-07-seven-day-retrospective.md#day-03-streamingadditive不-replace)。

### Day 04 — Agent Loop + Tool Calling

- **代码产物**：`libs/tools/{tool,tool-registry,calculator-tool}.ts` + `libs/agent/agent.ts` + ChatRequest/ChatResponse 统一
- **关键 commit**：`223745c` / `ca9452c` / `3ff54dd`（删 chatWithTools）+ `2585449`（ToolDefinition 上移）+ `32a8ddda`（Agent loop）
- **一句话总结**：普通聊天和工具调用是同一种能力的不同输入，加字段不加方法。详见 [day01-07 §1 Day 04](2026-07-27-day01-07-seven-day-retrospective.md#day-04-agent-loop-tool-calling)。

### Day 05 — AgentEvent + SSE + Web UI（三阶段交付）

- **代码产物**：`libs/agent/event.ts`（AgentEvent 7 kind）+ `apps/api/{server,sse-adapter}.ts` + 单 HTML Web UI
- **关键 commit**：`09d5589`（CLAUDE.md 协议指令）+ `3e12fd2`（AgentEvent + drop onIteration）+ `7310645`（SSE）+ `a906335`（扩 request/response）+ `a292fdd`（ADR-0001）
- **一句话总结**：判别联合替代平铺 optional + runEvents() 是 run() 真子集 + ADR-0001 三层职责分离。详见 [day01-07 §1 Day 05](2026-07-27-day01-07-seven-day-retrospective.md#day-05-agentevent-sse-web-ui三阶段交付)。

### Day 06 — CI Smoke Test + Trace Collector

- **代码产物**：`tests/libs/agent/shared/fake-chat-client.ts` + `apps/api/src/trace-collector.ts`（LRU 32）+ `GET /traces/:runId`
- **关键 commit**：`3ee7ebd`（抽 FakeChatClient）+ `9be48b4`（端到端测试）+ `70bd23b`（docs）+ `a5fed60`（TraceCollector + snapshot）
- **一句话总结**：Runtime 零感知 Trace 存在 + snapshot 语义（yield 时深拷贝累积型数据）。详见 [day01-07 §1 Day 06](2026-07-27-day01-07-seven-day-retrospective.md#day-06-ci-smoke-test-trace-collector)。

### Day 07 — Streaming Content + AbortSignal + Usage ⭐ 详细见 §3

- **代码产物**：`ChatOptions { signal? }` + `ChatUsage` + `message_delta` kind（10 kind）+ signal 透传 + error yield + final-answer iter stream
- **关键 commit**：12 commit，4 Phase A/B/C/D + `ac369d5` / `1009656` / `765a2be` / `fe9804e` / `1cae03b` / `0ff83aa` / `badd1c4`
- **一句话总结**：Day 06 留的 4 个悬挂契约收口，error throw → yield，ChatResponse.usage 是 source，Trace.meta.usage 是 derived。
- **演进细节**：见 §3

### Day 08 — Context Window 观测 + Tailwind CSS 集成 ⭐ 详细见 §4

- **代码产物**：`libs/llm/observability/{models,context-counter}.ts` + `context` / `run_summary` kind（12 kind）+ `AgentOptions.model` + `HeaderPill.vue` / `MetricsSidebar.vue`（Tailwind）
- **关键 commit**：19 commit，5 Phase 1-5，`6e77435` / `fe2b0e9` / `f35aff9` / `3b8f975` / `0491590`（fix 5 error 路径）/ `d102b58`（Tailwind）/ `9f99f5e`（三栏 UI）/ `555e722`（scroll-to-iteration fix）
- **一句话总结**：source vs derived 双写落地（meta.context）+ best-effort 派生（count_tokens 失败不抛）+ 渐进式 UI 技术栈迁移。
- **演进细节**：见 §4

## 🆕 Day 07 — Streaming Content + AbortSignal + Usage 详细演进

### 学习目标

收口 Day 06 留下的 4 个悬挂契约：

1. **AbortSignal 进 ChatClient 契约层** —— 抽象层跟数据走，signal 沿调用链透传
2. **error throw → yield** —— 所有错误统一 yield error 事件，消费方不 catch
3. **message_delta 限定 final-answer iter** —— tool_calls iter 不流式，中间态不噪声
4. **Token Usage 双写** —— ChatResponse.usage 是 source，Trace.meta.usage 是 derived

### 代码产物

- `libs/llm/chat-client.ts` 加 `ChatOptions { signal? }` + `ChatUsage`
- `libs/llm/openai-chat-client.ts` / `anthropic-chat-client.ts`：signal 透传 + usage parse
- `libs/agent/event.ts` 加 `message_delta` kind（**10 kind**）+ `response.usage?` optional
- `libs/agent/agent.ts` 加 signal + **error throw → yield** + final-answer iter 切 `stream()` + usage 累积
- `apps/api/src/trace-collector.ts` 加 `addMeta(runId, partial)`
- `apps/api/src/server.ts`：AbortController + 监听 `request.signal` + meta usage 写入 + 删 try/catch
- `apps/api/src/web/index.html`：打字机 streaming bubble + ▍ 光标 + `finalizeStreamingBubble`
- Day 04 demos 加 usage 打印 + 流式输出
- `examples/day07/ex_001_streaming_agent_openai.ts` / `ex_002_streaming_agent_anthropic.ts`
- `run-events.test.ts` 加 5 个新场景（signal / error / streaming / usage）

### 关键 commit 链路（12 commit）

| Phase | Commit | 内容 |
|---|---|---|
| A 抽象层 | `ac369d5` | feat(day07): add signal and usage to ChatClient interface |
| A 抽象层 | `1009656` | feat(day07): openai provider signal and usage support |
| A 抽象层 | `765a2be` | feat(day07): anthropic provider signal and usage support |
| B Agent 层 | `fe9804e` | feat(day07): add message_delta kind and response.usage to AgentEvent |
| B Agent 层 | `1cae03b` | feat(day07): agent signal, error yield, streaming, and usage |
| C 消费层 | `79e2a89` | docs(day07): SSE adapter handles message_delta and usage |
| C 消费层 | `ac08230` | feat(day07): trace collector addMeta for partial meta merge |
| C 消费层 | `0ff83aa` | feat(day07): server AbortController, signal, and meta usage |
| D UI & demos | `090922a` | feat(day07): web ui typewriter and streaming bubble |
| D UI & demos | `b200d2f` | refactor(day07): day 04 demos print usage and stream message_delta |
| D UI & demos | `520a942` | feat(day07): streaming agent demos for both providers |
| D UI & demos | `badd1c4` | test(day07): signal abort, error yield, streaming chunks, usage scenarios |

### 演进说明（5 条关键不变量 / 决策）

#### 1. AbortSignal 进 ChatClient 契约层（ADR-011）

`Day 02` 立 ChatClient 时定“抽象层跟数据走”。Day 03 思考题 #3 留了“signal 应该进 ChatClient 还是 apps/api adapter”未答。**Day 07 答：ChatClient 契约层加 `ChatOptions { signal? }`**。

- 抽象层有 signal → provider 透传给 SDK → SDK 终止请求 → 已发 token 不浪费
- 抽象层无 signal → 消费方只能 break iterator，不能取消已发请求 → 流式 token 计费痛点
- 不放 Agent 配置：Agent 是长期对象（构造一次用多次），signal 是单次执行的上下文（每次 fetch 独立 AbortController）

调用链：`Browser fetch → request.signal → apps/api AbortController → Agent.runEvents({signal}) → chat/stream({signal}) → SDK`。

#### 2. error throw → yield（行为变更，ADR-012）

`Day 06` 决策点留了 “error throw vs yield” 未决。`Day 07` 拍板：**所有错误统一 yield error 事件**。

```ts
if (signal?.aborted) yield { kind: 'error', message: 'aborted by signal' };
try { ... } catch (err) { yield { kind: 'error', message: ... }; }
yield { kind: 'error', message: `exceeded ${max} iterations ...` };
```

`Agent.run()` 保持向后兼容：

```ts
async run(userInput: string, options?: AgentRunOptions): Promise<string> {
  for await (const ev of this.runEvents(userInput, options)) {
    if (ev.kind === 'message_end') return ev.content;
    if (ev.kind === 'error') throw new Error(ev.message);
  }
  return '';
}
```

- 消费方统一不 catch（`for await` 看不到 throw 就接住）
- 协议层错误（HTTP 400）走 HTTP status，业务层错误走 SSE event —— 边界清晰
- 跟 `done` 互斥：error 后不发 done，success 才发 done

#### 3. message_delta 限定 final-answer iter

tool_calls iter 不流式（仍走 request/response 事件），仅 final-answer iter 流式 yield `message_delta`。**Claude Code 风格**：“AI 想 → 调工具 → 看结果 → 打字机答”。中间态 assistant 流式 = 信息噪声。

#### 4. Token Usage 双写（source vs derived）

- `ChatResponse.usage` 是事实源（provider SDK 返回的）
- `TraceCollector.meta.usage` 是派生（apps/api 层累积多轮之和）
- **Agent Runtime 不感知 Trace 存在** —— Trace 是消费方关注的事，Agent 只 yield 事件，apps/api 层决定怎么累积

#### 5. chat + stream 双重调用的代价

final-answer iter 双重 LLM 调用 = 双重 token 计费。Day 07 选简化方案（chat 探测 + stream 流式）。**Day 10+ 优化方向**：单次 stream + 在 ChatChunk 加 `usage?` optional —— **今天不引入**（YAGNI，知道 generator return value 拿不到后，"接受 cost 先收口契约"是正确的简化方案）。

## 🆕 Day 08 — Context Window 观测 + Tailwind CSS 集成 详细演进

### 学习目标

把 Day 07 留下的 `meta` 扩展点用上 —— 实时观测每次 LLM 调用的 prompt token / context limit 占比；同时引入 Tailwind 4 给 Agent Console 换 UI 技术栈。

### 代码产物（精简版）

- `libs/llm/observability/{models,context-counter,index}.ts`（MODELS 注册表 6 model + countContextTokens best-effort）
- `libs/agent/event.ts` 加 `context` + `run_summary` 两种 kind（**10 → 12 kind**）
- `libs/agent/agent.ts` `AgentOptions.model` 字段 + 在每次 chat 前 yield `context` + 5 个 error 路径都 yield `run_summary`
- `apps/api/src/server.ts` 在 `run_summary` 时 `addMeta({ context: { peakPromptTokens, iterations } })`
- `apps/web` 集成 Tailwind 4（`@tailwindcss/vite` + `@import "tailwindcss"`，无 PostCSS 配置）
- `apps/web/src/components/{HeaderPill,MetricsSidebar}.vue`（Tailwind utility classes，无 `<style>` block）
- `apps/web/src/App.vue` 三栏布局 `grid-cols-[240px_1fr_360px]`
- `apps/web/src/api/agentClient.ts` `isAgentEvent` 类型守卫扩展（12 kind）
- 10 个 example 文件 `new Agent({ ..., model })` 加 model 字段

详见 [day08.md §📦 今日产出物](../daily/day08.md#-今日产出物)（完整版表格）。

### 关键 commit 链路（19 commit，5 Phase）

| Phase | Commit | 内容 |
|---|---|---|
| 1 抽象层 | `6e77435` | feat(observability): add MODELS registry with contextLimit |
| 1 抽象层 | `fe2b0e9` | feat(observability): add countContextTokens with anthropic adapter |
| 1 抽象层 | `daf27c1` | feat(observability): export from libs/llm barrel |
| 2 Agent 层 | `f35aff9` | feat(agent): add context + run_summary event kinds |
| 2 Agent 层 | `3b8f975` | feat(agent): yield context + run_summary events |
| 2 Agent 层 | `0491590` | fix(agent): yield run_summary before all error paths |
| 2 Agent 层 | `e685221` | test(agent): update run-events for context + run_summary kinds |
| 3 应用层 | `5ea5e00` | feat(examples): pass model to Agent constructor |
| 3 应用层 | `47f1725` | feat(api): write run_summary context to TraceCollector meta |
| 3 应用层 | `1d7cbaf` | test(api): assert meta.context in end-to-end e2e |
| 4 UI 层 | `d102b58` | feat(web): integrate tailwind css via @tailwindcss/vite |
| 4 UI 层 | `d072260` | chore: update pnpm-lock.yaml for tailwindcss + @tailwindcss/vite |
| 4 UI 层 | `fd622b1` | feat(web): add HeaderPill vue component |
| 4 UI 层 | `0fe59a9` | feat(web): add MetricsSidebar vue component |
| 4 UI 层 | `9f99f5e` | feat(web): render HeaderPill + MetricsSidebar + three-column layout |
| 4 UI 层 | `c8bd5ac` | fix(test): narrow possibly undefined latestTrace in e2e assertion |
| 5 修复合 | `0e72eeb` | test(api): add run_summary to trace-collector expected kinds |
| 5 修复合 | `555e722` | fix(web): wire scroll-to-iteration + barColor threshold + run_summary test |
| 5 修复合 | `6210ea1` | docs(day08): document new pnpm run dev:day08 workflow |

### 演进说明（6 块）

#### 1. 派生 vs 源 —— provider 是 source，context/cost 是 derived

`AgentEvent` 12 kind 里，`response.usage` 是**源**（provider SDK 返回），`context` / `run_summary` 是**派生**（从源推导）。

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
2. count_tokens API 是**独立的 API 调用**，可能失败（best-effort）—— 派生不能比源更脆弱
3. run_summary 是终止态的"快照"，给前端 HeaderPill 用（实时更新）

> **教学点**：任何派生字段都应该有"源"。"派生绝不能替代源"是 CLAUDE.md "第一原则"的延伸 —— 消灭 if 兜住的条件，而是让源稳定。

详见 [§6](#核心概念复习day-07-08-增量) 核心概念复习。

#### 2. best-effort 派生的纪律 —— count_tokens 失败不卡死 agent

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

**为什么必须吞？** 派生指标是**可选观察**。如果 `count_tokens` 失败但 `chat/stream` 正常，agent 还能跑。**让指标 bug 阻断主流程 = 违反"YAGNI 消灭 if 存在的条件"**。

> **教学点**：best-effort 派生 = 把"派生路径"和"主路径"完全隔离。try/catch 是隔离手段，但 **catch 块必须 return undefined 而不是 rethrow**。

详见 ADR-013（[§7](#重要设计决策adr-增量)）。

#### 3. AgentEvent 扩展是 additive —— 12 kind 的扩展策略

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

#### 4. run_summary 必须在所有 error 路径前 yield —— 行为契约

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

**5 个 error 路径全部覆盖**（fix 前的初版漏 4 个，被 reviewer 抓出 → dispatch fix subagent 补全）：

- success (content) → message_end
- success (empty) → message_end
- maxIterations → error
- chat/stream exception → error
- signal abort (iter start) → error
- signal abort (after chat) → error
- signal abort (in stream) → error

> **教学点**：行为变更类 task（Day 07 error yield、Day 08 run_summary 扩展）必须**明示所有终止 case**。Reviewer 兜底 = 一次性抓全。

#### 5. Tailwind 4 + Vue 3 SFC 共存 —— 渐进式迁移策略

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

详见 ADR-015（[§7](#重要设计决策adr-增量)）。

#### 6. 单一 `data-timeline-id` 锚点 —— scroll-to-iteration 的实现

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
- 用 `data-timeline-id` 精准锚点 = "跳到 LLM Request 那条"

> **教学点**：**"wired but non-functional"** 是最危险的 bug 类型 —— 代码看起来完整，UI 没崩溃，但功能从来不工作。Day 08 final review 抓出来 = spec 条款不能少。

### 5 个踩坑（精简版，详见 [day08.md §⚠️ 今日踩坑](../daily/day08.md#-今日踩坑)）

1. **Generators don't get exhaustiveness-checked** —— `async *runEvents(...)` 加新 variant 后 TS 不报错，必须手动加 yield site
2. **run_summary 漏 4 个 error 路径** —— Reviewer 抓出，dispatch fix subagent 补全 5 个终止 case
3. **tests/apps/api/trace-collector.test.ts 没自动更新** —— 硬编码 kind 数组，加新 kind 时必须 grep `kinds.toEqual` 同步更新
4. **pnpm-lock.yaml 第一次没 commit** —— 任何 deps 装包必带 lockfile，CI 跑 `pnpm install --frozen-lockfile` 会校验
5. **`scroll-to-iteration` wired but non-functional** —— 功能链断最后一步，UI 互动 = emit → handler → DOM selector → scroll API 每步单独验证

---

## 🏗 当前架构（Day 08 末态）

```
[Browser fetch / apps/web/src/App.vue (Vue 3 + Tailwind 4)]
    ↓ POST /agent
apps/api/src/server.ts
    ├── AbortController + request.signal
    ├── apps/api/src/trace-collector.ts (AgentTrace + meta.usage + meta.context)
    ├── apps/api/src/sse-adapter.ts (framework-agnostic)
    └── libs/agent/agent.ts (runEvents + 12 kind + signal + error yield + final-iter stream)
            ├── libs/llm/chat-client.ts (ChatOptions { signal? } + ChatUsage)
            │   ├── OpenAIChatClient (with toOpenAIMessages)
            │   └── AnthropicChatClient (with toApiMessages)
            ├── libs/llm/observability/models.ts (MODELS 注册表 6 model)
            ├── libs/llm/observability/context-counter.ts (countContextTokens best-effort)
            └── libs/tools/tool-registry.ts
                    └── CalculatorTool (无 eval / new Function)

[apps/web 消费 events]
    ├── HeaderPill.vue (peak / limit / total + 进度条: 绿 < 50% / 黄 50-80% / 红 > 80%)
    ├── MetricsSidebar.vue (per-iteration + Peak/Total/Iters 合计 + scroll-to-iteration emit)
    └── Timeline.vue (request/response/tool_call/tool_result + data-timeline-id 锚点)

[GET /traces/:runId]  ←──  TraceCollector (LRU 32, in-memory)
                              ├── events[] (source: 12 kind 全保存)
                              └── meta = { usage: ChatUsage, context: { peakPromptTokens, iterations } }
```

**状态**：Agent Runtime 是 source（12 kind events），apps/api 层是 derived（meta.usage / meta.context），apps/web 层是 rendering（HeaderPill / MetricsSidebar / Timeline）。

**关键纪律**：

- snapshot 语义（yield 时深拷贝累积型数据）
- source vs derived 双写（Runtime 零感知 Trace / meta.context 存在）
- framework-agnostic adapter（apps/api/src/sse-adapter.ts 输出 `{event, data}`）
- final-iter 流式 + message_delta 限定 final-iter
- best-effort 派生（count_tokens 失败不抛）
- 渐进式 UI 技术栈（Tailwind 4 + Vue 3 SFC + 旧 scoped CSS 并存）

详见 [day01-07 §3 Day 7 架构图](2026-07-27-day01-07-seven-day-retrospective.md#day-7-当前架构流式-可观测-可中断-可观测) + [day08.md §📚 知识点 5](../daily/day08.md#5-tailwind-4-vue-3-sfc-共存-渐进式迁移策略)。

---

## 📚 核心概念复习（Day 07-08 增量）

> 完整核心概念见 [day01-07 §3](2026-07-27-day01-07-seven-day-retrospective.md#3-核心概念复习)。本节只列 Day 07-08 增量。

### 6.1 ChatUsage 进 ChatResponse（ADR-011 同源）

Day 07 之前 ChatResponse 只有 `content?` / `toolCalls?`。Day 07 加 `usage?`：

```ts
interface ChatResponse {
  readonly content?: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly usage?: ChatUsage;
}

interface ChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}
```

- **源**：provider SDK 返回（OpenAI `completion.usage` / Anthropic `message.usage`）
- **派生**：`TraceCollector.meta.usage` 累积多轮之和（apps/api 层在 SSE 消费时累加）
- **Runtime 不感知 Trace 存在**：Agent 只 yield 事件，apps/api 层决定怎么累积

### 6.2 MODELS 注册表 + count_tokens best-effort（ADR-013）

`libs/llm/observability/models.ts`：

```ts
export const MODELS = {
  'claude-opus-5': { contextLimit: 200000 },
  'claude-sonnet-5': { contextLimit: 200000 },
  'claude-haiku-4-5': { contextLimit: 200000 },
  'gpt-4o': { contextLimit: 128000 },
  'gpt-4o-mini': { contextLimit: 128000 },
  'gpt-4-turbo': { contextLimit: 128000 },
} as const;
```

`libs/llm/observability/context-counter.ts`：

- Anthropic 适配：调用 `client.messages.count_tokens({model, messages, signal})`
- OpenAI 适配：返回 `undefined`（OpenAI 无公开 count_tokens 接口，YAGNI 自己造轮子）
- **失败（API 错误 / 超时）→ 返回 `undefined`，不抛**（best-effort 派生）
- 未知 model → 直接 return undefined

### 6.3 Source vs Derived 双写（ADR-014 深化）

Day 06 立 `Trace = events[] + meta`（ADR-010）。Day 08 加 `context` / `run_summary` 时**严格遵守 source vs derived 边界**：

| 字段 | 类型 | 来源 |
|---|---|---|
| `response.usage` | source | provider SDK 直接返回 |
| `context.promptTokens` | derived | `count_tokens` API 调用结果（best-effort） |
| `run_summary.totalPromptTokens` | derived | 多轮 `response.usage.promptTokens` 累加 |
| `run_summary.peakPromptTokens` | derived | `max(peakPromptTokens, currentIterationContext)` |

**派生不能替代源** —— 这是 CLAUDE.md "第一原则"的延伸。

- 加 `context` 事件时，`response.usage` 不删（仍是事实源）
- 加 `run_summary` 事件时，`response.usage` 累加逻辑独立（apps/api 层 addMeta）
- 新增 derived 不改 source —— Runtime 契约零修改

### 6.4 Snapshot 语义（深化）

Day 06 立 snapshot 语义（ADR-009）。Day 07-08 加深：

- `request.messages` 深拷贝（累积型）✓
- `response.toolCalls` 深拷贝（累积型）✓
- `response.usage` 不拷贝（值类型）
- `context.promptTokens` / `context.limit` 不拷贝（值类型）
- `run_summary` 字段全部不拷贝（值类型）

**不变量**：reference type yield 时深拷贝 / 值类型不拷贝 —— 这是消费方看到的"当时"而非"最终"的核心保证。

## 📐 重要设计决策（ADR 增量）

> ADR-001~012 见 [day01-07 §4](2026-07-27-day01-07-seven-day-retrospective.md#4-重要设计决策adr)。本节列 Day 07-08 新增 3 条。

### ADR-013: best-effort 派生（count_tokens 失败不抛）

**背景**：Day 08 加 Context Window 观测。`countContextTokens` 是**独立的 API 调用**（Anthropic `/v1/messages/count_tokens`），可能因网络 / 4xx / 超时 / model 未注册而失败。

**当时的问题**：

- 如果 `count_tokens` 抛错 → agent 主流程挂掉
- 派生指标是"可选观察"，不是主流程
- "指标 bug 阻断主流程" = 违反"YAGNI 消灭 if 存在的条件"

**最终选择**：失败路径全部 `return undefined`，**绝不 throw**：

```ts
export async function countContextTokens(messages, model, signal?): Promise<number | undefined> {
  if (!process.env.ANTHROPIC_API_KEY) return undefined;
  const meta = getModelMeta(model);
  if (!meta) return undefined;
  try {
    return await client.messages.countTokens({...});
  } catch (err) {
    console.warn('[countContextTokens] failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}
```

**原因**：

- 派生指标是**可选观察**，失败必须被吞
- `Agent.runEvents` 在 `countContextTokens` 返回 undefined 时**不 yield context 事件**（前端降级到不显示）
- 用户体验：context 数字不显示 ≠ agent 跑不动

**未来影响**：

- 所有 best-effort 派生走同一模式：try/catch + return undefined
- 主流程不感知派生存在

**证据 commit**：`fe2b0e9` feat(observability): add countContextTokens with anthropic adapter / `6e77435` MODELS registry。

---

### ADR-014: derived event vs source event（context / run_summary 与 response.usage 的边界）

**背景**：Day 08 加 `context` / `run_summary` 两种 event kind。两者都是"派生"，但与 `response.usage` 的边界是什么？

**当时的问题**：

- `response.usage` 是 provider SDK 返回的事实
- `context.promptTokens` 是 `count_tokens` API 返回的事实
- `run_summary.totalPromptTokens` 是多轮累加的派生
- 三者关系不清 → 消费方不知道哪个权威

**最终选择**：

| 字段 | 类型 | 来源 | 用途 |
|---|---|---|---|
| `response.usage` | source | provider SDK | 计费 / cache read/write 真相 |
| `context.promptTokens` | source-like | count_tokens API | 实时观测 context 占比（best-effort） |
| `run_summary` | derived | 多轮累加 | UI 终止态"快照" |

**关键边界**：

- **派生不能替代源**：加 `context` 不删 `response.usage`；加 `run_summary` 不改 `response.usage` 累加逻辑
- **source 字段永不变**：AgentEvent 联合的已有 variant 不改字段名 / 类型 / 顺序
- **derived 走新 variant**：每次扩 derived = 新加 kind，老消费方 `default` case 仍然工作

**未来影响**：

- 加 Cost（USD 计价）走新 `cost_summary` kind，不污染 `response.usage`
- 加 Latency 走新 `latency_summary` kind，不污染 `response` 事件
- 加 Cache Hit Rate 走新 `cache_summary` kind

**证据 commit**：`f35aff9` feat(agent): add context + run_summary event kinds / `3b8f975` yield context + run_summary / `1d7cbaf` test meta.context e2e。

---

### ADR-015: 渐进式 UI 技术栈迁移（Tailwind 4 + Vue 3 SFC 共存）

**背景**：Day 08 引入 Tailwind 4 给 Agent Console 换 UI 技术栈。旧组件（Conversation.vue / Timeline.vue / InputBar.vue）已用 scoped CSS 写好。

**当时的问题**：

- 一次性重写 3 个组件 = 24 小时内"美但不工作"风险
- 新组件用 Tailwind + 旧组件用 scoped = 风格不统一
- 团队还在熟悉 Tailwind utility classes

**考虑过的方案**：

- **方案 A**：渐进式（新组件 Tailwind + 旧组件 scoped 不动）✅ Day 08 选
- **方案 B**：一次性重写 3 个组件 —— ❌ 风险太高，Day 08 时间窗不够
- **方案 C**：Day 08 不引入 Tailwind —— ❌ 用户体验升级（HeaderPill + MetricsSidebar 三栏布局）必须做

**最终选择**：方案 A

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

**原因**：

- 渐进式 = 新组件立刻收益（Tailwind 写起来快），旧组件稳如山
- YAGNI 兑现："未来要不要统一？等真统一时再统一"
- 业务稳定 + 团队 ready 之后才能统一（Day 09+ 评估）

**未来影响**：

- 加新组件默认 Tailwind utility classes
- 旧组件 scoped CSS 不动，等真统一时一次性重写
- Tailwind 4 升级 breaking class 时，新组件优先调整

**证据 commit**：`d102b58` feat(web): integrate tailwind css via @tailwindcss/vite / `fd622b1` HeaderPill / `0fe59a9` MetricsSidebar / `9f99f5e` three-column layout。

## 💼 面试视角（STAR 法则）

> 区别于 day01-07 §7 的纯文本版，本节按 STAR 法则（Situation / Task / Action / Result）整理 4 个亮点故事 + 5 分钟回答骨架 + 10 个追问。

### §8.1 项目概述（30 秒 STAR）

**S (Situation)**：8 天从 ChatClient 抽象搭到完整的 Agent Runtime + 可观测 UI。

**T (Task)**：不引 transport / UI 框架到 libs 层；additive 演化不破调用方。

**A (Action)**：5 阶段交付：

1. **Day 01-02**：monorepo + ChatClient 抽象（OpenAI / Anthropic）
2. **Day 03-04**：Streaming + Tool Calling（ChatRequest 统一）
3. **Day 05-07**：AgentEvent + SSE + Trace + AbortSignal + Usage
4. **Day 08**：Context Window 观测 + Tailwind 4 集成

**R (Result)**：107 commit / 70 test 通过 / AgentEvent 12 kind / 15 条 ADR / 0 临时 API 残留。

**30 秒口述**：
> "我做了 8 天的 Agent Runtime 学习项目。从 ChatClient 抽象开始，逐步建出完整的 Chat → Tool Calling → Streaming → SSE → Trace → Context 观测的 Runtime。总共 107 个 commit，70 个测试通过，**没有引入 transport / UI 框架到 libs 层**。"

### §8.2 4 个 STAR 亮点故事

#### 亮点 1：判别联合 + 增量演化的接口设计（贯穿 8 天）

**S (Situation)**：Day 04 ChatResponse 用 optional 字段表达 "content 或 toolCalls 二选一"，消费方写 `if x !== undefined` 串行判断；加新 kind 旧消费者 TS 不报错。

**T (Task)**：8 天内 AgentEvent 从 0 → 12 kind 不破老调用方。

**A (Action)**：

- 用判别联合 `{ kind: '...' }` 替代 optional
- `switch (ev.kind)` TS 自动收窄
- 加新 kind = 显式扩展联合
- 8 天每加一种 kind 都走"修改五问"

**R (Result)**：

- 加 `context` / `run_summary` 时，`isAgentEvent` 类型守卫同步扩展，老消费方 `default` case 仍然工作
- `pnpm typecheck` 0 error + 70/70 test 通过

**30 秒口述**：
> "AgentEvent 是判别联合（discriminated union），8 天从 0 加到 12 kind 没破任何老消费方。秘诀是 `kind` 作为判别字段，TS 自动收窄，加新 kind 时老 `switch (ev.kind)` 的 `default` 仍然成立。这是加字段而非加方法的纪律 —— 字段扩展比方法扩展便宜。"

#### 亮点 2：Source vs Derived 双写（Day 06 + Day 08 联动）

**S (Situation)**：Day 06 加 Trace 收集；只存 events = 没 token 用量；events 塞 derived = 污染契约。

**T (Task)**：设计 `AgentTrace = { events: AgentEvent[]; meta: Record<string, unknown> }` 让 Runtime 零感知 Trace。

**A (Action)**：

- 拆 source vs derived 双层（ADR-010）
- meta 用 `Record<string, unknown>` 预留扩展点
- Day 08 复用同一结构：`meta.context = { peakPromptTokens, iterations }`

**R (Result)**：

- Day 06 `meta.usage` 落地 + Day 08 `meta.context` 落地
- 新增 derived 不改 source
- typecheck 0 error / 70 test 通过 / Runtime 零感知 Trace

**30 秒口述**：
> "Trace 设计上我做了 source vs derived 双写：events 是源，meta 是派生。这样 day06 加 token 用量、day08 加 context window 不需要改 Runtime。代价是 meta 用 `Record<string, unknown>` —— 预先不设计具体形状，调用方决定塞什么 key。"

#### 亮点 3：Snapshot 语义 + Yield 时深拷贝（Day 06 + Day 07 加深）

**S (Situation)**：Agent 内部 messages 持续 push，yield `request` 事件时共享同一引用 → 测试断言 `requests[0].messages.length === 2` 失败（实际 4）。

**T (Task)**：所有 yield 出去的 reference-type 数据必须深拷贝，让消费方看到"当时"而非"最终"。

**A (Action)**：

- yield `request` 时 `messages.map((m) => ({ ...m }))`
- FakeChatClient 也要深拷贝（同源问题）
- 值类型不需要（content / usage）

**R (Result)**：

- 测试断言稳定（70/70 通过）
- Trace / SSE / Debug UI 三种消费方依赖同一 invariant
- reference type 深拷贝 / 值类型浅拷贝 = 不变量

**30 秒口述**：
> "Snapshot 语义是 Agent Runtime 的核心不变量：yield 时深拷贝累积型数据（messages / toolCalls），值类型不拷贝。这让 Trace、SSE、Debug UI 三种消费方都看到'当时'状态而不是'最终'状态。"

#### 亮点 4：渐进式 UI 技术栈迁移（Tailwind 4 + Vue 3 SFC 共存）

**S (Situation)**：Day 08 要加 HeaderPill + MetricsSidebar，但旧组件（Conversation / Timeline / InputBar）已用 scoped CSS 写好。

**T (Task)**：引入 Tailwind 4 不破坏旧组件。

**A (Action)**：

- `@tailwindcss/vite` 插件 + `@import "tailwindcss"` 一行
- 无 PostCSS 配置
- 新组件用 Tailwind utility classes，旧组件保留 scoped CSS
- YAGNI 兑现：未来统一？等真统一时再统一

**R (Result)**：

- `HeaderPill.vue` / `MetricsSidebar.vue` 无 `<style>` block
- 旧组件稳如山
- Vite build 8.89 kB CSS 生成

**30 秒口述**：
> "技术栈迁移我选渐进式：day08 加 Tailwind 4 时，新组件 HeaderPill/MetricsSidebar 用纯 utility classes，旧组件 Conversation/Timeline 保留 scoped CSS 不动。YAGNI 兑现 —— 未来要不要统一？等业务稳定再说。一次性重写风险是 24 小时内'美但不工作'。"

### §8.3 5 分钟回答骨架

> 模拟面试："你做过 Agent 项目吗？"

```
[30s] §8.1 项目概述 → 107 commit / 12 kind / 70 test
[60s] 架构：
       libs/llm (ChatClient) → libs/agent (AgentEvent 12 kind) → apps/api (SSE) → apps/web (Vue + Tailwind)
[60s] 技术选型：
       - 判别联合 > 平铺 optional（亮点 1）
       - source vs derived 双写（亮点 2）
       - snapshot 语义（亮点 3）
       - 渐进式 UI 迁移（亮点 4）
[60s] 难点：
       - Provider 协议差异在 SDK 适配层消化（system 顶层化 / content blocks）
       - tool_call / tool_result 严格 1:1 配对是 Agent Loop 不变量
       - AbortSignal 穿透整条调用链才能真正取消远端请求
       - 派生 vs source 边界（亮点 2 深化）
[60s] Trade-off：
       - chat + stream 双重调用（最终 token 计费）换 message_delta 收口
       - In-memory Trace LRU 32 换 CI 闭环的简单性
       - 零前端框架 → 单 HTML 530 行换零构建工具
       - error yield（不是 throw）换消费方边界清晰
[30s] 简历上的 3 个亮点：
       1. 判别联合 + 增量演化的接口设计
       2. Source vs Derived 双写
       3. Snapshot 语义 + Yield 时深拷贝
```

详见 [day01-07 §7.1-§7.6](2026-07-27-day01-07-seven-day-retrospective.md#7-面试视角总结) Day 01-07 部分。

### §8.4 面试可能追问（10 题，含 Day 07-08 新增）

> Day 01-06 追问见 [day01-07 §7.7](2026-07-27-day01-07-seven-day-retrospective.md#77-面试可能追问)。本节列 Day 07-08 新增 5 题 + Day 01-06 经典 5 题整合。

**Day 07-08 新增**：

1. **"为什么 AbortSignal 进 ChatClient 契约层而不是 apps/api adapter？"**
   → 抽象层有 signal → SDK 终止请求 → 已发 token 不浪费；apps/api 层只能 break iterator。
2. **"为什么 message_delta 限定 final-answer iter？"**
   → 中间态 assistant 流式 = 信息噪声；tool_calls iter 不流式仍走 request/response 事件。
3. **"run_summary 在 error 路径也要 yield 吗？"**
   → 是，5 个 error 路径全部覆盖（Day 08 第一次 review 抓出 4 个漏，dispatch fix subagent 补全）。
4. **"count_tokens 失败怎么处理？"**
   → best-effort 永远 return undefined（ADR-013）。派生指标是可选观察，失败必须被吞。
5. **"为什么派生不替代源？"**
   → ADR-014，`response.usage` 是事实源，`context` / `run_summary` 是派生。加 derived 不改 source —— Runtime 契约零修改。

**Day 01-06 经典**：

6. **"为什么 AsyncGenerator 不直接给 Vue？"** → 跨进程 + 断线重连 + 类型污染，详见 [day01-07 §3.5](2026-07-27-day01-07-seven-day-retrospective.md#35-streaming)。
7. **"Tool 不放 systemPrompt 为什么重要？"** → ADR-0001，详见 [day01-07 §3.4](2026-07-27-day01-07-seven-day-retrospective.md#34-tool-system)。
8. **"Agent Loop 怎么防无限循环？"** → `maxIterations` + error yield，详见 [day01-07 §3.3](2026-07-27-day01-07-seven-day-retrospective.md#33-agent-runtime)。
9. **"ChatClient 抽象为什么不放 SDK 名字？"** → 抽象 ≠ 给 SDK 换名字，调用方"换 provider 零改动"。
10. **"Tailwind 渐进式迁移怎么保证旧组件不破？"** → ADR-015，新组件 utility + 旧组件 scoped 并存；YAGNI 兑现"未来统一？等真统一时再统一"。

## 🛣 Day 09+ 路线 + 技术债

### Day 09+ 路线（仅 day08.md 已 ack 的 5 个决策）

**推荐**：多轮对话历史（Day 06 复盘路线标 Day 09+，前置条件已全部就绪）。

**前置条件全部就绪**：

- ✅ AbortSignal（Day 07）
- ✅ message_delta 流式（Day 07）
- ✅ error yield 终止态（Day 07）
- ✅ response.usage 累积（Day 07）
- ✅ context / run_summary 观测（Day 08）
- ✅ HeaderPill + MetricsSidebar（Day 08）

**关键决策待 ack**（来自 [day08.md §🚀 Day 09 预告](../daily/day08.md#-day-09-预告)）：

1. 持久化策略（in-memory session vs localStorage vs server-side）
2. session ID 传递方式（cookie / URL param / body field）
3. message ID 体系（要不要给每条 message 唯一 ID 用于 deduplication）
4. AbortSignal 跨 turn 行为（同一 turn 内 abort 全部 message，还是 abort 当前 turn）
5. context / run_summary 在多轮场景下是否需要"按 turn 拆分"（Day 08 当前是按 run 累计，多轮后 run 怎么定义？）

详见 [day01-07 §6.1-§6.5](2026-07-27-day01-07-seven-day-retrospective.md#6-当前不足分析) 不足分析（Memory / Permission / Evaluation / Observability / Workflow）。

### 已知技术债（8 天累计）

| 债 | 位置 | 影响 | 触发修 |
|---|---|---|---|
| **chat + stream 双重调用** | `libs/agent/agent.ts:118-141` | final-answer iter 双重 token 计费 | Day 10+ 评估一次 stream 方案 |
| **In-memory Trace LRU 32** | `apps/api/src/trace-collector.ts` | 重启丢失；32 次以外被 evict | Day 10+ 评估持久化 |
| **single Agent 单端口绑死** | `apps/api/src/server.ts` | `createAgentApp({ agent })` 一次只能配一个 Agent | 多 Agent 场景 |
| **web/ 单 HTML 349+ 行** | `apps/web/src/App.vue` | App.vue 已 349 行，组件已拆 HeaderBar/RightPanel/Composer，但还能再加 200 行就要拆 | 引入 framework 时 |
| **错误事件不区分协议层 vs Runtime 层** | `Agent.runEvents()` | 消费方拿到 error 不知道是 maxIterations 还是 abort | 扩 AgentEvent kind |
| **usage 是 prompt + completion 之和** | `apps/api/src/server.ts:96-103` | 没有 cached / reasoning tokens 细分 | provider 能力差异大 |
| **没有 SSE 重连状态机** | `apps/api/src/sse-adapter.ts` | 客户端断线重连后从 message_start 重看 | EventSource 自带，不主动实现 |

### 技术债变化（8 天累计）

```
+ 新增 docs/review/2026-07-29-day01-08 review       —— 维护成本 低，3 年存活率 高
+ 新增 libs/llm/observability/ 模块                   —— 维护成本 低，3 年存活率 高
+ 新增 MODELS 注册表（6 model）                       —— 维护成本 低，3 年存活率 中（价格变动需更新）
+ 新增 countContextTokens 抽象                        —— 维护成本 低，3 年存活率 高
+ 新增 context / run_summary event kinds              —— 维护成本 低，3 年存活率 高
+ 新增 Tailwind 4 集成                                —— 维护成本 中（Tailwind 版本可能带来 breaking class），3 年存活率 高
+ 新增 HeaderBar + RightPanel 组件（Day 08 HeaderPill/MetricsSidebar 已重构）—— 维护成本 中，3 年存活率 高
+ 新增 scroll-to-iteration 互动                       —— 维护成本 低，3 年存活率 高
+ 新增 28 commits（Day 07-08）                        —— 维护成本 中，3 年存活率 高
+ 修复 5 个 error 路径遗漏 run_summary                —— 维护成本 低，3 年存活率 高
+ 修复 trace-collector.test.ts 硬编码数组             —— 维护成本 低，3 年存活率 高
+ 修复 pre-existing Timeline.vue exactOptionalPropertyTypes —— 维护成本 低，3 年存活率 高
净增：+12 能力 / -0 重复
反驳记录：
  - Cost / USD / latency / cache hit / 持久化 / OpenAI count_tokens 全部 YAGNI —— spec 已 ack
  - Day 07-08 新增 12 kind 中 2 kind（context / run_summary）是有意识扩展（ADR-014），不是悄悄扩张
  - Day 08 渐进式 UI 迁移是技术栈换血最小风险路径（ADR-015），不是妥协
```

---

## 🔗 相关引用

- **5 天节奏 review**：[2026-07-22-day01-05-architecture-review.md](2026-07-22-day01-05-architecture-review.md)
- **7 天完整复盘**：[2026-07-27-day01-07-seven-day-retrospective.md](2026-07-27-day01-07-seven-day-retrospective.md)
- **Day 笔记**：[day01.md](../daily/day01.md) / [day02.md](../daily/day02.md) / [day03.md](../daily/day03.md) / [day04.md](../daily/day04.md) / [day05.md](../daily/day05.md) / [day06.md](../daily/day06.md) / [day07.md](../daily/day07.md) / [day08.md](../daily/day08.md)
- **Day 08 spec**：[2026-07-28-day08-context-and-cost-observability-design.md](../docs/superpowers/specs/2026-07-28-day08-context-and-cost-observability-design.md)
- **Day 08 plan**：[2026-07-28-day08-context-window-tailwind.md](../docs/superpowers/plans/2026-07-28-day08-context-window-tailwind.md)
- **ADR**：[0001-tool-capability-must-not-embed-in-system-prompt.md](../adr/0001-tool-capability-must-not-embed-in-system-prompt.md)
- **CLAUDE.md 全局约定**：[../../../CLAUDE.md](../../../CLAUDE.md)
- **代码锚点**：
  - [libs/llm/chat-client.ts](../../libs/llm/chat-client.ts) — ChatClient + ChatRequest/Response/Options
  - [libs/llm/observability/models.ts](../../libs/llm/observability/models.ts) — MODELS 注册表
  - [libs/llm/observability/context-counter.ts](../../libs/llm/observability/context-counter.ts) — countContextTokens best-effort
  - [libs/agent/event.ts](../../libs/agent/event.ts) — AgentEvent 12 kind
  - [libs/agent/agent.ts](../../libs/agent/agent.ts) — runEvents 全 5 终止路径
  - [apps/api/src/server.ts](../../apps/api/src/server.ts) — Hono + AbortController + TraceCollector
  - [apps/api/src/sse-adapter.ts](../../apps/api/src/sse-adapter.ts) — framework-agnostic
  - [apps/api/src/trace-collector.ts](../../apps/api/src/trace-collector.ts) — events[] + meta.usage + meta.context
  - [apps/web/src/App.vue](../../apps/web/src/App.vue) — Vue 3 + Tailwind 4 IDE 风格布局（HeaderBar + LeftMenu + Main + RightPanel + Composer）
  - [apps/web/src/components/HeaderBar.vue](../../apps/web/src/components/HeaderBar.vue) — 顶栏（model · in/out · ctx + status pill）
  - [apps/web/src/components/RightPanel.vue](../../apps/web/src/components/RightPanel.vue) — Trace / Cost 切换面板

---

> **写给未来的自己**：如果你忘了 Agent 怎么工作，先看 [day01-07 §3 核心概念复习](2026-07-27-day01-07-seven-day-retrospective.md#3-核心概念复习)。如果你忘了"为什么这样设计"，看 [day01-07 §4 ADR](2026-07-27-day01-07-seven-day-retrospective.md#4-重要设计决策adr) + 本 review §7 ADR 增量。如果你要接着做，先看 [day01-07 §5 阅读指南](2026-07-27-day01-07-seven-day-retrospective.md#5-当前代码阅读指南) + 本 review §9 路线。如果你要面试，看本 review §8 STAR 法则。
>
> 8 天不是结束，是 65 天的地基。
