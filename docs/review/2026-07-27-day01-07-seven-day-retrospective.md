# Day 01–07 七天深度复盘 — 2026-07-27

> 65 天 AI Agent 工程师训练营 · 第一个 7 天深度复盘
>
> 目的：把 7 天里**真正发生了的架构演进**还原成一份给未来自己的学习教材。
>
> 与 [2026-07-22-day01-05-architecture-review.md](2026-07-22-day01-05-architecture-review.md)（5 天节奏点 review）不同：
> 这份是 **full retrospective**，覆盖全 7 天，强调"为什么这样设计"和"git commit 还原的思考过程"。
>
> 数据源优先级：**git commit > day docs > 当前代码**。所有架构结论都从 git 历史倒推，避免"看现状猜历史"。

---

## 📊 一览

| 维度 | 数据 |
|---|---|
| 学习天数 | 7 / 65 |
| 累计 commit | 75 |
| 总测试 | **74 / 74 通过**（Day 07 末态） |
| 引入新依赖 | 3（`openai` / `@anthropic-ai/sdk` / `hono` + `@hono/node-server`） |
| 触发的 YAGNI 边界 | 多轮历史 / 持久化 / RAG / MCP / 多 Agent / WebSocket / parallel tool / streaming tool_call / latency-cost / schema validation |
| 守住的核心原则 | ChatClient 抽象 / 判别联合 / 单向依赖 / snapshot 语义 / source vs derived 双写 |
| AgentEvent kind 数 | 7 → 10（每加一种都走修改五问 + ADR 路径） |
| 临时 API 残留 | 0（`onIteration` Day 04 加 / Day 05 删 / `chatWithTools` Day 04 加 / Day 04 末删） |

---

# 1. 七天路线总览

> 用 **commit + 演进** 双时间线还原"每天解决什么问题"。每行都是 git 历史真实产物，不是 day doc 自述。

## Day 01 — 工程脚手架 + 第一个 LLM 调用

- **学习目标**：65 天 monorepo 起点建立 + 真实 LLM smoke test 工作流
- **代码产物**：
  - `pnpm-workspace.yaml` + `tsconfig.json`（strict + NodeNext + ES2023）
  - `examples/day01/ex_001_chat_completion.ts`（OpenAI 兼容 API 调用）
  - `examples/day01/ex_002_nodemon_smoke.ts`（nodemon + tsx 热更新 smoke）
  - CI matrix（Node 22/24）+ Husky pre-commit + commitlint（Conventional Commits 强制）
  - `tests/smoke.test.ts`（CI 兜底）
- **关键 commit**：
  - `839ab30` chore: bootstrap monorepo
  - `17ea51b` feat(day01): add multi-turn chat demo
  - `5385d6b` chore: day01 dev tooling
  - `5a06243` chore: day01 env template
- **演进说明**：Day 01 没碰任何抽象，但立了**"边写边跑 + 真实 LLM smoke test"** 的工作流。这条工作流决定后面 6 天不会被"等我起个 docker 跑测试"卡住。

## Day 02 — ChatClient 抽象 + 多 Provider

- **学习目标**：把 SDK 调用关进 `libs/llm/`，承诺"换 provider 零改动"
- **代码产物**：
  - `libs/llm/message.ts`（Role type + Message readonly）
  - `libs/llm/chat-client.ts`（`ChatClient { chat, setModel }` 接口）
  - `libs/llm/openai-chat-client.ts`（OpenAI 协议实现）
  - `libs/llm/anthropic-chat-client.ts`（Anthropic 协议实现，**Day 02 末尾因外部 gateway 触发提前落地**）
  - `examples/day02/ex_001_chat_client.ts` / `ex_002_anthropic_chat_client.ts`
- **关键 commit**：
  - `c851ad8` feat(day02): ChatClient abstraction with OpenAI provider
  - `0e6bf1f` docs(day02): daily note
  - `fef2331` feat(day02): split ChatClient per-provider + AnthropicChatClient
  - `a7bb68f` ci(day02): skip coverage check
- **演进说明**：
  - **抽象 ≠ 给 SDK 换名字**。Anthropic 的 `system` 顶层化 + `content` blocks + `max_tokens` 兜底三个差异**完全消化在 `AnthropicChatClient` 内部**，调用方只调 `chat([...])`。
  - **第一次兑现"多 provider 并存"**：`git mv chat-client.ts → openai-chat-client.ts`，让"每 provider 一文件"成为对称模式。**这是后面加 GeminiChatClient / DeepSeekChatClient 不需要碰中心文件的纪律起源**。
  - 引入 `@anthropic-ai/sdk` 是核心链路新依赖 → 走"灰区"流程（外部触发 + 当日落地 + ADR 留痕）。

## Day 03 — Streaming（additive，不 replace）

- **学习目标**：验证 ChatClient 抽象能否在第二种调用形态下继续隐藏 provider 差异
- **代码产物**：
  - `libs/llm/chat-client.ts` 加 `stream(messages): AsyncIterable<string>`
  - `libs/llm/openai-chat-client.ts` 加 `stream()`（null delta skip）
  - `libs/llm/anthropic-chat-client.ts` 加 `stream()`（双判别联合 + 抽 `toApiMessages()`）
  - `examples/day03/ex_001_openai_stream.ts` / `ex_002_anthropic_stream.ts`
- **关键 commit**：
  - `471469c` docs(day03): streaming design spec
  - `122b5c1` / `e578a93` docs: spec self-review + implementation plan
  - `4628c01` feat(day03): add stream() to ChatClient interface
  - `b228718` feat(day03): OpenAI stream() implementation
  - `c1e8696` feat(day03): Anthropic stream() implementation
  - `4229361` / `30b9e76` feat(day03): OpenAI / Anthropic stream demos
  - `7987bac` refactor(day03): extract toApiMessages helper（review 抓出 duplication）
  - `3f6cb05` ~ `ccf17c2` docs: daily note + 3 fix commits（line refs / commit count math / review findings）
- **演进说明**：
  - **候选 A（add `stream()`）赢候选 B（改 `chat()` 返回 AsyncIterable）**。理由：Day 02 调用方 0 行修改 + 流式是显式选择而非默认。`Promise<string>` 与 `AsyncIterable<string>` 是不同形态，**additive 不等于无成本**（implements ChatClient 的类要补实现，TS2420 抓得出）。
  - **`AsyncIterable<string>` 是 SDK 抽象层，不是传输层**。CLAUDE.md "禁止裸 chunk 作为业务协议"约束的是 transport/UI 层，不是 `libs/llm` —— 这条边界纪律让 libs/llm 永远不引入 HTTP / SSE 依赖。
  - **review 抓 duplication → 抽 helper**：Task 4 初版 `chat()` 和 `stream()` 各持一份 byte-identical 的 system 提升 + content blocks 转换。提交 `7987bac` 把 helper 抽到 AnthropicChatClient 私有，`chat()` / `stream()` 共享。**YAGNI 时机是"第二个真实 copy site 出现"**，不是预测。

## Day 04 — Agent Loop + Tool Calling

- **学习目标**：让 LLM 能调工具并收敛到最终答案；统一 ChatClient 形态
- **代码产物**：
  - `libs/tools/tool.ts`（ToolDefinition 事实源 + Tool interface）
  - `libs/tools/tool-registry.ts`（register / get / list / toProviderTools）
  - `libs/tools/calculator-tool.ts`（自写 tokenizer + shunting-yard + RPN，**无 eval / new Function**）
  - `libs/llm/chat-client.ts` 重构：`ChatRequest = { messages, tools? }` / `ChatResponse = { content?, toolCalls? }`
  - `libs/agent/agent.ts`（最小 Agent 类：chat → tool_call → execute → chat，maxIterations=5）
  - `examples/day04/ex_001_calculator_agent_openai.ts` / `ex_002_calculator_agent_anthropic.ts`
  - `tests/libs/{tools,agent}/`（calculator / registry / agent 三个测试）
- **关键 commit**：
  - `7f2db07` / `a1b78f1` / `0c47915` docs: Day 04 spec + 2 fixes
  - `223745c` feat(day04): libs/tools layer with CalculatorTool
  - `ca9452c` feat(day04): extend libs/llm with ToolCallData
  - `618a3d0` feat(day04): add chatWithTools to ChatClient interface
  - `95ba99c` feat(day04): OpenAI chatWithTools
  - `c476715` feat(day04): Anthropic chatWithTools
  - **`2585449` refactor(tools): move ToolDefinition to libs/tools/tool.ts**
  - **`b23e801` fix(llm): replace as-unknown casts with proper tool message mapping**
  - **`32a8ddda` feat(agent): add Agent loop for tool calling**
  - `cf27423` feat(examples): day04 calculator demos
  - `86ab5a46` test: calculator / registry / agent tests
  - `3ff54dd` refactor(llm): **unify chat/stream with ChatRequest**（删除 `chatWithTools`）
- **演进说明**：
  - **`ToolDefinition` 位置之争**：spec 原放 `libs/llm/tool-call.ts`，实施时发现 `libs/llm` 已经 `import type ToolParameters from libs/tools` —— 把 ToolDefinition 放到 `libs/tools/tool.ts` 消除双事实源。**协议字段归协议层，工具定义归工具层**，调用方 import 路径不变。
  - **`chatWithTools` 加了又删**：初版三个方法（`chat` / `stream` / `chatWithTools`），肥老大指出 "普通聊天和工具调用是同一种能力的不同输入"。最终 `chat(ChatRequest)` / `stream(ChatRequest)`，`ChatRequest.tools` 是 optional。**扩展性优于穷举** —— 加字段比加方法便宜。
  - **`as unknown as OpenAI.Chat.*` 硬 cast 是撒谎**：Day 02/03 字段少时能用，加 `toolCalls` / `toolCallId` 后 cast 会丢语义。`b23e801` 引入 `toOpenAIMessages` / `toApiMessages` 显式映射 assistant + tool role → 各 provider 期望的形态。**Anthropic 没有 `tool` role** —— tool result 必须放在 `user` 消息的 `tool_result` block 里。
  - **CalculatorTool 是 security baseline**：用 tokenizer + shunting-yard + RPN 替代 `eval` / `new Function`。**允许任意代码执行 = 把 LLM 输出直接变成 RCE 入口**。今天 `args: unknown` 是 runtime trust 信任，Day 10+ 评估 zod / ajv 引入时机。
  - **`onIteration` 出生当日就活不久**：Day 04 留了回调，Day 05 删（详见下）。

