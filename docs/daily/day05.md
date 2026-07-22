# Day 05 — apps/api/ SSE Adapter + Web UI

> 65 天 AI Agent Engineer Bootcamp · Day 05 / 65
> 主题（两阶段）：
> 1. 把 `Agent` 暴露成 SSE HTTP 端点
> 2. 在 apps/api/ 同进程 serve Agent Console Web UI（Claude Code 风格双栏）
>
> 回应全局 CLAUDE.md "内部统一使用 AgentEvent，对外统一通过 SSE 传输 AgentEvent"。

---

## 🎯 今日目标

### 阶段一：SSE Adapter

1. ✅ 在 `libs/agent` 落地 `AgentEvent` 判别联合（Agent Runtime 事件模型）
2. ✅ `Agent` 加 `runEvents()`：`AsyncIterable<AgentEvent>`，暴露完整 loop 过程
3. ✅ 重构 `Agent.run()` 为 `runEvents()` 的收尾版（消除重复）
4. ✅ 删除 `onIteration` 回调（与 `runEvents` 重复 → 加 if 兜底反模式）
5. ✅ 新建 `apps/api/` 包：`createAgentApp` + `sse-adapter`
6. ✅ 单端点 `POST /agent`，Hono `streamSSE` 输出
7. ✅ 端到端 demo：listen 端口 → 进程内 fetch 调自己 → 打印 SSE 帧
8. ✅ 补齐 apps/api/ 测试（sse-adapter 单测 + server 集成测试）
9. ✅ 守住 YAGNI：不引入 AbortSignal / 多 route / auth / schema validation / 假流式

### 阶段二：Agent Console Web UI（Claude Code 风格双栏）

10. ✅ `apps/api/src/web/index.html` 单 HTML 文件（内嵌 CSS + 原生 JS，零构建）
11. ✅ 双栏布局：左 Conversation（用户 + AI 气泡）+ 右 Execution Timeline（每事件一行）
12. ✅ 用 `fetch + ReadableStream` 消费 SSE（`EventSource` 不支持 POST）
13. ✅ 同一个事件源分发到两栏——Claude Code 的"用户消息和 tool result 在同一 turn 内交织"原则
14. ✅ 响应式：≤720px 自动堆叠为单栏
15. ✅ 写 HTML 关键字段断言测试（防 UI 静默坏）

### 阶段二修订：Timeline 样式调整（肥老大反馈）

16. ✅ 卡片化 timeline-step：每步是独立卡片（圆角 + 左边 3px 色条 + 浅色背景）
17. ✅ 状态色编码：done=绿 / active=蓝（深蓝底）/ error=红
18. ✅ step-detail 加 monospace 包裹框，提亮层级解决"一片黑"问题
19. ✅ Chrome MCP 端到端验证（真实 LLM + CalculatorTool）

---

## 📦 今日产出物

### 阶段一：SSE Adapter

```text
agent-engineer-bootcamp/
├── libs/agent/
│   ├── event.ts                                  # 🆕 AgentEvent 判别联合
│   ├── agent.ts                                  # ✏️ 加 runEvents() + 重构 run() 为收尾版 + 删除 onIteration
│   ├── types.ts                                  # ✏️ re-export AgentEvent
│   └── index.ts                                  # ✏️ export AgentEvent
├── apps/api/                                     # 🆕 新包
│   ├── README.md                                 # 🆕 用法 + YAGNI 边界
│   └── src/
│       ├── index.ts                              # 🆕 public exports
│       ├── server.ts                             # 🆕 createAgentApp（Hono factory）
│       ├── sse-adapter.ts                        # 🆕 AgentEvent → SSEMessage（framework-agnostic）
│       └── web-loader.ts                         # 🆕 加载 web/index.html
├── examples/day04/                               # ✏️ demo 改用 runEvents 替代 onIteration
│   ├── ex_001_calculator_agent_openai.ts         # ✏️ 移除 onIteration
│   └── ex_002_calculator_agent_anthropic.ts      # ✏️ 移除 onIteration
├── examples/day05/
│   └── ex_001_sse_agent.ts                       # 🆕 端到端：listen + self-fetch + SSE 流
├── tests/apps/api/                               # 🆕
│   ├── sse-adapter.test.ts                       # 🆕 纯函数 + 流式编码
│   └── server.test.ts                            # 🆕 Hono app.fetch 集成测试（不 listen）
└── package.json                                  # ✏️ + hono, @hono/node-server
```

