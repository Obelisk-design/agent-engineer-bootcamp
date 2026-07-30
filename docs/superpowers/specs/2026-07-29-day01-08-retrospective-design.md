# Day 01–08 八天深度复盘 设计

> **日期**：2026-07-29
> **作者**：AI Agent Engineer Bootcamp Review Phase
> **状态**：draft（待肥老大 review）

---

## 1. 目标

延续 [2026-07-22-day01-05-architecture-review.md](../review/2026-07-22-day01-05-architecture-review.md)（5 天节奏点）和 [2026-07-27-day01-07-seven-day-retrospective.md](../review/2026-07-27-day01-07-seven-day-retrospective.md)（7 天 full retrospective）的节奏，落地第 3 篇 review：

**`docs/review/2026-07-29-day01-08-eight-day-retrospective.md`**

聚焦范围（按肥老大拍板）：
- **8 天总览**（day01-06 一句话总结 + day07-08 详细展开）
- **STAR 法则**整理 4 个亮点故事（区别于 day01-07 §7 的纯文本版）
- **可复用现有 review 资源**：day01-07 的 §3 / §4 / §5 通过引用而不是重写

---

## 2. 范围

### 2.1 必须做

**Review 文档结构**（9 个 section）：

| § | 标题 | 来源 | 字数预算 |
|---|---|---|---|
| 1 | 一览（维度表） | 新写 | ~30 行 |
| 2 | 8 天路线总览（每 day 一段） | 复用 day01-07 §1 + day08.md §"关键命令速查" / "验收清单" | ~150 行 |
| 3 | **Day 07 详细演进**（Streaming + AbortSignal + Usage） | 新写（精炼 day01-07 §1 Day 07） | ~120 行 |
| 4 | **Day 08 详细演进**（Context 观测 + Tailwind 集成） | 复用 day08.md §"📚 知识点" / "📦 今日产出物" / "⚠️ 今日踩坑" | ~200 行 |
| 5 | 当前架构（Day 08 末态） | 复用 day01-07 §3 Day 7 架构图 + 增量 Tailwind 三栏 UI | ~80 行 |
| 6 | 核心概念复习（Day 07-08 增量） | 复用 day01-07 §3 + 新增 3 块（ChatUsage / best-effort / derived） | ~100 行 |
| 7 | ADR 增量（Day 07-08 新增 3 条） | 新写 | ~80 行 |
| 8 | **面试视角（STAR 法则）** ← 本次最大差异 | 重写 day01-07 §7 + 4 个 STAR 故事 | ~250 行 |
| 9 | Day 09+ 路线 + 技术债 | 复用 day01-07 §6 + Day 08 路线 | ~80 行 |

**4 个 STAR 亮点故事**（§8 核心内容）：

1. **判别联合 + 增量演化的接口设计**（贯穿 day01-08）
2. **Source vs Derived 双写**（Trace meta + Context meta，day06 + day08）
3. **Snapshot 语义 + Yield 时深拷贝**（day06 + day07 加深）
4. **渐进式 UI 技术栈迁移**（Tailwind 4 + Vue 3 SFC 共存，day08）

每条 STAR 故事结构（150-200 字）：

```text
S (Situation): 项目背景 + 当时痛点
T (Task): 要完成的设计目标
A (Action): 实际怎么做的（具体到 commit / 代码位置）
R (Result): 验证结果 + 数字证据
+ 30 秒口述脚本（面试现场怎么说）
```

### 2.2 必须不做

- **不复写 day01-06 的 day-by-day 演进**：直接复用 day01-07 §1 / §2 + 加一句"详见 day01-07 §1 Day 0X"链接
- **不复写 day01-07 已有的 12 条 ADR**：ADR-001~012 通过链接引用
- **不复写 Day 06 / Day 07 的 6.1~6.5 不分析**：通过链接
- **不复写 §5 代码阅读指南**：通过链接（Day 08 文件路径已更新）
- **不增加新内容**：Day 09+ 路线基于 day01-07 §6 + day08.md §"Day 09 预告"，不引入新判断

### 2.3 边界（硬规则）

