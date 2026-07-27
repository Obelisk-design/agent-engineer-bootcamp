# Day 07 — Agent Stream 流式体验 + 可观测性补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 Day 06 留下的 4 个悬挂契约：(A) AbortSignal 取消、(B) 流式 content via `message_delta`、(C) Token Usage 进 meta、(D) error throw → yield。多轮对话历史不在 Day 07 scope（独立 Day）。

**Architecture:**
- `libs/llm/chat-client.ts` — `ChatOptions { signal? }` + `ChatUsage` + `ChatResponse.usage?`；`chat/stream` 加 options 参数
- `libs/llm/{openai,anthropic}-chat-client.ts` — 透传 signal 给 SDK + parse usage
- `libs/agent/event.ts` — AgentEvent 加 `message_delta` kind (10 kind) + `response.usage?`
- `libs/agent/agent.ts` — `runEvents(userInput, options?: {signal?})`，final-answer iter 用 `stream()`，error 全 yield，usage 累积
- `apps/api/src/sse-adapter.ts` — `message_delta` + `response.usage` 编码（沿用 `{event, data}` 形态）
- `apps/api/src/trace-collector.ts` — `addMeta(runId, partial)` 累积 meta
- `apps/api/src/server.ts` — `AbortController` + 监听 `request.signal` + meta usage 写入 + 删 try/catch
- `apps/api/src/web/index.html` — `message_delta` 累加 → `message_end` finalize + error 红色气泡
- `tests/libs/agent/shared/fake-chat-client.ts` — `stream()` mock + signal 透传

**Tech Stack:** TypeScript 5.7 + Node 22 + OpenAI SDK 6.47 + Anthropic SDK 0.111 + tsx + vitest + eslint + prettier + commitlint + pnpm 11.6.

---

## Global Constraints

From spec §2.2 + 5 天训练营纪律，每条任务都遵守：

- **TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes** ON。
- **`exactOptionalPropertyTypes` 规则**：optional 字段用条件展开 `...(value !== undefined ? { field: value } : {})`，禁止 `field: undefined`。
- **Commit message format**：`feat(day07): ...` / `docs(day07): ...` / `test(day07): ...` / `refactor(day07): ...`，commitlint 友好行宽 ≤100 字符。多用 `-m`，少用 heredoc。
- **Files runnable**：`pnpm exec tsx ...` 跑通。
- **Env vars**：`.env` 通过 `import 'dotenv/config'`，缺失必报显式错误。
- **snapshot 语义保持**：Day 06 加的 `messages.map(m => ({...m}))` 深拷贝不能丢。
- **closed set 纪律**：AgentEvent 9 → 10 kind，加新 kind 后测试 + 文档同步。
- **行为变更 ack**：error throw → yield 是灰区，Day 07 spec §1 已 ack；所有 `for await (ev of agent.runEvents())` 调用方必须审。
- **provider 透传 ≠ provider 改造**：signal / usage 都从 SDK 已有的字段拿，不改 SDK 调用形态。
- **Web UI 打字机**：libs/agent 不感知 UI，只 yield `message_delta`，Web UI 累加。
- **多轮对话历史 / 流式 tool_calls / scrollback / WebSocket / schema validation / latency-cost** —— 全 YAGNI。

---

## File Structure

