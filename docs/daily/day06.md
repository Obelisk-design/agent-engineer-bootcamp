# Day 06 — CI 闭环 smoke test（FakeChatClient + end-to-end）

> 65 天 AI Agent Engineer Bootcamp · Day 06 / 65
> 主题：把 Day 04-05 的产出锁进 CI —— **不依赖真实 LLM 也能跑通端到端管线**。
> 来源：Day 01-05 复盘路线候选 4（推荐 Day 06-08 穿插）。

---

## 🎯 今日目标

1. ✅ 抽 `FakeChatClient` 到 `tests/libs/agent/shared/` 作为可复用测试 helper
2. ✅ 重构 `tests/libs/agent/agent.test.ts` 用 shared helper（4 个现有测试全过）
3. ✅ 新增 `tests/libs/agent/run-events.test.ts`：覆盖 `Agent.runEvents()` 完整事件序列（含 request/response 阶段三扩的 2 kind）
4. ✅ 新增 `tests/apps/api/end-to-end.test.ts`：覆盖 POST /agent 端到端 SSE 流（happy path）
5. ✅ **CI 环境独立**：`pnpm test` 在 `OPENAI_API_KEY` 缺失或为空时全绿
6. ✅ 守住 YAGNI：不改 libs/ / apps/ 任何生产代码 / 不引入 HTTP mock 库

---

## 📦 今日产出物

```text
agent-engineer-bootcamp/
├── tests/libs/agent/
│   ├── shared/
│   │   └── fake-chat-client.ts              # 🆕 可复用测试 helper（含深拷贝 messages）
│   ├── agent.test.ts                        # ✏️ 重构用 shared helper
│   └── run-events.test.ts                   # 🆕 runEvents 完整事件序列 + messages 累积
└── tests/apps/api/
    └── end-to-end.test.ts                   # 🆕 POST /agent 端到端 SSE 流
```

**libs/ / apps/ / examples/ 零改动**——今日纯测试层工作。

---

## 🔧 关键命令速查

```bash
# === CI 模式 ===
pnpm test                                    # 64 / 64 通过（不依赖 .env）

# === CI 验证（手动）===
OPENAI_API_KEY="" pnpm test                  # 强制空值，验证 CI 独立
env -u OPENAI_API_KEY pnpm test              # 完全 unset（部分 shell）

# === 质量门 ===
pnpm typecheck
pnpm lint
pnpm format:check
```

---

## 📚 知识点

### 1. FakeChatClient 必须深拷贝 messages

**问题**：Agent 内部对 `messages` 数组持续 `push`（assistant 消息、tool result），所有 chat 调用共享**同一个引用**。如果 FakeChatClient 只 push 原引用：

```typescript
this.requests.push(request);  // 浅引用！
// 循环结束后 requests[N].messages 都指向同一个累积后的数组
// 测试断言 requests[0].messages.length === 2 失败（实际 4）
```

**修法**：

```typescript
this.requests.push({
  ...request,
  messages: request.messages.map((m) => ({ ...m })),
});
```

**Why**：测试要断言"第 N 次 chat 调用时 LLM 看到的是什么"——必须快照当时的 messages 状态，不能让 Agent 的后续 push 反向污染历史。

### 2. `Agent.runEvents()` throw vs yield error 的契约

**当前契约**（Day 05 实现）：

```typescript
async *runEvents(userInput: string): AsyncIterable<AgentEvent> {
  // ...
  throw new Error(`Agent loop exceeded ${maxIterations} iterations ...`);
  //          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //  generator throw 时，for-await 冒泡 throw，**不** yield error 事件
}
```

**消费方**：

- `server.ts` 在 SSE 端用 `try/catch` 捕获 throw → emit `error` SSE 帧（apps/api 的 catch 是合理的）
- 直接 `for await` 消费 throw —— 必须自己 `try/catch`