## Day 05 — AgentEvent + SSE + Web UI（三阶段交付）

- **学习目标**：把 Agent 暴露成 SSE HTTP 端点 + 单页 Web UI
- **代码产物**：
  - `libs/agent/event.ts`（**AgentEvent 判别联合**，7 kind：message_start / iteration / tool_call / tool_result / message_end / done / error）
  - `libs/agent/agent.ts` 重构：加 `runEvents()` + `run()` 改为 `runEvents()` 收尾版 + **删 `onIteration`**
  - `apps/api/` 新包：`createAgentApp` + `sse-adapter`（framework-agnostic）+ `web-loader`
  - `apps/api/src/web/index.html`（**单 HTML 文件**，内嵌 CSS + 原生 JS，零构建）
  - `examples/day05/ex_001_sse_agent.ts` / `ex_002_web_ui.ts`
  - `tests/apps/api/`（sse-adapter 单测 + server 集成测试 + web-html 断言）
  - 阶段三扩 2 kind：`request` / `response`（调用过程快照）
  - **ADR-0001**：Tool capability MUST NOT embed in systemPrompt
- **关键 commit**：
  - `09d5589` chore: add AgentEvent/SSE protocol directive to global CLAUDE.md
  - `3e12fd2` feat(agent): AgentEvent + runEvents, drop onIteration
  - `e27dd9d` refactor(examples): day04 calculator demos to runEvents
  - `7310645` feat(apps/api): expose agent over SSE + Web UI
  - `2f596a7` docs(day05): SSE adapter and Web UI notes
  - `e75544a` docs(review): **day01-05 architecture review**（首篇 5 天节奏 review）
  - `a906335` feat(agent): **expose request and response events**（阶段三）
  - `1cf1b2a` feat(apps/api/web): show request and response in execution timeline
  - `6d552d5` docs(review): sync day01-05 review
  - `18a41ec` refactor(examples): **strip tool descriptions from demo systemPrompts**
  - `648cd32` docs(day05,review): record systemPrompt vs ToolDefinition separation
  - `a292fdd` docs(adr): **record systemPrompt vs ToolDefinition separation（ADR-0001）**
- **演进说明**：
  - **判别联合 vs 平铺 optional**：Day 04 反思题 #5 的答案。`ChatResponse` 用 optional 字段时消费方写 `if x !== undefined` 串行判断；AgentEvent 用 `kind` 后消费方 `switch` 不会漏 case（TS 自动收窄）。**SSE 是外部消费契约，类型收窄是免费的运行时安全**。
  - **`runEvents()` 是 `run()` 的真子集，不是并列**：`run()` 内部 `for-await runEvents()` 收尾。loop 只写一遍，两个入口不可能分叉。**`onIteration` 回调被替代品取代即删**，不留兼容层（"加 if 兜住反模式"）。
  - **`tool_call` / `tool_result` 严格 1:1 配对是 Agent Loop 的不变量**，不是约定俗成。SSE 消费方可以做超时检测（发出 `tool_call` 后 N 秒没收到 `tool_result` 即异常）。
  - **`sse-adapter.ts` 输出 `{ event, data }` 不返回 Response / SSE 字符串帧**：单测一行可验证，未来换 Fastify / Express / Web Response 都不动 adapter。`server.ts` 才耦合 Hono。
  - **`createAgentApp({ agent })` 不硬编码 ChatClient / ToolRegistry**：测试用 `FakeChatClient` 端到端验证，**不需要 mock HTTP**。
  - **400 vs error 事件边界**：协议层（缺 input）走 HTTP status；Runtime 层（maxIterations / chat 抛错）走 SSE 事件。**两种错误的"通道"分离**，而不是塞一个 try/catch 兜底。
  - **三阶段同日交付**：阶段一 libs/agent + apps/api SSE（5 commit）→ 阶段二 Web UI 双栏（肥老大追加）→ 阶段三 Timeline 详细化（"整个调用过程都显示出来"反馈）。**`request` / `response` 事件把"调用过程"全可视化**——调用前 messages 累积、调用后 ChatResponse 都暴露。
  - **ADR-0001 起源**：肥老大 Day 05 指出 4 处 demo systemPrompt 重复 "You have access to a calculator tool..." 是错位。`ToolDefinition.description` 已经是 LLM 能看到的协议字段，把工具描述塞进 systemPrompt 是同一信息的两个出口 + 维护陷阱（加 tool 要改 4 处 prompt）。**三层职责分离**：Agent Prompt（身份/行为） / ToolDefinition（协议） / Provider Adapter（差异）。**加新 tool → 只 `ToolRegistry.register`，不动 systemPrompt**。

## Day 06 — CI Smoke Test + Trace Collector

- **学习目标**：CI 不依赖真实 LLM 也能跑通端到端 + 让 Agent Runtime 可观测
- **代码产物**：
  - `tests/libs/agent/shared/fake-chat-client.ts`（可复用测试 helper，深拷贝 messages）
  - `tests/libs/agent/run-events.test.ts`（覆盖 9 kind 序列 + messages 累积）
  - `tests/apps/api/end-to-end.test.ts`（POST /agent 端到端 SSE 流）
  - `apps/api/src/trace-collector.ts`（`AgentTrace` + `TraceCollector` LRU 32）
  - `apps/api/src/server.ts` 增 `GET /traces` + `GET /traces/:runId`
  - `libs/agent/agent.ts` 改 `yield request` 时深拷贝 messages（snapshot 语义）
  - `tests/apps/api/trace-collector.test.ts`（5 个端到端测试）
- **关键 commit**：
  - `3ee7ebd` refactor(tests): extract FakeChatClient to shared helper
  - `9be48b4` test: cover agent runEvents and apps/api end-to-end with fake client
  - `70bd23b` docs(day06): CI smoke test notes
  - `a5fed60` feat(apps/api): in-memory trace collector + snapshot request messages
  - `ac369d5` test(day06): end-to-end trace collection + extend day06 notes
  - `b43cd9d` feat(day06): add day06 example folder with 3 self-test demos
- **演进说明**：
  - **`FakeChatClient` 必须深拷贝 messages**：Agent 内部对 `messages` 数组持续 push，所有 chat 调用共享同一引用。**测试要断言"第 N 次 chat 调用时 LLM 看到的是什么"——必须快照当时状态**。`request.messages.map(m => ({...m}))` 一行解决。
  - **Runtime 不知道 Trace 存在**：`libs/agent` 零感知 `TraceCollector`。Trace 是消费方关注的事，apps/api 层包一层。**这是 source（事件）vs derived（meta）的雏形**。
  - **Trace = events[] + meta**：events[] 是事实快照（真相源），meta 是 `Record<string, unknown>` 预留扩展点（Token / Latency / Cost / Permission...）。**预先不设计具体形状**，调用方决定往 meta 塞什么 key。
  - **snapshot 语义普适化**：所有"累积型"数据 yield 时深拷贝（messages、toolCalls），值类型不需要（content、usage）。**这不是一个细节，是一个 invariant** —— 消费方看到的是"当时"不是"最终"。
  - **CI 闭环 vs 真实 LLM demo 的隔离**：测试层全用 FakeChatClient，不读 `.env` / `OPENAI_API_KEY`；demo 层本地手动跑。**CI 是回归保护，demo 是人工验证，两种不要混**。
  - **断言写法要锁住"自己代码的契约"，不是环境状态**：`expect(process.env.OPENAI_API_KEY ?? '').toBe('')` 比 `toBeUndefined()` 更鲁棒（.env 存在时环境变量仍 defined）。

## Day 07 — Streaming Content + AbortSignal + Usage

- **学习目标**：收口 Day 06 留下的 4 个悬挂契约
- **代码产物**：
  - `libs/llm/chat-client.ts` 加 `ChatOptions { signal? }` + `ChatUsage`
  - `libs/llm/openai-chat-client.ts` / `anthropic-chat-client.ts`：signal 透传 + usage parse
  - `libs/agent/event.ts` 加 `message_delta` kind（**10 kind**） + `response.usage` optional
  - `libs/agent/agent.ts` 加 signal + **error throw → yield** + final-answer iter 切 `stream()` + usage 累积
  - `apps/api/src/trace-collector.ts` 加 `addMeta(runId, partial)`
  - `apps/api/src/server.ts`：AbortController + 监听 `request.signal` + meta usage 写入 + 删 try/catch
  - `apps/api/src/web/index.html`：打字机 streaming bubble + ▍ 光标 + `finalizeStreamingBubble`
  - Day 04 demos 加 usage 打印 + 流式输出
  - `examples/day07/ex_001_streaming_agent_openai.ts` / `ex_002_streaming_agent_anthropic.ts`
  - `run-events.test.ts` 加 5 个新场景（signal / error / streaming / usage）
- **关键 commit**（**12 commit**）：
  - Phase A 抽象层：`ac369d5` / `1009656` / `765a2be`（signal + usage 进 ChatClient）
  - Phase B Agent 层：`fe9804e` / `1cae03b`（message_delta + runEvents signal/error/streaming/usage）
  - Phase C 消费层：`79e2a89` / `ac08230` / `0ff83aa`（SSE / addMeta / server AbortController）
  - Phase D UI & demos：`090922a` / `b200d2f` / `520a942` / `badd1c4`（Web UI 打字机 / Day 04 demos / Day 07 demos / 测试）
  - `2b66965` docs(day07): daily learning note + spec + plan
