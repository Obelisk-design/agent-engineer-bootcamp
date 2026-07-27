# Day 07 — Agent Stream 流式体验 + 可观测性补全设计

> **日期**：2026-07-27
> **作者**：AI Agent Engineer Bootcamp Day 07
> **状态**：draft（待肥老大 review）

---

## 1. 目标

Day 06 完成了 Agent Runtime 可观测性基座（TraceCollector + meta 预留扩展点 + snapshot 语义）。
Day 07 把 Day 06 留下的 4 个悬挂契约一次收口：

1. **AbortSignal 取消** — 流式请求能 stop（UX stop 按钮 + 资源释放）
2. **流式 content via `message_delta`** — Agent 内部 `chat()` → `stream()`，前端打字机效果
3. **Token Usage 进 meta** — provider 返回的 usage 透传到 Trace
4. **error throw → yield** — Agent Loop 错误统一走 error 事件，消费方不再 catch

多轮对话历史（Day 06 复盘路线标 Day 09+）**不在 Day 07 scope**，独立成日。

---

## 2. 范围

### 2.1 必须做

**ChatClient 契约层加 signal（决策点 1a）**

- `libs/llm/chat-client.ts` — `ChatOptions` 加 `readonly signal?: AbortSignal`
- `chat(req: ChatRequest, options?: ChatOptions): Promise<ChatResponse>`
- `stream(req: ChatRequest, options?: ChatOptions): AsyncIterable<ChatChunk>`
- `ChatResponse` 加 `readonly usage?: ChatUsage`
- `ChatUsage = { readonly promptTokens: number; readonly completionTokens: number }`

**OpenAI / Anthropic provider 透传（决策点 1a + 决策点 3b）**

- `libs/llm/openai-chat-client.ts` — `chat/stream` 加 options 参数，透传给 SDK `signal`，parse `usage`
- `libs/llm/anthropic-chat-client.ts` — 同上，parse Anthropic `usage` 字段

**AgentEvent 加 `message_delta`（决策点 2b）**

- `libs/agent/event.ts` — 加 `{ readonly kind: 'message_delta'; readonly content: string }`，联合扩到 10 kind
- `libs/agent/agent.ts` — `runEvents` 内部把"最终 answer" iteration 的 `chat()` 换成 `stream()`，yield 多个 `message_delta` 后 yield `message_end`
- tool_calls iteration 仍走 `request`/`response`（不流式中间态）

**Agent.runEvents options.signal（决策点 1a + 决策点 4a）**

- `libs/agent/agent.ts` — `runEvents(userInput: string, options?: { readonly signal?: AbortSignal }): AsyncIterable<AgentEvent>`
- signal.aborted 检查在每次 `await chat/stream` 之后、yield 之前
- signal 触发 → yield `{kind:'error', message:'aborted by signal'}` → 立即 return（不发 done）
- `Agent.run()` 同步加 options 透传

**error 行为变更（决策点 4a）**

- `libs/agent/agent.ts` — `runEvents` 内部所有 throw 路径改为 yield error：
  - `maxIterations` 超限 → yield `{kind:'error', message:...}` → return
  - `chat/stream` 抛错 → yield `{kind:'error', message:err.message}` → return
  - `signal.aborted` → yield `{kind:'error', message:'aborted by signal'}` → return
- `run()` 改为消费 `runEvents()` 的 error 事件 + 抛 Error（保持 `Promise<string>` 契约不破）
- ⚠️ 行为变更 — 所有 `for await (ev of agent.runEvents())` 调用方不再 try/catch（除了 apps/api server.ts）

**Token Usage 进 meta（决策点 3b）**

- `libs/agent/agent.ts` — `runEvents` 在每次 chat/stream 完成后，从 `response.usage` 提取 token 数
- 累积的 usage 在 `message_end` 之前的最后一个 `response` 事件附带
- ⚠️ usage 是**累积**概念：tool_calls 多轮的 usage 之和 = 单次 run 的总 token
- apps/api 层把累积的 usage 写进 `TraceCollector.collect(runId, ...)` 的 meta 字段

**apps/api SSE adapter**

- `apps/api/src/sse-adapter.ts` — `message_delta` kind 适配（沿用现有 `{event, data}` 形态，无新分支）
- `apps/api/src/server.ts` —
  - 创建 `AbortController`，`signal` 透传给 `agent.runEvents(input, { signal })`
  - 监听 `request.signal`（客户端断线）→ `abortController.abort()`
  - 累积 `usage`（来自 `response` 事件的 `usage`），run 结束后写 trace meta
  - 删 `try/catch`（error 已走 SSE 事件路径）

