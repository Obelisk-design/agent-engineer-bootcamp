# Agent Learning State

> 更新时间：2026-08-24
>
> 当前学习日：Day13
>
> 用途：供外部 AI 助教读取，用于继续制定学习计划。

---

## 0. 关键约束（请外部 AI 助教先读）

本仓库信源优先级（高→低）：

1. 当前仓库实际代码（libs/ apps/ examples/）
2. Git commit / Git diff（`git log --oneline` 见下）
3. `pnpm test` / `pnpm typecheck` / `pnpm lint` 运行结果
4. `docs/daily/dayXX.md` 学习笔记
5. `docs/adr/0001-0003` 架构决策记录
6. 用户的口述 / Claude Code 的建议（**最低可信度**）

本文件由 Claude Code 在 2026-08-24 通过 `git log`（182 个 commit）+ 实际代码 + Day01-13 daily notes 生成。所有标 ✅ 的事项均经过 Git 与代码双重验证。

---

## 1. 当前项目一句话描述

正在构建一个 **Node.js + TypeScript Agent Runtime**，按 5 层架构渐进实现：

- **L1（ChatClient 抽象）**：OpenAI 兼容协议 + Anthropic Messages API 双 provider，统一 `chat()` / `stream()` 接口。
- **L2（Tool 层）**：Tool + ToolRegistry + zod schema 单一事实源（ADR 0003）。
- **L3（Agent Loop）**：`Agent.runEvents()` 暴露 12 种 `AgentEvent`，支持 streaming tool calls / final-answer 流式 / 多轮历史。
- **L4（HTTP/SSE）**：Hono `POST /agent` 端点 + W3C SSE 帧 + TraceCollector in-memory。
- **L5（Web UI）**：Vue 3 + Vite + Tailwind 4 的 Agent Console（Conversation + Timeline + Metrics Sidebar）+ `/embed-demo` 路由。

**RAG 基础层（Day12-13）**：`libs/embedding/`（embed/distance/pca/visualize）+ `libs/rag/`（chunk/retrieve/store/indexer/evaluate/prompt）已落地最小闭环。

**关键状态指标**：182 commits / 35+ 单元测试文件 / 约 175 passing / 4 闸必跑（typecheck/lint/typecheck:web/test）全绿。

---

## 2. 当前真实架构

```text
┌────────────────────────────────────────────────────────┐
│  apps/web (Vue 3 + Vite + Tailwind 4)                  │
│   App.vue → AgentClient.stream() → ReadableStream      │
│   ├── ConversationPanel (user/assistant bubbles)       │
│   ├── RightPanel (ExecutionTimeline + MetricsSidebar)  │
│   └── /embed-demo (PanelA/B/C/D visualize 4 ways)      │
└──────────────────┬─────────────────────────────────────┘
                   │ HTTP POST /agent (JSON: input + messages[])
                   ↓
┌────────────────────────────────────────────────────────┐
│  apps/api (Hono)                                       │
│   server.ts → createAgentApp(agent)                    │
│   ├── POST /agent  → streamSSE                         │
│   ├── GET  /traces /traces/:runId (in-memory)          │
│   └── TraceCollector (LRU 32) + addMeta({usage,ctx})   │
└──────────────────┬─────────────────────────────────────┘
                   │ agent.runEvents(messages, {signal})
                   ↓
┌────────────────────────────────────────────────────────┐
│  libs/agent (Agent Runtime 事件模型)                   │
│   Agent.runEvents() → AsyncIterable<AgentEvent>        │
│   12 kind: message_start / iteration / request /       │
│   response / context / message_delta / tool_call /     │
│   tool_result / message_end / run_summary / done / error│
│   ↓                                                    │
│   libs/llm ChatClient (统一抽象)                       │
│   ├── OpenAIChatClient  (chat / stream + signal+usage) │
│   └── AnthropicChatClient (chat / stream + sig+usage)  │
│   ↓                                                    │
│   External LLM (OpenAI / Anthropic gateway)            │
└──────────────────┬─────────────────────────────────────┘
                   │ ToolRegistry.execute(name, args)
                   ↓
┌────────────────────────────────────────────────────────┐
│  libs/tools                                            │
│   ToolRegistry (zod schema 单一事实源)                  │
│   ├── calculatorTool        (Day 04)                   │
│   ├── repoIndexTool         (Day 10)                   │
│   ├── repoSearchTool        (Day 10)                   │
│   └── fileReadTool          (Day 11)                   │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  RAG 基础层（Day 12-13）                               │
│   libs/embedding/                                       │
│   ├── embed.ts  (OpenAI 兼容 / NaN 修复)               │
│   ├── distance.ts (cosine / euclidean)                  │
│   ├── pca.ts (手写 2D PCA)                              │
│   └── visualize.ts (HTML / SVG)                        │
│   libs/rag/                                             │
│   ├── chunk.ts (heading / paragraph + code/table protect)│
│   ├── store.ts (lancedb + memory fallback)              │
│   ├── retrieve.ts (embed → search → top-K)             │
│   ├── evaluate.ts (5 query × 2 chunk 跑分)             │
│   ├── prompt.ts (三段式 RAG prompt)                    │
│   └── indexer.ts (Day 13 增量入库: mtime+hash)         │
└────────────────────────────────────────────────────────┘
```

---

## 3. 当前目录结构

```
agent-engineer-bootcamp/
├── libs/
│   ├── llm/                ← LLM 抽象层（L1）
│   │   ├── chat-client.ts        (ChatClient 接口契约)
│   │   ├── message.ts            (Message 类型)
│   │   ├── openai-chat-client.ts (OpenAI provider)
│   │   ├── anthropic-chat-client.ts (Anthropic provider)
│   │   └── observability/        (countContextTokens + MODELS)
│   ├── tools/              ← Tool 层（L2）
│   │   ├── tool.ts               (Tool 接口 + runTool 校验)
│   │   ├── tool-registry.ts      (Registry 中心)
│   │   ├── calculator-tool.ts
│   │   └── repo/
│   │       ├── ignore.ts / glob.ts
│   │       ├── repo-index-tool.ts / repo-search-tool.ts
│   │       ├── file-read-tool.ts
│   │       └── output-limits.ts
│   ├── agent/              ← Agent Runtime（L3）
│   │   ├── agent.ts              (runEvents + run)
│   │   ├── event.ts              (AgentEvent 12 kind)
│   │   └── types.ts
│   ├── embedding/          ← Embedding + 可视化（Day 12）
│   │   ├── embed.ts / distance.ts / pca.ts / visualize.ts
│   │   └── fixtures/sample-corpus.ts
│   └── rag/                ← RAG 基础层（Day 13）
│       ├── chunk.ts / store.ts / retrieve.ts
│       ├── evaluate.ts / prompt.ts / indexer.ts
│       └── fixtures/docs-corpus.ts
├── apps/
│   ├── api/                ← Hono SSE Adapter（L4）
│   │   └── src/
│   │       ├── server.ts / sse-adapter.ts
│   │       └── trace-collector.ts
│   └── web/                ← Vue 3 Agent Console（L5）
│       └── src/
│           ├── App.vue / main.ts / styles.css
│           ├── api/agentClient.ts
│           ├── components/ (HeaderBar / Composer / ConversationPanel
│           │               ExecutionTimeline / RightPanel / LeftMenu
│           │               MessageBubble / CodeBlock / TimelineItem
│           │               StatusDot / icons)
│           └── views/embed/ (EmbedDemo + PanelA/B/C/D + api.ts)
├── examples/
│   ├── day01/ day02/ day03/ day04/ day05/ day06/ day07/
│   ├── day08/ day09/ day10/ day11/ day12/ day13/
│   ├── ex_002_chat_completion.ts
│   └── langchain-side/       (并行 LangChain 学习)
├── tests/
│   ├── libs/agent/ libs/embedding/ libs/llm/ libs/rag/ libs/tools/
│   └── apps/api/ apps/web/
└── docs/
    ├── adr/ (0001, 0002, 0003)
    ├── daily/ (day01.md ~ day13.md)
    ├── review/ (day01-08 retrospective)
    ├── superpowers/ (specs / plans)
    └── test-corpus/
```

**每层职责（简）**：
- `libs/llm`：ChatClient 抽象 + 两个 provider 实现 + observability（context 计数）。
- `libs/tools`：Tool 接口 + zod schema 校验 + Registry + 4 个具体 tool。
- `libs/agent`：编排层。`Agent.runEvents` 是 Runtime 的中心 API，输出 12 kind `AgentEvent`。
- `apps/api`：HTTP/SSE 适配层。不硬编码 provider，接收已构造的 Agent。
- `apps/web`：Vue 3 UI。把 `AgentEvent` 流投影到 Conversation + Timeline。

---

## 4. Day01 ~ Day13 实际完成情况

> 状态图例：✅ 已实现并验证 / 🟡 已实现但验证不充分 / 🔵 只讨论/学习 / ❌ 尚未实现