- **演进说明**：
  - **`AbortSignal` 进 ChatClient 抽象层**：Day 02 立 ChatClient 时定"抽象层跟数据走"。Day 03 思考题 #3 留了"signal 应该进 ChatClient 还是 apps/api adapter"未答。**Day 07 答：ChatClient 契约层加 `ChatOptions { signal? }`**。如果 signal 只在 apps/api 监听，Agent.runEvents 拿不到 signal 状态，流式中断时 SDK 不知道，**已发 token 浪费**。
  - **error throw → yield（行为变更）**：Day 06 决策点留了 "error throw vs yield" 未决。Day 07 拍板：**所有错误统一 yield error 事件**。消费方统一不 catch（`for await` 看不到 throw 就接住），协议层错误（HTTP 400）走 HTTP status，业务层错误走 SSE event。**`Agent.run()` 保持向后兼容** —— 内部消费 runEvents error 事件再 throw new Error(message)。
  - **`message_delta` 限定在 final-answer iter**：tool_calls iter 不流式（仍走 request/response 事件），仅 final-answer iter 流式 yield message_delta。**Claude Code 风格**："AI 想 → 调工具 → 看结果 → 打字机答"。中间态 assistant 流式 = 信息噪声。
  - **Token Usage 双写**：ChatResponse.usage 是事实源（provider SDK 返回的），TraceCollector.meta.usage 是派生（apps/api 层累积多轮之和）。**Agent Runtime 不感知 Trace 存在** —— Trace 是消费方关注的事，Agent 只 yield 事件，apps/api 层决定怎么累积。
  - **chat + stream 双重调用的代价**：final-answer iter 双重 LLM 调用 = 双重 token 计费。Day 07 选 Plan Task 5 简化方案（chat 探测 + stream 流式）。**Day 10+ 优化方向**：单次 stream + 在 ChatChunk 加 `usage?` optional（仅最后一个 chunk 带）—— **今天不引入**（YAGNI，知道 generator return value 拿不到后，"接受 cost 先收口契约"是正确的简化方案）。
  - **Web UI 打字机：append 优于 replace**：message_delta 事件到来时累加到现有 bubble，message_end 时 finalize（去掉 streaming 类，去掉光标），**不重建节点**。CSS `▍` 光标 + `animation: blink 1s steps(1) infinite`。**流式语义（增量）跟渲染策略（append vs replace）解耦**。
  - **`signal?.aborted` truthy check 而非 `=== true`**：TypeScript control flow analysis 在多次 await 后把 `signal?.aborted` 收窄为 `false | undefined`，`=== true` 被认为永不为真（TS2367）。**等号 vs truthy check 的选择，在 strict 模式下要查类型兼容性，不是凭代码风格**。
  - **`commitlint` 拒绝大写开头的 subject**：`OpenAI` / `TraceCollector` / `AI` 都触发 `subject must not be sentence-case, start-case, pascal-case, upper-case`。所有 feat subject 改为全小写：**scope 内可以含专有名词缩写，subject 必须 lowercase**。

---

# 2. 架构演进图

## Day 1 — 零抽象，裸 SDK 调用

```
examples/day01/ex_001_chat_completion.ts
    ↓
new OpenAI({ apiKey, baseURL }).chat.completions.create(...)
```

- **状态**：所有逻辑在 demo 文件里
- **痛点**：换 provider / 加流式 / 加工具 全部要在 demo 里重写

## Day 3 — ChatClient 抽象 + Streaming 双入口

```
examples/day02/day03/ex_*
    ↓
libs/llm/chat-client.ts (interface: chat / stream / setModel)
    ├── OpenAIChatClient
    └── AnthropicChatClient
```

- **状态**：`libs/llm/` 成型，调用方零 provider 耦合
- **关键纪律**：每 provider 一文件 / `AsyncIterable<string>` 是 SDK 抽象不是传输 / helper 抽 in-provider 不抽 base class

## Day 5 — Agent Loop + Tool + AgentEvent + SSE

```
examples/day04/day05/ex_*
    ↓
libs/agent/agent.ts (run / runEvents)
    ├── libs/llm/chat-client.ts (chat / stream with ChatRequest)
    ├── libs/tools/tool-registry.ts
    └── libs/agent/event.ts (AgentEvent 7 kind)
            ↓
apps/api/src/server.ts (createAgentApp Hono)
    ├── apps/api/src/sse-adapter.ts (framework-agnostic {event, data})
    └── apps/api/src/web/index.html (单 HTML 双栏 UI)
```

- **状态**：从 SDK 调用 → Agent Runtime + 完整 HTTP/SSE 链
- **关键纪律**：AgentEvent 判别联合 / `runEvents()` 收尾版 / `tool_call:tool_result` 1:1 / ADR-0001 三层职责分离

## Day 7 — 当前架构（流式 + 可观测 + 可中断 + 可观测）

```
[Browser fetch / apps/api/test client]
    ↓ POST /agent
apps/api/src/server.ts
    ├── AbortController + request.signal
    ├── apps/api/src/trace-collector.ts (AgentTrace + meta)
    ├── apps/api/src/sse-adapter.ts (framework-agnostic)
    └── libs/agent/agent.ts (runEvents signal + error yield + final-iter stream)
            ├── libs/llm/chat-client.ts (ChatOptions { signal? } + ChatUsage)
            │   ├── OpenAIChatClient
            │   └── AnthropicChatClient
            └── libs/tools/tool-registry.ts (toProviderTools)
                    ├── CalculatorTool
                    └── (future: HttpTool / FileTool / ...)

[GET /traces/:runId]  ←──  TraceCollector (LRU 32, in-memory)
```

- **状态**：Agent Runtime 是 source（events[]），apps/api 层是 derived（meta.usage / Trace）
- **关键纪律**：snapshot 语义 / source vs derived 双写 / framework-agnostic adapter / Runtime 零感知 Trace / final-iter 流式 / message_delta 限定 final-iter

---

# 3. 核心概念复习

## 3.1 LLM API

### 为什么用 messages 而不是 prompt？

早期 LLM API（text-davinci-003 之前）是单字符串 prompt：`"Translate to French: Hello"`。但这个形态有 3 个问题：

1. **没有角色概念**：system 指令、user 输入、assistant 回复混在一个字符串里，模型分不清
2. **没有多轮**：第二轮要把整个历史拼成一个字符串，token 浪费 + 顺序容易错
3. **没有结构化输出入口**：tool calling、function calling 需要 metadata，单字符串放不下

`messages` 数组本质是 **structured prompt**：每个 message 有 `role`（system / user / assistant / tool）+ `content`（文本或多模态）+ 可选 metadata（tool_calls / tool_call_id）。**结构化让 SDK 能正确序列化、模型能正确理解、消费方能正确处理**。

### 4 种 role 的语义

| Role | 谁发 | 模型怎么理解 | 典型用途 |
|---|---|---|---|
| `system` | 调用方 | 优先级最高的全局指令（身份、行为、约束） | "You are a calculator expert. Always use the calculator tool for arithmetic." |
| `user` | 用户 / 调用方 | 真正的任务输入 | "What is 12345 * 6789?" |
| `assistant` | 模型 | 模型自己的回复（带 tool_calls） | "I'll use the calculator." + `tool_calls: [{id, name: 'calculator', args: {expression: '12345 * 6789'}}]` |
| `tool` | 调用方（执行工具后） | 工具执行结果回传（带 `tool_call_id` 关联） | `{role: 'tool', tool_call_id: '...', content: '83810205'}` |

**关键约束**：

- **Anthropic 没有 `tool` role** —— tool result 必须放在 `user` 消息的 `{type:'tool_result', tool_use_id, content}` block 里。这条差异在 `toApiMessages` 里消化。
- **`system` 在 Anthropic 是顶层字段**（不在 messages 数组），在 OpenAI 是 messages 数组第一条。`toApiMessages` 提取 system 提升到顶层。
- **`assistant` 必须有 `content` 字段**，即使只是 tool_calls 也写 `content: ''`，否则某些 SDK 会拒绝。

---

## 3.2 ChatClient

### 为什么需要抽象？

`libs/llm/chat-client.ts` 是 **provider 无感的边界**。它的存在不是"为了好抽象"，是为了解决 5 个具体问题：

| 没有抽象会发生什么 | 抽象层怎么解决 |
|---|---|
| 换 OpenAI → Anthropic 要改 N 个调用方 | 换 provider = 改一行 `new` |
| API key 写在调用方，浏览器 bundle 泄露 | 抽象层跟数据走，调用方永远拿不到 key |
| 协议差异（system 顶层化 / content blocks / max_tokens）散布业务代码 | provider class 内部消化 |
| 流式 / 非流式 / tool calling 各写一套 SDK 调用 | `chat` / `stream` 统一返回类型，调用方消费逻辑一套 |
| 测试要 mock 整个 SDK + HTTP | 测试用 `FakeChatClient implements ChatClient` 端到端验证 |

**抽象层跟数据走** 是 Day 02 §9 的核心 takeaway：谁持有 API key，谁持有 ChatClient。**浏览器永远只调 `fetch('/api/chat')`**，不直接调 SDK。

### 如果没有这一层会发生什么？

- **架构层面**：每个 Vue 组件都要知道 OpenAI 怎么调、Anthropic 怎么调 → 切模型 = N 处改
- **安全层面**：API key 在前端 Network 面板明文 → 用户 F12 刷光额度
- **测试层面**：业务逻辑跟 SDK 耦合，单测要 mount 整个组件 + mock SDK + mock HTTP
- **bundle 层面**：`openai` / `@anthropic-ai/sdk` 是 Node 包，含 `node:fs` / `node:http` → 进浏览器 bundle 爆掉（404 / undefined）

### 当前 ChatClient 接口（Day 07 末态）

```typescript
interface ChatClient {
  chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse>;
  stream(request: ChatRequest, options?: ChatOptions): AsyncIterable<ChatChunk>;
  setModel(model: string): void;
}

interface ChatRequest {
  readonly messages: Message[];
  readonly tools?: ReadonlyArray<ToolDefinition>;
}

interface ChatResponse {
  readonly content?: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly usage?: ChatUsage;  // 🆕 Day 07
}

interface ChatOptions {
  readonly signal?: AbortSignal;  // 🆕 Day 07
}
```

