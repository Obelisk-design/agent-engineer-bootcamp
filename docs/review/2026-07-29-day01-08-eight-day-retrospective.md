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