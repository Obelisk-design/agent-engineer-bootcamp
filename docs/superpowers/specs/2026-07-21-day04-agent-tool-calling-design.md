# Day 04 — Agent Tool Calling 基础能力设计

> **日期**：2026-07-21
> **作者**：AI Agent Engineer Bootcamp Day 04
> **状态**：approved（待 user review 后 commit）

---

## 1. 目标

为仓库引入 **Agent Loop** 基础能力。LLM 可以调用工具（Tool），工具结果回传 LLM，最终返回用户回答。新增 agent/tools 两层；ChatClient 不破坏既有契约（chat/stream/setModel 完全不动），只加新 method。

---

## 2. 范围

### 2.1 必须做

- `libs/tools/tool.ts` — `Tool<TArgs, TReturn>` interface + `ToolParameters` (JSON Schema)
- `libs/tools/tool-registry.ts` — `ToolRegistry` 类：register / get / toProviderTools
- `libs/tools/calculator-tool.ts` — CalculatorTool demo（自写简易 expression parser，不调 eval/new Function）
- `libs/agent/agent.ts` — `Agent` 类：orchestration + loop
- `libs/agent/agent-loop.ts` — Loop 逻辑（拆出便于单测 + 复用）
- `libs/agent/types.ts` — re-export `ToolCallData` / `ChatResponse` / `ToolDefinition`（定义在 `libs/llm/tool-call.ts`）
- `libs/llm/tool-call.ts` — `ToolCallData` / `ToolDefinition` / `ChatResponse` 类型定义
- `libs/llm/chat-client.ts` — 加 `chatWithTools(messages, tools): Promise<ChatResponse>` method
- `libs/llm/openai-chat-client.ts` — 实现 `chatWithTools`（SDK `tools` 参数 + 解析 `tool_calls`）
- `libs/llm/anthropic-chat-client.ts` — 实现 `chatWithTools`（SDK `tools` 参数 + 解析 `tool_use` 块）
- `libs/llm/message.ts` — 加 2 个 optional 字段：`toolCalls` / `toolCallId`
- `libs/llm/index.ts` — export `ChatResponse` + `ToolDefinition`
- `libs/tools/index.ts` — 新文件
- `libs/agent/index.ts` — 新文件
- `examples/day04/ex_001_calculator_agent.ts` — Demo

### 2.2 故意不做（YAGNI）

- ❌ AbortSignal —— 不在 Day 04 scope
- ❌ 单测 —— 靠 demo 跑真 LLM 验证
- ❌ Streaming tool calling（chatWithTools 是非流式的）
- ❌ 并行 tool 调用 —— sequential for 循环（OpenAI/Anthropic 都允许多 tool 并行，今天顺序跑）
- ❌ Message 升级判别联合 —— 加 optional 字段保持 Day 02 形态
- ❌ JSON Schema runtime validation —— tool execute 信任参数（或自检），不引入 ajv/zod 等依赖
- ❌ apps/api/ + apps/web-vue/ —— 留后续 day
- ❌ FileTool / SearchTool / MCP Tool —— ToolRegistry 设计上支持，但 Day 04 只落地 CalculatorTool

---

## 3. 架构

### 3.1 分层关系

```
libs/llm/                        LLM SDK 抽象层（chat/stream + 新 chatWithTools）
    ↑ 使用
libs/agent/                      Agent 编排层（loop + tool 调度）
    ↑ 使用
libs/tools/                      Tool 定义 + 注册表（Tool interface + ToolRegistry）
```

三层严格自下而上调用：tools 不依赖 agent，agent 不依赖 apps/api（不在 Day 04 scope）。ChatClient 接口契约不变，只加 method。

### 3.2 调用关系图

```
用户输入
  ↓
Agent.run(input)
  ↓
[loop iter ≤ maxIterations]
   ↓
   ChatClient.chatWithTools(messages, toolDefs)
      ↓ SDK tools 参数
      OpenAI:  client.chat.completions.create({tools, messages})
      Anthropic: client.messages.create({tools, messages})
      ↓ 解析响应
      OpenAI:  response.choices[0].message.tool_calls[]
      Anthropic: response.content[].type==='tool_use'
      ↓
   ChatResponse
      ├─ kind:'content' → return 最终回答
      └─ kind:'tool_calls' →
            ↓
            for each ToolCallRequest:
               ToolRegistry.get(name)
               tool.execute(args) → result
            ↓
            messages.push(assistant + toolCalls)
            messages.push(tool result + toolCallId)
            ↓
            下一轮 iter
```