**TraceCollector meta 字段（决策点 3b）**

- `apps/api/src/trace-collector.ts` — 加 `addMeta(runId, partial)` 方法（partial merge），支持流式累积
- meta 形态（Day 07 落地）：
  ```ts
  {
    usage: { promptTokens: number, completionTokens: number }
  }
  ```
- meta 仍是 `Record<string, unknown>`，未来加 latency / cost 不破 schema

**Web UI 打字机效果**

- `apps/api/src/web/index.html` —
  - `message_delta` 事件 → append 到当前 AI 气泡文本（不重建节点）
  - `message_end` 事件 → finalize（标记最终文本，可滚动）
  - `error` 事件 → 红色错误气泡 + timeline error 标记
  - 删除 message_end 前 `response` 事件触发的"完整文本气泡"创建逻辑（避免重复）

**Demo / examples 同步**

- `examples/day04/ex_001_calculator_agent_openai.ts` — 改用 `runEvents`，加 usage 打印
- `examples/day04/ex_002_calculator_agent_anthropic.ts` — 同上
- 新增 `examples/day07/ex_001_streaming_agent.ts` — 真流式 demo（一个 calculator tool 不调，流式打字机效果）

**测试**

- `tests/libs/llm/chat-client-signal.test.ts` — FakeChatClient 接受 signal，abort 时抛 AbortError
- `tests/libs/agent/run-events.test.ts` —
  - signal 中途 abort → yield error 事件
  - 流式 message_delta 累积 → message_end.content 一致
  - maxIterations → yield error（不 throw）
  - chat 抛错 → yield error（不 throw）
- `tests/apps/api/end-to-end.test.ts` —
  - 流式 SSE 帧序列含 `message_delta`
  - signal abort 触发 error 事件 + 正常关闭连接
  - Trace meta 含 usage
- `tests/libs/agent/shared/fake-chat-client.ts` — 加 `signal` 透传 + `stream` mock 支持

### 2.2 故意不做（YAGNI）

