# Day 09 — 多轮对话历史（Multi-turn Conversation History）

> 65 天 AI Agent 工程师训练营 · Day 09 / 65
> 主题：把"messages 由谁拥有"这个问题在 Day 09 钉死 —— `Agent.runEvents` 接受完整 messages，`AgentOptions.systemPrompt` 删除，调用方拼装 system + 历史 + 新 user。前端 `apps/web` 配套 scrollback。

---

## 🎯 今日目标

1. ✅ `agent.runEvents(messages, options)` 签名从 `runEvents(userInput, options)` 改为接收 `readonly Message[]`
2. ✅ `agent.run(messages, options)` 同步改签名（同一份 loop 实现）
3. ✅ `AgentOptions.systemPrompt` 删除 —— system 消息完全由调用方拼在 messages[0]
4. ✅ `runEvents` 入口 `messages.map((m) => ({...m}))` 深拷贝（Day 05 规则在入口复用）
5. ✅ 函数体内部所有 `messages` 引用改 `workingMessages`（避免污染调用方数组）
6. ✅ `apps/api/src/server.ts` POST `/agent` 接 `messages?: Message[]`，追加 user 在末尾
7. ✅ 10 个 example 文件全部改（day04~day08）—— `new Agent({...})` 删 systemPrompt，调用方拼 messages
8. ✅ 4 个测试文件（agent.test, run-events.test, end-to-end, server, trace-collector）全部改完
9. ✅ 前端 `AgentClient.stream` 加 `messages` 选项
10. ✅ 前端 `App.vue` 拆 `resetTurn` → `resetRunState`（不清空 conversation，只清 per-run 状态）
11. ✅ 前端 `App.vue.send` 把 `ConversationItem[]` 翻译成 `Message[]` 传给 stream
12. ✅ 反例 1（多轮 send via HTTP）+ 反例 3（空 messages）写为 e2e 测试
13. ✅ 反例 2（非法 role）标记 YAGNI，留 TODO 进 Day 10+ 路线
14. ✅ ADR 0002 落地（messages 边界 + systemPrompt 下放 + 入口深拷贝）
15. ✅ `examples/day09/multi_turn_client.ts` —— 真实 LLM 跑两轮，断言 turn 2 LLM 真的"记住"了 turn 1
16. ✅ `examples/day09/agent_server.ts` + `scripts/dev-day09.ts` + `dev:day09` 脚本 —— 浏览器 UI 端到端验证路径（Layer 5）

---

## 📦 今日产出物

```text
libs/agent/
  agent.ts                            MODIFIED — runEvents 签名 + 删 systemPrompt + 入口深拷贝 + body 改 workingMessages

apps/api/src/
  server.ts                           MODIFIED — POST /agent 接 messages + 浅校验 + Message 导入

examples/
  day04/ex_001_calculator_agent_openai.ts   MODIFIED
  day04/ex_002_calculator_agent_anthropic.ts MODIFIED
  day05/ex_001_sse_agent.ts           MODIFIED
  day05/ex_002_web_ui.ts              MODIFIED
  day06/ex_001_sse_trace.ts           MODIFIED
  day06/ex_002_web_ui_timeline.ts     MODIFIED
  day06/ex_003_no_llm_smoke.ts        MODIFIED
  day07/ex_001_streaming_agent_openai.ts   MODIFIED
  day07/ex_002_streaming_agent_anthropic.ts MODIFIED
  day08/agent_server.ts               MODIFIED
  day09/multi_turn_client.ts          NEW — 真实 LLM 两轮多轮 + 断言
  day09/agent_server.ts               NEW — 纯 server（浏览器 UI 验证用）

scripts/
  dev-day09.ts                        NEW — 一行起 api + web（Layer 5 入口）

apps/web/src/
  api/agentClient.ts                  MODIFIED — StreamOptions.messages + body 含 messages
  App.vue                             MODIFIED — resetRunState + send 翻译 ConversationItem → Message[]

tests/
  apps/api/end-to-end.test.ts         MODIFIED + 2 反例（多轮 + 空 messages）
  apps/web/multi-turn.test.ts         NEW — front-end body 形状（2 反例：含 messages / back-compat 单轮）
  libs/agent/agent.test.ts            MODIFIED — agent.run([]) 形式
  libs/agent/run-events.test.ts       MODIFIED — runEvents([]) 形式 + system 注入测试

docs/
  adr/0002-run-events-accepts-messages-caller-injects-system-prompt.md  NEW
  daily/day09.md                      NEW — 本文件
```