| Day  | Git 实际完成                                      | 核心代码                              | 实际验证                  | 理论主题                                | 当前状态 |
|------|--------------------------------------------------|---------------------------------------|---------------------------|-----------------------------------------|----------|
| 01   | 工程脚手架 + OpenAI 兼容 + nodemon              | libs/ 占位 + ex_001/002/003           | demo 真跑通 + CI 兜底     | monorepo / TS strict / pnpm / vitest    | ✅       |
| 02   | ChatClient 抽象 + OpenAI + Anthropic            | libs/llm 全套                         | ex_001/002 真跑通         | interface 设计 / 渐进式扩展 / YAGNI     | ✅       |
| 03   | ChatClient.stream() + OpenAI/Anthropic 流式     | stream() 双方实现                     | ex_001/002 真流式跑通    | AsyncGenerator / SDK 事件流过滤         | ✅       |
| 04   | 统一 chat/stream + Tool Calling + Calculator    | libs/agent/agent.ts + calculator-tool  | ex_001/002 真跑通         | Agent Loop / 工具调用 / tokenizer       | ✅       |
| 05   | AgentEvent + runEvents + SSE Adapter + Web UI   | event.ts + sse-adapter.ts + server.ts | ex_001 真跑通 + Chrome MCP | 判别联合 / AsyncIterable / SSE / 单页 UI| ✅       |
| 06   | CI 闭环 smoke + FakeChatClient + Trace         | tests/libs/agent/shared/fake-chat-client.ts | 4 闸必跑全绿             | e2e 测试 / in-memory trace / 装饰器      | ✅       |
| 07   | AbortSignal + 流式 content + Token Usage + 错误 | ChatOptions.signal + ChatUsage + message_delta | ex_001/002 真跑流式 + signal | AbortSignal / 错误处理 / 多 provider 一致性 | ✅       |
| 08   | Context Window 观测 + Tailwind 集成            | observability/ + run_summary event + HeaderPill | 真跑 + HeaderPill 渲染    | context window / 进度条 / Tailwind 4     | ✅       |
| 09   | 多轮对话 + systemPrompt 下放 + scrollback       | agent.ts 改签名 + 前端 resetRunState  | multi_turn_client 真跑断言 | 责任边界 / system prompt 单一入口        | ✅       |
| 10   | RepoIndexTool + RepoSearchTool + L1 闭环        | libs/tools/repo/ + 8 反例 + 1 e2e    | ex_001/002 手跑 + ex_003 需 key | glob / ignore / 内容搜索 / 静默失败      | ✅       |
| 11   | Tool zod schema 单一事实源 + FileReadTool + ADR 0003 | tool.ts 改造 + runTool() + file-read-tool.ts | 33 反例 + 3 轮红绿循环 | 事实源 / zod / runtime 校验             | ✅       |
| 12   | Embedding + 4 可视化 Panel + dev 网关           | libs/embedding/ + apps/web/views/embed/ | ex_001/002 真跑通        | embedding / cosine / euclidean / PCA    | ✅       |
| 13   | RAG 最小闭环 + 增量入库 + test-corpus 支持      | libs/rag/ + indexer.ts + 4 tables    | 27 files / 175 passed + ex_001-004 | RAG / chunk 策略 / 评估口径 / NaN 修复  | ✅       |

---

## 5. 每一天详细说明

### Day01 — 工程脚手架 + OpenAI 兼容 API + nodemon

**实际做了什么**：
- 建立 TypeScript monorepo（pnpm workspace）
- 配置工具链：ESLint 9 flat / Prettier 4 / Vitest 2 / Husky / commitlint
- 写 OpenAI 兼容协议的最小 demo（ex_001_chat_completion.ts）
- nodemon 热更新（ex_002_nodemon_smoke.ts）
- Day 01 末尾：多轮对话 + 摘要压缩 demo（ex_003）

**核心代码**：
- `package.json` + `tsconfig.json` + `tsconfig.build.json` + `tsconfig.test.json`
- `eslint.config.js` + `prettierrc` + `.prettierignore` + `vitest.config.ts`
- `examples/day01/ex_001_chat_completion.ts` + `ex_002_nodemon_smoke.ts` + `ex_003_chat_with_compression.ts`
- `tests/smoke.test.ts`（CI 兜底）
- `.github/workflows/ci.yml`

**学到的东西**：
- 工程：monorepo 启动 + Node 22 + strict TS + pnpm 8
- Agent：仅是开场（脚手架）

**实际验证**：✅ demo 真跑通 + CI 全绿

**遗留问题**：无（仅脚手架）

---

### Day02 — ChatClient 接口设计 + libs/llm 第一个正式组件

**实际做了什么**：
- 设计 `ChatClient` interface（chat / setModel）
- 设计 `Message` 类型（Role 枚举 + readonly + 渐进式扩展路径）
- 实现 `OpenAIChatClient`
- Day 02 末尾延展：`AnthropicChatClient`（Anthropic Messages API）

**核心代码**：
- `libs/llm/message.ts` — Role + Message
- `libs/llm/chat-client.ts` — ChatClient 接口（详见 §7）
- `libs/llm/openai-chat-client.ts` — OpenAI provider
- `libs/llm/anthropic-chat-client.ts` — Anthropic provider（toApiMessages 协议适配）
- `libs/llm/index.ts` — barrel
- `examples/day02/ex_001_chat_client.ts` + `ex_002_anthropic_chat_client.ts`

**学到的东西**：
- 理论：interface 设计 = 抽象边界
- 工程：OpenAI vs Anthropic 三个关键差异（system 顶层 / content blocks / max_tokens 强制）
- Agent：provider 抽象的价值

**实际验证**：✅ ex_001/002 真跑通 + typecheck/lint/test 全绿

**遗留问题**：无（设计阶段完成度极高）

---

### Day03 — ChatClient Streaming + 多 provider 兑现

**实际做了什么**：
- `ChatClient.stream()` 加进接口
- `OpenAIChatClient.stream()` — async generator + null delta 过滤
- `AnthropicChatClient.stream()` — MessageStream 事件过滤（仅 yield text_delta）
- 抽出 `toApiMessages()` 消除 chat/stream 协议适配复制

**核心代码**：
- `libs/llm/chat-client.ts` — `stream(): AsyncIterable<ChatChunk>`
- `libs/llm/openai-chat-client.ts` — stream 实现
- `libs/llm/anthropic-chat-client.ts` — stream 实现 + 抽出 toApiMessages
- `examples/day03/ex_001_openai_stream.ts` + `ex_002_anthropic_stream.ts`

**学到的东西**：
- 理论：AsyncGenerator + AsyncIterable + SDK 事件流过滤
- 工程：provider 抽象在第二种调用形态下仍稳定

**实际验证**：✅ OpenAI 57-63 chunks / Anthropic 6-7 chunks 真跑通

**遗留问题**：无（Day 03 验证了多 provider 兑现）

---

### Day04 — Agent Tool Calling 基础能力

**实际做了什么**：
- 统一 `ToolDefinition` 到 `libs/tools`（消除双头定义）
- 统一 ChatClient 接口（chat/stream + tools 字段），移除 `chatWithTools`
- 修复 OpenAI/Anthropic 中 Message[] 的 `as unknown` 硬 cast
- 实现最小 `Agent` 类：chat → tool_call → execute → chat 循环（maxIterations=5）
- `CalculatorTool`：自写 tokenizer + shunting-yard + RPN（不依赖 eval）

**核心代码**：
- `libs/agent/agent.ts` — Agent 类 + AgentOptions
- `libs/agent/types.ts` — 类型 re-export
- `libs/agent/index.ts` — barrel
- `libs/tools/calculator-tool.ts` — 自写求值器
- `libs/tools/tool.ts` — ToolDefinition 事实源（旧版，未迁 zod）
- `libs/tools/tool-registry.ts` — Registry
- `examples/day04/ex_001_calculator_agent_openai.ts` + `ex_002_calculator_agent_anthropic.ts`

**学到的东西**：
- 理论：Agent Loop = LLM 决策 → 工具执行 → 结果回灌 → 再决策
- 工程：手写 tokenizer 求值（不用 eval 防任意代码执行）

**实际验证**：✅ ex_001/002 真跑通 + calculator / registry / agent 单测全过

**遗留问题**（Day 11 已修）：
- ❌ Tool 的 ToolParameters 手写 JSON Schema（Day 11 改 zod 单一事实源）
- ❌ execute 自检（Day 11 提到框架层校验）

---

### Day05 — apps/api/ SSE Adapter + Agent Console Web UI

**实际做了什么**：
- `AgentEvent` 判别联合（10 kind：message_start/iteration/request/response/tool_call/tool_result/message_end/done/error + Day 05 加 request/response）
- `Agent.runEvents()` — AsyncIterable<AgentEvent>
- 重构 `Agent.run()` 为 `runEvents()` 的收尾版（消除重复）
- 删除 `onIteration` 回调（与 runEvents 重复 = 加 if 兜底反模式）
- `apps/api/` 包：createAgentApp + sse-adapter + 单页 Web UI
- 落地 ADR 0001（Tool capability 不进 systemPrompt）
- Chrome MCP 端到端验证（真 LLM + CalculatorTool）

**核心代码**：
- `libs/agent/event.ts` — AgentEvent 联合
- `libs/agent/agent.ts` — runEvents 实现
- `apps/api/src/server.ts` — Hono app 工厂
- `apps/api/src/sse-adapter.ts` — W3C SSE 适配
- `apps/api/src/web/index.html` — Agent Console 单页 UI（Day 08 已删除，前后端分离）
- `examples/day05/ex_001_sse_agent.ts` + `ex_002_web_ui.ts`
- `docs/adr/0001-*.md`

