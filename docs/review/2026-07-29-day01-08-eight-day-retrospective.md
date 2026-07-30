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

final-answer iter 双重 LLM 调用 = 双重 token 计费。Day 07 选简化方案（chat 探测 + stream 流式）。**Day 10+ 优化方向**：单次 stream + 在 ChatChunk 加 `usage?` optional —— **今天不引入**（YAGNI，知道 generator return value 拿不到后，“接受 cost 先收口契约”是正确的简化方案）。