---

## 🤔 今日讨论过程（苏格拉底式摘要）

Day 09 的设计不是一次成型，中间有 6 个关键转折点。

### 转折 1：5 个 ack 决策自动消解

打开 Day 08 笔记里的 Day 09 预告，看到 5 个待 ack 决策（持久化策略 / session ID / message ID 体系 / AbortSignal 跨 turn / context 按 turn 还是 run 拆分），第一反应是"5 个都得答"。

但答完第一题"Conversation 该由谁持有"之后，**架构决策连带消解了 4 个**：
- session ID → 不需要持久化就不需要 sessionId（YAGNI）
- message ID → dedup 是持久化的需求，持久化没做就不预加（YAGNI）
- AbortSignal 跨 turn → 一个 AbortController per HTTP request = per turn，Day 07 语义不用扩
- run vs turn → `runId` 天然是 `turnId`（一次 POST = 一次 runEvents = 一次 turn）

5 个 ack 决策**只剩 1 个**（持久化策略），其他被架构自动吸收。

### 转折 2：反驳"createAgentApp 会重新初始化"

我自己提出了"`Conversation` 由 `Agent` 内部持有"选项 A。肥老大立刻判断"createAgentApp 会重新初始化，信息不会串"。

我用三段代码反证：
1. `createAgentApp` 是模块顶层语句，进程启动跑一次
2. `tests/apps/api/trace-collector.test.ts:187-188` 直接 `createAgentApp({ agent: shared })` × 2 —— 共享同一 Agent 实例
3. 请求级状态（AbortController / runId / messages）全在 handler 或 runEvents 内部 new，**agent 不在这一列**

结论：选项 A 在单进程单实例下**会跨用户串话**。选项 A 证伪。

### 转折 3：B1 vs B2 真正理由

肥老大选了 B2（`runEvents` 内部不修改调用方数组），理由是"避免调用方数组无限膨胀"。

我指出这是错的：多轮对话就是**要膨胀**。B2 的真正理由是**所有权（ownership）**：
- B1 让 `runEvents`（可能被中途 break 的 async generator）拥有对调用方数据的写权限 → "同一状态的两个所有者"
- B2 保持所有权唯一：`runEvents` 内部的 `messages` 是 run 私有的工作副本

这其实是 Day 05 删 `onIteration` 原则的入口版本 —— 当时是"同一信息的两个出口"，今天是"同一状态的两个所有者"。

### 转折 4：Message 原子性

肥老大问"如果 run 中途 abort，已经 push 的 assistant/tool 消息留在历史里还是丢掉"。

答案揭示了 messages 不是随便的 list：
- Anthropic API 强制 `assistant(tool_calls) → tool(result) → assistant(content)` 顺序
- 半截状态 = 协议非法 = 下一轮 400
- 所以"原子提交"是 messages 语法的硬约束，不是产品偏好

推论：**只有跑到 `message_end` 的 turn 才能进历史**。这决定了"谁 commit"必须在 message_end 时机点做。

### 转折 5：消费方能区分 message_end / error

肥老大说"消费方无法确认是 message_end 还是 error"。

我用 server.ts 现有代码反证：

```ts
if (ev.kind === 'message_end' || ev.kind === 'error') {
  if (totalUsage !== undefined) collector.addMeta(runId, { usage: totalUsage });
  collector.end(runId);
}
```

**同一个 for await 循环、同一个 ev.kind switch，消费方已经在区分了。** 问"消费方能不能"是 false premise。

正确的"谁 commit"方案是 **乙（消费方自然消费）**：
- 不用改 agent.ts（不动 `request.messages` shape）
- 不用加新 kind（不动 12 kind 协议）
- 调用方在看到 `message_end` 时 commit —— 跟 TraceCollector 是同一种"消费事件流"

### 转折 6：持久化抽象诱惑

肥老大问"持久化是否可以先抽象出一层方便换"。

我反驳：
1. CLAUDE.md YAGNI 写"今天不用就不要设计"
2. Day 04 的 `ChatClient`、Day 06 的 `TraceCollector` 都是真到第二家 SDK / 第二个场景才抽
3. `trace-collector.test.ts:187-188` 用的还是 `new TraceCollector()`，没抽 interface
4. 未来无痛换**靠集中不靠抽象** —— 把所有"读 / 写 conversation"的代码收口在 `useConversation()` 一个 composable 里（Day 09 暂不抽，等第二个 caller）

