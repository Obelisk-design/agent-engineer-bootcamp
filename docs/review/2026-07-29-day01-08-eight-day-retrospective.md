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