**学到的东西**：
- 理论：判别联合 vs 平铺 optional / SSE 协议
- 工程：framework-agnostic 抽象（agentEventToSSEMessage）
- Agent：同事件源分发到 Conversation + Timeline

**实际验证**：✅ ex_001 真跑通 + Chrome MCP 端到端验证

**遗留问题**（已修）：
- ❌ AbortSignal 取消（Day 07 解决）
- ❌ token 用量隐藏（Day 07 解决）
- ❌ 流式 content（Day 07 解决）

---

### Day06 — CI 闭环 smoke test（FakeChatClient + end-to-end）

**实际做了什么**：
- 抽 `FakeChatClient` 到 `tests/libs/agent/shared/`
- 新增 `tests/libs/agent/run-events.test.ts`（覆盖 runEvents 完整事件序列）
- 新增 `tests/apps/api/end-to-end.test.ts`（POST /agent 端到端 SSE 流）
- CI 独立：`OPENAI_API_KEY` 缺失时全绿

**核心代码**：
- `tests/libs/agent/shared/fake-chat-client.ts`（含深拷贝 messages）
- `tests/libs/agent/agent.test.ts`（重构用 shared helper）
- `tests/libs/agent/run-events.test.ts`
- `tests/apps/api/end-to-end.test.ts`
- `apps/api/src/trace-collector.ts`（in-memory collector，LRU 32）
- `apps/api/src/server.ts`（加 /traces + /traces/:runId）

**学到的东西**：
- 理论：可观测性 ≠ 真实 LLM = 测试替身
- 工程：FakeChatClient 用协议契约保证 tests 不依赖 key

**实际验证**：✅ 4 闸必跑（typecheck/lint/test/CI）全绿

**遗留问题**：无（纯测试层工作）

---

### Day07 — Agent 流式体验 + 可观测性补全

**实际做了什么**：
- `ChatOptions { signal? }` + `ChatUsage` 加入 ChatClient 抽象
- OpenAI/Anthropic 透传 signal + parse usage
- `AgentEvent` 加 `message_delta` kind + `response.usage` 可选字段
- `Agent.runEvents` 加 signal + error throw→yield + final iter 切 stream + usage 累积
- `TraceCollector.addMeta()` 累积 meta
- `server.ts` 加 AbortController + 监听 request.signal + 删 try/catch
- Web UI 打字机效果（message_delta 累加）
- Day 04/07 demos 加 usage 打印 + 流式输出

**核心代码**：
- `libs/llm/chat-client.ts` — +ChatOptions, +ChatUsage, +ChatResponse.usage
- `libs/llm/openai-chat-client.ts` — signal 透传 + usage parse
- `libs/llm/anthropic-chat-client.ts` — 同上
- `libs/agent/event.ts` — +message_delta kind, +response.usage optional
- `libs/agent/agent.ts` — runEvents signal + error yield + chat→stream + usage 累积
- `apps/api/src/trace-collector.ts` — +addMeta
- `apps/api/src/server.ts` — AbortController + signal + meta usage
- `examples/day07/ex_001_streaming_agent_openai.ts` + `ex_002_streaming_agent_anthropic.ts`

**学到的东西**：
- 理论：AbortSignal 透传到 SDK / streaming UX 关键
- 工程：error throw → yield 行为变更（灰区，肥老大 ack）

**实际验证**：✅ ex_001/002 真跑流式 + signal 演示 + 5 个新反例全过

**遗留问题**（Day 08 修）：
- ❌ context window 不可见（Day 08 解决）

---

### Day08 — Context Window 观测 + Tailwind CSS 集成

**实际做了什么**：
- `MODELS` 注册表（6 model → contextLimit）+ `countContextTokens` 抽象
- `countContextTokens` 失败不抛、永远返回 undefined（best-effort）
- `AgentEvent` 加 `context` + `run_summary` 两种 kind（10 → 12 kind）
- `Agent.runEvents` 在每次 chat 前 yield `context`，在 message_end/error 之前 yield `run_summary`
- `error` 路径必须也 yield `run_summary`
- apps/api/server.ts 在 run_summary 时 addMeta({ context: { peakPromptTokens, iterations } })
- apps/web 集成 Tailwind 4（@tailwindcss/vite）
- HeaderPill 显示 `iter · peak/limit tok · total` + 颜色进度条
- MetricsSidebar 每次 iteration 一行 + Peak/Total/Iters 合计
- App.vue 三栏布局：MetricsSidebar + Conversation + Timeline
- isAgentEvent 类型守卫扩展（12 kind）
- examples 全部 new Agent({ ..., model }) 加 model 字段

**核心代码**：
- `libs/llm/observability/models.ts` — MODELS 注册表 + getModelMeta
- `libs/llm/observability/context-counter.ts` — countContextTokens + Anthropic 适配
- `libs/agent/event.ts` — +context, +run_summary
- `libs/agent/agent.ts` — AgentOptions.model + 2 fix commits
- `apps/web/tailwind.config.ts` — content paths
- `apps/web/src/styles.css` — @import "tailwindcss"
- `apps/web/src/components/HeaderPill.vue` + `MetricsSidebar.vue`
- `examples/day08/agent_server.ts`

**学到的东西**：
- 理论：context window 进度条 = UX 关键
- 工程：Anthropic count_tokens 是有成本的 → best-effort 模式

**实际验证**：✅ HeaderPill 渲染 + HeaderBar 显示 + 真 LLM demo

**遗留问题**（Day 09 修）：
- ❌ 多轮对话历史不在 Agent 内部（Day 09 解决）

---

### Day09 — 多轮对话历史（Multi-turn Conversation History）

**实际做了什么**：
- `agent.runEvents(messages, options)` 改签名为接收 `readonly Message[]`
- `agent.run(messages, options)` 同步改签名（同一份 loop 实现）
- `AgentOptions.systemPrompt` 删除 —— system 消息完全由调用方拼
- runEvents 入口 `messages.map((m) => ({...m}))` 深拷贝
- 函数体内部 messages 引用改 workingMessages（避免污染调用方数组）
- apps/api/src/server.ts POST `/agent` 接 `messages?: Message[]`
- 10 个 example 文件全部改（day04~day08）
- 4 个测试文件全部改完
- 前端 AgentClient.stream 加 messages 选项
- 前端 App.vue 拆 resetTurn → resetRunState（不清空 conversation）
- 前端 App.vue.send 把 ConversationItem[] 翻译成 Message[]
- 反例 1（多轮 send via HTTP）+ 反例 3（空 messages）写为 e2e 测试
- 反例 2（非法 role）标记 YAGNI
- ADR 0002 落地（messages 边界 + systemPrompt 下放 + 入口深拷贝）
- examples/day09/multi_turn_client.ts — 真实 LLM 两轮 + 断言
- examples/day09/agent_server.ts + scripts/dev-day09.ts + dev:day09 脚本

**核心代码**：
- `libs/agent/agent.ts` — 改签名 + 删 systemPrompt + 入口深拷贝
- `apps/api/src/server.ts` — POST /agent 接 messages
- ADR 0002（messages 边界 + systemPrompt 下放）

**学到的东西**：
- 理论：messages 单一拥有者 = 调用方
- 工程：Day 05 "delete onIteration" 原则延伸到入口

**实际验证**：✅ multi_turn_client.ts 真实 LLM 两轮断言 + agent_server.ts 浏览器 UI 端到端

**遗留问题**（Day 10+ 解决）：
- ❌ Agent 没工具能"读 repo"（Day 10/11 解决）

---

### Day10 — Repo Index + Content Search（L1 第一步）

**实际做了什么**：
- RepoIndexTool（maxDepth 默认 3，> 10 拒绝；隐式 maxFiles=5000）
- RepoSearchTool（pattern 自判 regex、context lines、fileGlob）
- 3 个 example（2 手跑 + 1 真 LLM demo 代码，缺 API key 未现场跑）
- 8 反例（index 5 + search 3）
- 1 e2e（Agent 调 repo_index tool）
- 测试 fixture（tests/fixtures/sample-repo/）
- JD 映射段（首次落地路线 spec §3 模板增量）

**核心代码**：
- `libs/tools/repo/ignore.ts` — ignore 匹配器（精确 + glob，DEFAULT_IGNORE 16 项）
- `libs/tools/repo/glob.ts` — 自写 glob（* ** ?）
- `libs/tools/repo/repo-index-tool.ts` — RepoIndexTool
- `libs/tools/repo/repo-search-tool.ts` — RepoSearchTool
- `libs/tools/repo/index.ts` — barrel
- `libs/tools/index.ts` — re-export repo tools
- `examples/day10/ex_001_repo_index.ts` + `ex_002_repo_search.ts` + `ex_003_repo_agent.ts`
- `tests/fixtures/sample-repo/` — package.json + src/foo.ts + src/bar.test.ts

**学到的东西**：
- 理论：glob 自写 8 行（YAGNI 纪律：micromatch 30KB 不值）
- 工程：静默失败 bug A（Boolean("false")===true）+ bug B（Array.isArray 静默回落）
- Agent：Agent + tool 闭环（LLM 决定调哪个 tool + 传什么参数）

**实际验证**：✅ ex_001/002 手跑通 + 8 反例全过 + 1 e2e；ex_003 需 API key（Day 11 才真跑）

**遗留问题**（Day 11 解决）：
- ❌ schema 骗 LLM（ToolParameters 手写 JSON Schema 与 execute 类型臆测不一致）→ ADR 0003