**Day 04 重构**：从 `chat(messages)` + `stream(messages)` + `chatWithTools(messages, tools)` 三方法 → `chat(ChatRequest)` + `stream(ChatRequest)` 两方法。**普通聊天是 `chat({messages})`，工具调用是 `chat({messages, tools})`** —— 同一种能力的不同输入。

**Day 07 重构**：加 `ChatOptions { signal? }` 和 `ChatResponse.usage`。`ChatUsage` 是 ChatResponse 的事实源（provider SDK 返回），Trace meta 是派生（apps/api 层累积）。

---

## 3.3 Agent Runtime

### Agent 和 ChatBot 的区别

| 维度 | ChatBot | Agent |
|---|---|---|
| 输入 | 用户消息 | 用户任务（可能多步） |
| 输出 | 单条回复 | 最终答案（中间可能调工具） |
| 循环 | 一次 chat → 一次回复 | chat → tool_call → execute → chat → ... → 收敛 |
| 终止 | 单次响应结束 | 拿到 content 或超过 maxIterations |
| 状态 | 单次 stateless | 累积 messages（含 tool results）|

**核心区别是 Agent 有 loop**：模型说"我要调工具"，执行，把结果喂回模型，模型再说下一步。**收敛条件是模型自己说"我有答案了"（content !== undefined）或达到 maxIterations**。

### 当前 Agent Loop 如何运行（Day 07 末态）

```
1. yield message_start
2. messages = [system?, user]
3. for i in [0, maxIterations):
   3a. if signal.aborted → yield error → return
   3b. yield iteration {n: i+1}
   3c. yield request {messages: snapshot}
   3d. probe = chat({messages, tools})   ←── Day 07：先 chat 探测
   3e. if probe.content !== undefined:
        - for-await stream({messages}):
          - if signal.aborted → yield error → return
          - if chunk.content → yield message_delta
        - response = {content: accumulated, usage: probe.usage}
       else: response = probe
   3f. yield response
   3g. if response.content !== undefined:
        yield message_end → yield done → return
   3h. if response.toolCalls:
        messages.push(assistant + tool_calls)
        for each toolCall:
          yield tool_call
          tool.execute(args) → output
          yield tool_result
          messages.push(tool + tool_call_id + content)
        continue  ←── 下一轮
4. yield error('exceeded maxIterations')
```

**关键不变量**：

- **`tool_call` / `tool_result` 严格 1:1 配对**：每个 tool_call 后面必有同名 tool_result。SSE 消费方可以做超时检测。
- **`message_end` 之后必跟 `done`**：成功路径终止；error 后不发 done（互斥）。
- **`request` / `response` 是过程快照**：每次 LLM 调用前后都 yield，消费方知道"调用前 LLM 看到了什么、调用后 LLM 返回了什么"。
- **`message_delta` 只在 final-answer iter**：tool_calls iter 不流式（中间态 assistant 流式 = 信息噪声）。

### 为什么需要 maxIterations？

**LLM 不会自动收敛**。它可能永远调同一个工具、永远不调工具、永远返回空 content。`maxIterations` 是 **硬上限**：超过即 yield error。

---

## 3.4 Tool System

### ToolRegistry 为什么存在？

ToolRegistry 是 **Tool 的中心注册表**，解决 3 个问题：

| 没有 ToolRegistry 会发生什么 | ToolRegistry 怎么解决 |
|---|---|
| Agent 直接持有 `Tool[]`，加 tool 要改 Agent | `registry.register(newTool)` 一行 |
| 序列化给 LLM SDK 的格式散落在 Agent | `registry.toProviderTools()` 单一入口 |
| 查找 tool 用线性扫描 O(N) | `Map<string, Tool>` 哈希 O(1) |

### ToolDefinition 和 Tool Execute 的区别

```typescript
interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
}

interface Tool<TArgs = unknown, TReturn = unknown> {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
  execute(args: TArgs): Promise<TReturn>;
}
```

**ToolDefinition 是协议字段**（发给 LLM 的），**Tool Execute 是运行时能力**（被 Agent 调用的）。

| 维度 | ToolDefinition | Tool Execute |
|---|---|---|
| 给谁看 | LLM（通过 `chat({tools})` 协议） | Agent（通过 `registry.get(name).execute(args)`）|
| 形态 | JSON-serializable | 函数 |
| 何时用 | 每次 LLM 调用前转 provider format | LLM 决定调 tool 时 |

**为什么要分开**：

- ToolDefinition 是**协议契约**（OpenAI function calling / Anthropic tool_use 各自有格式），归 `libs/tools/`
- Tool Execute 是**能力实现**（CalculatorTool 怎么算、HttpTool 怎么发请求），归 Tool 自身
- ToolRegistry 不关心 execute 怎么实现，只负责 register / get / list / toProviderTools

### 为什么 Tool 不应该拼到 systemPrompt？

**ADR-0001 的核心论证**：

1. **冗余**：`ToolDefinition.description` 通过 `chat({tools})` 协议已经发给 LLM，LLM 已经在结构化 tool block 里看到了工具描述。systemPrompt 再写一句 "You have access to calculator" = **同一信息的两个出口**。
2. **维护陷阱**：加 tool 要改 4 处 prompt（demo1 / demo2 / demo3 / demo4）。**"不要忘记更新 X"的耦合是隐式的**。
3. **职责错位**：systemPrompt 是 Agent 身份/行为（"You are a calculator expert"），ToolDefinition 是协议（"calculator takes {expression: string}"）。**两层职责强行耦合**。
4. **provider 不可移植**：未来某些 provider 不支持原生 tool calling，需要在 provider 层加 `PromptToolCallingAdapter` 把 ToolDefinition 转成 prompt text。**systemPrompt 里写死工具描述会污染 Agent 层**。

**纪律**：

- systemPrompt **不包含**任何工具描述
- ToolDefinition.description **不翻译**回 prompt
- 加新 tool → 只 `ToolRegistry.register`，**不动 systemPrompt**

---

## 3.5 Streaming

### 三者关系

```
SDK async generator (OpenAI / Anthropic)
    ↓ filter（null delta skip / double discriminant check）
ChatClient.stream() = AsyncIterable<ChatChunk>
    ↓ Agent 内部消费（final-answer iter）
Agent.runEvents() yield message_delta
    ↓ 编码（JSON.stringify）
SSE message {event: 'message_delta', data: '{...}'}
    ↓ 浏览器 fetch + ReadableStream
Web UI streaming bubble（append 而非 replace）
```

### AsyncGenerator vs AsyncIterable

```typescript
// 接口声明（宽）
stream(messages: Message[]): AsyncIterable<string>;

// 实现（窄）—— 必须是 async function*
async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
  ...
}
```

**关系**：

```text
AsyncGenerator<string, void, undefined>
        implements
AsyncIterator<string> + AsyncIterable<string>
                         ▲
                         │ interface 只依赖这一层
```

**接口宽，实现窄**：未来某 provider 可以直接包装 SDK 自带的 `AsyncIterable<string>`，不必为了满足接口再人为套一层 generator。**依赖能力，不依赖构造方式**。

### 重点：为什么 AsyncGenerator 不应该直接暴露给 Vue？

3 个具体问题：

1. **跨进程边界**：浏览器跑 JS 引擎、Node 跑 V8。generator 在 Node 端 yield，浏览器拿不到 iterator 对象 —— **必须经过 transport（SSE / WebSocket）**。
2. **断线 / 重连 / 缓冲**：generator 没有重连状态机、没有 Last-Event-ID 处理、没有心跳。**SSE 是 spec 自带这些语义的 transport**，generator 不替代。
3. **类型安全**：generator yield 的是 provider-specific 形态（OpenAI delta / Anthropic events），不是 ChatChunk。**消费方不应该被 SDK 类型污染**。

**正确分层**：

```
libs/llm/    AsyncIterable<ChatChunk>  ←── SDK 抽象层
apps/api/    AgentEvent + SSE          ←── 业务协议层
Browser      SSE 帧 + DOM              ←── UI 层
```

libs/llm 只产 ChatChunk（domain type）；apps/api 把它转成 AgentEvent（business event）+ SSE（transport）；UI 只消费 SSE 帧。**每一层只依赖下一层的契约，不穿透类型**。

---

## 3.6 AgentEvent

### 为什么需要 Event？

Agent.run() 返回 `Promise<string>` 看似够用，但 3 个场景立刻暴露问题：

1. **长任务可视化**：agent 跑 30 秒调 5 个工具，用户盯着空白屏幕不知道在干嘛
2. **调试**：模型走了错误路径，事后看不到为什么
3. **流式 UX**：agent 最终回复到达前，UI 应该能打字机效果

**Event 是 Agent Runtime 对外的过程契约**。**返回值是答案，事件是过程**。

### Event 和普通返回值的区别

| 维度 | 返回值 | Event |
|---|---|---|
| 形态 | `Promise<T>` | `AsyncIterable<T>` |
| 触发 | 函数执行结束 | 函数执行过程中多次 yield |
| 数量 | 1 个 | N 个 |
| 时序 | 只有"最终态" | 有"中间态" + "最终态" |
| 消费 | await | for-await |

### Event 对未来的意义

| 场景 | 没有 Event | 有 Event |
|---|---|---|
| **Trace** | 只能存最终 string，过程丢失 | 存 events[] = 完整过程快照 |
| **UI** | 等 30 秒突然出现一坨文本 | timeline 实时更新 + streaming bubble |
| **Debug** | 看不到模型为什么这么决定 | 看 request 累积 messages 还原推理路径 |
| **Evaluation** | 只能评分最终答案 | 能评估 tool_call 是否正确、循环是否合理、是否用了该用的工具 |
| **Replay** | 不能 | 存 events[] 后重放（`Agent.runEvents()` 不调真实 LLM，直接 yield 旧事件） |
| **A/B Test** | 不能 | 不同 prompt 对比 event 序列差异 |

**AgentEvent 不是"多此一举的协议"，是"未来 4 个能力的基础设施"**。

