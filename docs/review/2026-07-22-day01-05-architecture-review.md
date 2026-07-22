# Day 01-05 深度复盘 — 2026-07-22

> 65 天 AI Agent 工程师训练营 · 第一个 5 天深度复盘
> 目的：每 5 天收敛一次**学到了什么 + 当前架构 + 架构偏移分析**，避免 65 天跑下来架构偏移无人察觉
> 节奏：每 5 天一份 review，落在 `docs/review/YYYY-MM-DD-dayXX-YY-architecture-review.md`

---

## 📊 一览

| 维度 | 状态 |
|---|---|
| 学习天数 | 5 / 65 |
| 累计 commit | 22（day01-04 已落库，day05 待提交） |
| 总测试 | **49 / 49 通过** |
| 引入新依赖 | 3（`hono`, `@hono/node-server`, 间接用 `@anthropic-ai/sdk`） |
| 触发的 YAGNI 边界 | streaming tool calling / AbortSignal / 假流式 / 持久化 / RAG / Vue |
| 守住的核心原则 | ChatClient 抽象 / 判别联合 / 依赖单向 / provider 无感 |
| 临时 API 残留 | 0（`onIteration` day04 加 day05 已删） |

---

## 🎓 学习收获（5 天浓缩）

### Day 01 — 工程脚手架

**学到了什么**：

- pnpm monorepo + TS strict + NodeNext + ES2023 的最小可演进配置
- "边写边跑"工作流：nodemon + 真实 LLM smoke test（不是 mock）
- 65 天 monorepo 起点：**`libs/` 复用层 + `apps/` 业务层**的依赖方向

**关键决策**：CI 矩阵（Node 22/24）+ Husky pre-commit + commitlint 强制 Conventional Commits。

### Day 02 — ChatClient 接口

**学到了什么**：

- **抽象契约设计**：`chat(messages): Promise<string>` + `setModel()`
- 抽象 ≠ 给 SDK 换名字——调用方应能"换一个 provider 零改动"
- Anthropic 延展：`toApiMessages()` 翻译层（System 提到顶层、role 翻译）

**关键决策**：`Message` 用 type-only 枚举 + `readonly` 字段，今天不升级判别联合。

### Day 03 — Streaming

**学到了什么**：

- `stream(): AsyncIterable<ChatChunk>` —— **add 而非 replace**（`chat()` 契约不变）
- OpenAI vs Anthropic 流式 API 形态差异巨大（delta vs SDK events）
- provider 差异在 SDK 适配层消化，调用方只拿 `ChatChunk.content`

**关键决策**：抽 `toApiMessages()` helper 消除 chat/stream 协议适配复制（day03 review 抓出）。

### Day 04 — Agent Tool Calling

**学到了什么**：

- `ChatRequest` / `ChatResponse` 统一：`tools` 走 optional 字段，**普通聊天和 tool 调用是同一种能力的不同输入**
- `ToolDefinition` 上移到 `libs/tools/`（消除 `libs/llm/tool-call.ts` 与 `libs/tools/tool-registry.ts` 双事实源）
- **删除 `chatWithTools`**：加 if 兜底反模式——同一种能力不要两个 API
- Agent loop: `chat → tool_call → execute → chat`
- `CalculatorTool` 自写 tokenizer + shunting-yard + RPN（防 RCE：拒绝 `eval` / `new Function`）

**关键决策**：`Message` 用 optional `toolCalls` / `toolCallId`（不升级判别联合），明天再升级。

### Day 05 — AgentEvent + SSE + Web UI + Timeline 详细化（今日，三阶段交付）

**学到了什么**：

- **判别联合 vs 平铺 optional**（day04 反思题 #5 的答案）：`AgentEvent.kind` 让消费方 `switch` 不漏 case
- **`runEvents()` = `run()` 的真子集**：不是并列实现（消除重复）——`run()` 内部 `for-await runEvents()` 收尾
- **删除 `onIteration` 回调**：与 `runEvents` 是同一信息的两个出口，**临时 API 被替代品取代即删**
- apps/api 落地：`createAgentApp` + `sse-adapter`（framework-agnostic）+ Agent Console Web UI
- Claude Code 风格双栏 UI：**左 Conversation + 右 Execution Timeline，同一事件源分发**
- 阶段三 `request` / `response` 事件把"调用过程"全可视化——肥老大指令触发，**调用前 messages 累积 / 调用后 ChatResponse** 都暴露

**关键决策**：