**抽象是"为还没出现的代码预留位置"；集中是"为今天唯一的代码找好位置"**。两者外观相似，本质不同。

### 转折 7：反例 2（非法 role）—— YAGNI 的诚实处理

我列了 3 个反例要验证，反例 2 是"messages 包含非法 role（如 'banana'）"。FakeChatClient 不校验 role，原样透传 —— 在 server 层测不到，要真 LLM 才报错。

我没硬写一个 mock 来测，而是**把这个事实写进 commit message**：
- 当前行为：server 接到 `{ role: 'banana' }` → 浅校验 `Array.isArray` 通过 → 透传到 chat.chat() → provider 层炸（500）
- 这是 YAGNI，等真有 provider-specific error path 时再加 schema 校验
- 留 TODO 进 Day 10+ 路线

这是 CLAUDE.md "完成前必跑"铁律的镜像：测不到的不能假装"测了"，**老老实实记下来"没测、为什么没测、什么时候该测"**。

### 转折 8：完成前必跑铁律的违反

我提交了 `709deb5`（前端多轮 UI + scrollback），commit message 写"测试 74 passed"，但**当时 `tsc --noEmit` 有 2 个错误**（`AsyncIterable` 没有 `.next()`）。vitest 用 esbuild 不跑 typecheck，所以测试还过。

后来写 day09 example 时 typecheck 跑出来才看见。

**CLAUDE.md "完成前必跑"铁律 violation: typecheck 是验证的一部分，缺一不可。**

修法：`tests/apps/web/multi-turn.test.ts` 用 `for await ... break` 替代 `iter.next()`，typecheck 重跑 0 错。这个修法以独立 `fix:` commit 提交（不 amend history），commit message 写明"补 commit 709deb5 的 typecheck gap"。

---

## 💡 关键设计决策

### 决策 1：runEvents 签名从 `string` 改为 `readonly Message[]`

```ts
// 之前
async *runEvents(userInput: string, options?: AgentRunOptions): AsyncIterable<AgentEvent>

// 之后
async *runEvents(
  messages: readonly Message[],
  options?: AgentRunOptions,
): AsyncIterable<AgentEvent>
```

**为什么**:多轮对话要求 messages 由调用方累积，Agent 内部拼会阻断跨 turn 历史传递。`Agent` 是配置容器（跨请求不变），`messages` 是 per-request 决策，两者生命周期不同。

### 决策 2：删除 `AgentOptions.systemPrompt`

```ts
// 之前
interface AgentOptions {
  chat: ChatClient;
  tools: ToolRegistry;
  systemPrompt?: string;   // ← 删除
  maxIterations?: number;
  model?: string;
}

// 之后
interface AgentOptions {
  chat: ChatClient;
  tools: ToolRegistry;
  maxIterations?: number;
  model?: string;
}
```

**为什么不留**:systemPrompt 是 per-request 决策（每次 send 决定 system 文案），不是 per-instance 配置（一个 Agent 实例跨多个 session）。把 per-request 数据塞进 per-instance options 是职责错位。Day 04 当时没有多轮场景，问题被掩盖了。

### 决策 3：入口深拷贝

```ts
// runEvents 内部
const workingMessages: Message[] = messages.map((m) => ({ ...m }));
```

**为什么**:Day 05 已经在 `request` 事件上做过 defensive copy（避免两次 yield 引用同一个累积数组）。Day 09 把这个规则推广到**入口** —— 调用方传入的 `messages` 绝不被就地修改，`runEvents` 内部 push assistant/tool 只动 working copy。

### 决策 4：调用方拼 messages

```ts
// apps/api/src/server.ts
const incomingMessages = Array.isArray(body?.messages) ? (body.messages as Message[]) : [];
const messages: Message[] = [...incomingMessages, { role: 'user', content: input }];
for await (const ev of options.agent.runEvents(messages, { signal: ... })) { ... }
```

**为什么**:系统消息 + 历史 + 新 user 全部由 server 拼。`runEvents` 不再有任何"拼 messages"的职责，只读不写。

### 决策 5：前端 ConversationItem → Message 映射