```
libs/llm/
  chat-client.ts                     MODIFIED — +ChatOptions, +ChatUsage, +ChatResponse.usage, chat/stream 加 options 参数
  openai-chat-client.ts              MODIFIED — chat/stream 透传 signal + parse usage; stream 累积 usage
  anthropic-chat-client.ts           MODIFIED — 同上（message_stop event 含 usage）
  message.ts                         unchanged
  index.ts                           MODIFIED — +export ChatUsage, ChatOptions

libs/agent/
  event.ts                           MODIFIED — +message_delta kind, +response.usage optional
  agent.ts                           MODIFIED — runEvents options.signal + error yield + final iter chat→stream + usage 累积; run() 消费 error
  types.ts                           unchanged
  index.ts                           unchanged

apps/api/src/
  sse-adapter.ts                     MODIFIED — message_delta + response.usage 适配（沿用现有框架）
  trace-collector.ts                 MODIFIED — +addMeta(runId, partial) 方法
  server.ts                          MODIFIED — AbortController + 监听 request.signal + meta usage + 删 try/catch
  web/index.html                     MODIFIED — message_delta 累加 + error 红色气泡 + 删旧的完整文本气泡逻辑
  index.ts                           unchanged
  web-loader.ts                      unchanged

examples/day04/
  ex_001_calculator_agent_openai.ts     MODIFIED — 改用 runEvents，加 usage 打印
  ex_002_calculator_agent_anthropic.ts  MODIFIED — 同上

examples/day07/
  ex_001_streaming_agent_openai.ts      NEW — 真流式 demo（不调 tool，验证打字机效果）
  ex_002_streaming_agent_anthropic.ts   NEW — 同上

tests/libs/llm/
  chat-client-signal.test.ts             NEW — signal 透传 + usage 解析

tests/libs/agent/
  shared/fake-chat-client.ts             MODIFIED — +stream() mock + signal 透传 + usage 解析
  agent.test.ts                          MODIFIED — 加 signal / error yield 用例
  run-events.test.ts                     MODIFIED — 加 message_delta / signal / error / usage 场景

tests/apps/api/
  end-to-end.test.ts                     MODIFIED — 加 message_delta 流 + signal abort + meta usage 断言
  sse-adapter.test.ts                    MODIFIED — 加 message_delta 编码断言
  trace-collector.test.ts                MODIFIED — addMeta 累积 + 用例

docs/superpowers/specs/
  2026-07-27-day07-agent-streaming-observability-design.md   DONE

docs/superpowers/plans/
  2026-07-27-day07-agent-streaming-observability.md           NEW（本文件）

docs/daily/
  day07.md                              NEW — Day 07 学习笔记
```

**Decomposition rationale:**
- **Phase A（抽象层）** 先动 ChatClient + 2 providers，因为 Day 06 已有的代码契约变更必须先稳。
- **Phase B（Runtime）** AgentEvent + Agent 一起改（强耦合）；error yield 是行为变更，单独 task 隔离。
- **Phase C（Apps 层）** adapter / collector / server 是 transport 范畴，与 libs 解耦。
- **Phase D（UI + Demos + 测试 + 文档）** 是消费方 + 验证 + 复盘，按依赖顺序排列。

**预估 commit 数**：15-20 commit（与 spec §4 一致）。

---

## Phase A — 抽象层（ChatClient）

### Task 1: ChatClient 接口加 ChatOptions + ChatUsage + ChatResponse.usage

**Files:**
- Modify: `libs/llm/chat-client.ts`（整文件 Write 重写，避免 Edit CRLF 问题）
- Modify: `libs/llm/index.ts`（export ChatUsage / ChatOptions）

**Interfaces:**
- Consumes: 无（leaf）
- Produces:
  - `interface ChatOptions { readonly signal?: AbortSignal }`
  - `interface ChatUsage { readonly promptTokens: number; readonly completionTokens: number }`
  - `interface ChatResponse { readonly content?: string; readonly toolCalls?: ...; readonly usage?: ChatUsage }`（+usage optional）
  - `interface ChatClient { chat(req, options?: ChatOptions): Promise<ChatResponse>; stream(req, options?: ChatOptions): AsyncIterable<ChatChunk>; setModel(model: string): void }`

**Implementation content:**

`libs/llm/chat-client.ts` 关键改动：