- sse-adapter 输出 `{ event, data }` 形态不依赖 hono，server.ts 才耦合 hono——未来换 Fastify/Express 不动 adapter
- `request` / `response` 复用了现有 `Message` / `ToolCallData` 类型，不引入新领域概念
- Web UI 折叠区用原生 `<details><summary>`，**零依赖**（区别于 React Collapsible 等）

**三阶段交付路径**：

1. **阶段一**：libs/agent 改造 + apps/api SSE（5 commit 提交了复盘）
2. **阶段二**：Web UI 双栏（肥老大同日追加） + Timeline 卡片化样式调整（"一片黑"反馈）
3. **阶段三**：Timeline 详细化（"整个调用过程都显示出来"反馈）—— AgentEvent 扩 2 kind + UI 折叠 JSON 详情

---

## 🏗 当前架构全景

### 文件树（核心模块）

```
agent-engineer-bootcamp/
├── libs/                        # 复用层（无 IO）
│   ├── agent/                   # Agent Runtime（chat loop）
│   │   ├── event.ts             # 🆕 AgentEvent 判别联合（7 kind）
│   │   ├── agent.ts             # run() + runEvents()（同一份 loop）
│   │   ├── types.ts             # 纯 re-export
│   │   └── index.ts             # 公共 API
│   ├── llm/                     # ChatClient 抽象
│   │   ├── chat-client.ts       # ChatClient 接口 + ChatRequest/Response/Chunk
│   │   ├── openai-chat-client.ts
│   │   ├── anthropic-chat-client.ts
│   │   └── message.ts           # Message 内部模型
│   └── tools/                   # Tool 抽象
│       ├── tool.ts              # ToolDefinition 事实源
│       ├── tool-registry.ts
│       └── calculator-tool.ts   # 自写 parser，防 RCE
├── apps/                        # 业务编排层
│   ├── index.ts                 # 公共导出
│   └── api/                     # 🆕 首个 HTTP 出口
│       ├── README.md
│       └── src/
│           ├── server.ts        # createAgentApp (Hono factory)
│           ├── sse-adapter.ts   # framework-agnostic
│           ├── web-loader.ts
│           └── web/index.html   # Agent Console（单 HTML）
├── examples/                    # 端到端 demo
├── tests/                       # 单元 + 集成测试
└── docs/
    ├── daily/                   # 每日学习笔记
    ├── superpowers/             # 设计 spec + 实施计划
    └── review/                  # 🆕 每 5 天架构 review
```

### 关键契约（"什么在哪"）

| 契约 | 位置 | 形态 |
|---|---|---|
| `ChatClient` | [libs/llm/chat-client.ts](../libs/llm/chat-client.ts) | `chat / stream / setModel` |
| `Message` | [libs/llm/message.ts](../libs/llm/message.ts) | type-only 枚举 + readonly |
| `ToolDefinition` | [libs/tools/tool.ts](../libs/tools/tool.ts) | 事实源 |
| `Agent` | [libs/agent/agent.ts](../libs/agent/agent.ts) | `run() / runEvents()` |
| `AgentEvent` | [libs/agent/event.ts](../libs/agent/event.ts) | 判别联合 7 kind |
| HTTP | [apps/api/src/server.ts](../apps/api/src/server.ts) | `POST /agent` + `GET /` |
| SSE | [apps/api/src/sse-adapter.ts](../apps/api/src/sse-adapter.ts) | framework-agnostic |

### 依赖方向（严格单向）

```
apps/   →  libs/agent/  →  libs/{llm, tools}/
   ↓           ↓               ↓
   └── apps/api/server.ts ←────┘ (transport)
```

**核心约束**：`libs/` 永远不依赖 `apps/`、`libs/agent/` 不依赖 `libs/llm/` 运行时（仅 `import type`）。

---

## ⚖️ 架构偏移分析

### 守住的部分（无偏移）

1. **ChatClient 抽象始终是 provider 无感的边界**（day02 决定，day03 day04 day05 都未动摇）
2. **`libs/` 永远是底座，`apps/` 永远是入口**（依赖方向单向）
3. **内部 `Message` 模型 vs SDK 消息类型严格翻译**（day03 抽 `toApiMessages`，day04 加 tool 消息映射）
4. **YAGNI 边界严格守住**：stream tool calling / AbortSignal / 持久化 / 假流式 / 多轮历史 / Markdown 渲染 / Vite+React 全部延后
5. **质量门稳定**：5 天来 typecheck / lint / format:check / test 全绿