### 当前 AgentEvent（Day 07 末态，10 kind）

```typescript
type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | { kind: 'request'; iteration: number; messages: ReadonlyArray<Message> }
  | { kind: 'response'; iteration: number; content?: string; toolCalls?: ...; usage?: ChatUsage }
  | { readonly kind: 'message_delta'; readonly content: string }  // 🆕 Day 07
  | { kind: 'tool_call'; id: string; name: string; args: unknown }
  | { kind: 'tool_result'; id: string; name: string; output: string }
  | { readonly kind: 'message_end'; readonly content: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
```

**为什么判别联合不是平铺 optional**：

- `switch (ev.kind)` TS 自动收窄类型，每个 case 拿到的是 `content` / `toolCalls` / `usage` 都不存在的具体形态
- 加新 kind 是显式扩展联合，旧消费者必须 handle（否则 TS 报错）
- SSE 消费方 `EventSource.addEventListener('tool_call', ...)` 天然可用 —— `kind` 直接复用

---

## 3.7 Trace

### 为什么需要 Trace？

AgentEvent 是**流**（每次执行一份）。Trace 是**历史快照**（多次执行的存档）。

| 维度 | Event | Trace |
|---|---|---|
| 形态 | 流（yield-by-yield） | 快照（events[] + meta） |
| 数量 | 每次执行 1 份 | LRU 32 份（最近 32 次） |
| 持久化 | 不（消费完即丢） | 是（in-memory Map） |
| 查询 | 不能（只能消费） | 能（按 runId 拿完整 events + meta） |

### Trace 和 Event 的关系

```typescript
interface AgentTrace {
  readonly runId: string;
  readonly startedAt: number;
  endedAt: number | undefined;
  events: AgentEvent[];             // source：原样保存事件流
  meta: Record<string, unknown>;   // derived：调用方累积（usage / latency / cost）
}
```

**source vs derived 双写**：

- `events[]` 是真相源（agent yield 什么就存什么，不改）
- `meta` 是派生数据（apps/api 层累积 totalUsage、计算 latency、估算 cost）
- **新增 derived 字段不改 source 字段** —— Day 07 加 `meta.usage` 时 `ChatResponse.usage` 早已是事实源

### Trace 的关键设计选择

| 选择 | 理由 |
|---|---|
| **In-memory** | Day 06 够用，Day 10+ 评估持久化 |
| **LRU 32** | 测试可预测；不会内存爆炸；足够看最近 32 次 |
| **Runtime 不知道 Trace 存在** | libs/agent 零感知；Trace 是消费方关注的事 |
| **snapshot 语义** | events[] 是过去事实，不是累积污染 |
| **`addMeta(runId, partial)`** | 调用方累积 derived；shallow merge 不深拷贝 |

---

## 3.8 AbortSignal

### 为什么不是 Agent 配置？

```typescript
// ❌ 错：signal 放 AgentOptions
const agent = new Agent({ chat, tools, signal });
agent.run(input);   // signal 是 Agent 的属性？

// ✅ 对：signal 放 Execution Context
agent.runEvents(input, { signal });
```

**理由**：

1. **生命周期不同**：Agent 是长期对象（构造一次用多次），signal 是**单次执行的上下文**（每次 fetch 独立 AbortController）
2. **多消费方隔离**：浏览器一个 tab 一个 signal，服务端一个请求一个 signal —— 不能让所有执行共享同一个 signal
3. **跨调用方传递**：浏览器 `request.signal`（fetch 自带）→ Node `AbortController.signal` → ChatClient → SDK。**signal 沿调用链透传**，不是 Agent 内部状态

### 为什么属于 Execution Context？

```typescript
async runEvents(userInput: string, options?: AgentRunOptions): AsyncIterable<AgentEvent>

interface AgentRunOptions {
  readonly signal?: AbortSignal;
}
```

**Agent 是无状态对象**（除了 chat / tools / systemPrompt 配置）。**每次 `runEvents(input, options)` 是独立的执行上下文**。signal 是 context 的一部分，不是 Agent 的属性。

### 调用链

```
Browser fetch
  └→ request.signal (AbortSignal)
       └→ apps/api/server.ts: c.req.raw.signal.addEventListener('abort', ...)
            └→ AbortController
                 └→ agent.runEvents(input, { signal })
                      ├→ chat({messages, tools}, { signal })  → SDK signal
                      └→ stream({messages}, { signal })        → SDK signal
                           └→ OpenAI / Anthropic SDK terminate request
```

**关键**：

- **signal 是 Web 标准 API**（Node 22 全实现），provider SDK 都接受第二参数。**不引入第三方 polyfill**
- **每个 yield / 每个 chunk 后都检查 signal**（agent.ts 第 91 / 113 / 123 行）—— 不是只在循环开头检查
- **signal abort 后 yield error + return**，**不发 done**（error 跟 done 互斥）

---

# 4. 重要设计决策（ADR）

> 命名仿照 `docs/adr/0001-*.md`。已存在的 ADR-0001 在 [0001-tool-capability-must-not-embed-in-system-prompt.md](../adr/0001-tool-capability-must-not-embed-in-system-prompt.md)。
>
> 以下 ADR 是**回顾性归纳**（commit 已落地，事后提炼设计动机），不是"未来要写"。每条都标注证据 commit。

## ADR-001: ChatClient 抽象

**背景**：Day 01 所有逻辑在 demo 里，OpenAI SDK 直接调。Day 02 要开始"换 provider 零改动"。

**当时的问题**：

- 协议差异（system 字段、content blocks、max_tokens）硬编码在 demo 里
- 换 Anthropic 要改所有调用方
- 业务逻辑跟 SDK 耦合，无法测试
- API key 在调用方（潜在泄露风险）

**考虑过的方案**：

- **方案 A**：每个 provider 一个 class，统一 interface `ChatClient`（✅ Day 02 选）
- **方案 B**：工厂方法 `ChatClient.create({ baseURL })` 自动判 —— ❌ baseURL 不可靠、隐藏决策、不可控
- **方案 C**：单 class + provider 参数 `new UnifiedChatClient({ provider })` —— ❌ class 内 if/else 分支多，难维护

**最终选择**：方案 A

**原因**：

- **接口稳定的真正考验是"允许多 provider 并存"**：调用方写一次，换 provider = 改一行 `new`
- **provider 差异封装在各自 class 里，不泄漏到调用方**
- **业务函数可以纯函数化**：`async function summarize(chat: ChatClient, text: string)` 接受任何 ChatClient

**未来影响**：

- 未来加 GeminiChatClient / DeepSeekChatClient 不用碰中心文件
- 未来加 multi-modal / vision 走 ChatClient 扩展（adjective chat）
- **抽象层跟数据走** —— 永远是 Node 端资源；浏览器永远只调 `fetch('/api/chat')`

**证据 commit**：`c851ad8`（Day 02） / `fef2331`（拆 file + Anthropic） / `9593b72`（Day 04 重命名 file 为每 provider 一文件）

---

## ADR-002: 工具能力声明必须脱离 systemPrompt

**背景**：见 [0001-tool-capability-must-not-embed-in-system-prompt.md](../adr/0001-tool-capability-must-not-embed-in-system-prompt.md)。Day 05 4 处 demo systemPrompt 重复 "You have access to a calculator tool..."。

**当时的问题**：

- 同一信息两个出口（ToolDefinition.description + systemPrompt 重复）
- 加 tool 要改 4 处 prompt（维护陷阱）
- 职责错位（Agent 身份 vs 工具协议）

**最终选择**：三层职责分离

| 层 | 拥有者 | 形式 |
|---|---|---|
| Agent Prompt | 调用方 | 自由文本，运行时由 PromptBuilder 拼装（Day 06+） |
| Tool capability | ToolRegistry | ToolDefinition 对象，chat({tools}) 协议传递 |
| Tool execution | ToolRegistry | tool.execute(args) |
| Provider protocol diff | Provider Adapter | 不污染 Agent 层 |

**证据 commit**：`18a41ec` refactor(examples): strip tool descriptions from demo systemPrompts / `648cd32` docs(day05,review): record / `a292fdd` docs(adr): record

---

## ADR-003: ChatClient 接口 additive 演化（streaming）

**背景**：Day 03 要加 streaming。两个候选：新增 `stream()` 还是改 `chat()` 返回 AsyncIterable。

**当时的问题**：

- 改 `chat()` 返回类型 = Day 02 调用方全要改（breaking change）
- 不加 streaming = 不能支持流式 UX（长回复卡顿）
- 加新方法 = implements ChatClient 的类要补实现（TS2420 抓得出）

**考虑过的方案**：

- **方案 A**：保留 `chat(): Promise<string>` + 新增 `stream(): AsyncIterable<string>`（✅ Day 03 选）
- **方案 B**：改 `chat(): AsyncIterable<string>` —— ❌ Day 02 调用方全要改，breaking change

**最终选择**：方案 A

**原因**：

- **Day 02 调用方 0 行修改**
- **流式是显式选择而非默认** —— 一次性响应继续用 `chat()`，流式用 `stream()`
- **契约演化是 consumer-additive**，不是 implementer-additive（TypeScript 会抓到后者）

**未来影响**：

- 加 tool calling 走 ChatRequest 扩展（additive）
- 加 signal 走 ChatOptions 扩展（additive）
- 加 usage 走 ChatResponse 扩展（additive）
- **每次 additive 演化都要 TS2420 协调改动闭环** —— 在教学分步提交里可记录中间红，生产分支必须 squash 成绿

**证据 commit**：`4628c01` feat(day03): add stream() to ChatClient interface

---

## ADR-004: ToolDefinition 上移到 libs/tools

**背景**：Day 04 spec 把 ToolDefinition 放 `libs/llm/tool-call.ts`。实施时发现双头定义。

**当时的问题**：

- `libs/llm/tool-call.ts` 已经 `import type ToolParameters from libs/tools`
- `libs/tools/tool-registry.ts` 又定义了一份 ToolDefinition（for `toProviderTools()`）
- 同一个类型两个 source of truth