| 边界 | 处理 |
|---|---|
| 107 commit 全部覆盖？ | ✅ 是（§2 总览每 day 都覆盖）+ Day 07-08 重点扩 |
| 复用 day01-07 而非重写 | ✅ 通过 markdown 链接而非复制粘贴 |
| 12 现有 ADR 不重写 | ✅ 仅新加 ADR-013~015 |
| STAR 故事必须真 | ✅ 每个 S/T/A/R 都引用具体 commit / 代码行 |
| Day 08 5 个踩坑全要进 | ✅ 4 个进 §4 演进说明 + 1 个（scroll-to-iteration）进 §5 已知技术债 |
| 不预测未来 | ✅ §9 Day 09+ 路线只在 day08.md §"Day 09 预告"已 ack 的 5 个关键决策 |
| 不引入新内容到 libs/ | ✅ review 是文档，不动代码 |

---

## 3. 内容大纲（详细）

### §1 一览（30 行）

```markdown
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
```

### §2 8 天路线总览（150 行）

每 day 1 段（day01-06 简略，day07-08 详细）。每段含：

- 学习目标
- 关键 commit 链路（3-5 个）
- 一句话总结

引用 day01-07 §1 详细叙述，Day 07-08 直接展开。

### §3 Day 07 详细演进（120 行）

**复用 day01-07 §1 Day 07 段（约 150 行原文）精简到 120 行**。结构：

- 学习目标（1 段）
- 代码产物列表（30 行）
- 关键 commit 链路（4 个 Phase × 3-4 commit）
- 演进说明（5 条关键不变量 / 决策）：
  - AbortSignal 进 ChatClient 契约层（ADR-011）
  - error throw → yield（ADR-012）
  - message_delta 限定 final-answer iter
  - Token Usage 双写（ChatResponse.usage + Trace.meta.usage）
  - chat + stream 双重调用代价（trade-off）

### §4 Day 08 详细演进（200 行）

**复用 day08.md §"📚 知识点" / "📦 今日产出物" / "⚠️ 今日踩坑"**。结构：

- 学习目标
- 代码产物（精简版表格）
- 19 commits 按 Phase 1-5 拆
- 演进说明（6 块）：
  1. 派生 vs 源（provider 是 source，context/cost 是 derived）
  2. best-effort 派生的纪律（count_tokens 失败不抛）
  3. AgentEvent 扩展是 additive（12 kind 的扩展策略）
  4. run_summary 必须在所有 error 路径前 yield（行为契约）
  5. Tailwind 4 + Vue 3 SFC 共存（渐进式迁移）
  6. 单一 `data-timeline-id` 锚点（scroll-to-iteration 实现）
- 5 个踩坑（精简版）—— 引用 day08.md 完整版

### §5 当前架构（80 行）

**复用 day01-07 §3 Day 7 架构图 + 增量 Tailwind 三栏 UI**。

```
[Browser fetch / apps/web/src/App.vue (Vue + Tailwind)]
    ↓ POST /agent
apps/api/src/server.ts
    ├── AbortController + request.signal
    ├── apps/api/src/trace-collector.ts (AgentTrace + meta.context)
    ├── apps/api/src/sse-adapter.ts (framework-agnostic)
    └── libs/agent/agent.ts (runEvents signal + error yield + final-iter stream + context/run_summary)
            ├── libs/llm/chat-client.ts (ChatOptions { signal? } + ChatUsage)
            │   ├── OpenAIChatClient
            │   └── AnthropicChatClient
            └── libs/tools/tool-registry.ts
                    └── CalculatorTool

[apps/web 消费 events]
    ├── HeaderPill.vue (peak / limit / total + 进度条)
    ├── MetricsSidebar.vue (per-iteration + Peak/Total/Iters 合计)
    └── Timeline.vue (request/response/tool_call/tool_result + scroll-to-iteration)

[GET /traces/:runId]  ←──  TraceCollector (LRU 32, meta.usage + meta.context)
```

### §6 核心概念复习（100 行）

**Day 07-08 增量**，3 个新概念 + 1 个深化：

1. **ChatUsage 进 ChatResponse（ADR-011 同源）**
   - 源：provider SDK 返回
   - 派生：Trace.meta.usage 累积多轮之和
2. **MODELS 注册表 + count_tokens best-effort（ADR-013）**
   - 未知 model / API 失败 → 返回 undefined
   - 派生绝不能比源更脆弱
3. **Source vs Derived 双写（ADR-014 深化）**
   - AgentEvent 是源
   - Context event 是派生
   - **派生不能替代源**（CLAUDE.md "第一原则"延伸）