**未来候选**：把 throw 转成 yield error 事件，让消费方永远不需要 catch。但这是行为变更，**今天不动**（YAGNI）—— Day 06+ 真做 PromptBuilder 时一并考虑。

### 3. 共享测试 helper 的位置

**放 `tests/libs/agent/shared/`**（不是 `libs/agent/test-helpers/`）：

- `tests/` 下文件不被 vitest collect（不匹配 `*.test.ts`），不会被生产代码 import
- `shared/` 子目录让"helper"语义明确（vs `agent.test.ts` / `run-events.test.ts`）
- 如果未来别的模块也要共享 helper，可以提升到 `tests/shared/`（Day 06+ 评估）

### 4. CI 闭环 vs 真实 LLM demo 的隔离

**测试层**（CI 能跑）：
- `tests/**/*.test.ts` 全用 `FakeChatClient`
- 不引用 `.env` / `dotenv` / `OPENAI_API_KEY`
- `end-to-end.test.ts` 显式断言 `OPENAI_API_KEY` 缺失或为空都不影响测试

**Demo 层**（本地手动跑）：
- `examples/day05/ex_*.ts` 仍依赖 `OPENAI_API_KEY`
- 不在 vitest 收集范围
- 跟 CI 解耦——不会因为缺 key 而失败

**Why**：CI 是**回归保护**，不能依赖外部服务。真实 LLM demo 是**人工验证**，本地 + 手动。

---

## ❓ 思考题

1. `FakeChatClient.requests` 用 deep-copy 后，**深拷贝成本**是什么？CalculatorTool 的 `args` 是 `{ expression: '1+2' }` 这种浅对象——没问题。但如果工具 args 含复杂嵌套（比如 file system tree），深拷贝会重？是否应该只深拷贝 messages（顶层），不深拷贝 args / tools？
2. `Agent.runEvents()` 当前 throw 不 yield error。`server.ts` 用 try/catch 兜底 emit error 事件——这是**消费方职责**。如果未来多个消费方都要做这个 catch，是不是应该让 runEvents 内部就 yield error？改的成本是行为变更（yield error 后调用方拿到的 kind 多了 error，但消费方也要从 `for await` 拿到 error 而不是 throw），值得吗？
3. 当前 `tests/apps/api/end-to-end.test.ts` 走 happy path，**不走** 400 错误 / tool 未找到 / maxIterations 等 edge case——这些留给 `server.test.ts`。**两个文件职责划分**清晰吗？还是应该合并？
4. CI 闭环的下一步是 Day 07 推**流式 content via `message_delta`**——这又会扩 AgentEvent 到 10 kind。会不会破坏 Day 06 写的"完整事件序列"断言？
5. 如果未来要支持 OpenAI / Anthropic 两家 Provider 的真流式（OpenAI delta vs Anthropic events），CI smoke test 是不是应该再加一组**双 Provider 集成测试**？还是保持单 Provider？

---

## ⚠️ 今日踩坑

### 1. FakeChatClient 没深拷贝 messages 导致累积污染

**症状**：测试断言 `chat.requests[0].messages.length === 2` 失败（实际 4）——`requests[0].messages` 是同一引用，被循环后续 push 污染。

**根因**：Agent 内部维护 `messages: Message[]` 数组持续 push，FakeChatClient 只存了浅引用。

**修法**：`chat()` 时深拷贝 messages 快照（`request.messages.map((m) => ({ ...m }))`）。

**Why**：测试要"还原当时 LLM 看到的 messages"，必须把那一刻定格。引用追踪无法区分"当时 2 条" vs "累积后 4 条"。

### 2. `end-to-end.test.ts` 没设 systemPrompt 导致 messages 长度少 1

**症状**：断言 `secondMessages.length === 4` 失败（实际 3）。第一轮无 systemPrompt 时 messages 起始只有 `[user]`（length 1），第二轮 = `[user, assistant(tool), tool(result)]`（length 3）。

**修法**：测试里加 `systemPrompt: 'You are a helpful assistant.'`，让 messages 起始 = `[system, user]`（length 2），第二轮 = 4。