**最终选择**：把 ToolDefinition 上移到 `libs/tools/tool.ts`，删除 `libs/llm/tool-call.ts`，`libs/llm/index.ts` re-export。

**原因**：

- **协议字段归协议层**（`libs/tools`），`libs/llm` 不拥有 ToolDefinition
- **ToolRegistry.toProviderTools() 单一返回 ToolDefinition**
- **调用方 import 路径不变**（`libs/llm/index.ts` re-export）

**未来影响**：

- `libs/llm` 只 `import type ToolDefinition from ../tools/tool.js`（type-only 依赖）
- **如果未来 `libs/llm` 需要 `Tool.execute`，层边界会变** —— 现在是 type-only，运行时零依赖

**证据 commit**：`2585449` refactor(tools): move ToolDefinition to libs/tools/tool.ts

---

## ADR-005: 统一 chat/stream 为 ChatRequest

**背景**：Day 04 初版三个方法 `chat` / `stream` / `chatWithTools`，普通聊天和工具调用走不同入口。

**当时的问题**：

- 调用方要分两套消费逻辑（`reply: string` vs `response: ChatResponse`）
- 三个方法 = fat interface
- 业务逻辑分散

**最终选择**：

```typescript
interface ChatClient {
  chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse>;
  stream(request: ChatRequest, options?: ChatOptions): AsyncIterable<ChatChunk>;
  setModel(model: string): void;
}

interface ChatRequest {
  readonly messages: Message[];
  readonly tools?: ReadonlyArray<ToolDefinition>;
}

interface ChatResponse {
  readonly content?: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly usage?: ChatUsage;
}
```

**原因**：

- **同一种能力的不同输入**（带不带 tools）
- **扩展性优于穷举**：加字段比加方法便宜
- **统一返回 ChatResponse**：消费方只写一套逻辑

**未来影响**：

- 加 usage / signal / system prompt 选项走 ChatRequest / ChatOptions / ChatResponse 扩展
- **不破坏现有调用方** —— 实现者补字段（TS 会抓到）

**证据 commit**：`618a3d0` feat(day04): add chatWithTools（后删） / `3ff54dd` refactor(llm): unify chat/stream with ChatRequest

---

## ADR-006: AgentEvent 用判别联合

**背景**：Day 04 `ChatResponse` 用 optional 字段表达 "content 或 toolCalls 二选一"。Day 05 AgentEvent 要扩多 kind。

**当时的问题**：

- optional 字段消费方要写 `if x !== undefined` 串行判断
- 加新 kind 不会让旧消费者 TS 报错
- SSE 是外部消费契约，类型安全是免费的运行时保护

**最终选择**：

```typescript
type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | { kind: 'request'; iteration: number; messages: ReadonlyArray<Message> }
  | { kind: 'response'; iteration: number; content?: string; toolCalls?: ...; usage?: ChatUsage }
  | { readonly kind: 'message_delta'; readonly content: string }
  | { kind: 'tool_call'; id: string; name: string; args: unknown }
  | { kind: 'tool_result'; id: string; name: string; output: string }
  | { readonly kind: 'message_end'; readonly content: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
```

**原因**：

- **`switch (ev.kind)` TS 自动收窄类型**，每个 case 拿到具体形态
- **加新 kind 是显式扩展联合**，旧消费者必须 handle（否则 TS 报错）
- **SSE 消费方天然可用** —— `kind` 直接复用为 event name

**未来影响**：

- **每加一种 kind 都要走修改五问**：5 → 7 → 9 → 10（Day 05 阶段三扩 2 kind 是肥老大指令触发，有意识扩展）
- **加新 kind 时测试 + 文档 + 复盘要同步更新**（不复盘就成"过时承诺"）

**证据 commit**：`3e12fd2` feat(agent): AgentEvent + runEvents / `a906335` feat(agent): expose request and response events / `fe9804e` feat(day07): add message_delta kind

---

## ADR-007: runEvents() 是 run() 的真子集

**背景**：Day 04 Agent 有 `run(): Promise<string>` 和 `onIteration` 回调。Day 05 加 `runEvents(): AsyncIterable<AgentEvent>`。

**当时的问题**：

- `run` 和 `runEvents` 各自写一份 loop → 必然分叉
- `onIteration` 回调跟 `iteration` event 是同一信息的两个出口

**最终选择**：

```typescript
async run(input: string, options?: AgentRunOptions): Promise<string> {
  for await (const ev of this.runEvents(input, options)) {
    if (ev.kind === 'message_end') return ev.content;
    if (ev.kind === 'error') throw new Error(ev.message);
  }
  return '';
}
```

**原因**：

- **loop 只写一遍**，两个入口不可能分叉
- **`onIteration` 被替代品取代即删**，不留兼容层（"加 if 兜住反模式"）
- 调用方按需选择：要 string 用 `run()`，要 events 用 `runEvents()`

**未来影响**：

- **任何 Agent 行为变更只改 `runEvents` 一处**，`run` 自动跟上
- **error 行为变更（throw → yield）也要同步改 `run()` 的 catch** —— Day 07 灰区纪律

**证据 commit**：`3e12fd2` feat(agent): AgentEvent + runEvents, drop onIteration

---

## ADR-008: SSE Adapter framework-agnostic

**背景**：Day 05 把 AgentEvent 暴露成 SSE。Hono `streamSSE` 有自己的 SSEMessage 类型。

**当时的问题**：

- 初版 `encodeAgentEvent(ev)` 返回 `event: <kind>\ndata: <json>\n\n` 字符串，耦合 Hono API
- 换框架（Fastify / Express / 原 http）要重写 adapter
- adapter 单测要启 HTTP

**最终选择**：

```typescript
// 输出 W3C SSE spec 子集 { event, data } —— framework-agnostic
export interface SSEMessage {
  readonly event: string;
  readonly data: string;
}
export function agentEventToSSEMessage(ev: AgentEvent): SSEMessage { ... }
```

**server.ts 才耦合 Hono**：

```typescript
return streamSSE(c, async (stream) => {
  for await (const msg of agentEventsToSSEMessages(options.agent.runEvents(input))) {
    await stream.writeSSE(msg);
  }
});
```

**原因**：

- **adapter 单测一行可验证**（不启 HTTP）
- **W3C SSE 字段 `{event, data}` 是 spec 子集**，未来换 Fastify / Express / Web Response 都不动 adapter
- **data 用 JSON.stringify**：单行 SSE `data:` 一定合法，不需要拆多行

**未来影响**：

- AgentEvent 加 kind / 字段不需要改 adapter（JSON.stringify 自动处理）
- **未来加 WebSocket / gRPC transport**：新建 adapter，server.ts 加路由

**证据 commit**：`7310645` feat(apps/api): expose agent over SSE and Web UI

---

## ADR-009: snapshot 语义（事实快照）

**背景**：Day 06 加 TraceCollector。Agent 内部 `messages` 数组持续 push，所有 yield 出去的事件共享同一引用。

**当时的问题**：

- 测试断言 `requests[0].messages.length === 2` 失败（实际 4）—— `requests[0].messages` 是同一引用，被后续 push 污染
- TraceCollector 存的 events 是"累积后"的事实，不是"当时"的事实

**最终选择**：

```typescript
yield {
  kind: 'request',
  iteration: i + 1,
  messages: messages.map((m) => ({ ...m })),  // 深拷贝
};
```

**原因**：

- **消费方看到的是"当时"，不是"最终"**
- **FakeChatClient 也要深拷贝 messages**（同一问题，同一修法）
- **snapshot 语义只对"累积型"数据生效** —— 值类型（content / usage）不需要

**未来影响**：

- **所有 reference type（messages / toolCalls）yield 时必须 snapshot**
- **值类型不要 snapshot**（避免无意义的性能开销）
- **Trace / SSE / Debug UI 三种消费方都依赖此 invariant**

**证据 commit**：`a5fed60` feat(apps/api): in-memory trace collector + snapshot request messages / `b23e801` fix(llm): replace as-unknown casts with proper tool message mapping（同源问题）

---

## ADR-010: Trace = events[] + meta（source vs derived）

**背景**：Day 06 加可观测性。Trace 是什么？events[] 还是包含 token / latency / cost 的派生数据？

**当时的问题**：

- 只存 events[] = 没有累积 token 用量，没法算 cost
- events 里塞 derived 字段 = 污染真相源，破坏 AgentEvent 契约

**最终选择**：

```typescript
interface AgentTrace {
  readonly runId: string;
  readonly startedAt: number;
  endedAt: number | undefined;
  events: AgentEvent[];             // source: 原样保存
  meta: Record<string, unknown>;   // derived: 累积（usage / latency / cost）
}
```

**原因**：

- **events[] 是事实快照**（source of truth），原样保存 AgentEvent
- **meta 是 Record<string, unknown>** —— 预留扩展点，预先不设计具体形状
- **Runtime 不感知 Trace 存在** —— apps/api 层包一层

**未来影响**：

- **新增 derived 字段不改 source 字段** —— Day 07 加 `meta.usage` 时 ChatResponse.usage 早已是事实源
- **不同 transport 可以用不同累积策略**（流式 vs 批处理）

**证据 commit**：`a5fed60` feat(apps/api): in-memory trace collector / `ac08230` feat(day07): trace collector addMeta for partial meta merge

---

## ADR-011: AbortSignal 进入 ChatClient 契约层

**背景**：Day 02 立 ChatClient 时定"抽象层跟数据走"。Day 03 思考题 #3 留了"signal 应该进 ChatClient 还是 apps/api adapter"未答。Day 07 落地。

**当时的问题**：

- 如果 signal 只在 apps/api 监听并触发，**Agent.runEvents 拿不到 signal 状态**
- 流式中断时 SDK 不知道，**已发 token 浪费**（流式 UX 关键痛点）

**最终选择**：

```typescript
interface ChatClient {
  chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse>;
  stream(request: ChatRequest, options?: ChatOptions): AsyncIterable<ChatChunk>;
  setModel(model: string): void;
}

interface ChatOptions {
  readonly signal?: AbortSignal;
}
```