### 漂移点（明确记录）

#### 1. `onIteration` 出现又消失（day04 加 day05 删）

- **现象**：day04 验收清单打勾时 `onIteration` 还在，day05 删
- **原因**：与 `runEvents` 重复，是"加 if 兜住"反模式
- **教训**：临时妥协接口一旦被替代品（更通用的）取代就立刻删，**不要保留为兼容层**

#### 2. `web/` 目录的"零依赖单 HTML"（day05 决定）

- **现象**：`apps/api/src/web/index.html` 内联 CSS + JS 530 行
- **风险点**：未来要加 Vue/React / Markdown 渲染时整个 web/ 重写
- **现状**：可控（YAGNI 边界明确），未来真要换再 refactor
- **缓解**：Web UI 是**单端点单布局**，复杂度天花板低

#### 3. `apps/api/` 引入 2 个新依赖（`hono` + `@hono/node-server`）（day05 决定）

- **风险**：新增 2 个 transitive deps
- **缓解**：`sse-adapter` 是 framework-agnostic，未来换 Fastify/Express/原 http 不动 adapter

#### 4. Day 04 demo 受 day 05 改造影响（demo 与底层 API 共变）

- **现象**：day05 删 `onIteration` → day04 两个 demo 改写
- **教训**：demo 是底层的真实用户，**底座 API 变了 demo 必须同步**，不能留着等用户自己适配
- **结果**：demo 改用 `runEvents()` 后更详细（之前 onIteration 看不到 tool_call / tool_result 细节）

### 风险点（明天决策前必看）

1. **事件类型扩展的纪律性**：`AgentEvent` 当前 **9 kind**（Day 05 阶段一 7 + 阶段三 +2）。这次扩是**肥老大指令触发**，有意识扩展
   - **未来每加一种都要走"修改五问"**，不留"未来可能用"的占位
   - 经验：扩 2 kind 后，**测试 + 文档 + 复盘要同步更新**（不复盘就成"过时承诺"）
2. **web/ 单文件 vs 框架**：HTML 内联 530+ 行（含三阶段样式调整），CSS 280+ 行。再加 200 行就要拆——**今天明确不拆**
   - 阶段三折叠区用 `<details><summary>` 零依赖——**继续守住"不引前端框架"**
3. **真实 LLM 依赖 demo**：`examples/day05/ex_001/ex_002` 都依赖 `OPENAI_API_KEY`，CI 不能直接跑
   - **未来要做"无 LLM 依赖的 smoke test"**（用 FakeChatClient + app.fetch）