---

## 4. 组件

### 4.1 `libs/tools/tool.ts`

```ts
export interface ToolParameters {
  readonly type: 'object';
  readonly properties: Record<string, { readonly type: string; readonly description?: string }>;
  readonly required?: ReadonlyArray<string>;
}

export interface Tool<TArgs = unknown, TReturn = unknown> {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
  execute(args: TArgs): Promise<TReturn>;
}
```

`ToolParameters` 简化版 JSON Schema（Day 04 不引入 ajv/zod）。provider 转发时转换为各家 SDK 期望的格式。

### 4.2 `libs/tools/tool-registry.ts`

```ts
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): ReadonlyArray<Tool> {
    return Array.from(this.tools.values());
  }

  toProviderTools(): ReadonlyArray<ToolDefinition> {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
```

### 4.3 `libs/tools/calculator-tool.ts`

简易 expression parser（无 eval/new Function）。支持 `+ - * /` 与括号，整数与小数。

```ts
export const calculatorTool: Tool<{ expression: string }, { result: number }> = {
  name: 'calculator',
  description: 'Evaluate arithmetic expressions with +, -, *, / and parentheses. Returns { result: number }.',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'e.g. "1+2*3"' },
    },
    required: ['expression'],
  },
  execute: async (args) => {
    const { expression } = args;
    if (typeof expression !== 'string') {
      throw new Error(`calculator: expression must be string, got ${typeof expression}`);
    }
    return { result: evaluate(expression) };
  },
};
```

`evaluate()`：自写 tokenizer + shunting-yard → RPN 评估。不引入外部依赖。

### 4.4 `libs/llm/tool-call.ts` —— ToolCallData 与 ToolDefinition（**放在 llm 层**，避免下层依赖上层）

```ts
import type { ToolParameters } from '../tools/tool.js';

export interface ToolCallData {
  readonly id: string;
  readonly toolName: string;
  readonly args: unknown;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
}

export type ChatResponse =
  | { readonly kind: 'content'; readonly content: string }
  | { readonly kind: 'tool_calls'; readonly toolCalls: ReadonlyArray<ToolCallData> };
```

`ToolParameters` 从 `libs/tools/tool.ts` import —— tools 层定义参数 schema 形态，llm 层用其组装 SDK 请求形态。`libs/agent/types.ts` 改 import 自 `libs/llm/tool-call.ts`（不再定义，纯粹 re-export）。

### 4.5 `libs/llm/message.ts` —— 加 2 个 optional 字段

```ts
export interface Message {
  readonly role: Role;
  readonly content: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;   // 仅 assistant 调工具时
  readonly toolCallId?: string;                       // 仅 tool result 时
}
```

**Day 02 / Day 03 调用方代码 0 行改动**（optional 字段不出现时为 undefined，行为同旧契约）。

### 4.6 `libs/llm/chat-client.ts` —— 新 method

```ts
export interface ChatClient {
  chat(messages: Message[]): Promise<string>;                                  // Day 02 不动
  stream(messages: Message[]): AsyncIterable<string>;                          // Day 03 不动
  chatWithTools(                                                               // 🆕 Day 04
    messages: Message[],
    tools: ReadonlyArray<ToolDefinition>,
  ): Promise<ChatResponse>;
  setModel(model: string): void;
}
```

### 4.7 `libs/agent/agent.ts` —— Agent 类

```ts
export interface AgentOptions {
  readonly chat: ChatClient;
  readonly tools: ToolRegistry;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;  // 默认 5
}

export class Agent {
  constructor(private readonly options: AgentOptions) {}

  async run(userInput: string): Promise<string> {
    // 详见 §5 Agent Loop
  }
}
```

### 4.8 Provider 事件映射（chatWithTools 实现）

