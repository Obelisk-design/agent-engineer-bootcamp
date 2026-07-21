# Day 04 — Agent Tool Calling 基础能力

> 65 天 AI Agent 工程师训练营 · Day 04 / 65
> 主题：在 ChatClient 之上建 Agent Loop，让 LLM 能调用工具并收敛到最终答案。

---

## 🎯 今日目标

1. ✅ 统一 `ToolDefinition` 到 `libs/tools`（消除 `libs/llm/tool-call.ts` 与 `libs/tools/tool-registry.ts` 双头定义）
2. ✅ 统一 ChatClient 接口：`chat(ChatRequest)` / `stream(ChatRequest)`，消除 `chatWithTools` 冗余方法
3. ✅ 修复 OpenAI / Anthropic `chat()` / `stream()` 中 `Message[]` 的 `as unknown` 硬 cast，加入 tool 消息正确映射
4. ✅ 实现最小 `Agent` 类：chat → tool_call → execute → chat 循环，默认 `maxIterations=5`
5. ✅ 落地 `CalculatorTool`：自写 tokenizer + shunting-yard + RPN，不依赖 eval/new Function
6. ✅ 跑通 OpenAI 兼容协议 + Anthropic gateway 的真实 LLM tool calling demo
7. ✅ 补齐 `libs/` 测试（calculator / registry / agent mock）
8. ✅ 守住 YAGNI：不做并行 tool、stream tool calling、AbortSignal、runtime schema validation

---

## 📦 今日产出物

```text
agent-engineer-bootcamp/
├── libs/tools/
│   ├── tool.ts                                 # ✏️ ToolDefinition 事实源
│   ├── tool-registry.ts                        # ✏️ 移除本地 ToolDefinition，改从 tool.ts 导入
│   ├── calculator-tool.ts                      # 🆕（今日已存在）
│   └── index.ts                                # ✏️ 改 ToolDefinition export 源
├── libs/llm/
│   ├── chat-client.ts                          # 🆕 ChatRequest/ChatResponse/ChatChunk + ChatClient 接口
│   ├── tool-call.ts                            # ❌ 删除（类型合并到 chat-client.ts）
│   ├── openai-chat-client.ts                   # ✏️ 实现统一 chat/stream 接口 + toOpenAIMessages
│   ├── anthropic-chat-client.ts                # ✏️ 实现统一 chat/stream 接口 + toApiMessages
│   ├── message.ts                              # ✏️ ToolCallData import 从 chat-client 导入
│   └── index.ts                                # ✏️ 统一导出新类型
├── libs/agent/
│   ├── agent.ts                                # 🆕 Agent 类 + AgentOptions（用 chat({messages, tools})）
│   ├── types.ts                                # 🆕 类型 re-export
│   └── index.ts                                # 🆕 公共 API 导出
├── examples/day04/
│   ├── ex_001_calculator_agent_openai.ts       # 🆕 OpenAI 兼容协议 demo
│   └── ex_002_calculator_agent_anthropic.ts    # 🆕 Anthropic gateway demo
├── examples/day02-03/                          # ✏️ 更新为新接口（chat({messages})/stream({messages})）
├── tests/libs/
│   ├── tools/calculator-tool.test.ts           # 🆕 evaluate + calculatorTool 单测
│   ├── tools/tool-registry.test.ts             # 🆕 registry 行为单测
│   └── agent/agent.test.ts                     # 🆕 Agent loop mock 测试
└── docs/daily/day04.md                         # 🆕 本学习笔记
```

---

## 🔧 关键命令速查

```bash
# === Day 04 真实 LLM demo ===
pnpm exec tsx examples/day04/ex_001_calculator_agent_openai.ts
pnpm exec tsx examples/day04/ex_002_calculator_agent_anthropic.ts

# === 质量门（本地 commit 前必跑） ===
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

---

## 📚 知识点

### 1. ChatClient 接口的统一形态

**Day 04 前的设计**：

```typescript
interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;
  chatWithTools(messages: Message[], tools: ToolDefinition[]): Promise<ChatResponse>;
}
```

问题：
- 三个方法，普通聊天和工具调用走不同入口
- `chat()` 返回 `string`，`chatWithTools()` 返回结构化 `ChatResponse`，调用方要分两套消费逻辑

**Day 04 重构后的设计**：

```typescript
interface ChatClient {
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatChunk>;
  setModel(model: string): void;
}

interface ChatRequest {
  readonly messages: Message[];
  readonly tools?: ReadonlyArray<ToolDefinition>;
}

interface ChatResponse {
  readonly content?: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
}