4. **`apps/api/` 只有一个 endpoint + 一个 GET/**：单 Agent 单端口绑死
   - 未来要多 Agent → 走 `createAgentApp({ agents: Record<string, Agent> })` 还是把"路由→agent"放调用方？**留给 Day 10+**
5. **三阶段同日交付的复盘节奏**：本次 Day 05 一个工作日产生了 7 commit（5 + 2），复盘文档需要"持续同步"
   - 节奏不变：每 5 天 review；**额外约定**——每次"同日多阶段交付"后必须更新本复盘

---

## 🛣 Day 06-10 路线建议

### 候选

1. **流式 content via `message_delta`**（**部分完成 ✅**，剩 stream content 未做）
   - ✅ **已做**：肥老大指令触发，Day 05 阶段三把 `request` / `response` 加进 AgentEvent，UI 用 `<details>` 折叠 JSON
     —— 这是"调用过程可视化"的最小集，**比 message_delta 更基本**
   - ⏳ **未做**：把 `Agent.runEvents()` 内部 `chat()` 换成 `stream()`，让 `message_end` 之前 yield 多个 `message_delta`
   - 风险：tool_calls 在流式下的顺序处理（OpenAI / Anthropic 行为差异）

2. **AbortSignal 取消**（次推荐 Day 07）
   - 给 `runEvents` / `chat` / `stream` 加 `signal` 取消语义
   - 前端可以 stop 按钮
   - 纯基础设施改动，不涉及新能力

3. **多轮对话历史**（Day 08+ 再考虑）
   - 每次 send 不清空 conversation
   - 风险：复杂度跳变（持久化、scrollback、消息 ID、AbortSignal 配合）

4. **无 LLM 依赖的 smoke test**（**推荐 Day 06-08 之间穿插**）
   - FakeChatClient + app.fetch 的端到端测试
   - CI 跑通，与真实 LLM demo 解耦

### 我的判断

**Day 06 优先做候选 4（无 LLM smoke test）**——把 CI 闭环，给 day 06+ 提供回归保护。`request` / `response` 阶段三扩了 2 kind，**正需要 FakeChatClient 测试覆盖**（现实 LLM 太贵）。
**Day 07 选 2（AbortSignal）**——基础设施补齐，给未来流式 content 加 stop 能力。
**候选 1 剩下的 stream content 推到 Day 08+**——配合 AbortSignal 一起做。
**3（多轮历史）放 Day 09+**——复杂度高，需要先有 AbortSignal 和会话隔离设计。

---

## 📐 修改五问（本次 review 任务）

### 1. 根因

5 天累积，没有 review 复盘节奏；担心架构偏移——尤其 `onIteration` 这类临时 API 残留无人察觉会扩散。

### 2. 之前代码为什么这样

每天按 YAGNI 增量推进，每个 day 是独立闭环（day spec → 实现 → 验收清单 → 收尾）。
但 day04 day05 改的东西**有跨天耦合**（`onIteration` → `runEvents`），单 day 视角看不见这种漂移。

### 3. 其他地方有同类问题吗

- 暂无同款"临时接口被替代"问题
- 风险点：`web/` 单文件 → 未来要 framework 化时
- **每天 commit 前必填"修改五问"**——已部分拦截同类问题

### 4. 最合理架构

- 每 5 天一次"架构 review"（**肥老大拍板的节奏**）
- 复盘文档固定位置：`docs/review/YYYY-MM-DD-dayXX-YY-architecture-review.md`
- 复盘必答 3 问：学到了什么 / 当前架构 / 偏移分析
- **本次 review 是第一次**——建立节奏

### 5. 今天重新设计

100% 跟新节奏一致，没改设计。仅增加 `docs/review/` 目录约定。

---

## 💾 技术债变化（5 天累计）

```
+ 新增 docs/review/ 目录（架构 review 节奏）         —— 维护成本 低，3 年存活率 高
+ 新增 apps/api/ 包（Hono + SSE transport）          —— 维护成本 中，3 年存活率 高
+ 新增 AgentEvent 判别联合（libs/agent/event.ts）    —— 维护成本 低，3 年存活率 高
+ 新增 apps/api/web/ 单 HTML UI                      —— 维护成本 中，3 年存活率 中
+ 新增 AgentEvent.request / .response 2 kind         —— 维护成本 低，3 年存活率 高
+ 新增 Web UI 折叠 JSON 详情（<details> 零依赖）     —— 维护成本 低，3 年存活率 中
- 删除 Agent.onIteration 回调（合并到 runEvents）    —— 消除临时 API
- 删除 libs/llm/tool-call.ts（合并到 chat-client.ts）—— 消除双事实源
净增：+6 模块 / -2 临时 API
反驳记录：
  - 5 天净增 6 模块偏高（阶段三同日内多扩 2 kind 是用户指令触发）
  - 删除 2 个临时 API 证明"临时 API 即删"纪律有效
  - 单 HTML UI YAGNI 边界明确，未来扩规模时再 refactor
  - 阶段三"request/response"扩 kind 是有意为之，不是悄悄扩张
```

---

## 🚨 给未来 day 的提醒

- **每加一种 AgentEvent 都要走修改五问**——closed set 不可悄悄扩张
- **每加一个真实 LLM demo 都要配 FakeChatClient smoke test**——CI 不能依赖 LLM
- **每改公共 API 都要同步更新 day demo**——不留断链
- **每 5 天一次复盘**——`docs/review/` 目录
- **同日多阶段交付后必须更新复盘**——本次 Day 05 三阶段交付，复盘在第一阶段后写过，后续两阶段 commit 都更新了复盘，**纪律已立**

---

## 🔗 相关引用

- 每日笔记：[day01](daily/day01.md) / [day02](daily/day02.md) / [day03](daily/day03.md) / [day04](daily/day04.md) / [day05](daily/day05.md)
- 全局约定：[CLAUDE.md](../../CLAUDE.md)
- Day 04-05 关键 commit：`3ff54dd` / `9593b72` / `09d5589`（AgentEvent 协议指令）
- Day 05 三阶段 7 commit：
  - 阶段一 SSE：`3e12fd2` / `e27dd9d` / `7310645` / `2f596a7` / `e75544a`
  - 阶段三 Timeline 详细化：`a906335` / `1cf1b2a`
- 总 27 个 commit：见 `git log --oneline`