---

### Day11 — Tool 参数契约单一事实源 + FileReadTool（L1 闭环）

**实际做了什么**：
- 真跑 Day 10 ex_003_repo_agent.ts，发现 LLM 传 {"maxDepth":"1"}（字符串）
- 复现 2 个静默失败 bug（A: Boolean("false")===true；B: Array.isArray 静默回落）
- 定位根因：类型声明与 runtime 期望不是同一个事实源
- Tool.schema: z.ZodType 改造 —— JSON Schema / runtime 校验 / TS 类型三者派生自一处
- 校验上提到框架层（runTool / ToolRegistry.execute），execute 只收已校验 args
- 3 个 tool 全部迁移，删除 7 处类型臆测 + 3 个手写 Args interface
- FileReadTool + output-limits（三层截断 + cat -n 行号）
- 33 个新增反例（18 契约 + 15 FileRead），含 5 条防复发结构性测试
- 3 轮红绿循环验证回归测试真的有效
- ADR 0003 落地（推翻 Day 04 的「execute 自检」决策）

**核心代码**：
- `libs/tools/tool.ts` — schema 事实源 + runTool()
- `libs/tools/tool-registry.ts` — execute() 校验入口 + toProviderTools 派生
- `libs/tools/calculator-tool.ts` — 迁 zod
- `libs/tools/repo/repo-index-tool.ts` — 迁 zod（修 bug B）
- `libs/tools/repo/repo-search-tool.ts` — 迁 zod（修 bug A + C）
- `libs/tools/repo/file-read-tool.ts` — 三层截断 + cat -n 行号
- `libs/tools/repo/output-limits.ts` — cap 常量 + 截断工具
- `examples/day11/ex_001_file_read.ts` + `ex_002_read_agent.ts`
- `docs/adr/0003-*.md`

**学到的东西**：
- 理论：事实源 = zod schema 一处派生 → 三处生效
- 工程：3 轮红绿循环验证回归测试有效性

**实际验证**：✅ 33 反例全过 + 3 轮红绿循环 + 4 闸必跑全绿

**遗留问题**（已规划 Day 12+）：
- ❌ LLM 不知道 repo 长什么样 → RAG 增强

---

### Day12 — Embedding Demo（4 个可视化面板）

**实际做了什么**：
- libs/embedding/distance.ts — cosine / euclidean + dim-mismatch / zero-vector 反例
- libs/embedding/pca.ts — 手写 2D PCA（power iteration + deflate），不引 ml 库
- libs/embedding/visualize.ts — distanceMatrixHTML + scatterSVG（HTML/SVG self-contained）
- libs/embedding/embed.ts — OpenAI 兼容 embeddings wrapper
- libs/embedding/fixtures/sample-corpus.ts — 4 动物 + 3 水果 + 3 抽象词 + 4 前缀变体
- libs/embedding/index.ts — barrel
- apps/web/src/views/embed/api.ts — 前端 import.meta.env 适配 + warnDevKeyOnce
- PanelA.vue — 距离矩阵热图（10 词 × 4096 维 cosine）
- PanelB.vue — PCA → 2D 散点图
- PanelC.vue — 同维度 cosine vs euclidean 对比（Matryoshka 不支持）
- PanelD.vue — 距离梯度（query + 4 前缀变体）
- EmbedDemo.vue — 4 panel 容器 + 缺 key 红 banner
- /embed-demo 路由 — App.vue hash switch（path B，无 vue-router）
- LeftMenu 加 Embed 入口 + HeaderBar 加 dev:day12 标识
- dev OpenAI 兼容网关 + 4096 维 embedding 作为默认
- examples/day12/ex_001_embed_only.ts + ex_002_probe_dims.ts

**核心代码**：
- `libs/embedding/distance.ts` — cosine / cosineDistance / euclidean
- `libs/embedding/pca.ts` — 2D PCA（power iteration + deflate）
- `libs/embedding/visualize.ts` — distanceMatrixHTML + scatterSVG
- `libs/embedding/embed.ts` — OpenAI 兼容 embeddings wrapper
- `libs/embedding/fixtures/sample-corpus.ts` — ANIMAL_WORDS + FRUIT_WORDS + ABSTRACT_WORDS + QUERY_WITH_PREFIXES
- `apps/web/src/views/embed/PanelA/B/C/D.vue` + `EmbedDemo.vue` + `api.ts` + `styles.css`
- `examples/day12/ex_001_embed_only.ts` + `ex_002_probe_dims.ts`

**学到的东西**：
- 理论：embedding = 向量空间 / cosine vs euclidean / Matryoshka
- 工程：手写 PCA 30 行（power iteration）= 引 ml 库的 30KB 依赖不值

**实际验证**：✅ ex_001/002 真跑通 + 4 panel 浏览器渲染（dev 网关 OK）

**遗留问题**（Day 13 解决）：
- ❌ 文档怎么入库 + 怎么检索（Day 13 RAG 最小闭环）

---

### Day13 — RAG 最小闭环（embedding → 入库 → cosine top-K → LLM 总结）