```ts
// apps/web/src/App.vue
const historyMessages: Message[] = conversation.value
  .filter((c): c is { role: 'user' | 'assistant'; text: string; streaming: boolean } =>
    c.role === 'user' || c.role === 'assistant',
  )
  .filter((c) => c.text.length > 0)
  .map((c) => ({ role: c.role, content: c.text }));
```

**为什么**:前端 `ConversationItem` 有 4 种 role（user/assistant/thinking/error），server `Message` 有 4 种 role（system/user/assistant/tool）。前端不持有 system/tool（它们是 server 内部概念），所以只取 user/assistant。这是 inline 4 行，不抽 helper（YAGNI）。

### 决策 6：resetTurn 拆为 resetRunState

```ts
// 之前
function resetTurn() {
  conversation.value = [];  // ← 删
  timeline.value = [];
  runContexts.value = [];
  // ...
}

// 之后
function resetRunState() {
  // conversation 不动 —— 多轮 scrollback
  timeline.value = [];
  runContexts.value = [];
  // ...
}
```

**为什么**:timeline / runSummary / runContexts 是 per-run 状态（每次 LLM 调用重置），conversation 是 per-session 状态（跨 turn 保留）。两者生命周期不同，函数名也要分开。

---

## 📊 测试覆盖

| 测试 | 文件 | 覆盖什么 |
|---|---|---|
| `agent.test.ts` (4 tests) | `tests/libs/agent/agent.test.ts` | `agent.run(messages)` 签名：单轮 / tool loop / 未知 tool / maxIterations |
| `run-events.test.ts` (14 tests) | `tests/libs/agent/run-events.test.ts` | `runEvents(messages)` 签名：12 kind 序列 / request messages 累积 / signal abort / error yield / run_summary |
| `server.test.ts` (7 tests) | `tests/apps/api/server.test.ts` | HTTP 协议层：400 / POST 序列化 / TraceCollector 路由 |
| `end-to-end.test.ts` (7 tests) | `tests/apps/api/end-to-end.test.ts` | SSE 端到端 + **反例 1（多轮 send via HTTP）** + **反例 3（空 messages）** |
| `trace-collector.test.ts` (5 tests) | `tests/apps/api/trace-collector.test.ts` | TraceCollector：start / collect / end / LRU eviction / meta |
| `multi-turn.test.ts` (2 tests) | `tests/apps/web/multi-turn.test.ts` | front-end body 形状：含 messages / back-compat 单轮 |
| `sse-adapter.test.ts` (13 tests) | `tests/apps/api/sse-adapter.test.ts` | AgentEvent → SSE 帧转换 |
| `context-counter.test.ts` (4 tests) | `tests/libs/llm/observability/context-counter.test.ts` | countContextTokens best-effort |
| `models.test.ts` (3 tests) | `tests/libs/llm/observability/models.test.ts` | MODELS 注册表 + getModelMeta |
| `call-chain.test.ts` (1 test) | `tests/apps/web/call-chain.test.ts` | buildCallChain 工具函数 |
| `smoke.test.ts` (3 tests) | `tests/smoke.test.ts` | 仓库根级 smoke |
| `calculator-tool.test.ts` (8 tests) | `tests/libs/tools/calculator-tool.test.ts` | calculator 工具 |
| `tool-registry.test.ts` (5 tests) | `tests/libs/tools/tool-registry.test.ts` | ToolRegistry 注册 / 查找 |

**总计：13 test files, 74 passed, 0 failed, 2 skipped (Anthropic key gated)**

---

## 🧪 怎么测 Day 09 的改动

按粒度分四层：

### Layer 1：纯类型（毫秒级）

```bash
npx tsc --noEmit
```

期望：0 errors。如果有错说明签名变更没改全。

### Layer 2：单元 + 集成测试（秒级）

```bash
pnpm test --run
```

期望：74 passed, 0 failed, 2 skipped。

### Layer 3：HTTP 端到端 + mock 多轮（秒级）

```bash
pnpm test --run tests/apps/api/end-to-end.test.ts
pnpm test --run tests/apps/web/multi-turn.test.ts
```

期望：分别 7 passed / 2 passed。这两层明确覆盖反例 1（多轮 send via HTTP）和反例 3（空 messages）。

### Layer 4：真实 LLM 端到端（10~30 秒，需要 OPENAI_API_KEY）

```bash
pnpm exec tsx examples/day09/multi_turn_client.ts
```