4. **Snapshot 语义（深化）**
   - 累积型数据 yield 时深拷贝（messages / toolCalls）
   - 值类型不需要（content / usage）

### §7 ADR 增量（80 行）

**新加 3 条 ADR**：

- **ADR-013**：best-effort 派生 — countContextTokens 失败不抛
  - 证据 commit：`fe2b0e9` / `0491590`（run_summary 在 error 路径也 yield）
- **ADR-014**：derived event vs source event — `context` / `run_summary` 不能替代 `response.usage`
  - 证据 commit：`f35aff9` / `3b8f975` / `1d7cbaf`
- **ADR-015**：渐进式 UI 技术栈迁移 — Tailwind 4 + Vue 3 SFC 共存
  - 证据 commit：`d102b58` / `fd622b1` / `0fe59a9` / `9f99f5e`

ADR-001~012 通过链接引用 day01-07 §4。

### §8 面试视角（STAR 法则）— 250 行（本次最大差异）

**§8.1 项目概述（30 秒 STAR）**：

```text
S: 8 天从 ChatClient 抽象搭到完整的 Agent Runtime + 可观测 UI
T: 不引 transport / UI 框架到 libs 层；additive 演化不破调用方
A: 5 阶段交付（chat → stream → tool → event+trace → observability）
R: 107 commit / 70 test 通过 / AgentEvent 12 kind / 15 条 ADR
```

**§8.2 4 个 STAR 亮点故事**（每条 150-200 字 + 30 秒口述脚本）：

#### 亮点 1：判别联合 + 增量演化的接口设计（贯穿 8 天）

- **S**：day04 ChatResponse 用 optional 字段表达 "content 或 toolCalls 二选一"，消费方写 `if x !== undefined` 串行判断；加新 kind 旧消费者 TS 不报错
- **T**：8 天内 AgentEvent 从 0 → 12 kind 不破老调用方
- **A**：
  - 用判别联合 `{ kind: '...' }` 替代 optional
  - `switch (ev.kind)` TS 自动收窄
  - 加新 kind = 显式扩展联合
  - 8 天每加一种 kind 都走"修改五问"
- **R**：
  - 加 `context` / `run_summary` 时，isAgentEvent 类型守卫同步扩展，老消费方 `default` case 仍然工作
  - typecheck 0 error + 70/70 test 通过
- **30 秒口述**：
> "AgentEvent 是判别联合（discriminated union），8 天从 0 加到 12 kind 没破任何老消费方。秘诀是 `kind` 作为判别字段，TS 自动收窄，加新 kind 时老 `switch (ev.kind)` 的 `default` 仍然成立。这是加字段而非加方法的纪律 —— 字段扩展比方法扩展便宜。"

#### 亮点 2：Source vs Derived 双写（day06 + day08 联动）

- **S**：day06 加 Trace 收集；只存 events = 没 token 用量；events 塞 derived = 污染契约
- **T**：设计 `AgentTrace = { events: AgentEvent[]; meta: Record<string, unknown> }` 让 Runtime 零感知 Trace
- **A**：
  - 拆 source vs derived 双层（ADR-010）
  - meta 用 `Record<string, unknown>` 预留扩展点
  - day08 复用同一结构：`meta.context = { peakPromptTokens, iterations }`
- **R**：
  - day06 meta.usage 落地 + day08 meta.context 落地
  - 新增 derived 不改 source
  - typecheck 0 error / 70 test 通过 / Runtime 零感知 Trace
- **30 秒口述**：
> "Trace 设计上我做了 source vs derived 双写：events 是源，meta 是派生。这样 day06 加 token 用量、day08 加 context window 不需要改 Runtime。代价是 meta 用 Record<string, unknown> —— 预先不设计具体形状，调用方决定塞什么 key。"

#### 亮点 3：Snapshot 语义 + Yield 时深拷贝（day06 + day07 加深）

- **S**：Agent 内部 messages 持续 push，yield `request` 事件时共享同一引用 → 测试断言 `requests[0].messages.length === 2` 失败（实际 4）
- **T**：所有 yield 出去的 reference-type 数据必须深拷贝，让消费方看到"当时"而非"最终"
- **A**：
  - yield `request` 时 `messages.map((m) => ({ ...m }))`
  - FakeChatClient 也要深拷贝（同源问题）
  - 值类型不需要（content / usage）
