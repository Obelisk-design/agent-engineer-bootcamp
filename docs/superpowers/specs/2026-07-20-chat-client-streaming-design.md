# Day 03 — ChatClient Streaming 设计

> **日期**：2026-07-20
> **作者**：AI Agent Engineer Bootcamp Day 03
> **状态**：approved + committed（spec commit `471469c`，待 user review 后开始 implementation）

---

## 1. 目标

为 `ChatClient` 抽象层添加 streaming 能力，作为 Day 02 `chat()` 的 additive 增强。**不改 Day 02 既有契约**，调用方代码 0 行破坏。

---

## 2. 范围

### 2.1 Day 03 必须做

- `ChatClient` interface 加 `stream(messages): AsyncIterable<string>` 方法
- `OpenAIChatClient.stream()` —— 用 OpenAI SDK `stream: true` 路径
- `AnthropicChatClient.stream()` —— 用 Anthropic SDK `messages.stream(...)` 路径，过滤出 `content_block_delta` + `text_delta` 事件
- 两个 demo：`examples/day03/ex_001_openai_stream.ts`、`examples/day03/ex_002_anthropic_stream.ts`
- 跑通真实 LLM demo，看到字符逐步打印

### 2.2 故意不做（YAGNI）

- ❌ 取消（`AbortSignal`）—— Day 02 chat() 也没有，今天对齐
- ❌ 单测 —— 流式 mock 复杂度高，靠 demo 跑真 LLM 验证
- ❌ `tool_use` 流式 —— 不在范围
- ❌ 多模态流式（content 严格 string）—— 守住 message.ts 契约
- ❌ 暴露 SDK 原始事件类型 —— `stream()` 只 yield 文本增量
- ❌ 结构化事件 chunk（`{text, tool_call}` 混合）—— 破坏性升级契约，留未来 day
- ❌ HTTP / SSE / Express / Fastify / 任何传输层 —— libs/llm 不引入传输依赖
- ❌ Vue / 浏览器 / fetch helper —— 留给未来 day 的 `apps/api/` 和 `apps/web-vue/`
- ❌ 抽象公用 stream helper（`libs/llm/stream-utils.ts`）—— 跨 SDK 抽容易漏抽象
- ❌ 内部缓存 / 队列 / 单实例多请求并发 —— 不在范围

---

## 3. 架构

### 3.1 接口改动

```ts
// libs/llm/chat-client.ts
export interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;  // ← 新增（additive）
  setModel(model: string): void;
}
```

**为什么是 `AsyncIterable<string>` 而不是 `AsyncGenerator<string>`**：

- 接口层只承诺"能被 `for await`"，不锁定实现策略
- 未来 provider 若包装第三方 `AsyncIterable`（非 generator），契约不会挡路
- 实现侧仍然可以用 `async function*` —— `AsyncGenerator<T>` 是 `AsyncIterable<T>` 的子类型，类型自动满足
- TypeScript lib 标准库惯例：`Response.body`、`Symbol.asyncIterator` 协议等都用 `AsyncIterable` 而非 `AsyncGenerator`

### 3.2 实现策略

两个 provider 都用 `async function*` 写实现 —— 读起来就是数据流，最贴合 streaming 语义。

```ts
// openai-chat-client.ts 实现侧（伪代码）
async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
  const stream = await this.client.chat.completions.create({
    model: this.model,
    messages,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
```

```ts
// anthropic-chat-client.ts 实现侧（伪代码）
async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
  // ... 同 chat() 的 system 抽离 + content blocks 转换
  const stream = this.client.messages.stream({ /* ... */ });
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}
```

### 3.3 chunk 语义

调用方拿到的 `chunk: string` = **纯文本增量**（text delta）。不是 SDK 原始事件，不是结构化对象。

**承诺的语义等价性**（不强 type-level 保证）：

```ts
let result = '';
for await (const chunk of client.stream(msgs)) {
  result += chunk;
}
// result ≈ await client.chat(msgs)
```