### 阶段二：Web UI

```text
agent-engineer-bootcamp/
├── apps/api/
│   └── src/
│       └── web/
│           └── index.html                        # 🆕 Agent Console 单 HTML（内嵌 CSS + JS）
├── examples/day05/
│   └── ex_002_web_ui.ts                          # 🆕 启动 server 给浏览器用（不自调 fetch）
├── tests/apps/api/
│   └── web-html.test.ts                          # 🆕 HTML 关键字段断言
└── docs/daily/screenshots/                       # 🆕 Chrome MCP 截图
    ├── day05-web-ui-initial.png
    ├── day05-web-ui-completed.png
    └── day05-web-ui-timeline-v2.png              # 阶段二修订：卡片化样式
```

### 阶段二修订：Timeline 卡片化

只动了 1 个文件：apps/api/src/web/index.html 的 `.timeline-step` 块样式重构。零新依赖、零 JS 逻辑变化。

---

## 🔧 关键命令速查

```bash
# === Day 05 端到端 demo ===
pnpm exec tsx examples/day05/ex_001_sse_agent.ts        # SSE 端到端
pnpm exec tsx examples/day05/ex_002_web_ui.ts           # Web UI server（浏览器访问 http://127.0.0.1:3000/）

# === 质量门（本地 commit 前必跑） ===
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

---

## 📚 知识点

### 1. AgentEvent：判别联合而非平铺 optional

**前置问题（day04 反思题 #5）**：`ChatResponse` 用 optional 字段 `{ content?, toolCalls? }` 表达"二选一"，消费方要写：

```typescript
if (response.content !== undefined) { ... }
else if (response.toolCalls !== undefined) { ... }
```

**Day 05 选择**：AgentEvent 用判别联合 `kind` 字段，**消费方 switch 不会漏 case**：

```typescript
type AgentEvent =
  | { readonly kind: 'message_start' }
  | { readonly kind: 'iteration'; readonly n: number }
  | { readonly kind: 'tool_call'; readonly id: string; readonly name: string; readonly args: unknown }
  | { readonly kind: 'tool_result'; readonly id: string; readonly name: string; readonly output: string }
  | { readonly kind: 'message_end'; readonly content: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };
```

**Why**：

- SSE 是外部消费契约，TypeScript 类型收窄是免费的运行时安全。
- `event:` 字段直接复用 `kind`，前端 `EventSource.addEventListener('tool_call', ...)` 天然可用。
- 加新事件不会悄悄破坏旧消费者（必须显式扩展联合）。

### 2. `runEvents()` 是 `run()` 的真子集，不是并列

day04 的 `Agent.run()` 返回 `Promise<string>`，`onIteration` 回调暴露 `(iteration, response)`。
day04 反思题 #2 问 "onIteration 是妥协还是必要"——**是妥协**，因为它的信息本来就在事件流里。

**Day 05 重构**：

```typescript
async run(input: string): Promise<string> {
  // 收尾版：委托给 runEvents
  for await (const ev of this.runEvents(input)) {
    if (ev.kind === 'message_end') return ev.content;
    if (ev.kind === 'error') throw new Error(ev.message);
  }
  return '';
}