```ts
/**
 * libs/llm/chat-client.ts
 *
 * ChatClient 抽象层 —— libs/llm 的中心契约。
 *
 * Day 02 立 chat/setModel；Day 03 加 stream；Day 04 统一 chat(ChatRequest) 含 tools；
 * Day 07 加 signal（取消）+ usage（token 计量）。
 *
 * 契约（Day 07）：
 *   chat(req, options?): 一次对话，传入累积 messages + 可选 tools，
 *                        拿到 assistant 回复（ChatResponse: content? / toolCalls? / usage?）。
 *   stream(req, options?): 流式对话，同上请求参数，AsyncIterable<ChatChunk>。
 *   setModel(model): 运行时切换模型。
 *
 *   options.signal: AbortSignal，provider 透传给 SDK；调用方提前 abort 时
 *                   SDK 终止请求，已发送 token 不浪费（流式 UX 关键）。
 *
 * 不做的事（YAGNI）：
 *   - ChatResponse 不含 latency / cost（Day 10+ 评估）
 *   - ChatUsage 不分 cached/reasoning tokens（provider 能力差异大）
 *   - 多模态 / vision / audio chunks
 */

import type { Message, ToolCallData, ToolDefinition } from './message.js';

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

`libs/llm/index.ts` 加 export：
```ts
export type { ChatOptions, ChatUsage, ChatRequest, ChatResponse, ChatChunk, ChatClient } from './chat-client.js';
```

**Verification:**
```bash
pnpm typecheck                       # 0 error（OpenAI/Anthropic 实现签名不匹配会暴露 —— TS2420 协调改动）
pnpm exec tsx examples/day02/ex_001_chat_client.ts  # Day 02 demo 仍跑通（options 不传，向后兼容）
pnpm exec tsx examples/day04/ex_001_calculator_agent_openai.ts  # Day 04 demo 仍跑通
```

**Commit:** `feat(day07): add signal and usage to ChatClient interface`

---

### Task 2: OpenAIChatClient — signal 透传 + usage parse

**Files:**
- Modify: `libs/llm/openai-chat-client.ts`（chat + stream 加 options 参数，透传 SDK signal + parse usage）

**Interfaces:**
- Consumes: Task 1 的 ChatOptions / ChatUsage
- Produces: OpenAI provider 实现两个 method 都接受 options，调用 SDK 时透传 signal，parse `usage` 字段

**Implementation notes:**

`chat(request, options?)` 关键改动：
```ts
async chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse> {
  // ...
  const completion = await this.client.chat.completions.create(
    {
      model: this.model,
      messages: toOpenAIMessages(request.messages),
      ...(request.tools !== undefined && request.tools.length > 0 ? { tools: request.tools as OpenAI.Chat.ChatCompletionTool[] } : {}),
    },
    options?.signal !== undefined ? { signal: options.signal } : {},
  );
  const message = completion.choices[0]?.message;
  const usage: ChatUsage | undefined = completion.usage
    ? { promptTokens: completion.usage.prompt_tokens, completionTokens: completion.usage.completion_tokens }
    : undefined;
  // ... 解析 content / tool_calls / usage
  return usage !== undefined ? { ..., usage } : { ... };
}
```

`stream(request, options?)` 关键改动：
```ts
async *stream(request: ChatRequest, options?: ChatOptions): AsyncGenerator<ChatChunk, void, undefined> {
  const sdkStream = await this.client.chat.completions.create(
    {
      model: this.model,
      messages: toOpenAIMessages(request.messages),
      stream: true,
      ...(request.tools !== undefined && request.tools.length > 0 ? { tools: request.tools as OpenAI.Chat.ChatCompletionTool[] } : {}),
      stream_options: { include_usage: true },  // 🆕 必须开，OpenAI 默认不返回 usage chunk
    },
    options?.signal !== undefined ? { signal: options.signal } : {},
  );
  for await (const chunk of sdkStream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield { content: delta };
    // usage chunk：choices 为空时 chunk.usage 有值
    if (chunk.usage) {
      // 流式完成后 yield 一个特殊 chunk？Day 07 简化：ChatChunk 加 usage? optional
      // 或：把 usage 通过 generator return value 返回
    }
  }
}
```

**关键决策**：OpenAI 流式 usage 通过 generator **return value** 返回（不污染 ChatChunk 形态）。

```ts
export interface ChatChunk {
  readonly content?: string;
}