**为什么不是 apps/api 层**：

- **抽象层有 signal → provider 透传给 SDK → SDK 终止请求 → 已发 token 不浪费**
- **抽象层无 signal → 消费方只能 break iterator，不能取消已发请求 → 流式 token 计费痛点**

**为什么不是 Agent 配置**：

- **Agent 是长期对象**（构造一次用多次），**signal 是单次执行的上下文**（每次 fetch 独立 AbortController）
- **跨调用方传递**：浏览器 `request.signal` → Node `AbortController.signal` → ChatClient → SDK

**未来影响**：

- **每加一类消费方（多轮历史 / 持久化 / WebSocket），signal 都自动透传**
- **Agent.run() 内部消费 runEvents error 事件再 throw** —— Promise<string> 契约保持

**证据 commit**：`ac369d5` feat(day07): add signal and usage to ChatClient interface / `1009656` openai signal / `765a2be` anthropic signal / `1cae03b` feat(day07): agent signal / `0ff83aa` feat(day07): server AbortController

---

## ADR-012: error 统一走 yield（行为变更）

**背景**：Day 06 决策点留了 "error throw vs yield" 未决。Day 07 拍板。

**当时的问题**：

- maxIterations 超限 → 之前 `throw new Error`，消费方必须 try/catch
- chat 抛错 → 之前冒泡到 for-await 抛错
- 不同错误不同路径，消费方写代码要分情况

**最终选择**：**所有错误统一 yield error 事件**

```typescript
if (signal?.aborted) yield { kind: 'error', message: 'aborted by signal' };
try { ... } catch (err) { yield { kind: 'error', message: ... }; }
yield { kind: 'error', message: `exceeded ${max} iterations ...` };
```

**`Agent.run()` 保持向后兼容**：

```typescript
async run(userInput: string, options?: AgentRunOptions): Promise<string> {
  for await (const ev of this.runEvents(userInput, options)) {
    if (ev.kind === 'message_end') return ev.content;
    if (ev.kind === 'error') throw new Error(ev.message);
  }
  return '';
}
```

**原因**：

- **消费方统一不 catch**（`for await` 看不到 throw 就接住）
- **协议层错误（HTTP 400）走 HTTP status，业务层错误走 SSE event** —— 边界清晰
- **跟 `done` 互斥**：error 后不发 done，success 才发 done

**未来影响**：

- **行为变更是灰区**（CLAUDE.md 灰区纪律：spec §7 ack 后才落地）
- **消费方要审**：调用方看到的是 error 事件而不是 throw，必须 handle

**证据 commit**：`1cae03b` feat(day07): agent signal, error yield, streaming, and usage

---

# 5. 当前代码阅读指南

> 如果重新打开项目，按这个顺序看。每个文件后写"作用" + "为什么存在"。

## 5.1 第一天必读（理解架构地基）

### 1. `libs/llm/chat-client.ts`

**作用**：ChatClient 抽象的契约中心（interface + ChatRequest/ChatResponse/ChatOptions/ChatUsage）

**为什么存在**：provider 无感的边界。所有 LLM 调用必须通过它。

**关键内容**：

- `ChatClient { chat, stream, setModel }` 三方法
- `ChatRequest { messages, tools? }` 统一 chat / stream 入参
- `ChatResponse { content?, toolCalls?, usage? }` 统一 chat 出参
- `ChatOptions { signal? }` AbortSignal 透传

### 2. `libs/agent/event.ts`

**作用**：AgentEvent 判别联合（10 kind）—— Agent Runtime 的事件模型

**为什么存在**：把过程暴露给消费方（UI / Trace / Debug）

**关键内容**：

- `message_start` / `iteration` / `request` / `response` / `message_delta` / `tool_call` / `tool_result` / `message_end` / `done` / `error`
- `request` / `response` 配对：每次 LLM 调用的入参 / 出参快照
- `response.usage?`：token 用量事实源

### 3. `libs/agent/agent.ts`

**作用**：Agent 类（`run` / `runEvents`）

**为什么存在**：Agent Loop 的唯一实现

**关键内容**：

- `run()` 是 `runEvents()` 的收尾版（消除重复）
- `runEvents()` yield 完整 AgentEvent 流
- final-answer iter 切 `stream()` yield `message_delta`
- error 走 yield（不 throw） + signal 检查在每个 yield 后

## 5.2 第二天必读（理解 Provider 适配）

### 4. `libs/llm/openai-chat-client.ts`

**作用**：OpenAI 协议实现

**为什么存在**：证明 ChatClient 抽象能容纳真实 SDK

**关键内容**：

- `toOpenAIMessages` 映射 internal Message → OpenAI 格式（消除 `as unknown` cast）
- `stream()` null delta skip
- `signal` 透传给 SDK 第二参数
- `usage` 从 `completion.usage` parse

### 5. `libs/llm/anthropic-chat-client.ts`

**作用**：Anthropic 协议实现

**为什么存在**：证明多 provider 可以并存

**关键内容**：

- `toApiMessages` 把 `system` 提升到顶层 + `content` 转 text blocks
- `stream()` 双判别联合（event.type === 'content_block_delta' && delta.type === 'text_delta'）
- `signal` 透传 + `usage` parse

## 5.3 第三天必读（理解 Tool 系统）

### 6. `libs/tools/tool.ts`

**作用**：ToolDefinition + Tool interface

**为什么存在**：协议字段 + 能力实现的分离

### 7. `libs/tools/tool-registry.ts`

**作用**：ToolRegistry（register / get / list / toProviderTools）

**为什么存在**：Tool 中心注册表

### 8. `libs/tools/calculator-tool.ts`

**作用**：CalculatorTool（自写 parser）

**为什么存在**：security baseline —— 防 RCE

## 5.4 第四天必读（理解 apps/api）

### 9. `apps/api/src/sse-adapter.ts`

**作用**：framework-agnostic SSE 编码

**为什么存在**：换 HTTP 框架不重写 adapter

### 10. `apps/api/src/server.ts`

**作用**：Hono app（POST /agent + GET / + GET /traces）

**为什么存在**：Agent 暴露成 HTTP 端点

**关键内容**：

- AbortController + 监听 `request.signal`
- TraceCollector 累积 usage 到 meta
- 删了 try/catch（error 已走 SSE 事件路径）

### 11. `apps/api/src/trace-collector.ts`

**作用**：AgentTrace + TraceCollector（LRU 32，in-memory）

**为什么存在**：Agent Runtime 可观测

### 12. `apps/api/src/web/index.html`

**作用**：Agent Console 单 HTML UI（内嵌 CSS + JS）

**为什么存在**：Claude Code 风格双栏 UI（Conversation + Execution Timeline）

## 5.5 第五天选读（理解测试）

### 13. `tests/libs/agent/shared/fake-chat-client.ts`

**作用**：可复用测试 helper

**为什么存在**：CI 不依赖真实 LLM

**关键内容**：深拷贝 messages（snapshot 语义）

### 14. `tests/libs/agent/run-events.test.ts`

**作用**：覆盖 `runEvents()` 完整事件序列

**为什么存在**：Agent Runtime 行为契约

### 15. `tests/apps/api/end-to-end.test.ts`

**作用**：POST /agent 端到端 SSE 流

**为什么存在**：CI 闭环（无 LLM 依赖）

---

# 6. 当前不足分析

> 客观指出当前 Runtime 距离生产级 Agent 还缺什么。**不批评 7 天的进度**，只说生产落地前必须补的环节。

## 6.1 Memory（缺失）

**当前状态**：每次 `agent.runEvents(input)` 都从 `[system, user]` 开始，没有历史。

**生产级需要**：

- **短期记忆**：单次 session 内多轮对话（messages 累积）
- **长期记忆**：跨 session 的用户偏好 / 任务历史
- **持久化**：memory 存哪里（localStorage / server-side / vector DB）

**为什么不是现在做**：

- Day 03/04/05/06/07 已经把基础设施（events / signal / usage）堆好，Day 08+ 加 memory 不需要改架构
- 持久化引入新依赖（DB / vector store），先验证 in-memory 流程闭环再考虑

**触发条件**：

- 多轮 demo 跑通 + UI scrollback OK → 评估 localStorage / SQLite

## 6.2 Permission（缺失）

**当前状态**：任何 Tool 都能被 LLM 调用，Agent 不做权限校验。

**生产级需要**：

- **工具级权限**：哪些 tool 能用（用户授权）
- **资源级权限**：file system / network / shell 的访问范围
- **Human-in-the-loop**：高危操作需用户确认

**为什么不是现在做**：

- CalculatorTool 是低风险，纯算术不需要权限
- 等加 HttpTool / FileTool / ShellTool 时再设计权限模型（Day 15+）

**触发条件**：

- 第一次 tool 涉及"对外部世界有副作用"（发 HTTP / 写文件）

## 6.3 Evaluation（缺失）

**当前状态**：没有评估 pipeline。"Agent 跑得好不好"靠人眼看。

**生产级需要**：

- **Golden traces**：标准输入 + 期望 events 序列
- **自动评分**：tool_call 是否正确 / 循环是否合理 / 最终答案是否对
- **A/B 测试**：不同 prompt / 不同 model 对比

**为什么不是现在做**：

- TraceCollector 已经在收集 events[]（Day 06）—— 数据基础有了，Day 10+ 加 Evaluation
- 现阶段 Agent 形态还在变（tool / prompt / event 都改），现在评估会被推翻

**触发条件**：

- Agent 形态稳定（2 周没改 public API）+ 有真实用户场景

## 6.4 Observability（部分）

**当前状态**：In-memory TraceCollector + GET /traces/:runId。events[] + meta.usage 有了。

**生产级需要**：

- **持久化**：Trace 存哪里（SQLite / Postgres / S3）
- **结构化查询**：按 runId / userId / model / time range 查
- **告警**：latency P99 / error rate / cost 超阈值
- **OpenTelemetry 兼容**：与现有 observability stack 集成

**为什么不是现在做**：