期望：
```
[day09] server listening on http://127.0.0.1:3000
[day09] → turn (input="我是肥老大", history=1)
[day09] turn 1 answer: 你好，肥老大！
[day09] → turn (input="请告诉我你刚才听到的名字是什么？...", history=3)
[day09] turn 2 answer: 肥老大
[day09] ✅ LLM 真的"记住"了 turn 1 的输入
```

如果 turn 2 answer 不含"肥老大" —— messages 没透传对（最常见是 server.ts 拼 messages 漏掉 history）。

**Layer 4 是 mock 覆盖不到的** —— mock 只验 messages 形状对，不验 LLM 真的"读了"。

### Layer 5：浏览器 UI 端到端（10~30 秒，需要 OPENAI_API_KEY + Chrome）

```bash
# terminal 1: 一行起 API + 前端
pnpm run dev:day09

# terminal 2: 浏览器开 http://127.0.0.1:5173/
#   1. 输入 "我是肥老大" → 点 Send
#   2. 等 assistant 回复（问候 / 确认名字）
#   3. 输入 "请告诉我你刚才听到的名字是什么？" → 点 Send
#   4. 验证 scrollback 显示：turn 1 user / turn 1 assistant / turn 2 user / turn 2 assistant
#   5. 验证 turn 2 assistant 回答 "肥老大"
```

`dev:day09` = `dev:api:day09`（API 入口是 `examples/day09/agent_server.ts`）+ `dev:web`（Vite 5173 + proxy /agent 到 3000）。

`dev:api:day09` vs `dev:api` 的区别：API example 文件不同（day09 vs day08）。**后端代码完全相同**（Day 09 的 server.ts 改动向后兼容 day08 example），但用 `dev:day09` 保证验证名实一致。

**Layer 5 是 Layer 4 验不到的场景**：Layer 4 验"后端 + LLM 真的记住"，Layer 5 验"前端 UI 真的 scrollback + 渲染多轮"。

---

## ⚠️ 注意事项

### 1. server.ts 不做 deep schema 校验

`POST /agent` 收到 `body.messages` 后只查 `Array.isArray`，不校验每条 message 的 `role` 是不是 union 合法值、content 是不是 string。

**后果**:发 `{ role: 'banana' }` 不会在 server 层被拦，会一直透传到 provider 层炸（通常 500）。**当前没有专门测这条**（反例 2 留 TODO）。

**修法**:Day 10+ 评估加 schema 校验（zod / 手写 union 守卫），加在 server.ts 入口。

### 2. 前端 ConversationItem 和 server Message 是两个类型

- `apps/web/src/types/agentEvent.ts` 的 `ConversationItem` = 4 种 role (user/assistant/thinking/error)
- `libs/llm/message.ts` 的 `Message` = 4 种 role (system/user/assistant/tool)

前端不持有 system/tool，server 不持有 thinking/error。`App.vue.send` 内的 `filter + map` 是这两个类型的唯一桥梁。

**加新 role 时的检查清单**:
- 前端 `ConversationItem` 加 role → 改 `MessageBubble.vue` 渲染 + `App.vue.dispatch` 处理
- `Message` 加 role → 改 `App.vue.send` 的 filter (否则新 role 不被翻译)
- `agentClient` 不变 (透传 `messages` 数组)
- `agent.runEvents` 不变 (loop push assistant/tool 保持)

### 3. AbortSignal 是 per-turn 范围

`AbortController` 在 `POST /agent` handler 里 new 一个，监听 `c.req.raw.signal`（客户端断线）。这意味着 abort **只取消当前 turn**，不影响多轮 session 继续。

**不要**复用同一个 AbortController 跨多次 send —— 会让用户取消一次后整个 conversation 都 abort 不了。

### 4. message_end 是 commit 时机点

`AgentEvent.kind === 'message_end'` 意味着本轮完整跑完（assistant 拿到 content 或 tool_calls + tool 跑完）。

**front-end commit 时机**:
- `message_delta` 累积到 conversation 的 streaming assistant
- `message_end` 停止 streaming 标记，固定 assistant.text
- `error` **不** commit 半截（保持 conversation 干净）

这条铁律保证 messages 永远是协议合法状态，下一轮发给 LLM 不会 400。

### 5. `request` 事件 messages 是 deep copy