async *stream(...): AsyncGenerator<ChatChunk, ChatUsage | undefined, undefined> {
  // ...
  for await (const chunk of sdkStream) {
    if (chunk.choices[0]?.delta?.content) yield { content: ... };
  }
  const finalUsage = ...;  // 流式完成后从最后一个 chunk 提取
  return finalUsage;
}
```

⚠️ **契约微调**：`stream()` 的 generator return type 从 `void` 变 `ChatUsage | undefined`。
- `AsyncIterable<ChatChunk>` 仍然满足（return value 在 for-await 时拿不到，需手动调 `.return()`）
- 实际使用方（Agent.runEvents）会手动消费 generator 拿 return value。

**Verification:**
```bash
pnpm typecheck                       # 0 error
pnpm exec tsx examples/day03/ex_001_openai_stream.ts  # 仍跑通
pnpm exec tsx examples/day04/ex_001_calculator_agent_openai.ts  # 仍跑通
```

**Commit:** `feat(day07): OpenAI provider signal and usage support`

---

### Task 3: AnthropicChatClient — signal 透传 + usage parse

**Files:**
- Modify: `libs/llm/anthropic-chat-client.ts`（chat + stream 加 options 参数）

**Implementation notes:**

Anthropic SDK 的 usage 在 `messages.create()` 返回的 `message.usage` 字段；流式时在 `message_stop` 事件的 `message.usage` 字段。

```ts
async chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse> {
  // ...
  const { systemPrompt, apiMessages } = this.toApiMessages(request.messages);
  const toolsParam = request.tools !== undefined && request.tools.length > 0
    ? request.tools.map(t => ({ name: t.toolName, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema }))
    : undefined;
  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: this.maxTokens,
    ...(systemPrompt !== undefined ? { system: systemPrompt } : {}),
    messages: apiMessages,
    ...(toolsParam !== undefined ? { tools: toolsParam } : {}),
  }, options?.signal !== undefined ? { signal: options.signal } : {});

  const usage: ChatUsage | undefined = response.usage
    ? { promptTokens: response.usage.input_tokens, completionTokens: response.usage.output_tokens }
    : undefined;
  // ... 解析 content / tool_use / usage
  return usage !== undefined ? { ..., usage } : { ... };
}
```

`stream` 改造：Anthropic SDK `messages.stream()` 返回 `MessageStream`，包含 `finalMessage()` 拿完整响应（含 usage）。

```ts
async *stream(request: ChatRequest, options?: ChatOptions): AsyncGenerator<ChatChunk, ChatUsage | undefined, undefined> {
  const { systemPrompt, apiMessages } = this.toApiMessages(request.messages);
  // ...
  const sdkStream = this.client.messages.stream({ ... }, options?.signal !== undefined ? { signal: options.signal } : {});

  for await (const event of sdkStream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { content: event.delta.text };
    }
  }
  // 流式完成后拿 finalMessage
  const finalMessage = await sdkStream.finalMessage();
  return finalMessage.usage
    ? { promptTokens: finalMessage.usage.input_tokens, completionTokens: finalMessage.usage.output_tokens }
    : undefined;
}
```

**Verification:**
```bash
pnpm typecheck
pnpm exec tsx examples/day03/ex_002_anthropic_stream.ts
pnpm exec tsx examples/day04/ex_002_calculator_agent_anthropic.ts
```

**Commit:** `feat(day07): Anthropic provider signal and usage support`

---

## Phase B — Runtime（AgentEvent + Agent）

### Task 4: AgentEvent 加 `message_delta` kind + `response.usage?` optional

**Files:**
- Modify: `libs/agent/event.ts`（加 1 kind + 1 optional 字段）

**Implementation:**

```ts
import type { Message, ToolCallData } from '../llm/index.js';
import type { ChatUsage } from '../llm/chat-client.js';