**Why**：跟 day04 demo 措辞统一（ADR-0001 后所有 demo 都用统一 systemPrompt），测试本身也是 demo 的一种。

### 3. CI environment independence 断言 `toBeUndefined()` 在 .env 存在时失败

**症状**：环境里 `OPENAI_API_KEY` 被 .env 文件 set 成空字符串（或任何值）时，`expect(process.env.OPENAI_API_KEY).toBeUndefined()` 失败。

**根因**：`.env` 文件存在时 shell 会自动 source？或者 vitest 加载 dotenv？不——是 vitest 默认不加载 dotenv，但 `pnpm test` 跑在 `.env` 存在的目录里，某些 shell 行为会让 `OPENAI_API_KEY=""` 仍然 `defined`。

**修法**：改断言为 `expect(process.env.OPENAI_API_KEY ?? '').toBe('')`——接受 undefined 或空字符串，**断言语义**是"测试不依赖真实 key"而不是"环境必须干净"。

**Why**：测试断言要锁住**自己代码的契约**（不读 OPENAI_API_KEY），不是**环境的状态**。CI 跑时 .env 存在与否不应该让这个断言真假翻转。

---

## 📋 验收清单

- [x] `tests/libs/agent/shared/fake-chat-client.ts` 抽取 helper
- [x] `agent.test.ts` 用 shared helper，4 个现有测试全过
- [x] `run-events.test.ts` 7 个测试覆盖 9 kind 序列 + messages 累积
- [x] `end-to-end.test.ts` 4 个测试覆盖 SSE 流 + CI 独立
- [x] `pnpm typecheck` 0 error
- [x] `pnpm lint` 0 error, 0 warning
- [x] `pnpm format:check` 干净
- [x] `pnpm test` 64 / 64 通过
- [x] `OPENAI_API_KEY="" pnpm test` 64 / 64 通过（CI 独立验证）
- [x] libs/ / apps/ / examples/ 零改动
- [x] 未引入 HTTP mock 库 / 未改 ChatClient / 未改 Agent / 未改 Server

---

## 🆕 与 day01-05 复盘的对应

| 复盘路线建议 | 状态 |
|---|---|
| 候选 4（无 LLM smoke test）推荐 Day 06-08 穿插 | ✅ **Day 06 完成** |
| 候选 1（流式 content via `message_delta`） | ⏳ 留给 Day 07 |
| 候选 2（AbortSignal 取消） | ⏳ Day 08+ |
| 候选 3（多轮对话历史） | ⏳ Day 09+ |

Day 06 实际收敛到"防御性优先于攻击性"——先打牢 CI 基座，再扩新能力。

---

## 🌐 Day 06 阶段二（追加）— Agent Runtime 可观测性

> 肥老大追加指令：Day 06 重新定义为"让 Agent Runtime 变得可观测"。CI smoke test 是顺手活，可观测性是真正目标。

### 设计回答（5 个问题）

| 问题 | 答 |
|---|---|
| Q1: 是否加 Trace？放哪层？ | **应该加**，放 **apps/api 层**（候选 B）—— Runtime 零感知 |
| Q2: Trace 与 AgentEvent 关系？ | **`events[]` 原始事件 + `meta: Record<string, unknown>`**（设计 C）—— 不重组结构 |
| Q3: Trace 如何收集？ | **消费方包一层**（方案 C）—— `for await (ev of agent.runEvents())` 时 `collector.collect(ev)` |
| Q4: Token/Latency/Cost/Permission/Memory/Retry 扩展？ | Token/Latency/Retry **应进 Trace**（meta）；Permission/Memory **不进**（独立子系统）；预先不设计具体形状 |
| Q5: YAGNI 最小集？ | in-memory collector（LRU 32）+ `GET /traces` + `GET /traces/:runId`，**≤ 100 行** |

### 核心实现（Day 06 落地）