**实际做了什么**：
- libs/rag/chunk.ts — chunkByHeading + chunkByParagraph（代码块 / 表格保护）
- libs/rag/store.ts — VectorStore interface + lancedb 本地版 + 内存 fallback
- libs/rag/retrieve.ts — retrieve() + retrieveRepeated()（embedFn / store / model 全可注入）
- libs/rag/prompt.ts — buildRagPrompt() 三段式（Context + source 标注 + "using only" 约束）
- libs/rag/evaluate.ts — 5 条 fixed query × 2 chunk 策略自动跑分（+ Day 13 后续加 Q6/Q7 test-corpus）
- libs/rag/fixtures/docs-corpus.ts — 真文档加载（docs/daily/*.md + docs/adr/*.md）
- libs/embedding/embed.ts — NaN/Inf vector 修复（dev 网关 vLLM 拒 NaN → 二分定位 + placeholder fallback）
- 4 个 example（ex_001 入库 / ex_002 evaluate / ex_003 top-K 眼测 / ex_004 单轮 RAG 闭路）
- 18 个反例测试（chunk 9 / store 5 / retrieve 4）
- 4 闸必跑全清
- test-corpus 支持：loadTestCorpus() + EvalQuery.corpus 路由 + 4 表库（main/test × heading/paragraph）
- 增量入库（indexer.ts）：mtime + hash diff + 精确删除

**核心代码**：
- `libs/rag/chunk.ts` — heading / paragraph 切分 + dropEmptyChunks (MIN_CHUNK_CHARS=10)
- `libs/rag/store.ts` — VectorStore interface + lancedb + memory fallback
- `libs/rag/retrieve.ts` — embed(query) → store.search → top-K
- `libs/rag/evaluate.ts` — 5-7 条 fixed query + judgeHit + buildReport + formatReport
- `libs/rag/prompt.ts` — 三段式 RAG prompt（source 标注 + 字符 cap 8000）
- `libs/rag/fixtures/docs-corpus.ts` — 真文档加载（daily + adr + test-corpus）
- `libs/rag/indexer.ts` — mtime + hash 增量入库 + 精确删除
- `libs/embedding/embed.ts` — MODIFIED NaN 修复
- `examples/day13/ex_001_index_corpus.ts` + `ex_002_chunk_compare.ts` + `ex_003_query_topk.ts` + `ex_004_rag_loop.ts`

**学到的东西**：
- 理论：RAG = embedding + vector search + LLM 总结 / 评估口径决定能看见什么
- 工程：dev 网关 NaN vector 修复（二分定位 + placeholder fallback）/ lancedb 测试前必须清 .lancedb 目录

**实际验证**：✅ 27 files / 175 passed + ex_001 15 篇真文档入库（heading 359 / paragraph 1351 chunks）+ ex_002 真跑分（heading 4/5 vs paragraph 2/5）+ ex_004 真 LLM 总结（"找不到"是合法答案）

**遗留问题**（已规划 Day 14+）：
- ❌ FileEditTool（路线表原 Day 13，顺延）
- ❌ Agent + tools 完整 loop（路线表 Day 14：model 想改 → tool 执行 → model 看 diff → 决定下一步）
- ❌ Reranker（可选，dev 网关 qwen3-reranker-4b 已有）

---

## 6. 当前 Agent 核心能力矩阵

| 能力            | 是否实现 | 代码位置                                    | 是否验证 | 说明 |
|----------------|----------|---------------------------------------------|----------|------|
| LLM 调用       | ✅       | libs/llm/openai-chat-client.ts / anthropic-chat-client.ts | ✅ 真跑 | OpenAI 兼容 + Anthropic 双 provider |
| ChatClient 抽象 | ✅       | libs/llm/chat-client.ts                     | ✅       | chat / stream / setModel + usage + ChatUsage |
| Model 切换     | ✅       | setModel()                                  | 🟡       | 接口已写，单测未覆盖 |
| Streaming      | ✅       | OpenAI / Anthropic stream()                 | ✅ 真流式 | Day 03-07 完善 |
| Tool Definition | ✅       | libs/tools/tool.ts                          | ✅       | zod schema 派生 JSON Schema |
| ToolRegistry   | ✅       | libs/tools/tool-registry.ts                 | ✅       | 校验 + 派生 + execute |
| Tool Calling   | ✅       | Agent.runEvents → registry.execute          | ✅ 真跑 | calculator / repo / file_read |
| Agent Loop     | ✅       | libs/agent/agent.ts                         | ✅       | maxIterations=5 + signal 取消 |
| AgentEvent     | ✅       | libs/agent/event.ts                         | ✅       | 12 kind 判别联合 |
| SSE            | ✅       | apps/api/src/sse-adapter.ts + server.ts     | ✅       | W3C SSE + Hono streamSSE |
| Web UI         | ✅       | apps/web/src/App.vue + components/          | ✅       | Vue 3 + Tailwind 4 + Conversation + Timeline |
| AbortSignal    | ✅       | ChatOptions.signal + server.ts AbortController | ✅ 真跑 | Day 07 |
| Retry          | ❌       | 未实现                                       | -        | 仅 throw → SSE 错误事件 |
| Error Handling | 🟡       | libs/agent/agent.ts error yield + tool catch | ✅       | error 走 SSE 事件，不 throw |
| Conversation   | ✅       | agent.runEvents(messages) 多轮 + 前端 resetRunState | ✅ 多轮断言 | Day 09 |
| Memory         | 🟡       | 前端 sessionUsage（HeaderBar 累加）         | 🟡       | 仅前端 token 累加；非 LTM |
| RAG            | ✅       | libs/rag/ + libs/embedding/                 | ✅ 真跑 | heading 4/5 vs paragraph 2/5 |
| Embedding      | ✅       | libs/embedding/embed.ts + distance + pca    | ✅       | OpenAI 兼容 / NaN 修复 |
| Reranker       | ❌       | 未实现                                       | -        | dev 网关有 qwen3-reranker-4b |
| MCP            | ❌       | 未实现                                       | -        | 仅讨论 |
| File Tool      | ✅（读）  | libs/tools/repo/file-read-tool.ts           | ✅       | Read 已做；Edit 未做 |
| CLI            | ❌       | 未实现                                       | -        | 仅 scripts/dev-dayXX.ts 工具 |
| Persistence    | ❌       | 未实现（TraceCollector in-memory LRU 32）    | -        | 跨进程 = 重启丢 |

---

## 7. 当前 ChatClient 契约

文件：`libs/llm/chat-client.ts`

```typescript
export interface ChatOptions {
  readonly signal?: AbortSignal;
}

export interface ChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface ChatRequest {
  readonly messages: Message[];
  readonly tools?: ReadonlyArray<ToolDefinition>;
}

export interface ToolCallData {
  readonly id: string;
  readonly toolName: string;
  readonly args: unknown;
}

export interface ChatResponse {
  readonly content?: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly usage?: ChatUsage;
}

export interface ChatChunk {
  readonly content?: string;
}

export interface ChatClient {
  chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse>;
  stream(request: ChatRequest, options?: ChatOptions): AsyncIterable<ChatChunk>;
  setModel(model: string): void;
}
```

**演进过程**：
- Day 02：原 `IChatClient { chat, setModel }` + 手写 Message
- Day 03：加 `stream(): AsyncIterable<ChatChunk>`
- Day 04：加 `tools?: ReadonlyArray<ToolDefinition>` 字段（统一 chat/stream），移除 `chatWithTools` 冗余方法；返回 `ChatResponse` 统一普通聊天和工具调用
- Day 07：加 `ChatOptions.signal` + `ChatUsage` + `ChatResponse.usage`（OpenAI/Anthropic 都返回 token 用量，藏起来 = 浪费免费数据）

**已知行为**：
- 普通聊天：`await client.chat({ messages })`
- 工具调用：`await client.chat({ messages, tools: [...] })`
- 流式：`for await (const chunk of client.stream({ messages })) ...`
- `setModel(model)` 失败由底层 SDK 抛 validation error（不 throw 出去 = 隐藏 bug，保持 void）
- `ChatResponse.usage` undefined 时不写入（exactOptionalPropertyTypes）

**Message 类型**：
```typescript
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  readonly role: Role;
  readonly content: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly toolCallId?: string;
}
```

---

## 8. 当前 Agent Loop

文件：`libs/agent/agent.ts`

```
调用方: agent.runEvents(messages, { signal })
   ↓
Agent.runEvents:
   ├── workingMessages = messages.map(deepCopy)
   ├── yield message_start
   ├── for i in 0..maxIterations:
   │   ├── if signal.aborted → yield run_summary + yield error('aborted by signal') + return
   │   ├── yield iteration(n)
   │   ├── yield request(iteration, messages)        ← 深拷贝累积 messages
   │   ├── context = yield context(iteration, promptTokens, limit)  ← best-effort
   │   ├── try:
   │   │   ├── probe = await chat({ messages, tools }, { signal })
   │   │   ├── if signal.aborted → yield run_summary + yield error + return
   │   │   ├── if probe.content !== undefined:
   │   │   │   ├── for chunk in stream({ messages }, { signal }):
   │   │   │   │   ├── if signal.aborted → yield run_summary + yield error + return
   │   │   │   │   └── yield message_delta(content)
   │   │   │   └── response = { content: accumulated, usage: probe.usage }
   │   │   ├── else:
   │   │   │   └── response = probe (tool_calls)
   │   ├── catch err:
   │   │   ├── yield run_summary (partial)
   │   │   ├── yield error(message)
   │   │   └── return
   │   ├── 累积 usage + peakPromptTokens
   │   ├── yield response(iteration, content?, toolCalls?, usage?)
   │   ├── if response.content:
   │   │   ├── yield run_summary
   │   │   ├── yield message_end(content)
   │   │   └── yield done + return
   │   ├── if response.toolCalls:
   │   │   ├── workingMessages.push({ role: 'assistant', content: '', toolCalls })
   │   │   ├── for tc in toolCalls:
   │   │   │   ├── yield tool_call(id, name, args)
   │   │   │   ├── try: result = await registry.execute(name, args)
   │   │   │   ├── catch err: result = `Error: ${err.message}`
   │   │   │   ├── yield tool_result(id, name, output)
   │   │   │   └── workingMessages.push({ role: 'tool', content: result, toolCallId: id })
   │   │   └── continue (下一轮 LLM)
   │   └── else (空 content + 空 toolCalls):
   │       ├── yield run_summary
   │       ├── yield message_end('')
   │       └── yield done + return
   └── yield run_summary + yield error('exceeded maxIterations') + return
```

**关键不变量**：
1. `tool_call` / `tool_result` 严格 1:1 配对
2. `request` 事件携带累积 messages（深拷贝，防止指针共享）
3. `run_summary` 总在 `message_end` / `error` 之前 yield（含 partial 累加）
4. final-answer iter 双重调用 LLM（chat 探测拿 usage，再 stream 拿 delta）→ 双重 token 计费（Day 10+ 评估一次 stream 方案）
5. error 走 SSE 事件，不 throw 出 Agent（apps/api 层保持原状）

---

## 9. 当前 AgentEvent

文件：`libs/agent/event.ts`

12 kind 判别联合：

| kind            | 何时产生                          | 谁产生      | 谁消费                      | 前端使用 |
|-----------------|-----------------------------------|-------------|-----------------------------|----------|
| message_start   | runEvents 入口                     | Agent       | Frontend Conversation      | ✅ "Agent 接收任务…" |
| iteration       | 每次 LLM 调用前                    | Agent       | Timeline / MetricsSidebar   | ✅ "Iteration N" |
| request         | 每次 chat/stream 前                | Agent       | Timeline (Request 卡片)     | ✅ 显示累积 messages JSON |
| response        | 每次 chat/stream 后                | Agent       | Timeline (Response 卡片)    | ✅ 显示 content / toolCalls / usage |
| context         | 每次 chat 前（best-effort）        | Agent       | HeaderPill / MetricsSidebar | ✅ 显示 prompt/limit tok |
| tool_call       | LLM 决定调工具时                   | Agent       | Timeline (Tool Call 卡片)   | ✅ 显示 name + args |
| tool_result     | 工具执行完成时                     | Agent       | Timeline (Tool Result 卡片) | ✅ 显示 output |
| message_delta   | final-answer iter 流式 chunk      | Agent       | Conversation 流式气泡        | ✅ 打字机效果 + ▍光标 |
| message_end     | LLM 返回最终 content 时            | Agent       | Conversation 收尾气泡        | ✅ 最终文本 |
| run_summary     | message_end / error 之前           | Agent       | HeaderPill / RightPanel     | ✅ peak/total/iters |
| done            | runEvents 正常结束                 | Agent       | Timeline (Done 卡片)        | ✅ 状态 'completed' |
| error           | 异常 / signal aborted / max iter   | Agent       | Timeline (Error 卡片)       | ✅ 状态 'error' / 'cancelled' |

**演进过程**：
- Day 05 起步：6 kind（不含 request/response）
- Day 05 追加：+request / +response（过程快照）
- Day 07 追加：+message_delta（流式体验）
- Day 08 追加：+context / +run_summary（可观测性）

**已禁用的 kind**：
- `onIteration`（Day 05 删除，与 runEvents 重复 = 加 if 兜底反模式）

---

## 10. 当前 SSE 架构

```text
浏览器 (apps/web)
   ↓ fetch('http://localhost:3000/agent', { method: 'POST', body: JSON })
   ↓ ReadableStream reader
   ↓ TextDecoder + 自写 SSE parser (apps/web/src/api/agentClient.ts)
   ↓ AgentEvent (typed)
   ↓ dispatch(ev) (apps/web/src/App.vue)
   ↓ ConversationItem[] / TimelineItem[] / RightPanel 状态
Hono (apps/api/src/server.ts)
   ↓ POST /agent
   ↓ body = { input: string, messages?: Message[] }
   ↓ AbortController + 监听 request.signal
   ↓ for await (const ev of agent.runEvents(messages, { signal }))
   ↓ collector.collect(runId, ev)  ← TraceCollector in-memory
   ↓ addMeta(usage, context)        ← partial merge
   ↓ agentEventToSSEMessage(ev)     ← { event: ev.kind, data: JSON.stringify(ev) }
   ↓ stream.writeSSE(message)       ← Hono streamSSE
   ↓ collector.end(runId)           ← in finally 兜底
Agent
   ↓ runEvents → AsyncIterable<AgentEvent>
```

**SSE 端点**：
- `POST /agent` — 主端点，body 必含 `input: string`，可选 `messages?: Message[]`
- `GET /traces` — 列出所有 trace（按 startedAt 倒序）
- `GET /traces/:runId` — 拿指定 runId 完整 events 快照
- `GET /` — Day 08 起已不返回 HTML UI（前后端分离）

**event 格式**（W3C SSE 最小子集）：
```
event: <kind>
data: <JSON.stringify(ev)>

```
每个 event `event:` 字段是 `AgentEvent.kind`，`data:` 字段是 JSON 字符串。

**data 格式**：单一 JSON 对象，包含 kind + 该 kind 全部字段。

**前端解析**：apps/web/src/api/agentClient.ts 用 fetch + ReadableStream reader + TextDecoder + 自写 SSE 帧解析（按 `\n\n` 分隔）。

**断开支持**：
- 客户端断线：request.signal 触发 → AbortController.abort() → Agent.runEvents signal 检查 → yield error('aborted by signal') → 前端 status='cancelled'
- 服务端主动结束：Hono streamSSE 在 for await 结束时自动 close

**已知限制**：
- ❌ event id（SSE 重连）
- ❌ retry 字段
- ❌ 心跳 / comment 帧
- ❌ 多行 data

---

## 11. 当前 Tool 系统

文件：`libs/tools/tool.ts` + `libs/tools/tool-registry.ts`

**ToolDefinition**（事实源 = zod schema）：
```typescript
export type ToolJsonSchema = z.core.JSONSchema.BaseSchema;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolJsonSchema;  // 派生自 Tool.schema
}

export interface Tool<TSchema extends z.ZodType = z.ZodType, TReturn = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: TSchema;
  execute(args: z.infer<TSchema>): Promise<TReturn>;
}
```

**ToolRegistry**：
- `register(tool)` — 同名重复 throw
- `get(name)` — 查存在性（仅查询，不执行）
- `list()` — 列出所有
- `execute(name, rawArgs)` — **唯一正确入口**（先 schema.safeParse 校验，再 tool.execute）
- `toProviderTools()` — 派生 ToolDefinition[]（用 `z.toJSONSchema(schema, { target: 'draft-7', io: 'input' })`）

**校验流程**（Day 11 / ADR 0003）：
```
zod schema ─┬─ z.toJSONSchema() ──▶ 发给 LLM 的 JSON Schema
            ├─ schema.parse()    ──▶ runtime 校验（ToolRegistry.execute）
            └─ z.infer<>         ──▶ execute 的参数 TS 类型
```

**当前实际存在的 Tool**：

| Tool 名称         | 关键参数 (zod)                          | 输出 | 文件 |
|------------------|----------------------------------------|------|------|
| calculatorTool    | expression: string                     | { result: number } | calculator-tool.ts |
| repoIndexTool     | rootPath, maxDepth?, ignorePatterns?    | { files, totalCount, truncated } | repo/repo-index-tool.ts |
| repoSearchTool    | rootPath, pattern, fileGlob?, contextBefore?, contextAfter?, maxResults?, ignorePatterns? | { matches, totalMatches, truncated } | repo/repo-search-tool.ts |
| fileReadTool      | path, startLine?, endLine?              | { path, content (cat -n + 截断 marker) } | repo/file-read-tool.ts |

---

## 12. 当前 Web UI

**技术栈**：Vue 3 + Vite 5 + TypeScript + Tailwind CSS 4

**结构**：
```
apps/web/src/
├── App.vue                ← 状态分发 + 布局壳
├── main.ts / styles.css
├── api/
│   └── agentClient.ts     ← SSE 消费 + AbortController
├── components/
│   ├── HeaderBar.vue      ← model name + 总 token + status
│   ├── Composer.vue       ← input + send / stop
│   ├── LeftMenu.vue       ← 64px 侧栏（Agent Console / Embed）
│   ├── ConversationPanel.vue
│   ├── MessageBubble.vue
│   ├── CodeBlock.vue
│   ├── ExecutionTimeline.vue
│   ├── TimelineItem.vue
│   ├── RightPanel.vue      ← MetricsSidebar + Timeline
│   ├── StatusDot.vue
│   └── icons.ts
├── lib/
│   └── sessionUsage.ts    ← session 跨 turn 累加（HeaderBar Σin/Σout 用）
├── types/
│   └── agentEvent.ts
└── views/embed/
    ├── EmbedDemo.vue      ← 4 panel 容器 + key-missing 红 banner
    ├── PanelA.vue         ← 距离矩阵热图
    ├── PanelB.vue         ← PCA 2D 散点
    ├── PanelC.vue         ← cos vs euc 对比
    ├── PanelD.vue         ← 距离梯度
    ├── api.ts             ← import.meta.env + warnDevKeyOnce
    └── styles.css
```

**已实现**：
- ✅ Conversation：user/assistant 气泡 + streaming 流式（▍光标）+ 多轮 scrollback
- ✅ Execution Timeline：每个 AgentEvent 一卡片（圆角 + 左边 3px 色条 + 浅色背景）
- ✅ Tool Call 展示：name + args JSON
- ✅ Tool Result 展示：output
- ✅ Error 展示：友好提示（含 cancelled/aborted）
- ✅ Abort：Composer stop 按钮 + AbortController.abort()
- ✅ Streaming：message_delta 累加
- ✅ Status Dot：idle / running / completed / error / cancelled
- ✅ Metrics Sidebar：每次 iteration 一行 + Peak/Total/Iters 合计
- ✅ HeaderPill：iter · peak/limit tok · total + 颜色进度条
- ✅ sessionUsage：跨 turn 累加（Σin/Σout）
- ✅ Hash route：`#/` 切 `#/embed-demo`（无 vue-router，path B）
- ✅ LeftMenu：Agent Console / Embed 切换入口

**仅 UI 占位 / 未实现**：
- ❌ conversation 持久化（page refresh 清空）
- ❌ Settings 面板（model 切换 UI）
- ❌ Trace Viewer（apps/web 端没有可视化 /traces/:runId）

---

## 13. 当前错误处理

| 错误源       | 当前处理                                                                                  |
|-------------|------------------------------------------------------------------------------------------|
| LLM 错误    | chat/stream 抛错 → Agent catch → yield error(message) → SSE 事件流 → 前端 status='error' |
| Tool 错误   | tool 不存在 / 参数不合 schema / execute 抛错 → Agent catch → result = `Error: ...` → yield tool_result → 喂回 LLM 让其重试 |
| Agent 错误  | maxIterations 超限 → yield error('Agent loop exceeded N iterations without final answer') + run_summary（partial） |
| SSE 错误    | request.signal abort → AbortController.abort() → Agent runEvents signal 检查 → yield error('aborted by signal') → 前端 status='cancelled' |
| Abort 错误  | 同 SSE 错误（同一路径）                                                                  |
| maxIterations 错误 | error 事件（不 throw），runId 仍然 end()                                         |

**关键决策**：
- ✅ error 走 SSE 事件（Day 07 行为变更，原 throw）
- ✅ Tool 错误不 throw 出 Agent（让 LLM 重试）
- ✅ signal aborted 在每次 iter 起始 / chat/stream 完成后 / 每个 stream chunk 之后 三处检查
- ❌ Retry：未实现（错误 = 立即 error 事件，不重试）
- ❌ Rate limit：未实现
- ❌ Permission：未实现

---

## 14. 当前测试情况

**测试结构**（`tests/`）：

| 目录                      | 测试文件                                              | 用途 |
|--------------------------|-------------------------------------------------------|------|
| tests/smoke.test.ts      | smoke                                                 | CI 兜底 |
| tests/libs/agent/        | agent.test.ts / run-events.test.ts / shared/fake-chat-client.ts | Agent 编排 + runEvents |
| tests/libs/embedding/    | distance.test.ts / pca.test.ts                       | 距离度量 + PCA |
| tests/libs/llm/observability/ | context-counter.test.ts / models.test.ts         | observability 模块 |
| tests/libs/rag/          | chunk.test.ts / indexer.test.ts / retrieve.test.ts / store.test.ts | RAG 全链路 |
| tests/libs/tools/        | calculator-tool.test.ts / tool-contract.test.ts / tool-registry.test.ts / repo/ | 4 个 tool + 契约 |
| tests/apps/api/          | end-to-end.test.ts / repo-tools-e2e.test.ts / server.test.ts / sse-adapter.test.ts / trace-collector.test.ts | Hono / SSE / Trace |
| tests/apps/web/          | call-chain.test.ts / multi-turn.test.ts / session-usage.test.ts | 前端状态管理 |
| tests/fixtures/sample-repo/ | package.json + src/foo.ts + src/bar.test.ts        | 测试 fixture |

**测试执行**（Day 13 daily note 报告）：
- 总数：27 files / 175 passed / 2 skipped
- 4 闸必跑：typecheck / vue-tsc / eslint / vitest 全绿

**测试层级**：
- ✅ 单元测试：libs/* 全覆盖（每个纯函数 / 关键路径）
- ✅ 集成测试：apps/api SSE + Trace
- ✅ E2E：tests/apps/api/repo-tools-e2e.test.ts（Agent 调 repo_index tool）+ multi-turn.test.ts
- 🟡 前端测试：仅 lib 函数（sessionUsage） + call-chain（类型映射），UI 组件未测试

**手工验证**：
- ✅ Day 13 真跑 ex_001-004（chunk / evaluate / top-K / RAG 闭路）
- ✅ Chrome MCP 浏览器端到端（Day 05 起累计多次）
- ✅ Dev 网关真 LLM 验证（Day 12/13 Panel + RAG）

---

## 15. 已讨论但尚未实现

> 这一节至关重要。已讨论 ≠ 已实现。

| 概念              | 状态     | 来源 / 说明 |
|------------------|----------|------------|
| Retry            | ❌ 未实现 | 仅讨论：错误 = error 事件，不重试 |
| Memory（LTM）     | ❌ 未实现 | 仅前端 sessionUsage（HeaderBar 累加）；非 LTM |
| Reranker         | ❌ 未实现 | dev 网关有 qwen3-reranker-4b；Day 13 笔记 §7 提到 |
| MCP              | ❌ 未实现 | 仅在项目级 CLAUDE.md 边界提到 |
| CLI              | ❌ 未实现 | 仅 scripts/dev-dayXX.ts 工具 |
| File Edit Tool   | ❌ 未实现 | 路线表 Day 13/14 目标；今日 RAG 优先，Edit 顺延 |
| Permission       | ❌ 未实现 | 未讨论 |
| Rate Limit       | ❌ 未实现 | 未讨论 |
| Persistence      | ❌ 未实现 | TraceCollector in-memory LRU 32；重启 = 丢 |
| ConversationStore | ❌ 未实现 | 仅前端 conversation ref；不持久化 |
| Cost / USD 计价  | ❌ 未实现 | Day 08 砍掉 |
| Cache hit 观测   | ❌ 未实现 | Day 08 砍掉 |
| 多模态 / Vision  | ❌ 未实现 | 未讨论 |
| Tool result UI 渲染 | ❌ 未实现 | apps/web 仅展示 output JSON；不做渲染分块 / 图片 |
| 反例评估（LLM-judge） | ❌ 未实现 | Day 13 evaluate 只用关键词命中；LLM-judge 留给 Day 16-17 |
| Vector store 多租户 | ❌ 未实现 | 单进程单库；不做 namespace |
| Token rate limit | ❌ 未实现 | 未讨论 |
| Stream tool_calls | ❌ 未实现 | tool_calls iter 不流式（仍走 request/response） |

---

## 16. 已经实现但理解可能不扎实的知识

> 这里不替你判断"掌握"。只标"接触过，是否真懂需要进一步验证"。

| 知识              | 接触位置                                  | 建议验证深度 |
|------------------|-------------------------------------------|--------------|
| Token             | ChatUsage / context-counter              | 未深入：token 怎么计费 / cache_token / reasoning_token |
| Embedding         | libs/embedding/embed.ts                  | 未深入：Matryoshka 嵌套维度 / 内积归一化 |
| Transformer       | 未在本项目实现                             | 路线表 Day 17+ 才学 |
| Attention         | 未在本项目实现                             | 路线表 Day 17+ 才学 |
| Agent Loop        | libs/agent/agent.ts + runEvents          | ✅ 真实现，但 final-answer iter 双重调用 LLM 的取舍是 Day 10+ 评估话题 |
| Tool Calling      | 4 个 tool 真跑                            | ✅ 真实现 |
| Streaming         | OpenAI / Anthropic 双 provider stream   | ✅ 真实现，但 OpenAI stream_options.include_usage 未开 |
| SSE               | apps/api/src/sse-adapter.ts              | ✅ 真实现，未深入 event id / retry / 心跳 |
| AsyncGenerator    | stream() 实现 / runEvents()              | ✅ 真实现 |
| AbortSignal       | Day 07 全链路                             | ✅ 真实现，未深入：stream 取消时的 resource cleanup |
| Retry             | libs/agent/agent.ts 注释提到 YAGNI       | ❌ 未实现 |
| RAG               | libs/rag/ + libs/embedding/              | ✅ 真跑 5 query 跑分，但 reranker 阶段未做 |
| Reranker          | dev 网关有 qwen3-reranker-4b             | ❌ 未使用 |
| WebSocket         | 未在本项目实现                             | 全局用 SSE，不涉及 |
| Token counting    | countContextTokens (Anthropic only)      | ✅ 真实现（Anthropic 适配）；OpenAI 不支持（best-effort 跳过） |

---

## 17. 当前最容易混淆的概念

| 概念对                   | 区别                                                                                  |
|-------------------------|---------------------------------------------------------------------------------------|
| AsyncGenerator vs SSE   | AsyncGenerator = JS 内部异步迭代协议（`for await` 消费）；SSE = HTTP 文本协议（`event:` + `data:` 帧）。SSE adapter 把 AsyncGenerator 编码成 SSE 帧。 |
| ChatClient vs Agent     | ChatClient = 单次 LLM 调用的抽象（chat / stream）；Agent = 编排层，循环调用 ChatClient + 处理 tool_call + 暴露 AgentEvent。 |
| Tool vs ToolRegistry    | Tool = 单个工具的定义 + execute；ToolRegistry = 多个 Tool 的容器 + 校验 + 查找 + 派生。ToolRegistry.execute() 是唯一正确调用入口。 |
| LLM vs Agent            | LLM = 模型本身（ChatClient 调它）；Agent = LLM + Tool + Loop + Event 模型。 |
| Embedding vs Reranker   | Embedding = 向量粗排；Reranker = 用更精细模型对 top-K 重排（精度更高）。本项目只用 embedding。 |
| Streaming vs SSE        | Streaming = LLM 增量产出（AsyncGenerator<ChatChunk>）；SSE = 把流推到浏览器。两者经常配合但概念正交。 |
| Protocol vs Internal Programming Model | AgentEvent = Internal Programming Model（判别联合）；SSE = Protocol（外部传输格式）。前者类型安全，后者 forward-compat 友好。 |
| request vs response     | request = 调用 LLM 前的事件（带累积 messages 深拷贝）；response = 调用 LLM 后的事件（带 content/toolCalls/usage）。前后两次事件围成一次 LLM 调用。 |
| message_start / iteration / message_end | message_start = runEvents 入口一次；iteration = 每轮 LLM 调用前；message_end = 最终 content 到达。三者不能混。 |
| run_summary vs message_end | run_summary 总在 message_end / error 之前 yield（partial 累加也给前端看）。两者是连续事件，不能倒。 |
| chunk vs chunk_strategy | chunk.ts 的 chunk = Markdown 切块；embedding 的 chunk vs token chunk = 不同粒度。chunk.ts chunk 含 byteStart/byteEnd。 |

---

## 18. 当前技术债

> 从代码实际情况出发，不凑数。

### 高优（影响下一阶段推进）

1. **final-answer iter 双重调用 LLM**：final-answer iter 先 `chat()` 探测拿 usage，再 `stream()` 拿 delta → 双重 token 计费。注释明确"Day 10+ 评估一次 stream 方案"。建议下次重构优先解决。
2. **OpenAI `setModel` 失败语义**：保持 void，模型无效由底层 SDK 抛。Day 02 决策，但未做类型守卫。
3. **CountContextTokens 仅支持 Anthropic**：OpenAI 不支持 count_tokens → context 事件不 yield。best-effort 但 UI 上 OpenAI 用户看不到进度条。
4. **TraceCollector 不持久化**：LRU 32 in-memory，重启即丢。Day 06 决策"Day 10+ 评估持久化"。

### 中优（设计债）

5. **ChatResponse 不含 latency / cost**：注释明确"Day 10+ 评估"。HeaderPill 用法已有，缺 latency 后看 agent 性能盲。
6. **Tool 描述无国际化**：description 是英文。中文场景描述会不一致。
7. **`error` 事件没有 stack**：仅 message 字符串。debug 时拿不到 trace。
8. **前端 conversation 无持久化**：page refresh = 清空。已讨论，未做。
9. **`isAgentEvent` 类型守卫**：Day 08 注释提到，未在本项目（仅 docs 描述）。

### 低优（边角）

10. **eslint 部分规则可能冗余**：未审计。
11. **tsconfig.build / tsconfig.test 双文件**：维护成本小，未优化。
12. **apps/web 组件级测试缺失**：仅 lib 函数 + call-chain。
13. **lancedb `.lancedb/` 目录**：进 .gitignore，但首次构建需要创建。spec 没自动建目录。

---

## 19. 当前能力地图

```
LLM
├── ChatClient (chat / stream / setModel / signal / usage)
│   ├── OpenAIChatClient       ✅ 真跑
│   └── AnthropicChatClient    ✅ 真跑
├── MODELS registry (6 models) ✅ 真跑
└── countContextTokens        ✅ Anthropic only

Agent Runtime
├── AgentEvent (12 kind)       ✅ 全部实现并验证
├── runEvents / run             ✅ 真跑多轮 + 流式 + signal
├── Tool Calling (4 tool)       ✅ calculator / repo_index / repo_search / file_read
└── Streaming final answer      ✅ Day 07

Tools
├── ToolRegistry                ✅ zod 单一事实源
├── runTool 校验                ✅ ADR 0003
└── 4 个具体 tool                ✅ 全部有反例 + e2e

Infrastructure
├── Hono (POST /agent)          ✅
├── SSE adapter                 ✅
├── TraceCollector in-memory    ✅ LRU 32 + addMeta
├── Vue 3 + Tailwind 4          ✅
├── Agent Console               ✅ 三栏布局 + 流式 + abort
└── /embed-demo                 ✅ hash 路由

RAG
├── Embedding (OpenAI 兼容)     ✅ NaN 修复
├── Distance (cosine / euc)     ✅
├── PCA (2D, 手写)              ✅
├── chunkByHeading              ✅ heading 4/5
├── chunkByParagraph            ✅ paragraph 2/5
├── VectorStore (lancedb)       ✅
├── VectorStore (memory)        ✅
├── retrieve                    ✅ embed → search → top-K
├── RAG prompt (三段式)         ✅
├── evaluate (5-7 query)        ✅ 真跑分
├── test-corpus 支持            ✅ 4 表库
└── 增量入库 (mtime + hash)     ✅ Day 13
```

**状态标记说明**：
- ✅ 已实现并验证
- 🟡 已实现但验证不充分
- 🔵 只讨论/学习
- ❌ 尚未实现

---

## 20. 当前学习进度判断

### 已经真正做过（代码 + Git 确认）

- TypeScript monorepo 工程脚手架（Day 01）
- ChatClient 双 provider + 流式（Day 02-03）
- Agent Loop + Tool Calling（Day 04）
- AgentEvent 判别联合 + SSE Adapter + Web UI（Day 05）
- CI 闭环 smoke + TraceCollector（Day 06）
- AbortSignal + 流式 content + Token Usage（Day 07）
- Context Window 观测 + Tailwind（Day 08）
- 多轮对话 + systemPrompt 下放（Day 09）
- RepoIndex / RepoSearch / L1 闭环（Day 10）
- Tool zod schema 单一事实源 + FileRead（Day 11）
- Embedding + 4 可视化 Panel（Day 12）
- RAG 最小闭环 + 增量入库（Day 13）

### 已经学过但需要复习

- `libs/embedding/` 全部内容（distance / pca / embed）—— 涉及数学概念（cosine / PCA power iteration）
- `libs/rag/evaluate.ts` 评估口径决策（all vs any 模式）
- `libs/llm/observability/context-counter.ts` Anthropic count_tokens 用法
- `ToolRegistry.execute()` zod 校验的 zod 4 API（`z.coerce.number()` / `z.union([z.boolean(), z.stringbool()])`）

### 只讨论过（代码未实现）

- Retry / Reranker / MCP / FileEditTool / CLI / Permission / Rate Limit / Persistence
- LLM-judge 评估（Day 13 仍只用关键词命中）
- Stream tool_calls（tool_calls iter 不流式）
- Tool result UI 渲染分块
- Token cost / USD / cache hit 观测
- 多模态 / Vision

### 完全没有涉及

- WebSocket
- Transformer / Attention 内部实现（路线表 Day 17+ 才学）
- Prompt engineering 系统性方法（讨论过 RAG prompt "using only" 约束，无系统方法）
- AsyncIO / 并发 / 并行 tool 执行（明确 YAGNI）
- Vector store 多租户 / namespace
- Web UI 组件测试（仅 lib 函数测试）

---

## 21. 给外部 AI 助教的"下一步输入"

### 当前已经具备的能力

- L1: ChatClient 抽象 + 双 provider + 流式
- L2: Tool + ToolRegistry + zod 校验
- L3: Agent.runEvents + 12 kind AgentEvent
- L4: Hono SSE + TraceCollector
- L5: Vue 3 + Tailwind 4 Agent Console + /embed-demo
- RAG: Embedding + chunk + retrieve + 增量入库 + evaluate

### 当前明显缺口

1. **FileEditTool**（路线表原 Day 13 目标，顺延）：cat -n 行号已就绪（FileReadTool 提供），缺 Edit 工具。
2. **Agent + tools 完整 loop**（路线表 Day 14）：当前 Agent 已能调 tool，但缺"model 想改 → tool 执行 → model 看 diff → 决定下一步"的真实反馈回路（FileRead 已支持，但 Edit 未做）。
3. **Reranker**：dev 网关 qwen3-reranker-4b 已有；evaluate 阶段可引入。
4. **Retry / 错误恢复**：错误 = 立即 error 事件，无重试。
5. **Persistence**：TraceCollector in-memory，跨进程丢。

### 最近刚完成的内容

- Day 13：RAG 最小闭环（chunk / retrieve / evaluate / 增量入库）+ 18 反例 + 4 闸必跑全绿
- Day 12：Embedding + 4 可视化 Panel
- Day 11：Tool zod schema 单一事实源 + ADR 0003

### 可能适合下一步深入的方向

- **FileEditTool** + **Agent + tools 完整 loop**：补齐 L1 的最后一只手（Read / Edit / Search 闭环）
- **Reranker**：evaluate 增强 → top-K 精排
- **Retry**：错误恢复（YAGNI 边界已松动）
- **Cost / latency 观测**：与 context window 同源

### 不应该重复学习的内容

- ❌ AbortSignal 基础（Day 07 已实现）
- ❌ ChatClient 抽象（Day 02-03 已稳定）
- ❌ Tool 基础（Day 04 + Day 11 已稳定）
- ❌ Embedding 基础（Day 12 已落地）
- ❌ SSE 协议基础（Day 05 + Day 07 已落地）
- ❌ Agent Loop 基础（Day 04 + Day 05 + Day 07 已稳定）

### 路线表线索（参考 docs/daily/ 与已存档的 spec）

- 路线表 Day 14: `Agent + tools` 完整 loop（Edit 工具 + model 看 diff）
- 路线表 Day 16-17: RAG 增强 / LLM-judge 评估 / Reranker
- 路线表 Day 17+: Transformer / Attention 实现

---

## 22. 最重要的准确性要求

本文件最终区分：

### A. 已实现
代码中存在 + Git 可确认（182 commits 都有对应代码 / spec / test / example 落地）。

### B. 已验证
实际运行 / 测试确认（`pnpm test` 27 files / 175 passed + 真 LLM demo 跑通 + Chrome MCP 浏览器端到端）。

### C. 已讨论
Claude Code 与用户讨论过（如 Retry / Reranker / MCP / FileEditTool 顺延等）。

### D. 计划中
未来准备做（路线表 Day 14+）。

四类严格不混。

---

## 23. 自检核对

| 检查项 | 状态 |
|-------|------|
| Day01-13 是否全部覆盖？ | ✅ |
| 每天是否都有 Git 依据？ | ✅（每个 Day 都有 commits + spec + daily note） |
| 有没有把"讨论"误写成"实现"？ | ✅（§15 已讨论未实现 已明确列出） |
| 有没有把"实现"误写成"验证"？ | ✅（§14 测试情况 已区分自动 / 手工 / 验证状态） |
| ChatClient 是否以当前代码为准？ | ✅（§7 完整列出当前接口 + 演进过程） |
| Agent Loop 是否以当前代码为准？ | ✅（§8 流程图基于 libs/agent/agent.ts 当前真实代码） |
| Tool Calling 是否以当前代码为准？ | ✅（§11 列出当前 4 个真实 tool） |
| SSE 是否以当前代码为准？ | ✅（§10 完整架构 + 端点 + 限制） |
| AbortSignal 是否以当前代码为准？ | ✅（Day 07 + §13 错误处理 已覆盖） |
| 有没有遗漏最近几个 commit？ | ✅（含 Day 13 Q7 / namespace fix / verbose report / incremental / test-corpus 5 commit） |
| 有没有遗漏当前工作区尚未提交但已经实现的代码？ | ✅（git status clean） |
| 有没有明确列出"尚未实现"的内容？ | ✅（§15 + §18 + §20 已分别覆盖） |

---

## 24. 输出汇总

| 项 | 值 |
|----|---|
| 文件创建位置 | `docs/AGENT_LEARNING_STATE.md` |
| 分析了多少个 Day | 13（Day 01 - Day 13） |
| 分析了多少个相关 commit | 182（git log --all --oneline 全量） |
| 当前确认已实现的核心能力 | 12 kind AgentEvent + 4 个 Tool + 双 provider ChatClient + SSE Adapter + Vue Agent Console + Embedding + RAG 闭环 + 增量入库 |
| 当前最大的 3 个学习缺口 | (1) FileEditTool 未做；(2) Reranker 未用；(3) Transformer / Attention 未涉及 |
| 当前最大的 3 个工程缺口 | (1) final-answer iter 双重调用 LLM（双重 token 计费）；(2) TraceCollector 不持久化；(3) CountContextTokens 仅 Anthropic（OpenAI 用户看不到进度条） |