`runEvents` 在每次 LLM 调用前 yield `request` 事件，`request.messages` 是 `workingMessages.map((m) => ({...m}))` —— deep copy。

**消费方拿到 `request.messages` 改了不影响 runEvents 内部状态**。但也意味着消费方**不会**通过改 `request.messages` 来影响下一轮 LLM 调用 —— 想影响必须改传给 `runEvents` 的原始 `messages` 数组。

### 6. server 无状态 = 跨 session 隔离天然成立

`createAgentApp` 内的 `app` / `agent` / `collector` 全是进程级（模块顶层 / createAgentApp 内），**没有 per-session 状态**。每个 HTTP request 创建自己的 `abortController` / `runId` / `messages` 局部变量。

**含义**:两个浏览器 tab 同时发消息，互不干扰。`runId` 不同、abortController 不同、messages 不同（前端持有各自的 useState conversation）。

**多进程部署暂时不支持**（技术债）。单进程多 tab、单进程多用户 OK。

---

## 🛣 Day 10+ 路线 + 已知技术债

### Day 10+ 建议方向

#### A. schema 校验（反例 2）

`POST /agent` body 加 zod schema（或者手写 union 守卫）：

```ts
const MessageSchema = z.union([
  z.object({ role: z.literal('system'), content: z.string() }),
  z.object({ role: z.literal('user'), content: z.string() }),
  z.object({ role: z.literal('assistant'), content: z.string(), toolCalls: z.array(...).optional() }),
  z.object({ role: z.literal('tool'), content: z.string(), toolCallId: z.string() }),
]);
```

校验失败 → 400 + 明确错误信息；校验通过 → 类型安全往下传。

**触发条件**:真有用户报"messages 被吞了" / 500 from provider。

#### B. `useConversation` composable 抽象

当前 `App.vue` 内的 `conversation` ref + `send` 内的 filter+map 是 inline 4 行。等**第二个 caller** 出现（比如 `ChatReplayPanel` 重看历史、`EvalRunner` 跑固定 conversation）时再抽 `apps/web/src/composables/useConversation.ts`。

**触发条件**:有第二个 Vue 组件 / composable 要读 / 写 conversation。

#### C. 持久化（Day 08 路线遗留）

`localStorage` / `IndexedDB` / server-side DB 三选一。Day 09 不做，Day 10+ 视需求触发。

**触发条件**:用户报"刷新页面后对话没了"。

#### D. chat + stream 双重调用评估

Day 07 留下了技术债：`runEvents` final-answer iter 先 `chat()` 探测拿 usage，再 `stream()` 流式 —— 双重 token 计费。

修法评估：
- 方案 1：让 `chat()` 也支持流式（拆 chat + stream 为同一接口的不同流模式）—— 大改
- 方案 2：容忍双重计费（实测成本评估）—— 小改但持续烧 token
- 方案 3：Anthropic 单独 path（Anthropic 允许在 message_start 拿 usage）—— 局部优化

**触发条件**:token 成本告警。

#### E. Trace 持久化

`apps/api/src/trace-collector.ts` 是 in-memory LRU 32，重启丢失。Day 10+ 评估接 SQLite / 文件 JSONL。

**触发条件**:用户报"昨天的 trace 看不到了"。

#### F. multi-Agent / multi-tenant

`createAgentApp({ agent })` 一次只能配一个 Agent。多 Agent 场景（不同 tool sets / 不同 system prompt）需要 `createAgentApp({ agents: { id: Agent } })` 或 factory 模式。

**触发条件**:有"两个不同 agent 同时跑"的需求。

### 已知技术债（Day 09 累计）

| 债 | 位置 | 影响 | 触发修 |
|---|---|---|---|
| ~~systemPrompt 双写（AgentOptions + caller）~~ | ~~libs/agent/agent.ts~~ | ✅ Day 09 已修 | - |
| chat + stream 双重调用 | `libs/agent/agent.ts` | final-answer iter 双重 token 计费 | Day 10+ 评估 |
| In-memory Trace LRU 32 | `apps/api/src/trace-collector.ts` | 重启丢失 / 32 次以外 evict | Day 10+ 评估持久化 |
| single Agent 单端口绑死 | `apps/api/src/server.ts` | 一次只能配一个 Agent | 多 Agent 场景 |
| 错误事件不区分协议层 vs Runtime 层 | `Agent.runEvents()` | 消费方拿到 error 不知道是 maxIterations 还是 abort | 扩 AgentEvent kind |
| usage 是 prompt + completion 之和 | `apps/api/src/server.ts` | 没有 cached / reasoning tokens 细分 | provider 能力差异大 |
| 没有 SSE 重连状态机 | `apps/api/src/sse-adapter.ts` | 客户端断线重连后从 message_start 重看 | EventSource 自带，不主动实现 |
| **🆕** server 无 messages schema 校验 | `apps/api/src/server.ts` | 非法 role 透传到 provider 层 500 | Day 10+ schema 校验 |
| **🆕** ConversationItem ↔ Message 映射 inline 4 行 | `apps/web/src/App.vue` | 第二个 caller 出现时要抽 | 用 useConversation composable |