```
apps/api/src/trace-collector.ts    # AgentTrace + TraceCollector (LRU 32)
apps/api/src/server.ts             # for-await 双路：collector.collect + stream.writeSSE
                                   # 3 路由：GET /, POST /agent, GET /traces/:runId, GET /traces
libs/agent/agent.ts                # yield request 时 deep-copy messages（snapshot 语义）
tests/apps/api/trace-collector.test.ts  # 5 端到端测试
```

### Runtime 关键不变量

1. **libs/agent 不知道 TraceCollector 存在** —— Agent.runEvents 只 yield events
2. **TraceCollector 单一职责**：collect / store，**不做** Token/Latency/Cost 派生
3. **events[] 是事实快照**（deep-copy 防止累积污染）
4. **meta 是 Record<string, unknown>** —— 预留扩展点，不预先定义

### 踩坑：yield request 必须 deep-copy

**症状**：trace.events 里两个 request 事件的 messages 引用同一累积数组，测试断言 `requests[0].messages.length === 1` 失败（实际 3）。

**根因**：`yield { kind: 'request', messages }` 是浅引用 —— Agent 内部持续 push，**所有 yield 出去的 request 共享同一引用**。

**修法**：`yield { kind: 'request', messages: messages.map((m) => ({ ...m })) }` —— snapshot 语义。

**Why**：events 是"事实快照"——消费方（TraceCollector / SSE 消费 / Debug UI）应该看到**当时**的 messages，不能看到后续累积污染。

### 验证

- ✅ 5 个端到端测试覆盖：
  - GET /traces/:runId 拿完整 events + 第二轮 messages 累积
  - GET /traces 按 startedAt 倒序
  - GET /traces/:runId 不存在 → 404
  - loop throw 时 error 事件进 trace
  - 注入 collector 跨 app 共享
- ✅ libs/agent 不感知 TraceCollector
- ✅ meta 字段是空对象（Day 07+ 才会填充 Token/Latency）

### Day 06 完整产出

| Commit | 内容 |
|---|---|
| `3ee7ebd` | refactor(tests): shared FakeChatClient helper |
| `9be48b4` | test: runEvents + end-to-end smoke |
| `70bd23b` | docs(day06): CI smoke test 笔记 |
| `a5fed60` | **feat(apps/api): trace collector + snapshot messages** |

（commit 顺序对应今日工作流：CI smoke → 可观测性）

---

## 🚀 Day 07 预告

**推荐**：候选 1 —— 流式 content via `message_delta`

- Agent 内部 `chat()` → `stream()`，让 `message_end` 之前 yield 多个 `message_delta`
- 前端打字机效果
- **风险**：AgentEvent closed set 扩到 10 kind（继续走修改五问 + ADR 路径）
- **Day 06 留下的契约**：error 事件处理（throw vs yield）要在 Day 07 一起决定
- **meta 字段**：Day 07 加 Token Usage 时直接往 meta 里塞 —— 不破坏 schema

---

## 🔗 相关引用

- 全局约定：[CLAUDE.md](../../CLAUDE.md)
- 架构决策：[docs/adr/0001-tool-capability-must-not-embed-in-system-prompt.md](../../adr/0001-tool-capability-must-not-embed-in-system-prompt.md)
- 复盘路线：[docs/review/2026-07-22-day01-05-architecture-review.md](../../review/2026-07-22-day01-05-architecture-review.md)
- Day 05 笔记：[docs/daily/day05.md](day05.md)
- 代码锚点：
  - [libs/agent/agent.ts](../../libs/agent/agent.ts) — `runEvents()` 实现
  - [libs/agent/event.ts](../../libs/agent/event.ts) — AgentEvent 9 kind
  - [apps/api/src/server.ts](../../apps/api/src/server.ts) — POST /agent + 错误事件 emit
  - [tests/libs/agent/shared/fake-chat-client.ts](../../tests/libs/agent/shared/fake-chat-client.ts) — 今日 helper