这个等价对**纯文本对话**成立（OpenAI 的 `delta.content` 拼接 ≈ `message.content`；Anthropic 的 `text_delta` 拼接 ≈ 首个 text block 的 text）。一旦未来引入 tool_use / 多 content block，**这个等价会破**，届时契约升级为破坏性变更。

### 3.4 过滤掉的事件（Anthropic 协议细节）

Anthropic SDK 的 stream 是事件流，不是数据流。`stream()` 内部需要过滤：

| 事件类型 | 处理 |
|---|---|
| `message_start` | 跳过（仅元信息） |
| `content_block_start` | 跳过（仅声明 block 类型） |
| `content_block_delta` + `text_delta` | **yield `event.delta.text`** ← 唯一保留的事件 |
| `content_block_delta` + 其它 `delta.type` | 跳过（未来若支持 input_json 需另开 day） |
| `content_block_stop` | 跳过 |
| `message_delta` | 跳过（仅 stop_reason 等元信息） |
| `message_stop` | 跳过 |
| `ping` | 跳过 |

**关键约束**：调用方**永远看不到 Anthropic 协议内部事件**，只看到纯文本增量。这是抽象层的"协议隐藏"承诺。

---

## 4. 数据流

```
┌─────────────────────────────┐
│ OpenAIChatClient.stream(msgs)│
└──────────────┬──────────────┘
               ↓
   client.chat.completions.create({ stream: true })
               ↓
   Stream<ChatCompletionChunk>   (OpenAI SDK)
               ↓
   for await... of stream:
     if chunk.choices[0]?.delta?.content:
       yield chunk.choices[0].delta.content
               ↓
   AsyncIterable<string>          ←── 契约出口
               ↓
   调用方 for await 消费

┌──────────────────────────────┐
│ AnthropicChatClient.stream(msgs)│
└────────────────┬─────────────┘
                 ↓
   client.messages.stream({...})
                 ↓
   AsyncIterable<RawMessageStreamEvent>   (Anthropic SDK)
                 ↓
   for await... of stream:
     if event.type === 'content_block_delta'
       && event.delta.type === 'text_delta':
       yield event.delta.text
                 ↓
   AsyncIterable<string>          ←── 契约出口（已过滤协议事件）
                 ↓
   调用方 for await 消费
```

---

## 5. 错误处理

| 失败场景 | 行为 |
|---|---|
| SDK 启动失败（auth / network） | `iterator.throw` 在第一次 `next()` 时抛出 |
| 流式中途 SDK 报错 | `iterator.throw` 在对应 `next()` 时抛出 |
| 调用方提前 `break` 出 for-await | generator 自带 cleanup（Day 03 无外部资源，cleanup 是 no-op） |
| 流式返回 0 chunks | iterator 正常完成，concat 是空字符串 |
| `chunk.choices[0]?.delta?.content` 是 `null/undefined` | yield 跳过（OpenAI stream 开头 / 结尾事件常见） |

调用方用标准 `try/catch` 接：

```ts
try {
  for await (const chunk of client.stream(msgs)) {
    process.stdout.write(chunk);
  }
} catch (err) {
  console.error('stream failed:', err);
}
```

---

## 6. Demo 设计

两个 demo 都用同一个形态 —— **字符逐步打印**：

```ts
// examples/day03/ex_001_openai_stream.ts （伪代码）
const client = new OpenAIChatClient({ ... });
console.log('[stream] receiving...\n');
for await (const chunk of client.stream([
  { role: 'system', content: '...' },
  { role: 'user', content: '...' },
])) {
  process.stdout.write(chunk);   // 不换行，逐步打印
}
console.log('\n[stream] done.');
```

**验证标准**：肉眼能区分两种输出 —— `chat()` 一次性打印完整字符串 vs `stream()` 字符逐步出现（特别是长回答）。