**OpenAI**：
```ts
async chatWithTools(messages, tools): Promise<ChatResponse> {
  const response = await this.client.chat.completions.create({
    model: this.model,
    messages: messages as any,  // OpenAI SDK 接受含 toolCalls / toolCallId 的扩展形态
    tools: tools.map(toOpenAIToolDef),
  });
  const choice = response.choices[0];
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
    return {
      kind: 'tool_calls',
      toolCalls: choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        toolName: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      })),
    };
  }
  return { kind: 'content', content: choice.message.content ?? '' };
}
```

**Anthropic**：
```ts
async chatWithTools(messages, tools): Promise<ChatResponse> {
  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: this.maxTokens,
    messages: messages as any,
    tools: tools.map(toAnthropicToolDef),
  });

  // 提取 tool_use blocks
  const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
  if (toolUseBlocks.length > 0) {
    return {
      kind: 'tool_calls',
      toolCalls: toolUseBlocks.map((b) => ({
        id: b.id,
        toolName: b.name,
        args: b.input,
      })),
    };
  }

  // 提取 text blocks（final answer）
  const textBlock = response.content.find((b) => b.type === 'text');
  return { kind: 'content', content: textBlock?.text ?? '' };
}
```

注意 OpenAI 的 `tool_calls` finish_reason 与 Anthropic 的 tool_use block 检测路径不同 —— 各自 SDK 协议差异在 provider 实现内部消化。

---

## 5. Agent Loop 算法

```ts
async run(userInput: string): Promise<string> {
  const messages: Message[] = [
    ...(this.options.systemPrompt
      ? [{ role: 'system' as const, content: this.options.systemPrompt }]
      : []),
    { role: 'user', content: userInput },
  ];
  const toolDefs = this.options.tools.toProviderTools();

  for (let i = 0; i < (this.options.maxIterations ?? 5); i++) {
    const response = await this.options.chat.chatWithTools(messages, toolDefs);

    if (response.kind === 'content') {
      return response.content;
    }

    // Append assistant tool_calls to history
    messages.push({
      role: 'assistant',
      content: '',
      toolCalls: response.toolCalls,
    });

    // Execute each tool, append results (sequential — Day 04 YAGNI)
    for (const tc of response.toolCalls) {
      const tool = this.options.tools.get(tc.toolName);
      let resultContent: string;
      if (!tool) {
        resultContent = `Error: tool "${tc.toolName}" not found`;
      } else {
        try {
          const result = await tool.execute(tc.args);
          resultContent = JSON.stringify(result);
        } catch (err) {
          resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      messages.push({
        role: 'tool',
        toolCallId: tc.id,
        content: resultContent,
      });
    }
  }

  throw new Error(`Agent loop exceeded ${this.options.maxIterations ?? 5} iterations without final answer`);
}
```

边界保护：
- `maxIterations` 默认 5 防无限循环
- tool 执行 try/catch 错误返字符串不 throw
- 未知 tool name 返错误字符串给 LLM，让 LLM 下轮纠正

---

## 6. Demo 验证

`examples/day04/ex_001_calculator_agent.ts`：
- 用户输入："用 calculator 工具计算 1+2*3"
- Agent + CalculatorTool 期望输出："1+2*3 = 7"（或类似）
- chunks/iterations log：记录循环次数与每次 ChatResponse kind

**验证标准**：
- 跑通（无 throw）
- 计算结果正确
- 输出 log 显示 tool_calls 至少触发一次（证明 loop 走了 tool 分支）
- 最终返回 content（证明 loop 收敛）

---

## 7. 文件改动清单

| 文件 | 改动 | 行数估计 |
|---|---|---|
| `libs/tools/tool.ts` | 🆕 | +30 |
| `libs/tools/tool-registry.ts` | 🆕 | +50 |
| `libs/tools/calculator-tool.ts` | 🆕 | +80（含 evaluate parser） |
| `libs/tools/index.ts` | 🆕 | +5 |
| `libs/agent/types.ts` | 🆕 | +20 |
| `libs/agent/agent.ts` | 🆕 | +60 |
| `libs/agent/agent-loop.ts` | 🆕 | +70 |
| `libs/agent/index.ts` | 🆕 | +5 |
| `libs/llm/chat-client.ts` | MODIFIED | +15 |
| `libs/llm/openai-chat-client.ts` | MODIFIED | +40 |
| `libs/llm/anthropic-chat-client.ts` | MODIFIED | +40 |
| `libs/llm/message.ts` | MODIFIED | +2（2 个 optional 字段） |
| `libs/llm/index.ts` | MODIFIED | +5 |
| `examples/day04/ex_001_calculator_agent.ts` | 🆕 | +60 |
| `docs/superpowers/specs/2026-07-21-...-design.md` | 🆕 | （本文） |
| `docs/superpowers/plans/2026-07-21-...-md` | 🆕 | （后续） |
| `docs/daily/day04.md` | 🆕 | ~400 |