- in-memory LRU 32 够 demo 用，CI 闭环（Day 06）
- 持久化引入 DB 依赖，等 Agent 形态稳定再上

**触发条件**：

- Trace 数据需要跨进程 / 跨重启访问

## 6.5 Workflow（缺失）

**当前状态**：Agent 是单 loop（chat → tool → ... → content）。没有多 Agent 协作 / DAG 编排。

**生产级需要**：

- **Multi-agent**：researcher + writer + reviewer 分工
- **Conditional branching**：根据工具返回决定下一步走哪个分支
- **Long-running workflow**：跨多 turn 的状态机
- **Retry / fallback**：tool 失败重试，model 失败换 model

**为什么不是现在做**：

- Workflow 是"单 Agent 稳定后的扩展方向"，不是基础能力
- 当前 Agent Loop 是 workflow 的 building block

**触发条件**：

- 真实场景需要"先搜索再总结再翻译"这种多步编排

## 6.6 已知技术债

| 债 | 位置 | 影响 | 触发修 |
|---|---|---|---|
| **chat + stream 双重调用** | `libs/agent/agent.ts:118-141` | final-answer iter 双重 token 计费 | Day 10+ 评估一次 stream 方案 |
| **In-memory Trace LRU 32** | `apps/api/src/trace-collector.ts` | 重启丢失；32 次以外被 evict | Day 10+ 评估持久化 |
| **single Agent 单端口绑死** | `apps/api/src/server.ts` | `createAgentApp({ agent })` 一次只能配一个 Agent | 多 Agent 场景 |
| **web/ 单 HTML 530+ 行** | `apps/api/src/web/index.html` | CSS 280+ 行，再加 200 行就要拆 | 引入 framework 时 |
| **错误事件不区分协议层 vs Runtime 层** | `Agent.runEvents()` | 消费方拿到 error 不知道是 maxIterations 还是 abort | 扩 AgentEvent kind |
| **usage 是 prompt + completion 之和** | `apps/api/src/server.ts:96-103` | 没有 cached / reasoning tokens 细分 | provider 能力差异大 |
| **没有 SSE 重连状态机** | `apps/api/src/sse-adapter.ts` | 客户端断线重连后从 message_start 重看 | EventSource 自带，不主动实现 |

---

# 7. 面试视角总结

> 模拟面试："你做过 Agent 项目吗？"
> 下面是一份 5 分钟回答的骨架（按这个顺序说就行）。

## 7.1 项目概述（30 秒）

> "我做了 7 天的 Agent Runtime 学习项目。从 ChatClient 抽象开始，逐步建出完整的 Chat → Tool Calling → Streaming → SSE → Trace 的 Runtime。
> 总共 75 个 commit，74 个测试通过，**没有引入 transport / UI 框架到 libs 层**。"

## 7.2 架构（90 秒）

```
libs/llm         ChatClient 抽象 + provider 适配（OpenAI / Anthropic）
libs/tools       Tool 系统（ToolDefinition / ToolRegistry / CalculatorTool）
libs/agent       Agent Runtime（runEvents + AgentEvent 判别联合 10 kind）
apps/api         Hono + SSE + Trace Collector + 单 HTML Web UI
```

**核心设计原则**：

1. **抽象层跟数据走** —— ChatClient 永远是 Node 端资源
2. **判别联合 > 平铺 optional** —— 消费方 switch 不会漏 case
3. **additive 演化 > breaking change** —— 加字段比加方法便宜
4. **source vs derived 双写** —— events 是真相源，meta 是派生
5. **snapshot 语义** —— yield 时深拷贝累积型数据

## 7.3 技术选型（90 秒）

| 选择 | 为什么 |
|---|---|
| **pnpm monorepo** | 严格依赖 + 原生 workspaces |
| **TypeScript strict** | 重构信心 + IDE 拦截误改 |
| **Hono** | 轻量、streamSSE 原生、Node 22 全兼容 |
| **判别联合 for events** | TS 类型收窄 + 加 kind 显式扩展 |
| **AsyncIterable for streaming** | 协议无关 + 未来 transport 切换零成本 |
| **JSON.stringify for SSE** | 单行 data 合法，扩字段不用改 adapter |
| **in-memory TraceCollector** | Day 06 够用，Day 10+ 评估持久化 |
| **零前端框架** | 单 HTML 内嵌 CSS/JS，零构建工具 |

## 7.4 难点（90 秒）

1. **Provider 协议差异在 SDK 适配层消化**
   - Anthropic `system` 顶层化 vs OpenAI messages 数组
   - Anthropic tool_result 在 user block vs OpenAI role: 'tool'
   - 协议差异完全封装在 `AnthropicChatClient` / `OpenAIChatClient` 内部

2. **tool_call / tool_result 严格 1:1 配对**
   - 这是 Agent Loop 的不变量，不是约定俗成
   - SSE 消费方可以靠这个不变量做超时检测 / 状态机

3. **AbortSignal 的层级穿透**
   - 浏览器 fetch → apps/api → Agent → ChatClient → SDK
   - signal 必须穿透整条调用链才能真正取消远端请求

4. **错误事件 vs throw 的取舍**
   - Day 06 决策点留了 "error throw vs yield" 未决
   - Day 07 拍板 yield —— 消费方统一不 catch，边界更清晰

5. **流式 content + token 计费的矛盾**
   - final-answer iter 双重调用 = 双重 token
   - 选了"接受 cost 先收口契约"的简化方案，Day 10+ 优化

## 7.5 Trade-off（60 秒）

| 决策 | 取舍 |
|---|---|
| **AsyncIterable<string> vs AsyncIterable<ChatEvent>** | 当前窄，未来结构化输出要重构 |
| **In-memory Trace LRU 32** | 重启丢 / 32 次外 evict，换 CI 闭环的简单性 |
| **chat + stream 双重调用** | 双重 token，换 message_delta 收口的简单性 |
| **零前端框架** | 单 HTML 530 行，换零构建工具 + 未来 framework 化时重写 |
| **Message 用 optional fields**（不是判别联合） | 现在三种 role 字段相同，省分化；未来加 refusal 时再升级 |
| **error yield（不是 throw）** | 消费方要审换边界清晰 |
| **AgentEvent 10 kind** | closed set 扩了 3 次，每次都要走修改五问 + ADR |

## 7.6 简历上的 3 个亮点

1. **判别联合 + 增量演化的接口设计** —— 7 天没引入 breaking change，所有调用方零改动跟随
2. **Source vs Derived 双写** —— Trace meta 从 events 派生，Runtime 零感知 Trace 存在
3. **Snapshot 语义** —— 所有累积型数据 yield 时深拷贝，Trace / SSE / Debug UI 三种消费方都依赖此 invariant

## 7.7 面试可能追问

- **"为什么 AsyncGenerator 不直接给 Vue？"** —— 跨进程 + 断线重连 + 类型污染，详见 §3.5
- **"Tool 不放 systemPrompt 为什么重要？"** —— ADR-0001，详见 §4 / §3.4
- **"Agent Loop 怎么防无限循环？"** —— maxIterations + error yield，详见 §3.3
- **"AbortSignal 怎么穿透？"** —— ChatOptions 透传到 SDK，详见 §3.8
- **"Trace 怎么持久化？"** —— Day 06 选 in-memory，Day 10+ 评估 Postgres / SQLite，详见 §6.4

---

# 自检：是否漏掉重要架构决策

✅ **覆盖 7 天全部 75 commit**：

- Day 01：monorepo + CI + 真实 LLM smoke test
- Day 02：ChatClient 抽象 + 多 provider
- Day 03：Streaming（additive）
- Day 04：Agent Loop + Tool + ChatRequest 统一
- Day 05：AgentEvent + SSE + Web UI + ADR-0001
- Day 06：CI smoke test + Trace Collector
- Day 07：Streaming content + AbortSignal + Usage

✅ **核心概念全解释**：

- LLM API / ChatClient / Agent Runtime / Tool System
- Streaming / AgentEvent / Trace / AbortSignal

✅ **12 个 ADR 提炼**（含 ADR-0001），每个都有 commit 证据

✅ **代码阅读指南**涵盖 libs + apps + tests

✅ **不足分析**涵盖 Memory / Permission / Evaluation / Observability / Workflow + 已知技术债

✅ **面试视角**含架构 / 选型 / 难点 / Trade-off / 亮点 / 追问

---

## 🔗 相关引用

- **5 天节奏 review**：[2026-07-22-day01-05-architecture-review.md](2026-07-22-day01-05-architecture-review.md)
- **Day 笔记**：day01.md / day02.md / day03.md / day04.md / day05.md / day06.md / day07.md
- **ADR**：[0001-tool-capability-must-not-embed-in-system-prompt.md](../adr/0001-tool-capability-must-not-embed-in-system-prompt.md)
- **CLAUDE.md 全局约定**：[../../../CLAUDE.md](../../../CLAUDE.md)
- **代码锚点**：
  - [libs/llm/chat-client.ts](../../libs/llm/chat-client.ts) — ChatClient + ChatRequest/Response/Options
  - [libs/agent/event.ts](../../libs/agent/event.ts) — AgentEvent 10 kind
  - [libs/agent/agent.ts](../../libs/agent/agent.ts) — runEvents + run() 收尾版
  - [libs/tools/tool.ts](../../libs/tools/tool.ts) — ToolDefinition 事实源
  - [apps/api/src/server.ts](../../apps/api/src/server.ts) — Hono + AbortController + TraceCollector
  - [apps/api/src/sse-adapter.ts](../../apps/api/src/sse-adapter.ts) — framework-agnostic
  - [apps/api/src/trace-collector.ts](../../apps/api/src/trace-collector.ts) — events[] + meta

---

> **写给未来的自己**：如果你忘了 Agent 怎么工作，先看这份的 §3（核心概念复习）。如果你忘了"为什么这样设计"，看 §4（ADR）。如果你要接着做，先看 §5（阅读指南）+ §6（不足分析），选 Day 08+ 路线。
>
> 7 天不是结束，是 65 天的地基。