interface ChatChunk {
  readonly content?: string;
}
```

**关键收益**：
- 普通聊天：`await client.chat({ messages: [...] })` → `{ content: '...' }`
- 工具调用：`await client.chat({ messages, tools: [...] })` → `{ toolCalls: [...] }`
- 统一返回 `ChatResponse`，调用方不再分两套消费逻辑
- `setModel` 不动，渐进式增强

### 2. `ToolDefinition` 应该归哪一层？

设计 spec 原想把 `ToolDefinition` 放在 `libs/llm/tool-call.ts`，理由是避免 `libs/llm` 依赖 `libs/agent`。但实际代码里 `libs/llm/tool-call.ts` 已经通过 `import type { ToolParameters } from '../tools/tool.js'` 依赖了 `libs/tools`。

今日把它归到 `libs/tools/tool.ts`：

- 它是 tool 描述契约，不是 LLM 响应契约。
- `ToolRegistry.toProviderTools()` 返回 `ToolDefinition`，源头放在 tool 层更自然。
- 消除了 `libs/llm/tool-call.ts` 与 `libs/tools/tool-registry.ts` 双头定义。

`libs/llm/index.ts` 仍 re-export `ToolDefinition`，调用方 import 路径不变。

### 3. `Message` 到 SDK 消息格式：不能靠 `as unknown`

Day 02/03 的 `chat()` / `stream()` 都用 `messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[]`。Day 04 加了 `toolCalls` / `toolCallId` 字段后，这个 cast 会丢失工具调用语义。

**OpenAI 映射**（`toOpenAIMessages`）：

- `system` / `user` → 直接映射
- `assistant` + `toolCalls` → `role: 'assistant' + tool_calls`
- `tool` + `toolCallId` → `role: 'tool' + tool_call_id`

**Anthropic 映射**（`toApiMessages`）：

- `system` → 顶层 `system` 字段（保留 Day 03 行为）
- `user` → content blocks `[{type:'text', text}]`
- `assistant` + `toolCalls` → content blocks `[text, {type:'tool_use', id, name, input}, ...]`
- `tool` → Anthropic 把 tool 结果放在 `user` 消息的 `{type:'tool_result', tool_use_id, content}` block 里

> **教学点**：抽象层不是给 SDK 类型换名字，而是把内部 `Message` 模型翻译成每个 provider 能理解的形态。`as unknown` 在字段少时能用，字段一多就会撒谎。

### 4. Agent Loop 的边界保护

`Agent.run()` 今日实现三个边界：

1. **`maxIterations` 默认 5**：防止 LLM 无限递归调 tool。
2. **未知 tool 返回错误字符串**：不 throw，让 LLM 下轮纠正。
3. **tool 执行异常 catch**：把错误信息 JSON 化后回传，不中断 loop。

顺序执行 tool（非并行）是今日 YAGNI 决策。OpenAI 与 Anthropic 都支持一次返回多个 tool_calls，但 Day 04 的 demo 与测试先保证单条路径正确。

**`onIteration` 回调**：

```typescript
const agent = new Agent({
  chat,
  tools,
  onIteration: (iteration, response) => {
    // response.content !== undefined ? 'content' : 'tool_calls'
    console.log(`iteration=${iteration} response=${response.content !== undefined ? 'content' : 'tool_calls'}`);
  },
});
```

### 5. `CalculatorTool` 的「安全求值」纪律

用 tokenizer + shunting-yard + RPN 替代 `eval` / `new Function`：

- 只接受 `0-9`、`.`、`+ - * /`、`(`、`)`、空白。
- 其它字符直接 throw。
- 除零、括号不匹配、操作数不足都会报错。

> **教学点**：工具执行的是「外部输入的表达式」。允许任意代码执行 = 把 LLM 的输出直接变成 RCE 入口。自写 parser 是 Day 04 的 security baseline。

### 6. provider 差异在哪里被消化？

| 差异 | OpenAI | Anthropic | 封装位置 |
|------|--------|-----------|----------|
| 工具声明 | `type: 'function' + function` | `name + description + input_schema` | `chat` 内部 map |
| assistant tool 调用 | `message.tool_calls[]` | `content[].type==='tool_use'` | `chat` 解析 |
| tool 结果消息 | `role: 'tool' + tool_call_id` | `role: 'user' + tool_result block` | `toApiMessages` / `toOpenAIMessages` |
| system 消息 | 在 `messages` 数组里 | 顶层 `system` 字段 | `toApiMessages` 提取 |

调用方（Agent）完全无感知 —— 它只消费 `ChatResponse` 和 `Message`。

---

## ❓ 思考题

1. `ToolDefinition` 放在 `libs/tools` 后，`libs/llm` 是否还依赖 `libs/tools` 的**运行时**？当前依赖是 `import type` only。如果未来 `libs/llm` 需要 `Tool.execute`，层边界会怎样变化？
2. `Agent` 的 `onIteration` 回调是设计妥协还是必要接口？如果不加，demo 怎么才能展示 loop 次数而不破坏 Agent 封装？
3. `Message` 用 optional `toolCalls` / `toolCallId` 而不是判别联合，今天合理。当什么条件满足时，应该升级为 `type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage`？
4. `stream()` 今天只支持纯文本流（`ChatChunk.content`）。如果历史消息里包含 tool 调用，stream 时怎么把 tool 结果也算作上下文？这是否需要 `streamWithTools`？
5. `ChatResponse` 用 optional `content` / `toolCalls`（非判别联合）后，调用方要写 `response.content !== undefined` 区分两种状态。这种"二选一"的语义，用判别联合（`{kind: 'content'}` vs `{kind: 'tool_calls'}`）表达是否更安全？
6. `Agent` 的 tool 执行是顺序的。并行执行时，结果消息顺序会怎样影响 LLM 的下一轮决策？OpenAI 与 Anthropic 对并行 tool 结果的支持是否一致？
7. `calculatorTool` 的 `args` 类型是 `{ expression: string }`，但 execute 参数是 `unknown`。这种「运行时信任」在什么 day 应该被 runtime schema validation 替代？引入 zod/ajv 的触发条件是什么？

---

## ⚠️ 今日踩坑

### 1. `ToolDefinition` 双头定义被 lint 抓出

**症状**：改完 `libs/llm/tool-call.ts` 后，`pnpm lint` 报 `ToolDefinition is defined but never used`。

**根因**：`tool-call.ts` 仍 import 了 `ToolDefinition` 但不再定义/使用它。

**修法**：直接删掉 import；`ToolDefinition` 改由 `libs/llm/index.ts` 从 `../tools/tool.js` re-export。

**Why**：类型 import 也要诚实反映「谁拥有这个类型」。`import type` 不用于运行时，但 lint 仍会计入 unused vars。

### 2. Anthropic tool 结果消息 role 不是 `tool`，而是 `user`

**症状**：初版把 `tool` role 映射为 Anthropic `{role: 'tool', ...}`，typecheck 报错 `tool` 不是合法 role。

**根因**：Anthropic Messages API 没有 `tool` role。tool 结果必须放在 `user` 消息的 `tool_result` content block 里。

**修法**：`tool` 角色统一映射为 `user` + `tool_result` block。

**Why**：不能假设 OpenAI 的 role 命名对所有 provider 通用。`Message` 的 `'tool'` role 是内部抽象， provider 映射负责翻译。

### 3. Agent 测试 `maxIterations` 用例误解了循环次数

**症状**：第一次测试只给 1 个 `tool_calls` mock 响应，期望抛 `exceeded 2 iterations`，但实际抛的是 `FakeChatClient: no more mocked responses`。

**根因**：`maxIterations=2` 意味着 `chat` 会被调用 2 次。第二次调用没有 mock 响应，FakeChatClient 先抛错。

**修法**：提供 2 个 `tool_calls` 响应，让 loop 完整跑完 2 次后再触发 `maxIterations` 错误。

**Why**：测试必须理解被测代码的调用边界，而不是只测"期望异常"。

### 4. ChatClient 接口三方法变两方法

**症状**：初版设计 `chat()` / `stream()` / `chatWithTools()` 三个方法，普通聊天和工具调用走不同入口。调用方写代码要分两套消费逻辑（`reply: string` vs `response: ChatResponse`）。

**根因**：把"普通聊天"和"工具调用"当成两种能力，设计成两个 API。但实际它们是同一种能力的不同输入（带不带 tools）。

**修法**：统一为 `chat(ChatRequest)` / `stream(ChatRequest)`，通过 `ChatRequest.tools` 是否传入区分。返回统一 `ChatResponse`，通过 `content` / `toolCalls` optional 字段区分。

**Why**：扩展性优于穷举。`ChatRequest` 加字段比加方法便宜（不破坏现有调用方）。

---

## 📋 验收清单

- [x] `ToolDefinition` 单一事实源在 `libs/tools/tool.ts`
- [x] `libs/llm/tool-call.ts` 已删除（类型合并到 chat-client.ts）
- [x] ChatClient 接口统一为 `chat(ChatRequest)` / `stream(ChatRequest)`，无 `chatWithTools` 冗余方法
- [x] `ChatRequest` 包含 `messages` + 可选 `tools`
- [x] `ChatResponse` 包含可选 `content` / `toolCalls`
- [x] `ChatChunk` 包含可选 `content`
- [x] OpenAI `chat()` / `stream()` 共享 `toOpenAIMessages`，无 `as unknown` 硬 cast
- [x] Anthropic `chat()` / `stream()` 共享 `toApiMessages`，无 `as unknown` 硬 cast
- [x] `Message.toolCalls` / `Message.toolCallId` 正确映射到 OpenAI / Anthropic SDK 消息格式
- [x] `Agent` 类实现：system prompt、loop、maxIterations、tool 执行错误回传
- [x] `Agent` 内部用 `chat({ messages, tools })`，不直接调 `chatWithTools`
- [x] `examples/day04/ex_001_calculator_agent_openai.ts` 真跑通（iteration=1 tool_calls，iteration=2 content）
- [x] `examples/day04/ex_002_calculator_agent_anthropic.ts` 真跑通（iteration=1 tool_calls，iteration=2 content）
- [x] Day 02 / Day 03 demos 已更新为新接口
- [x] `CalculatorTool` 自写 parser，无 `eval`/`new Function`
- [x] `tests/libs/tools/calculator-tool.test.ts` 全绿
- [x] `tests/libs/tools/tool-registry.test.ts` 全绿
- [x] `tests/libs/agent/agent.test.ts` 全绿（FakeChatClient 实现新接口）
- [x] `pnpm typecheck` 0 error
- [x] `pnpm lint` 0 error
- [x] `pnpm format:check` 全绿
- [x] `pnpm test` 20 / 20 passed
- [x] 未引入并行 tool、streaming tool calling、AbortSignal、runtime schema validation、apps/api/

---

## 🆕 与 spec 的差异记录

### 1. `ToolDefinition` 上移到 `libs/tools/tool.ts`

设计 spec 原把 `ToolDefinition` 放在 `libs/llm/tool-call.ts`。实施时发现：

1. `libs/llm/tool-call.ts` 已经 `import` `libs/tools/tool.ts`（`ToolParameters`）。
2. `libs/tools/tool-registry.ts` 为了 `toProviderTools()` 又定义了一份 `ToolDefinition`。
3. 调用 `libs/llm/index.ts` 仍 re-export `ToolDefinition`，调用方 import 路径不变。

因此把 `ToolDefinition` 上移到 `libs/tools/tool.ts`，消除双事实源。

### 2. ChatClient 接口从三方法改为两方法

设计 spec 原定 `chat(messages)` / `stream(messages)` / `chatWithTools(messages, tools)` 三个方法。实施时肥老大指出：

> chat 和 chatWithTools 应该合并。普通聊天是 `client.chat({ messages })`，Agent 是 `client.chat({ messages, tools })` 然后 agent 的返回是 `{ toolCalls: [...] }` 这种方式

实施后：

- 统一为 `chat(ChatRequest)` / `stream(ChatRequest)`
- `ChatRequest` = `{ messages, tools? }`
- `ChatResponse` = `{ content?, toolCalls? }`
- 删除 `chatWithTools`，类型 `ToolCallData` / `ChatResponse` 合并到 `chat-client.ts`
- 删除整个 `libs/llm/tool-call.ts` 文件

这是今日最重要的设计调整，属于根因修复（消除冗余 API），不是新增能力。

---

## 🚀 Day 05 预告

候选方向：

1. **AbortSignal 取消**：给 `chat` / `stream` 加 `options?: { signal?: AbortSignal }`，让流式/非流式调用都能被取消。
2. **并行 tool 执行**：`Promise.all` 一次执行多个 tool_calls，再合并结果。
3. **apps/api/ SSE adapter**：把 `ChatResponse` 编码成 `AgentEvent` 对外走 SSE（回应 CLAUDE.md 全局指令）。

推荐候选 **3**，因为 CLAUDE.md 已经明确 "内部统一使用 AgentEvent，对外统一通过 SSE 传输 AgentEvent"，Day 05 应该把这一层补齐。

---

## 🔗 相关引用

- 设计 spec：[docs/superpowers/specs/2026-07-21-day04-agent-tool-calling-design.md](../superpowers/specs/2026-07-21-day04-agent-tool-calling-design.md)
- 实施计划：[docs/superpowers/plans/2026-07-21-day04-agent-tool-calling.md](../superpowers/plans/2026-07-21-day04-agent-tool-calling.md)
- 代码锚点：
  - [libs/llm/chat-client.ts](../../libs/llm/chat-client.ts) — ChatClient 接口 + ChatRequest/ChatResponse/ChatChunk
  - [libs/tools/tool.ts](../../libs/tools/tool.ts) — `ToolDefinition` 事实源
  - [libs/llm/openai-chat-client.ts](../../libs/llm/openai-chat-client.ts) — `toOpenAIMessages`
  - [libs/llm/anthropic-chat-client.ts](../../libs/llm/anthropic-chat-client.ts) — `toApiMessages`
  - [libs/agent/agent.ts](../../libs/agent/agent.ts) — `Agent` loop