- **R**：
  - 测试断言稳定（70/70 通过）
  - Trace / SSE / Debug UI 三种消费方依赖同一 invariant
  - reference type 深拷贝 / 值类型浅拷贝 = 不变量
- **30 秒口述**：
> "Snapshot 语义是 Agent Runtime 的核心不变量：yield 时深拷贝累积型数据（messages / toolCalls），值类型不拷贝。这让 Trace、SSE、Debug UI 三种消费方都看到'当时'状态而不是'最终'状态。"

#### 亮点 4：渐进式 UI 技术栈迁移（Tailwind 4 + Vue 3 SFC 共存）

- **S**：day08 要加 HeaderPill + MetricsSidebar，但旧组件（Conversation / Timeline / InputBar）已用 scoped CSS 写好
- **T**：引入 Tailwind 4 不破坏旧组件
- **A**：
  - `@tailwindcss/vite` 插件 + `@import "tailwindcss"` 一行
  - 无 PostCSS 配置
  - 新组件用 Tailwind utility classes，旧组件保留 scoped CSS
  - YAGNI 兑现：未来统一？等真统一时再统一
- **R**：
  - HeaderPill.vue / MetricsSidebar.vue 无 `<style>` block
  - 旧组件稳如山
  - Vite build 8.89 kB CSS 生成
- **30 秒口述**：
> "技术栈迁移我选渐进式：day08 加 Tailwind 4 时，新组件 HeaderPill/MetricsSidebar 用纯 utility classes，旧组件 Conversation/Timeline 保留 scoped CSS 不动。YAGNI 兑现 —— 未来要不要统一？等业务稳定再说。一次性重写风险是 24 小时内'美但不工作'。"

**§8.3 5 分钟回答骨架**（来自 day01-07 §7 整合 + Day 08 增量）

**§8.4 面试可能追问（10 题含 day07-08 新增）**：

来自 day01-07 §7.7 + 新增：

- **"为什么派生不替代源？"** —— ADR-014，详见 §6
- **"count_tokens 失败怎么处理？"** —— ADR-013，best-effort 永远 return undefined
- **"Tailwind 渐进式迁移怎么保证旧组件不破？"** —— 新组件 utility + 旧组件 scoped 并存
- **"为什么 message_delta 限定 final-answer iter？"** —— 中间态 assistant 流式 = 信息噪声
- **"run_summary 在 error 路径也要 yield 吗？"** —— 是，5 个 error 路径全部覆盖（day08 第一次 review 抓出 4 个漏）
- ... 其余从 day01-07 §7.7

---

## 4. 关键引用（"什么在哪"）