### Day 10+ 优先级（建议）

按"用户感知 / 内部复杂度"排：

1. **schema 校验（反例 2）** —— 一次到位的事，影响所有调用方
2. **chat + stream 评估** —— token 成本持续告警时优先
3. **Trace 持久化** —— 用户感知强但可以延后
4. **useConversation 抽象** —— 等第二个 caller 出现
5. **multi-Agent** —— 等真有多 agent 场景
6. **持久化 conversation** —— 等用户报"刷新就没"

---

## 🔗 相关引用

- **ADR**: [0002-run-events-accepts-messages-caller-injects-system-prompt.md](../adr/0002-run-events-accepts-messages-caller-injects-system-prompt.md)
- **前置**: [day08.md](day08.md) §🚀 Day 09 预告
- **Day 08 复盘**: [2026-07-29-day01-08-eight-day-retrospective.md](../review/2026-07-29-day01-08-eight-day-retrospective.md) § Day 09+ 路线 + 技术债
- **Day 06 复盘**: [2026-07-27-day01-07-seven-day-retrospective.md](../review/2026-07-27-day01-07-seven-day-retrospective.md) §6.1-§6.5 不足分析（5 个 ack 来源）
- **Code anchors**:
  - [libs/agent/agent.ts](../../libs/agent/agent.ts) — `runEvents(messages, options?)` 签名 + `workingMessages` 入口深拷贝
  - [apps/api/src/server.ts](../../apps/api/src/server.ts) — POST `/agent` body 解析 + 浅校验 + 拼 messages
  - [apps/web/src/api/agentClient.ts](../../apps/web/src/api/agentClient.ts) — `StreamOptions.messages` + body 含 messages
  - [apps/web/src/App.vue](../../apps/web/src/App.vue) — `resetRunState` + `send` 翻译 `ConversationItem` → `Message[]`
  - [examples/day09/multi_turn_client.ts](../../examples/day09/multi_turn_client.ts) — 真实 LLM 多轮 demo
  - [examples/day09/agent_server.ts](../../examples/day09/agent_server.ts) — 纯 server（浏览器 UI 验证用）
- **测试锚点**:
  - [tests/apps/api/end-to-end.test.ts](../../tests/apps/api/end-to-end.test.ts) — 反例 1（多轮）+ 反例 3（空 messages）
  - [tests/apps/web/multi-turn.test.ts](../../tests/apps/web/multi-turn.test.ts) — front-end body 形状
- **Day 09 commits**:
  - `57337d8` — back-end: runEvents 签名 + systemPrompt 删除（15 文件）
  - `21aac38` — back-end: e2e 反例测试（1 文件 +68）
  - `709deb5` — front-end: scrollback + 多轮 UI（3 文件 +105）
  - `TBD` — docs: ADR 0002 + day09.md + example（待 commit）

---

## ✍️ 写给未来的自己

如果你忘了"为什么 `Agent.runEvents` 接收 messages 而不是 userInput"，看 [ADR 0002 §Context](../adr/0002-run-events-accepts-messages-caller-injects-system-prompt.md#context)。

如果你忘了"5 个 ack 决策怎么消解的"，看本文件 §🤔 转折 1。

如果你忘了"为什么 systemPrompt 被删而不是保留"，看本文件 §💡 决策 2 + ADR 0002 §Decision。

如果你要接着做（Day 10+），看本文件 §🛣 Day 10+ 路线 —— 6 个候选方向已排序。

如果你要测今天的改动，看本文件 §🧪 怎么测 —— 4 层覆盖，从 typecheck 到真实 LLM。

> 9 天不是结束，是 65 天的地基。