async *runEvents(input: string): AsyncIterable<AgentEvent> {
  // 唯一一份 loop 实现
  ...
}
```

**Why**：

- 消除重复：loop 只写一遍，`run()` 和 `runEvents()` 不可能分叉。
- 删除 `onIteration`：再保留就是同一信息的两个出口，加 if 兜底反模式。
- 调用方可以选：想要最终 string 用 `run()`，想要事件流用 `runEvents()`。

### 3. `tool_call` / `tool_result` 严格 1:1 配对

事件序列保证：

```
tool_call (id=X) → tool_result (id=X)
```

**这是 Agent Loop 的不变量**，不是约定俗成——`Agent.runEvents()` 的代码结构保证了这个顺序。

**Why**：

- SSE 消费方可以做超时检测：发出 `tool_call` 后 N 秒没收到 `tool_result` 就是异常。
- 状态机简化：消费方只需要"等待同 id 的 result"，不需要复杂配对逻辑。

### 4. SSE adapter 为什么 framework-agnostic

`apps/api/src/sse-adapter.ts` 输出 `{ event, data }` 形态，**不返回 Response 也不返回 SSE 字符串帧**：

```typescript
export interface SSEMessage {
  readonly event: string;
  readonly data: string;
}

export function agentEventToSSEMessage(ev: AgentEvent): SSEMessage { ... }
export async function* agentEventsToSSEMessages(events: AsyncIterable<AgentEvent>): AsyncIterable<SSEMessage> { ... }
```

`server.ts` 才依赖 Hono：

```typescript
return streamSSE(c, async (stream) => {
  for await (const msg of agentEventsToSSEMessages(options.agent.runEvents(input))) {
    await stream.writeSSE(msg);
  }
});
```

**Why**：

- adapter 单测一行可验证（不启 HTTP）。
- 未来换 Fastify / Express / Web Response，`sse-adapter.ts` 不动。
- W3C SSE 字段 `{ event, data }` 是 spec 子集，跟 hono `SSEMessage` 形态一一对应。

### 5. apps/api/ 不硬编码 provider

```typescript
// 调用方组装依赖
const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);
const agent = new Agent({ chat, tools });