| 内容 | 位置 | 复用方式 |
|---|---|---|
| day01-07 §1 路线总览 | [2026-07-27-day01-07-seven-day-retrospective.md](../review/2026-07-27-day01-07-seven-day-retrospective.md#1-七天路线总览) | §2 链接 + Day 07 单独展开 |
| day01-07 §3 架构图 Day 7 | 同上 | §5 引用 + 增量 |
| day01-07 §3 核心概念 | 同上 | §6 链接 + 增量 3 块 |
| day01-07 §4 ADR-001~012 | 同上 | §7 链接，§7 仅新加 ADR-013~015 |
| day01-07 §5 代码阅读指南 | 同上 | 不复写，文档末尾代码锚点列表更新 8 个 |
| day01-07 §6 不分析 | 同上 | §9 链接 + Day 08 增量技术债 |
| day01-07 §7 面试视角 | 同上 | §8 重写（STAR 法则）+ 引用 §7.7 追问 |
| day08.md 知识点 | [day08.md](../daily/day08.md) | §4 复用 6 块 |
| day08.md 今日踩坑 | 同上 | §4 末尾精简版 5 条 |
| ADR-0001 | [0001-tool-capability-must-not-embed-in-system-prompt.md](../adr/0001-tool-capability-must-not-embed-in-system-prompt.md) | 全文链接 |

---

## 5. 实施步骤

1. **新建文件** `docs/review/2026-07-29-day01-08-eight-day-retrospective.md`
2. **§1 一览**：8 行表格
3. **§2 8 天路线总览**：精简 150 行（day01-06 各 1 段 + day07-08 详细）
4. **§3 Day 07 详细演进**：120 行（复用 day01-07 §1 Day 07 精简）
5. **§4 Day 08 详细演进**：200 行（复用 day08.md 知识点 6 块 + 踩坑 5 条精简）
6. **§5 当前架构**：80 行（Day 7 架构图 + 增量 Tailwind 三栏 UI）
7. **§6 核心概念**：100 行（4 块：ChatUsage / best-effort / derived 深化 / snapshot 深化）
8. **§7 ADR 增量**：80 行（3 条新 ADR）
9. **§8 面试视角 STAR**：250 行（4 个亮点故事 + 5 分钟骨架 + 10 追问）
10. **§9 Day 09+ 路线**：80 行（day08.md "Day 09 预告" 5 个 ack 决策 + day01-07 §6 不足分析）
11. **末尾：相关引用 + 代码锚点**（8 个文件路径更新）

预估总长：**约 1100 行 / 90-110 KB**（与 day01-07 的 1500 行 / 73 KB 同量级或略长）。

---

## 6. 验收标准

- [ ] §1 一览数据准确（107 commit / 70 test 通过 / 12 kind / 15 ADR）
- [ ] §2 8 天总览每 day 都有 commit 链路
- [ ] §3 Day 07 演进说明含 5 条关键不变量
- [ ] §4 Day 08 演进说明含 6 块 + 5 个踩坑精简
- [ ] §5 架构图更新到 Day 08 末态（含 Tailwind 三栏 UI + meta.context）
- [ ] §6 4 个核心概念都引用 ADR / commit
- [ ] §7 3 条新 ADR 都有证据 commit
- [ ] §8 STAR 4 个亮点故事 S/T/A/R 全齐 + 30 秒口述脚本
- [ ] §8 5 分钟回答骨架
- [ ] §8 10 追问含 day07-08 新增
- [ ] §9 Day 09+ 5 个 ack 决策不引入新内容
- [ ] 末尾代码锚点更新 8 个文件路径
- [ ] markdown 链接全部可点击
- [ ] 总行数 1000-1200 行（不要超过 day01-07 太多）

---

## 7. 反例验证（写完后跑）

1. **"如果删掉 §8 STAR 故事，只剩 §1-7，技术亮点还成立吗？"** —— 应该成立，STAR 是 narrative 包装不是内容增量
2. **"如果只看 §4 Day 08，能 get 到 Context 观测 + Tailwind 集成的核心吗？"** —— 应该能，6 块演进说明 + 5 踩坑精简
3. **"如果只看 §8 STAR 故事，面试 5 分钟能 cover 8 天能力吗？"** —— 应该能，4 故事 + 5 分钟骨架 + 10 追问
4. **"如果 day01-07 §1-7 都没读，只读本 review 8 天能学完吗？"** —— 部分能（day07-08 详细；day01-06 需链接）

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 文档太长（110 KB+） | 严格按 1100 行预算；超过就砍 §5 架构图（已可复用） |
| 引用密度过高（day01-07 重复） | 复用即引用，不重写 |
| STAR 故事失真（编造 S/T/A/R） | 每个 S/T/A/R 都引用具体 commit / 代码行 / 数字 |
| Day 08 5 个踩坑不全 | 全部进 §4，不遗漏 |
| Day 09+ 路线预测未来 | 严格只列 day08.md "Day 09 预告" 已 ack 的 5 个决策 |
| Markdown 链接断链 | 所有 `[xxx](../path/xxx.md)` 都用相对路径，跑 prettier 验 |
| §8 STAR 故事 30 秒口述脚本太短 | 每条口述 ≤ 80 字，超出即砍 |

---

## 9. 不做的明确清单

- ❌ 不重写 day01-06 的 day-by-day 演进
- ❌ 不重写 ADR-001~012
- ❌ 不重写 Day 06 / Day 07 的 §6 不足分析
- ❌ 不重写 §5 代码阅读指南
- ❌ 不预测未来（Day 09+ 路线只在已 ack 范围）
- ❌ 不引入新内容到 libs/（review 是文档）
- ❌ 不动 day01-07 review 文档（独立 review 节奏）

---

## 10. 完成定义

文档写到 `docs/review/2026-07-29-day01-08-eight-day-retrospective.md`，git commit 后视为完成。

验收清单 12 条全绿 + 反例验证 4 个通过。