export type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | { readonly kind: 'request'; readonly iteration: number; readonly messages: ReadonlyArray<Message> }
  | {
      readonly kind: 'response';
      readonly iteration: number;
      readonly content?: string;
      readonly toolCalls?: ReadonlyArray<ToolCallData>;
      readonly usage?: ChatUsage;  // 🆕 Day 07
    }
  | { readonly kind: 'message_delta'; readonly content: string }  // 🆕 Day 07
  | { readonly kind: 'tool_call'; readonly id: string; readonly name: string; readonly args: unknown }
  | { readonly kind: 'tool_result'; readonly id: string; readonly name: string; readonly output: string }
  | { readonly kind: 'message_end'; readonly content: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
```

**Verification:**
```bash
pnpm typecheck
pnpm test            # 64/64 应仍过（AgentEvent 加字段不破坏既有测试）
```

**Commit:** `feat(day07): add message_delta kind and response.usage to AgentEvent`

---

### Task 5: Agent.runEvents 加 signal + error yield + final iter 切 stream + usage 累积

**Files:**
- Modify: `libs/agent/agent.ts`

**Interfaces:**
- Consumes: Task 1-4 的新接口
- Produces: `runEvents(userInput: string, options?: { readonly signal?: AbortSignal }): AsyncIterable<AgentEvent>`

**Implementation pseudocode（伪代码，详细实现 task 内）:**

```ts
async *runEvents(
  userInput: string,
  options?: { readonly signal?: AbortSignal },
): AsyncIterable<AgentEvent> {
  const signal = options?.signal;
  const messages: Message[] = [
    ...(this.options.systemPrompt !== undefined
      ? [{ role: 'system' as const, content: this.options.systemPrompt }]
      : []),
    { role: 'user', content: userInput },
  ];
  const toolDefs = this.options.tools.toProviderTools();
  const maxIterations = this.options.maxIterations ?? 5;

  yield { kind: 'message_start' };

  for (let i = 0; i < maxIterations; i++) {
    if (signal?.aborted === true) {
      yield { kind: 'error', message: 'aborted by signal' };
      return;
    }
    yield { kind: 'iteration', n: i + 1 };
    yield {
      kind: 'request',
      iteration: i + 1,
      messages: messages.map(m => ({ ...m })),
    };

    let response: ChatResponse;
    let accumulatedContent = '';
    try {
      // 🆕 Day 07：永远先 stream，看是否含 tool_call delta
      // 简化策略：先 chat() 拿到 response，看有 content 还是 tool_calls
      //   - 有 tool_calls → 走 tool_call iter
      //   - 有 content → 重新调 stream() 流式 yield message_delta（两次调用，但语义清晰）
      // 更优策略：一次 stream() 同时检测 content / tool_call delta —— Day 07 YAGNI，先用简化版
      const probe = await this.options.chat.chat({ messages, tools: toolDefs }, options);
      if (probe.content !== undefined) {
        // 重新调 stream 流式 yield delta
        accumulatedContent = '';
        const streamIter = this.options.chat.stream({ messages }, options);
        for await (const chunk of streamIter) {
          if (signal?.aborted === true) {
            yield { kind: 'error', message: 'aborted by signal' };
            return;
          }
          if (chunk.content) {
            accumulatedContent += chunk.content;
            yield { kind: 'message_delta', content: chunk.content };
          }
        }
        // 取 stream return value（usage）
        const usage = await streamIter.return?.(undefined);  // ⚠️ generator return value 拿法需确认
        response = { content: accumulatedContent, ...(usage ? { usage } : {}) };
      } else {
        // tool_calls iter：不流式
        response = probe;
      }
    } catch (err) {
      yield { kind: 'error', message: err instanceof Error ? err.message : String(err) };
      return;
    }

    const responseEvent: AgentEvent = {
      kind: 'response',
      iteration: i + 1,
      ...(response.content !== undefined ? { content: response.content } : {}),
      ...(response.toolCalls !== undefined ? { toolCalls: response.toolCalls } : {}),
      ...(response.usage !== undefined ? { usage: response.usage } : {}),
    };
    yield responseEvent;

    if (response.content !== undefined) {
      yield { kind: 'message_end', content: response.content };
      yield { kind: 'done' };
      return;
    }
    if (response.toolCalls !== undefined && response.toolCalls.length > 0) {
      // ... tool_call / tool_result 累积（与 Day 06 相同）
    }
    yield { kind: 'message_end', content: '' };
    yield { kind: 'done' };
    return;
  }

  // 🆕 Day 07：maxIterations 不 throw，改 yield error
  yield {
    kind: 'error',
    message: `Agent loop exceeded ${maxIterations} iterations without final answer`,
  };
  return;
}
```

⚠️ **重要约束**：`stream()` 的 generator return value 在 `for await` 时不暴露。Day 07 简化方案：

**简化方案**：第一次 `chat()` 拿 usage 探测；如果有 content（说明是 final-answer iter），第二次 `stream()` 不需要返回 usage（agent 知道这是 content iter，chat 探测时已拿到 usage；stream 只是为了 yield message_delta）。

实际更简洁：**chat() 探测 + stream() 流式**：
```ts
const probe = await chat.chat({ messages, tools });  // 含 usage
if (probe.content !== undefined) {
  // 流式 yield delta
  for await (const chunk of chat.stream({ messages }, options)) {
    if (chunk.content) yield { kind: 'message_delta', content: chunk.content };
  }
  // usage 用 probe 的（chat 探测已拿）
  response = probe;
}
```

**token 重复计费问题**：chat + stream 两次调用 = 双重 token。
- **Day 07 接受这个 cost**（先收口契约，token 优化留给 Day 10+）
- 文档里明写此局限

**Verification:**
```bash
pnpm typecheck
pnpm test            # 部分测试可能挂（error yield 行为变更）—— Task 12 一并修
```

**Commit:** `feat(day07): Agent runEvents signal + error yield + streaming`

---

### Task 6: Agent.run() 保持向后兼容（消费 runEvents error 事件）

**Files:**
- Modify: `libs/agent/agent.ts`（run() 内部 for-await runEvents，遇 error 抛 Error）

**Implementation:**

```ts
async run(userInput: string, options?: { readonly signal?: AbortSignal }): Promise<string> {
  for await (const ev of this.runEvents(userInput, options)) {
    if (ev.kind === 'message_end') return ev.content;
    if (ev.kind === 'error') throw new Error(ev.message);
  }
  return '';
}
```

**Verification:**
```bash
pnpm typecheck
pnpm test   # Day 06 agent.test.ts 应该全过（run() 契约不变）
```

**Commit:** `feat(day07): Agent.run consume error events (backward compat)`

---

## Phase C — Apps 层

### Task 7: SSE adapter 加 message_delta + response.usage 编码

**Files:**
- Modify: `apps/api/src/sse-adapter.ts`

**Implementation notes:**

`agentEventToSSEMessage` 加两个 case：

```ts
case 'message_delta':
  return { event: 'message_delta', data: JSON.stringify({ kind: 'message_delta', content: ev.content }) };

case 'response':
  return {
    event: 'response',
    data: JSON.stringify({
      kind: 'response',
      iteration: ev.iteration,
      ...(ev.content !== undefined ? { content: ev.content } : {}),
      ...(ev.toolCalls !== undefined ? { toolCalls: ev.toolCalls } : {}),
      ...(ev.usage !== undefined ? { usage: ev.usage } : {}),
    }),
  };
```

`response` 事件**已有**（Day 05 阶段三加），仅扩展 data 字段。

**Verification:**
```bash
pnpm test tests/apps/api/sse-adapter.test.ts  # 加 message_delta 编码断言
```

**Commit:** `feat(day07): SSE adapter encode message_delta and response.usage`

---

### Task 8: TraceCollector 加 addMeta 累积方法

**Files:**
- Modify: `apps/api/src/trace-collector.ts`

**Implementation:**

```ts
addMeta(runId: string, partial: Record<string, unknown>): void {
  const trace = this.traces.get(runId);
  if (trace === undefined) return;
  // shallow merge —— meta 顶层 key 由调用方约定（如 usage / latency / cost）
  for (const [key, value] of Object.entries(partial)) {
    trace.meta[key] = value;
  }
}
```

**Verification:**
```bash
pnpm test tests/apps/api/trace-collector.test.ts  # addMeta 累积 + 已有测试不挂
```

**Commit:** `feat(day07): TraceCollector.addMeta for partial meta merge`

---

### Task 9: server.ts — AbortController + signal 透传 + meta usage + 删 try/catch

**Files:**
- Modify: `apps/api/src/server.ts`

**Implementation:**

```ts
return streamSSE(c, async (stream) => {
  const abortController = new AbortController();
  // 客户端断线 → reqSignal abort → 我们也 abort
  c.req.raw.signal.addEventListener('abort', () => abortController.abort());

  const runId = options.collector.start();
  let totalUsage: ChatUsage | undefined;
  try {
    for await (const ev of options.agent.runEvents(input, { signal: abortController.signal })) {
      options.collector.collect(runId, ev);
      if (ev.kind === 'response' && ev.usage !== undefined) {
        totalUsage = totalUsage
          ? {
              promptTokens: totalUsage.promptTokens + ev.usage.promptTokens,
              completionTokens: totalUsage.completionTokens + ev.usage.completionTokens,
            }
          : ev.usage;
      }
      if (ev.kind === 'message_end' || ev.kind === 'error') {
        if (totalUsage !== undefined) {
          options.collector.addMeta(runId, { usage: totalUsage });
        }
        options.collector.end(runId);
      }
      const msg = agentEventToSSEMessage(ev);
      await stream.writeSSE(msg);
    }
  } finally {
    options.collector.end(runId);  // 兜底（signal abort / 异常路径）
  }
});
```

⚠️ 删 try/catch 后的 throw 路径：error 已走 SSE 事件，`for await` 自然结束。finally 仅保证 collector.end 被调（即使 signal abort 中途）。

**Verification:**
```bash
pnpm typecheck
pnpm test tests/apps/api/end-to-end.test.ts
pnpm exec tsx examples/day05/ex_001_sse_agent.ts  # Day 05 demo 仍跑通
```

**Commit:** `feat(day07): server AbortController + signal + meta usage`

---

## Phase D — Web UI + Demos + 测试 + 文档

### Task 10: Web UI 打字机效果 + error 红色气泡

**Files:**
- Modify: `apps/api/src/web/index.html`

**Implementation notes:**

`dispatch(ev)` 函数加 2 个 case：
- `message_delta` → 找到当前 AI 气泡，append text（不重建节点）
- `message_end` → finalize 当前 AI 气泡（标记 final，可滚动）
- `error` → 红色气泡 + timeline error 标记

删除 `response` 事件触发的"完整文本气泡"创建逻辑（与 message_delta 累加冲突）。

**Verification:**
- `pnpm test tests/apps/api/web-html.test.ts`（HTML 关键字段断言）
- 浏览器实测：Chrome MCP 截图（按全局铁律）

**Commit:** `feat(day07): web UI typewriter and error styling`

---

### Task 11: Day 04 demos 改用 runEvents + 加 usage 打印

**Files:**
- Modify: `examples/day04/ex_001_calculator_agent_openai.ts`
- Modify: `examples/day04/ex_002_calculator_agent_anthropic.ts`

**Implementation notes:**

demo 从 `agent.run(input)` 改为 `for await (const ev of agent.runEvents(input))` 手动打印每个事件 + usage：
```ts
for await (const ev of agent.runEvents(input)) {
  if (ev.kind === 'response' && ev.usage) {
    console.log(`  usage: prompt=${ev.usage.promptTokens} completion=${ev.usage.completionTokens}`);
  }
  if (ev.kind === 'message_end') {
    console.log('Final:', ev.content);
  }
}
```

**Verification:**
```bash
pnpm exec tsx examples/day04/ex_001_calculator_agent_openai.ts
pnpm exec tsx examples/day04/ex_002_calculator_agent_anthropic.ts
```

**Commit:** `refactor(day07): Day 04 demos use runEvents + print usage`

---

### Task 12: 新增 examples/day07 流式 demo

**Files:**
- Create: `examples/day07/ex_001_streaming_agent_openai.ts`
- Create: `examples/day07/ex_002_streaming_agent_anthropic.ts`

**Implementation notes:**

不调 tool，纯流式打字机效果。Agent 注册空 registry：
```ts
const agent = new Agent({
  chat,
  tools: new ToolRegistry(),  // 空 registry，无 tool
  systemPrompt: '...',
});
for await (const ev of agent.runEvents(input)) {
  switch (ev.kind) {
    case 'message_delta': process.stdout.write(ev.content); break;
    case 'message_end': console.log('\n[done]'); break;
    case 'response': if (ev.usage) console.log(`\n[usage] ${JSON.stringify(ev.usage)}`); break;
  }
}
```

**Verification:**
```bash
pnpm exec tsx examples/day07/ex_001_streaming_agent_openai.ts
pnpm exec tsx examples/day07/ex_002_streaming_agent_anthropic.ts
```

**Commit:** `feat(day07): streaming agent demos for both providers`

---

### Task 13: FakeChatClient 加 stream() mock + signal 透传 + usage

**Files:**
- Modify: `tests/libs/agent/shared/fake-chat-client.ts`

**Implementation notes:**

加 `streamResponses: ChatResponse[]` 字段（mock 多个 chunk 来源）：
```ts
async *stream(req: ChatRequest, options?: ChatOptions): AsyncGenerator<ChatChunk, ChatUsage | undefined, undefined> {
  // 按 chunk 拆响应
  for (const chunk of this.streamResponses.shift()?.chunks ?? []) {
    if (options?.signal?.aborted === true) throw new Error('aborted');
    yield chunk;
  }
  return this.streamResponses.shift()?.usage;
}
```

**Verification:**
```bash
pnpm typecheck
```

**Commit:** `test(day07): FakeChatClient stream and signal mock`

---

### Task 14: run-events.test.ts + agent.test.ts 加新场景

**Files:**
- Modify: `tests/libs/agent/run-events.test.ts`
- Modify: `tests/libs/agent/agent.test.ts`

**New test cases:**
1. signal 中途 abort → yield error + return（不 throw）
2. 流式 message_delta 累积 = message_end.content
3. maxIterations → yield error（不 throw）
4. chat/stream 抛错 → yield error（不 throw）
5. usage 累积：probe chat + stream 流式时 usage 正确

**Verification:**
```bash
pnpm test tests/libs/agent/
```

**Commit:** `test(day07): run-events signal, streaming, error yield, usage`

---

### Task 15: end-to-end.test.ts + trace-collector.test.ts + sse-adapter.test.ts 加新场景

**Files:**
- Modify: `tests/apps/api/end-to-end.test.ts`
- Modify: `tests/apps/api/trace-collector.test.ts`
- Modify: `tests/apps/api/sse-adapter.test.ts`

**New test cases:**
1. e2e 流式 SSE 帧含 `message_delta` ×N + `message_end`
2. e2e signal abort → error 事件 + 正常关闭
3. e2e Trace meta 含 usage
4. trace-collector addMeta 累积
5. sse-adapter message_delta + response.usage 编码

**Verification:**
```bash
pnpm test tests/apps/api/
```

**Commit:** `test(day07): e2e streaming, signal abort, meta usage`

---

### Task 16: 写 docs/daily/day07.md 学习笔记

**Files:**
- Create: `docs/daily/day07.md`

**Content outline:**
1. 🎯 今日目标 + 验收清单
2. 📦 今日产出物（commit 列表 + 文件变更）
3. 🔧 关键命令速查
4. 📚 知识点（10 条）：
   - ChatClient 抽象层加 signal 是 Day 02 抽象层纪律的兑现
   - AbortSignal 与 AsyncGenerator cleanup（Day 03 思考题 #3 兑现）
   - 流式 content 是 closed set 扩展的纪律考验
   - error yield 是行为变更（灰区，肥老大 ack）
   - Token Usage 是 derived 数据（source → derived）
   - Web UI 打字机是消费方的事
   - chat+stream 双重调用 = token 双重计费（Day 10+ 优化）
   - signal 跨平台差异（Node 22 + 浏览器 fetch）
   - generator return value 拿 usage 的限制
   - 行为变更的迁移成本（for-await 调用方审）
5. ❓ 思考题
6. ⚠️ 今日踩坑
7. 📋 验收清单
8. 🚀 Day 08 预告（多轮对话历史）
9. 🔗 相关引用（spec + plan + 代码锚点）

**Commit:** `docs(day07): add daily learning note`

---

## Phase 顺序 + 总 commit 数预估

| Phase | Task 数 | commit 数 |
|---|---|---|
| A. 抽象层 | 3 | 3 |
| B. Runtime | 3 | 3 |
| C. Apps 层 | 3 | 3 |
| D. UI + Demos + 测试 + 文档 | 4 | 6-8 |
| **合计** | **13** | **15-17** |

---

## 验收门（每 task 必跑）

每个 task 完成后必跑：
```bash
pnpm typecheck       # 0 error
pnpm lint            # 0 error
pnpm format:check    # 全绿
pnpm test            # 全绿（或新增测试用例通过）
```

Phase 完成后跑端到端：
```bash
pnpm exec tsx examples/day07/ex_001_streaming_agent_openai.ts  # 流式 demo
pnpm exec tsx examples/day07/ex_002_streaming_agent_anthropic.ts
pnpm exec tsx examples/day05/ex_001_sse_agent.ts  # Day 05 demo 无回归
```

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 行为变更（error throw → yield）影响既有调用方 | Task 5 单 task 隔离；Task 14 同步修测试 |
| closed set 扩张（9 → 10 kind） | Task 4 单 task；测试 + 文档同步 |
| AbortSignal 跨平台差异（Node 22 + 浏览器） | Task 2/3 用 SDK 原生 signal API；e2e test 覆盖 |
| usage 累积时序（probe + stream 双重调用） | Task 5 简化方案：probe 取 usage；Day 10+ 评估一次 stream 方案 |
| Web UI 打字机复杂度（不重建节点） | Task 10 用 `append text` 而非 `replace text` |
| 16 commit 跨天风险 | 每 task 跑完验收门才 commit；不积累技术债 |

---

## 相关引用

- 设计 spec：[2026-07-27-day07-agent-streaming-observability-design.md](../specs/2026-07-27-day07-agent-streaming-observability-design.md)
- 全局约束：[CLAUDE.md](../../CLAUDE.md)
- Day 06 笔记：[day06.md](../../daily/day06.md)（TraceCollector / snapshot 语义来源）
- Day 04-05 关键代码：[libs/agent/event.ts](../../../libs/agent/event.ts) / [libs/agent/agent.ts](../../../libs/agent/agent.ts)