const app = createAgentApp({ agent });
```

`createAgentApp` 只接 `Agent`，不知道也不关心 chat 是 OpenAI / Anthropic / fake。

**Why**：

- apps/api/ 不需要因为换 provider 而改任何代码。
- 测试用 `FakeChatClient` 即可端到端验证，**不需要 mock HTTP**。
- 单端口绑单 Agent（Day 05 YAGNI）；未来要多 Agent 再考虑 pool / factory map。

### 6. 400 错误的范围（不做 schema validation）

```typescript
if (typeof input !== 'string' || input.length === 0) {
  return c.json({ error: 'request body must be { input: string }' }, 400);
}
```

不做 zod/ajv runtime schema 校验。

**Why**：

- 只有一个 endpoint、一个字段。schema 校验的成本（依赖 + 错误消息结构）大于收益。
- 类型校验已经由 TypeScript 在调用方完成（调用方构造 Request body 时类型就保证）。
- 真正的恶意输入会被 LLM provider 的 server-side validation 拦下，apps/api/ 不需要重复防御。

### 7. Error 事件 vs throw

`runEvents()` 内部出错（maxIterations 超限 / chat 抛异常）走两种路径：

| 错误类型 | 路径 | 消费方收到 |
|---|---|---|
| Loop 内逻辑错误（maxIterations 超限） | `runEvents` 在 `message_end` 之前 throw → `server.ts` catch → emit `{kind:'error'}` 事件 | 收到 error 事件，连接正常关闭 |
| HTTP 协议层错误（缺 input） | `server.ts` 立即 return 400 | 收到 400 状态码，无 SSE 流 |

**Why**：

- 协议层错误用 HTTP status 表达（任何 HTTP client 都能识别）。
- 业务层错误用 SSE 事件表达（不破坏流，已经发的消息保留）。
- 区分清楚是 SSE adapter 的责任，不是 ChatClient 的责任。

---

## ❓ 思考题

1. `AgentEvent` 是判别联合（`kind` 字段）。如果某天需要"事件携带 provider 上下文"（比如 `{kind: 'tool_call', provider: 'openai', ...}`），是给每种 kind 加 provider 字段（破坏 closed set），还是拆成 `OpenAIToolCallEvent | AnthropicToolCallEvent`（增加变体但保持 closed）？今天的判别联合倾向哪种？
2. `runEvents()` 暴露 iteration 进度。如果未来要做"暂停 / 恢复 Agent"（agent 跑到一半，序列化状态，N 小时后从断点恢复），`AgentEvent` 是否够用？要不要加 checkpoint 事件？
3. `sse-adapter.ts` 是 framework-agnostic。如果未来要做 WebSocket / gRPC 传输，AgentEvent 类型本身要改吗？还是 adapter 层需要"先解码 SSEMessage 再向上转"？
4. `createAgentApp` 单 endpoint 单 agent。如果未来一个 server 要支持多个 Agent（不同 system prompt、不同 tools），是参数化 `createAgentApp({ agents: Record<string, Agent> })` 让路径 `/agent/:id` 选？还是把"路由→agent"放在调用方？
5. SSE 没有重连状态机。客户端断线重连后，从 `message_start` 重头看一遍。如果要支持"断线续传"，是 SSE 加 `id` + `Last-Event-ID` header（spec 自带），还是客户端用 WebSocket 替换？哪种更适合 Agent 事件流？
6. `tool_call.args` 是 `unknown`。Agent 内部不解析（calculator tool 自己 parse args）。如果未来 Agent 想知道"工具被错误调用"（参数类型对但语义错，比如 calculator 收到 `{expression: ''}`），是要 Agent 层做语义校验，还是工具层自己 throw 让 Agent 收到 error tool_result？
7. Day 04 demo 删了 `onIteration` 后改用 `runEvents`。这意味着 demo 现在能看到 tool_call / tool_result 细节（之前 onIteration 看不到）。Day 04 反思题 #2 现在有没有答案？

---

## ⚠️ 今日踩坑

### 1. `onIteration` 和 `runEvents` 重复信息

**症状**：设计 `runEvents()` 时，AgentOptions 仍有 `onIteration` 回调。

**根因**：`onIteration` 本来就是"看 iteration 进度"的妥协；`runEvents` 直接 yield 出 `{kind:'iteration'}` 是它的天然替代品。两者并存 = 同一信息的两个出口。

**修法**：删除 `onIteration`，把 `run()` 重构为 `runEvents()` 的收尾版。day04 两个 demo 同步改写：用 `for await (const ev of agent.runEvents(input))` 手动打印进度。

**Why**：保留两个出口需要写 `if (onIteration) emit iteration event then call onIteration`——经典"加 if 兜住"，违反全局 CLAUDE.md 第一原则。

### 2. SSE adapter 一开始写成了"生成完整 SSE 帧字符串"

**症状**：初版 `encodeAgentEvent(ev)` 返回 `event: <kind>\ndata: <json>\n\n` 字符串，`encodeAgentEventStream` 是 `AsyncIterable<string>`。

**根因**：直接想"输出 Hono 能吃的格式"，耦合了 hono 的 `streamSSE` API。

**修法**：改写为 framework-agnostic——返回 `{ event, data }` 形态，跟 hono `SSEMessage` 一一对应。server.ts 才把 SSEMessage 喂给 `stream.writeSSE`。

**Why**：

- 单测一行可验证 `agentEventToSSEMessage({kind:'iteration', n:1})` → `{event:'iteration', data:'{"kind":"iteration","n":1}'}`。
- W3C SSE 字段 `{ event, data }` 是 spec 子集，未来换 Fastify / Express / Web Response 都不需要改 sse-adapter.ts。

### 3. `port: 0` 让 OS 分配端口

**症状**：hardcode `port: 3000`，CI 多进程跑可能冲突。

**根因**：demo 端口硬编码。

**修法**：`serve({ fetch: app.fetch, port: 0 })`，读 `server.address()` 拿实际端口。

**Why**：demo 自包含（不依赖外部端口约定）+ 不会跟系统其他进程冲突。

---

## 📋 验收清单

- [x] `libs/agent/event.ts` 定义 `AgentEvent` 判别联合（7 个 kind，不含 message_delta）
- [x] `Agent.runEvents(): AsyncIterable<AgentEvent>` 暴露完整 loop 过程
- [x] `Agent.run()` 重构为 `runEvents()` 的收尾版（消除重复）
- [x] `onIteration` 回调已删除（与 runEvents 重复 → 加 if 反模式）
- [x] `libs/agent/index.ts` export `AgentEvent`
- [x] day04 两个 demo 改用 `runEvents` 替代 `onIteration`，仍能跑通
- [x] `apps/api/src/sse-adapter.ts` framework-agnostic（输出 `{ event, data }` 形态）
- [x] `apps/api/src/server.ts` 暴露 `POST /agent`，Hono `streamSSE`
- [x] `apps/api/src/index.ts` 公共 exports
- [x] `apps/api/README.md` 用 curl / EventSource 演示
- [x] `apps/api/` 不硬编码 ChatClient / ToolRegistry（依赖通过参数注入）
- [x] 400 错误：input 缺失 / 非 string / 空字符串
- [x] Error 事件：Agent loop 抛错时以 `{kind:'error'}` SSE 帧发出
- [x] `tests/apps/api/sse-adapter.test.ts` 全绿（单测 + 流式编码）
- [x] `tests/apps/api/server.test.ts` 全绿（Hono app.fetch 集成测试，不 listen）
- [x] `examples/day05/ex_001_sse_agent.ts` 真实 listen + self-fetch + SSE 流
- [x] `pnpm typecheck` 0 error
- [x] `pnpm lint` 0 error
- [x] `pnpm format:check` 全绿
- [x] `pnpm test` 全部通过
- [x] 未引入 AbortSignal / 多 route / auth / schema validation / 假 message_delta 流式

---

## 🆕 与 day04 的差异记录

### 1. `AgentEvent` 类型从无到有

day04 全局 CLAUDE.md 写了约束但没落地类型。Day 05 把 AgentEvent 作为 `libs/agent/event.ts` 落地，放在 libs 层（不是 apps/api/），因为它属于 Agent Runtime 的概念，不是 transport 的概念。

### 2. `Agent.run()` 接口不变，实现重构

Public API 上 `run(input): Promise<string>` 还在。内部从手写 loop 改成 `for-await runEvents(...)` 收尾，**消除重复**。day04 测试不需要改。

### 3. `onIteration` 回调从有到无

day04 验收清单打勾时 `onIteration` 还在。Day 05 删掉，因为 `runEvents()` 是它的替代品。两个 demo 改用 `runEvents()` 手动打印 iteration / tool_call / tool_result。

---

## 🚀 Day 06 预告

候选方向：

1. **Streaming content**：把 `stream()` 真正接进 Agent，让 `message_end` 之前能 yield 多个 `message_delta`，前端可以打字机效果。
2. **AbortSignal**：给 `runEvents()` 加 `runEvents(input, { signal })`，流式 / 非流式调用都能取消。
3. **Web UI 消费 SSE**：用原生 EventSource（或 fetch + ReadableStream）做一个浏览器端 demo 页面，把 SSE 帧渲染成可读 UI。

推荐候选 **3**，因为 Day 05 的 demo 只在 Node 进程内自调，缺一个真正的浏览器 / curl 用户视角。

---

## 🔗 相关引用

- 全局约束：[CLAUDE.md](../../CLAUDE.md) — "内部统一使用 AgentEvent 作为 Agent Runtime 的事件模型；对外统一通过 SSE 传输 AgentEvent"
- Day 04 文档：[docs/daily/day04.md](day04.md)
- 代码锚点：
  - [libs/agent/event.ts](../../libs/agent/event.ts) — AgentEvent 判别联合
  - [libs/agent/agent.ts](../../libs/agent/agent.ts) — `runEvents()` + 重构后的 `run()`
  - [apps/api/src/sse-adapter.ts](../../apps/api/src/sse-adapter.ts) — framework-agnostic SSE 编码
  - [apps/api/src/server.ts](../../apps/api/src/server.ts) — Hono `streamSSE` 路由
  - [examples/day05/ex_001_sse_agent.ts](../../examples/day05/ex_001_sse_agent.ts) — 端到端 demo

---

## 🌐 Day 06（追加）— Agent Console Web UI

> 肥老大追加指令：阶段一交付后立即补 Web UI 层。

### 设计对齐 Claude Code

参考 Claude Code 的 surface model：

- **左栏 Conversation**：用户消息（右对齐蓝色气泡）+ AI 回复（左对齐绿色气泡）
- **右栏 Execution Timeline**：每个 AgentEvent 一行，✓ 标记视觉保留，让用户看到"已经完成的步骤"

### 关键技术点

**1. 双栏用 CSS Grid 而非 Flexbox**

```css
main {
  display: grid;
  grid-template-columns: 1fr 360px;  /* 左主，右固定 360px */
  height: 100%;
}
```

为什么不用 Flexbox：响应式时 Flexbox 容易让两栏高度错位；Grid 的 `grid-template-columns: 1fr 360px` 在 ≤720px 时改 `1fr` 即可堆叠。

**2. `EventSource` 不支持 POST，必须用 `fetch + ReadableStream`**

```javascript
const res = await fetch('/agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input }),
});
const reader = res.body.getReader();
// ... 按 \n\n 分帧
```

**3. 同一个事件源分发到两栏**

```javascript
function dispatch(ev) {
  switch (ev.kind) {
    case 'message_start': setThinking('...'); addTimelineStep('接收任务'); break;
    case 'tool_call':     addTimelineStep('调用 ' + ev.name, JSON.stringify(ev.args)); break;
    case 'tool_result':    addTimelineStep('Tool 返回', ev.output); break;
    case 'message_end':   addMessage('ai', ev.content); addTimelineStep('生成答案', ev.content); break;
    case 'done':          addTimelineStep('完成'); break;
    case 'error':         addMessage('error', ev.message); addTimelineStep('错误', ev.message, 'error'); break;
  }
}
```

**Why**：用户消息和 tool result 在同一个 turn 内交织——这是 Claude Code 的核心 UX 原则。timeline 是事件流可视化投影、conversation 是对话投影，**两者从同一事件源分发**，不分裂。

### YAGNI 边界（不做）

- ❌ Markdown 渲染（保留原始文本）
- ❌ 多轮对话历史（每次 send 清空两栏）
- ❌ 代码高亮（不属于今天）
- ❌ Tailwind / CSS-in-JS（内联 CSS 已经够）
- ❌ Vite / React / Vue（零构建工具）
- ❌ 主题切换（暗色单主题）

### 验证

- ✅ `tests/apps/api/web-html.test.ts` — HTML 关键字段断言（防 UI 静默坏）
- ✅ `tests/apps/api/server.test.ts` — `GET /` 返回 HTML
- ✅ Chrome MCP 截图肉眼验证（按全局铁律）

### 文件锚点

- [apps/api/src/web/index.html](../../apps/api/src/web/index.html) — Agent Console 单 HTML（内嵌 CSS + JS）
- [apps/api/src/web-loader.ts](../../apps/api/src/web-loader.ts) — 基于 import.meta.url 的 HTML 路径解析
- [apps/api/src/server.ts](../../apps/api/src/server.ts) — `GET /` + `POST /agent` 两路由
- [tests/apps/api/web-html.test.ts](../../tests/apps/api/web-html.test.ts) — HTML 静态测试