- ❌ **多轮对话历史**（Day 09+ 独立日）
- ❌ **流式 tool_calls**（tool 调用的中间 assistant message 仍走 request/response，不流式 delta）
- ❌ **Web UI scrollback**（Day 09+ 多轮历史一起做）
- ❌ **WebSocket 替代 SSE**（CLAUDE.md 全局指令"对外统一通过 SSE"）
- ❌ **schema validation**（apps/api 不引入 zod/ajv）
- ❌ **latency / cost 进 meta**（Day 07 先收 usage，latency/cost 留给后续）
- ❌ **Web UI 主题切换 / Markdown 渲染**（YAGNI）
- ❌ **apps/web-vue/**（Day 03 留 TODO，今日不动）

---

## 3. 架构

### 3.1 信号流（端到端）

```
浏览器 fetch('/agent', {signal: reqSignal})
    ↓
apps/api/server.ts
    ├─ abortController = new AbortController()
    ├─ reqSignal.addEventListener('abort', () => abortController.abort())
    └─ agent.runEvents(input, { signal: abortController.signal })
            ↓
libs/agent/Agent.runEvents
    ├─ yield {kind:'message_start'}
    ├─ for iter ≤ maxIterations
    │     ├─ if (signal.aborted) → yield error + return
    │     ├─ yield {kind:'iteration', n}
    │     ├─ yield {kind:'request', messages}
    │     ├─ final-answer iter: chatClient.stream(req, {signal}) → yield message_delta × N
    │     ├─ tool-call iter: chatClient.chat(req, {signal}) → yield {kind:'response', usage}
    │     ├─ yield {kind:'tool_call'} / {kind:'tool_result'}
    │     └─ 累积 usage
    └─ yield {kind:'message_end', content} / {kind:'error', message}
            ↓
apps/api/server.ts
    ├─ for-await 双路：traceCollector.collect + stream.writeSSE
    ├─ meta 累积 → traceCollector.addMeta(runId, {usage})
    └─ traceCollector.end(runId)
```

### 3.2 AgentEvent 联合（10 kind）

```ts
type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | { readonly kind: 'request'; readonly iteration: number; readonly messages: ReadonlyArray<Message> }
  | { readonly kind: 'response'; readonly iteration: number; readonly content?: string; readonly toolCalls?: ReadonlyArray<ToolCallData>; readonly usage?: ChatUsage }  // 🆕 usage
  | { readonly kind: 'message_delta'; readonly content: string }  // 🆕
  | { readonly kind: 'tool_call'; readonly id: string; readonly name: string; readonly args: unknown }
  | { readonly kind: 'tool_result'; readonly id: string; readonly name: string; readonly output: string }
  | { readonly kind: 'message_end'; readonly content: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
```

**关键不变量**：
- `message_delta` 仅在 final-answer iteration 流式产生
- `tool_calls` iteration 仍走 `request`/`response`（不含 `message_delta`）
- `error` 是终止态，**不发** `done`、**不发** `message_end`
- `done` 仅在 success 路径 yield

### 3.3 ChatClient 接口（signal + usage）

```ts
// libs/llm/chat-client.ts
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

export interface ChatResponse {
  readonly content?: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly usage?: ChatUsage;  // 🆕
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

**provider 透传规则**：
- OpenAI: SDK `chat.completions.create({signal})` / `chat.completions.create({stream: true, signal})`，parse `response.usage` / `chunk.usage`
- Anthropic: SDK `messages.create({signal})` / `messages.stream({signal})`，parse final `message.usage`（流式累积在 message_stop 事件）

### 3.4 错误路径（决策点 4a 落地）

| 错误源 | 旧行为（Day 06） | 新行为（Day 07） |
|---|---|---|
| `maxIterations` 超限 | `runEvents` throw | `runEvents` yield `{kind:'error', message}` → return |
| `chat/stream` 抛错（SDK 异常） | `runEvents` throw | catch → yield `{kind:'error', message}` → return |
| `signal.aborted` | 不响应 | yield `{kind:'error', message:'aborted by signal'}` → return |
| `request body` 缺 input | HTTP 400 | HTTP 400（不变） |

**`Agent.run()` 保持向后兼容**：
- 仍然返回 `Promise<string>`
- 内部消费 runEvents：message_end → return content；error → throw new Error(message)
- 调用方不需要修改 `await agent.run(input)` 的代码

**server.ts 调用方迁移**：
- 删 `try/catch`，直接 `for await (const ev of agent.runEvents(input, {signal}))`
- error 事件走 SSE error 帧，HTTP 状态保持 200（流已建立）

### 3.5 累积 usage 进 meta

```ts
// libs/agent/agent.ts (伪代码)
let totalUsage: ChatUsage | undefined;

for (const iter) {
  if (signal.aborted) { yield error; return; }
  yield {kind:'request', ...};
  
  let response: ChatResponse;
  if (isFinalAnswerIter) {
    // 流式
    let accumulated = '';
    for await (const chunk of chatClient.stream(req, {signal})) {
      if (signal.aborted) { yield error; return; }
      if (chunk.content) {
        accumulated += chunk.content;
        yield {kind:'message_delta', content: chunk.content};
      }
    }
    // 流式完成后才能拿 usage（Anthropic message_stop 事件）
    response = { content: accumulated, usage: extractUsageFromStream() };
  } else {
    response = await chatClient.chat(req, {signal});
  }
  
  // 累积 usage
  if (response.usage) {
    totalUsage = totalUsage
      ? {
          promptTokens: totalUsage.promptTokens + response.usage.promptTokens,
          completionTokens: totalUsage.completionTokens + response.usage.completionTokens,
        }
      : response.usage;
  }
  
  yield {kind:'response', ..., usage: response.usage};
  // ... tool_call / message_end
}

// message_end 之前把累积 usage 暴露在 response 事件
// apps/api server.ts 在 message_end 时把 totalUsage 写 meta
```

**apps/api/server.ts 改造**：
```ts
let totalUsage: ChatUsage | undefined;
for await (const ev of agent.runEvents(input, {signal})) {
  if (ev.kind === 'response' && ev.usage) {
    totalUsage = totalUsage
      ? { promptTokens: totalUsage.promptTokens + ev.usage.promptTokens, completionTokens: ... }
      : ev.usage;
  }
  traceCollector.collect(runId, ev);
  if (ev.kind === 'message_end' || ev.kind === 'error') {
    if (totalUsage) traceCollector.addMeta(runId, { usage: totalUsage });
    traceCollector.end(runId);
  }
  yield sseFrame;
}
```

---

## 4. 触达文件清单（修改五问 #3 同类扫描）

| 文件 | 改动 |
|---|---|
| `libs/llm/chat-client.ts` | 加 ChatOptions / ChatUsage；chat/stream 加 options 参数；ChatResponse 加 usage |
| `libs/llm/openai-chat-client.ts` | options 透传；parse usage；stream 累积 usage |
| `libs/llm/anthropic-chat-client.ts` | 同上 |
| `libs/llm/index.ts` | export ChatUsage / ChatOptions |
| `libs/agent/event.ts` | 加 message_delta kind；response 加 usage optional |
| `libs/agent/agent.ts` | runEvents options.signal；chat→stream；error yield；usage 累积 |
| `libs/agent/index.ts` | export ChatUsage（如需） |
| `apps/api/src/sse-adapter.ts` | message_delta 适配（沿用现有框架） |
| `apps/api/src/trace-collector.ts` | 加 addMeta 方法 |
| `apps/api/src/server.ts` | AbortController；signal 透传；删 try/catch；meta 累积 |
| `apps/api/src/web/index.html` | message_delta 累加；error 红色气泡 |
| `examples/day04/ex_001_*.ts` / `ex_002_*.ts` | 改用 runEvents，加 usage 打印 |
| `examples/day07/ex_001_streaming_agent.ts` | 🆕 流式 demo |
| `tests/libs/llm/chat-client-signal.test.ts` | 🆕 |
| `tests/libs/agent/run-events.test.ts` | 改（加新场景） |
| `tests/apps/api/end-to-end.test.ts` | 改（加流式 + abort + meta usage 断言） |
| `tests/libs/agent/shared/fake-chat-client.ts` | 加 stream mock + signal 透传 |

**预估 commit 数**：15-20 commit（4 个强耦合能力 × 多次协调改动 + 测试）

---

## 5. 教学要点（day07.md 要展开）

1. **ChatClient 契约层加 signal 是抽象层纪律的兑现** —— Day 02 "抽象层跟数据走" 的延伸
2. **AbortSignal 与 AsyncGenerator cleanup 的关系** —— Day 03 思考题 #3 的兑现
3. **流式 content 是 closed set 扩展的纪律考验** —— AgentEvent 9→10 kind，加新 kind 后测试 + 文档 + 复盘要同步
4. **error yield 是行为变更** —— 所有 for-await 调用方审，但 server.ts 是唯一 SSE 入口，影响面可控
5. **Token Usage 是 derived 数据** —— provider 给的是 source，meta 是 derived；source 先有，derived 后写
6. **Web UI 打字机是消费方的事** —— libs/agent 不需要知道 UI 怎么渲染，只 yield 增量

---

## 6. 风险点

1. **行为变更（error yield）** — `runEvents` 不再 throw，所有 `for await` 调用方要审。Day 04/05/06 的 demo + tests + server.ts 都要改。
2. **closed set 扩张** — AgentEvent 9 → 10 kind。TraceCollector / SSE adapter / Web UI 都要审。
3. **AbortSignal 跨平台差异** — Node 22 + 浏览器 fetch 的 signal 兼容。OpenAI SDK 0.x 的 signal 透传可能有 race。
4. **usage 累积的时序** — 流式 chat 拿 usage 是在 stream 完成时；多轮 tool_calls 的 usage 是分轮累积。`response.usage` 是单轮，`totalUsage` 是 run 级别（写在 meta）。
5. **snapshot 语义保持** — Day 06 的 `messages.map(m => ({...m}))` 深拷贝仍要保留；`response.usage` 不需要深拷贝（值类型）。

---

## 7. 待肥老大 review 决策（已在 Day 07 起点 ack）

| 决策点 | 选择 |
|---|---|
| 1. AbortSignal 层 | (a) ChatClient 契约层 ✅ |
| 2. message_delta 范围 | (b) 仅最终 answer 流式 ✅ |
| 3. Usage 暴露 | (b) ChatResponse + meta 双写 ✅ |
| 4+5. error 行为 | (a) 全部 yield error + 立即关闭 ✅ |

---

## 8. 待补充（spec review 后写）

- 测试场景详细列表（每条测试断言什么）
- plan（实施步骤 + commit 拆分 + 验收门）