净增 ~14 个新文件 + 4 个修改。代码量预估 ~700 行（含注释 + 头注释）。

---

## 8. 验收清单

- [ ] `pnpm typecheck` 0 error
- [ ] `pnpm lint` 0 error
- [ ] `pnpm format:check` 全绿
- [ ] `pnpm test` 不破（Day 02 baseline 3/3）
- [ ] Day 02 + Day 03 demos 行为不变（chat/stream 契约未动）
- [ ] Calculator demo 真跑通（Agent 调 tool 至少一次，loop 收敛）
- [ ] 头注释 / spec 写明 Day 04 不做的项（AbortSignal / 单测 / 并行 tool 等）

---

## 9. 故意不做的设计权衡（决策记录）

| 决策 | 选择 | 拒绝的方案 | 拒绝理由 |
|---|---|---|---|
| ChatClient 改造 | 加 `chatWithTools` new method | 改 `chat()` 返回 ChatResponse | chat() 是 Day 02 既有契约，breaking |
| Message 改造 | 加 2 个 optional 字段 | 拆判别联合 | 渐进式，Day 02/03 调用方 0 行改动 |
| Tool 参数验证 | execute 信任 args | 引入 zod/ajv runtime validation | YAGNI，CalculatorTool 自检足够 |
| Tool 执行顺序 | sequential for 循环 | Promise.all 并行 | OpenAI/Anthropic 都允许多 tool，Day 04 YAGNI |
| Calculator 表达式 | 自写 tokenizer + shunting-yard | `new Function` / `eval` | 任意代码执行风险 |
| Tool 定义序列化 | ToolRegistry.toProviderTools() 转 | Tool 自己提供 `toOpenAI() / toAnthropic()` | 集中转换逻辑在 registry，tool 实现只关心 execute |

---

## 10. 开放问题（不阻塞 Day 04 实现）

1. **AbortSignal 接哪里**：未来 `chatWithTools(messages, tools, opts?: { signal?: AbortSignal })`。SDK 侧 OpenAI / Anthropic 都原生支持。
2. **Streaming tool calling**：未来 `streamWithTools()` 边流式回答边触发 tool（更复杂的协议协调）。
3. **并行 tool 调用**：未来 `Promise.all(toolCalls.map(execute))` + 结果合并协议。
4. **JSON Schema runtime validation**：未来引入 zod，工具声明 = zod schema，自动 derive JSON Schema + args validation。
5. **Message 升级判别联合**：当 tool_calls / tool_call_id 字段在 Message 上开始真有差异化时（不是当前 optional 而是必填），升级为判别联合。
6. **apps/api/ + apps/web-vue/**：Tool 调用怎么走 HTTP/SSE 边界？留 Day 06+。

---

## 11. 相关引用

- Day 02 笔记：[docs/daily/day02.md](../daily/day02.md)（ChatClient 抽象 + Message 类型）
- Day 02 ChatClient 契约：[libs/llm/chat-client.ts](../../libs/llm/chat-client.ts)
- Day 03 笔记：[docs/daily/day03.md](../daily/day03.md)（streaming 演化 + 多 provider 一致）
- Day 03 spec §12 开放问题（tool_call 升级路径）：[docs/superpowers/specs/2026-07-20-chat-client-streaming-design.md](../specs/2026-07-20-chat-client-streaming-design.md)
- CLAUDE.md 全局指令（AgentEvent / SSE 业务协议）：[CLAUDE.md](../../CLAUDE.md)
- CLAUDE.md 项目级指令：[CLAUDE.md](../../CLAUDE.md)