每个 demo 加时间戳 / chunk 计数 log，**便于区分"是真的流式"还是"快速 batch 输出"**。

---

## 7. 多 provider 一致性

Day 02 笔记 8 节承诺"接口稳定 + 多实现并存"。Day 03 在 streaming 下必须同样兑现：

- `OpenAIChatClient.stream()` 和 `AnthropicChatClient.stream()` **行为对调用方等价**
- 调用方写一次 `for await`，换 provider = 改一行 `new`
- 协议差异（OpenAI delta vs Anthropic events）封装在各自 class 里，**不泄漏到调用方**

```ts
// 调用方视角
async function printReply(client: ChatClient, msgs: Message[]) {
  for await (const chunk of client.stream(msgs)) {
    process.stdout.write(chunk);
  }
}

const openai = new OpenAIChatClient({ ... });
const anthropic = new AnthropicChatClient({ ... });
await printReply(openai, msgs);     // 走 OpenAI 流式
await printReply(anthropic, msgs);  // 走 Anthropic 流式
```

---

## 8. Vue / 浏览器场景（留 TODO，今天不碰）

虽然 Day 03 scope 不含 Vue / HTTP / SSE，但设计必须**留出干净的扩展路径**。

### 8.1 契约的 round-trip 安全性

`AsyncIterable<string>` ↔ SSE 协议映射是零信息损失：

```
服务端：yield 'hello' → SSE 'data: hello\n\n'
浏览器：fetch + ReadableStream + 按行 split → AsyncIterable<string>
```

Day 03 契约形状已确认能 round-trip。✓

### 8.2 留 TODO 但不实现

- ❌ AbortSignal：Vue 用户切页面 → SSE 断 → **ChatClient 还在跑**（浪费 token）。**未来 day 在 `apps/api/` 加 SSE adapter 时，必须解决**。
- ❌ HTTP 适配器：`AsyncIterable<string>` → SSE response 包装（server 侧）
- ❌ 浏览器侧 helper：fetch 流式响应 → `AsyncIterable<string>`（client 侧）
- ❌ Vue 组件消费 `AsyncIterable<string>` 渲染"打字机效果"

### 8.3 抽象层边界守则

**`libs/llm` 不引入任何 HTTP / SSE / 浏览器相关 export**。

CLAUDE.md Day 02 笔记 9 节"宿主原则"已经立过这条边界：

- `libs/llm` = LLM SDK 抽象层（Node 端持有 API key）
- 未来 `apps/api/` = HTTP server 层（把 ChatClient 暴露给浏览器）
- 未来 `apps/web-vue/` = Vue UI 层（消费 server API）

三层严格分离。Day 03 的设计**不允许任何一层跨边界**。

---

## 9. 文件改动清单

| 文件 | 改动 | 行数估计 |
|---|---|---|
| `libs/llm/chat-client.ts` | `ChatClient` interface 加 `stream()` 方法 + 头注释更新 | +10 |
| `libs/llm/openai-chat-client.ts` | 加 `async *stream()` 实现 + 头注释 TODO 更新 | +15 |
| `libs/llm/anthropic-chat-client.ts` | 加 `async *stream()` 实现（事件过滤） | +20 |
| `libs/llm/index.ts` | 不动（接口导出，无新值导出） | 0 |
| `examples/day03/ex_001_openai_stream.ts` | 🆕 OpenAI 流式 demo | ~30 |
| `examples/day03/ex_002_anthropic_stream.ts` | 🆕 Anthropic 流式 demo | ~30 |
| `docs/daily/day03.md` | 🆕 Day 03 学习笔记 | ~150 |

**净增文件**：3 个（2 demo + 1 daily note）
**净改文件**：3 个（chat-client + 2 provider）
**净增行数**：~255 行（含注释 + 头注释）

---

## 10. 验收清单

- [ ] `pnpm typecheck` 0 error（含 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）
- [ ] `pnpm lint` 0 error
- [ ] `pnpm format:check` 全绿
- [ ] `pnpm test` 不破（3 / 3 passed）
- [ ] `pnpm exec tsx examples/day03/ex_001_openai_stream.ts` 真发请求，**肉眼可见字符逐步打印**（非一次性输出）
- [ ] `pnpm exec tsx examples/day03/ex_002_anthropic_stream.ts` 真发请求，**肉眼可见字符逐步打印**
- [ ] Day 02 `ex_001_chat_client.ts` / `ex_002_anthropic_chat_client.ts` 两个 demo 行为不变（接口 backward-compat 兑现）
- [ ] ChatClient interface 没破坏既有契约（`chat()` 返回类型未变）
- [ ] 头注释 / spec 写明取消 / HTTP / Vue / 测试 全部 TODO，今天不实现
- [ ] commit 走完 commitlint 链路

---

## 11. 故意不做的设计权衡（决策记录）

| 决策 | 选择 | 拒绝的方案 | 拒绝理由 |
|---|---|---|---|
| API 形态 | 新增 `stream()` additive | 修改 `chat()` 返回 AsyncIterable | Day 02 既有 demo 全 break |
| 接口返回类型 | `AsyncIterable<string>` | `AsyncGenerator<string>` | 接口层不锁实现策略 |
| 实现写法 | `async function*` | 手动 class 实现 `[Symbol.asyncIterator]` | generator 是最自然的流式语法 |
| 取消语义 | 不做 | AbortSignal 参数 | YAGNI，与 Day 02 chat() 对齐 |
| chunk 类型 | string 文本增量 | `{text, type, ...}` 结构化事件 | 简化契约，破坏性升级留未来 |
| Anthropic 事件过滤 | 只 yield `text_delta` | yield 全部 RawMessageStreamEvent | 抽象层不泄漏协议细节 |
| HTTP 适配 | 不做 | libs/llm 加 SSE helper | 违反宿主原则（CLAUDE.md Day 02 §9） |
| 单测 | 不做 | mock SDK 异步迭代 | 复杂度高，demo 跑真 LLM 验证 |
| 双 demo 形态 | 字符逐步打印 | 完整 UI 渲染 | 不在 Node-only scope |

---

## 12. 开放问题（不阻塞 Day 03 实现，留作未来 day 入口）

1. **AbortSignal 接哪里**：未来 `stream(messages, opts?: { signal?: AbortSignal })`。SDK 侧 OpenAI / Anthropic 都原生支持 signal 传入；接口侧只要加一个可选参数即可。**Day 03 接口层不加，注释里写明扩展点**。

2. **结构化事件升级路径**：未来若需要 yield `tool_call` 等事件，契约形态如何选？候选：
   - 破坏性：`stream(): AsyncIterable<Event>`（Event 是新联合类型）
   - 渐进：`stream(): AsyncIterable<string | Event>`
   - 新方法：`events(): AsyncIterable<Event>`（与 `stream()` 并存）

   Day 03 暂不决策，等真出现 tool_use 需求时再 brainstorm。

3. **apps/api/ 起 day**：HTTP/SSE 适配器放哪里、用什么框架（Express / Fastify / Hono / 原生 http），Day 03 之后单独起一个 day 设计。

4. **apps/web-vue/ 起 day**：Vue 端如何消费流式响应、打字机效果组件设计、错误重连策略 —— 同样留未来 day。

---

## 13. 相关引用

- Day 02 笔记：[docs/daily/day02.md](../daily/day02.md)（Day 02 chat() 设计 + 多 provider + 宿主原则）
- Day 02 ChatClient 契约：[libs/llm/chat-client.ts](../../libs/llm/chat-client.ts)
- Day 02 Message 类型：[libs/llm/message.ts](../../libs/llm/message.ts)
- CLAUDE.md 项目级指令：[../../CLAUDE.md](../../CLAUDE.md)