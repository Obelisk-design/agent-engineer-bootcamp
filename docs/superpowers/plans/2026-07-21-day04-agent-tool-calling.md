# Day 04 — Agent Tool Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Agent Loop capability — LLM can call tools via SDK native tool calling APIs, tool results feed back into conversation, loop continues until final answer. New `libs/tools` + `libs/agent` layers; ChatClient extended with `chatWithTools` new method (chat/stream/setModel untouched).

**Architecture:** 3-layer composition. ChatClient (LLM SDK wrapper, Day 02-03, extended additively) → Agent (orchestration + loop, new layer) → Tools (Tool interface + Registry + CalculatorTool demo, new layer). Message type gains 2 optional fields (`toolCalls`, `toolCallId`) — Day 02/03 callers unchanged.

**Tech Stack:** TypeScript 5.7 + Node 22 + OpenAI SDK 6.47 + Anthropic SDK 0.111 + tsx + vitest + eslint + prettier + commitlint + pnpm 11.6.

## Global Constraints

From the spec, these apply to every task:

- **No breaking changes** to Day 02 / Day 03 contracts: `chat()`, `stream()`, `setModel()` signatures unchanged; Message interface only adds 2 optional fields (existing callers see no behavior change).
- **ChatClient layer is extended additively**: `chatWithTools` is a new method, not a modification of existing methods.
- **Tool parameter validation**: do not introduce zod/ajv/Yup runtime validation. CalculatorTool self-validates input.
- **Calculator tool**: self-written tokenizer + shunting-yard → RPN evaluator. NO `eval`, NO `new Function`, NO external math libraries.
- **Tool execution is sequential for-of loop** in Agent, NOT `Promise.all`. YAGNI — Day 04 doesn't add parallelism.
- **TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes** ON.
- **`exactOptionalPropertyTypes` rule**: optional fields use conditional spread pattern (`...(value !== undefined ? { field: value } : {})`), never `field: undefined`.
- **Commit message format**: `feat(day04): ...` / `docs(day04): ...` with commitlint-friendly line wrapping (≤100 chars). Use multiple `-m` flags, not heredoc.
- **Files must be runnable** via `pnpm exec tsx ...` after implementation.
- **Env vars**: Read from `.env` via `import 'dotenv/config'`. Required vars throw explicit errors.
- **No unit tests today** (verified by demo + Day 03 spec decision).
- **No AbortSignal / streaming tool / parallel tool / Message discriminated union / JSON Schema runtime validation** (Day 04 YAGNI list).

## File Structure

```
libs/llm/
  tool-call.ts                       NEW: ToolCallData / ChatResponse / ToolDefinition types
  message.ts                         MODIFIED: +2 optional fields (toolCalls / toolCallId)
  chat-client.ts                     MODIFIED: +chatWithTools method on interface
  openai-chat-client.ts              MODIFIED: +chatWithTools implementation
  anthropic-chat-client.ts           MODIFIED: +chatWithTools implementation
  index.ts                           MODIFIED: export ToolCallData / ChatResponse / ToolDefinition

libs/tools/
  tool.ts                            NEW: Tool interface + ToolParameters
  tool-registry.ts                   NEW: ToolRegistry class
  calculator-tool.ts                 NEW: CalculatorTool + expression parser
  index.ts                           NEW: exports

libs/agent/
  types.ts                           NEW: re-export from libs/llm/tool-call
  agent.ts                           NEW: Agent class
  agent-loop.ts                      NEW: loop logic (separated for testability)
  index.ts                           NEW: exports

examples/day04/
  ex_001_calculator_agent.ts         NEW: demo
```

**Decomposition rationale:**
- `libs/tools` is leaf (no dependencies on libs/llm or libs/agent) — pure definitions.
- `libs/agent` depends on `libs/llm` (uses ChatClient) and `libs/tools` (uses Tool/ToolRegistry).
- `libs/llm` is unchanged at behavior level; only ChatClient interface gains method, two providers gain implementation.
- Message optional fields preserve Day 02/03 backward-compat — those callers' messages don't need to specify them.

---

### Task 1: Create `libs/tools/` layer (Tool + ToolRegistry + CalculatorTool)

**Files:**
- Create: `libs/tools/tool.ts`
- Create: `libs/tools/tool-registry.ts`
- Create: `libs/tools/calculator-tool.ts`
- Create: `libs/tools/index.ts`

**Interfaces:**
- Consumes: nothing (leaf layer)
- Produces:
  - `Tool<TArgs, TReturn>` interface
  - `ToolParameters` type
  - `ToolRegistry` class
  - `calculatorTool` constant

**Implementation:**

`libs/tools/tool.ts` — Tool interface + parameters type:

```ts
/**
 * libs/tools/tool.ts
 *
 * Tool 层基础定义。
 *
 * Tool 是 Agent Loop 中 "可被 LLM 调用" 的能力单元。
 * ToolRegistry 持有多个 Tool 并提供序列化给 LLM SDK 的能力。
 *
 * ToolParameters 是简化版 JSON Schema (type/object/properties/required) —— Day 04 不引入
 * zod/ajv runtime validation, 由 tool execute 自检 (Day 04 CalculatorTool 走此纪律)。
 */

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

`libs/tools/tool-registry.ts` — ToolRegistry class:

```ts
/**
 * libs/tools/tool-registry.ts
 *
 * ToolRegistry: 注册 / 查找 / 转 provider format 的中心。
 *
 * Day 04 不做 toOpenAI() / toAnthropic() 拆分 —— ToolRegistry.toProviderTools()
 * 返统一的 ToolDefinition 形态, 由 libs/llm 各自转 SDK 期望的格式。
 *
 * 后续 day 拆开 (OpenAI 走 function calling, Anthropic 走 input_schema) 时:
 *   toProviderTools(provider: 'openai' | 'anthropic') 拆成两个 method。
 */

import type { Tool } from './tool.js';

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
}
import type { ToolParameters } from './tool.js';

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

`libs/tools/calculator-tool.ts` — CalculatorTool + expression parser:

```ts
/**
 * libs/tools/calculator-tool.ts
 *
 * CalculatorTool: 加减乘除 + 括号 的数学表达式求值。
 *
 * 表达式求值走自写 tokenizer + shunting-yard + RPN evaluation。
 * 不用 eval / new Function —— 避免任意代码执行风险 (Day 04 YAGNI 纪律)。
 *
 * 表达式只允许: 数字 (整数 + 小数) / + - * / / ( ) / 空白。 其他字符 throw。
 */

import type { Tool } from './tool.js';

export const calculatorTool: Tool<{ expression: string }, { result: number }> = {
  name: 'calculator',
  description:
    'Evaluate arithmetic expressions with +, -, *, / and parentheses. Input: { expression: string }. Returns { result: number }.',
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

// ---------------------------------------------------------------------------
// Expression evaluator (tokenizer + shunting-yard + RPN eval)
// ---------------------------------------------------------------------------

type Token = { kind: 'num'; value: number } | { kind: 'op'; op: '+' | '-' | '*' | '/' } | { kind: 'paren'; dir: '(' | ')' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ kind: 'op', op: c });
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      tokens.push({ kind: 'paren', dir: c });
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i + 1;
      while (j < input.length && ((input[j] >= '0' && input[j] <= '9') || input[j] === '.')) j++;
      const value = parseFloat(input.slice(i, j));
      if (Number.isNaN(value)) throw new Error(`calculator: invalid number at ${i}`);
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }
    throw new Error(`calculator: unexpected char '${c}' at ${i}`);
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

function toRPN(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const ops: Token[] = [];
  for (const t of tokens) {
    if (t.kind === 'num') out.push(t);
    else if (t.kind === 'op') {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top && top.kind === 'op' && PRECEDENCE[top.op] >= PRECEDENCE[t.op]) {
          out.push(ops.pop()!);
        } else break;
      }
      ops.push(t);
    } else if (t.kind === 'paren' && t.dir === '(') {
      ops.push(t);
    } else {
      // ')'
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top && top.kind === 'paren' && top.dir === '(') {
          ops.pop();
          break;
        }
        out.push(ops.pop()!);
      }
    }
  }
  while (ops.length > 0) out.push(ops.pop()!);
  return out;
}

function evalRPN(rpn: Token[]): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.kind === 'num') stack.push(t.value);
    else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error('calculator: malformed expression');
      switch (t.op) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/':
          if (b === 0) throw new Error('calculator: division by zero');
          stack.push(a / b);
          break;
      }
    }
  }
  if (stack.length !== 1) throw new Error('calculator: malformed expression');
  return stack[0]!;
}

export function evaluate(expression: string): number {
  return evalRPN(toRPN(tokenize(expression)));
}
```

`libs/tools/index.ts` — exports:

```ts
/**
 * libs/tools/index.ts
 *
 * libs/tools 公共导出。
 * Day 04 落地 CalculatorTool; Future days 加 FileTool / SearchTool / MCP Tool。
 */

export type { Tool, ToolParameters } from './tool.js';
export { ToolRegistry, type ToolDefinition } from './tool-registry.js';
export { calculatorTool } from './calculator-tool.js';
```

- [ ] **Step 1: Create the 4 files** with Write tool

- [ ] **Step 2: Verify typecheck**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm typecheck`

Expected: exit 0. The new `libs/tools/` files have no consumer yet, so typecheck should pass.

- [ ] **Step 3: Verify lint + format**

Run: `pnpm lint && pnpm format:check`

Expected: exit 0 each.

- [ ] **Step 4: Commit**

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp
git -c core.autocrlf=false add libs/tools/
git -c core.autocrlf=false commit -m "feat(day04): add libs/tools layer with CalculatorTool" \
  -m "Day 04 libs/tools 层首次落地:" -m "" -m "libs/tools/tool.ts:" -m "  Tool<TArgs, TReturn> interface" -m "  ToolParameters 简化 JSON Schema (Day 04 不引 zod/ajv)" -m "" -m "libs/tools/tool-registry.ts:" -m "  ToolRegistry class: register / get / list / toProviderTools" -m "" -m "libs/tools/calculator-tool.ts:" -m "  calculatorTool: 加减乘除 + 括号 表达式求值" -m "  自写 tokenizer + shunting-yard + RPN evaluation" -m "  不用 eval / new Function (任意代码执行风险)" -m "" -m "libs/tools/index.ts: 公共导出。" -m "" -m "故意不做 (Day 04 YAGNI):" -m "- 单元测试 (靠 demo 验证, Day 03 纪律)" -m "- toProviderTools(provider) 拆分 (Day 04 一个 method 统一, 未来拆)" -m "- JSON Schema runtime validation (CalculatorTool 自检足够)"
```

Expected: lint-staged prettier+eslint clean. Commitlint pass.

---

### Task 2: Create `libs/llm/tool-call.ts` types + extend `libs/llm/message.ts`

**Files:**
- Create: `libs/llm/tool-call.ts`
- Modify: `libs/llm/message.ts` (+2 optional fields)
- Modify: `libs/llm/index.ts` (export new types)

**Interfaces:**
- Consumes: `ToolParameters` from `libs/tools/tool.js`
- Produces:
  - `ToolCallData` interface
  - `ChatResponse` discriminated union
  - `ToolDefinition` interface

**Implementation:**

`libs/llm/tool-call.ts` — types:

```ts
/**
 * libs/llm/tool-call.ts
 *
 * ToolCallData / ChatResponse / ToolDefinition 类型定义。
 *
 * 这些类型在 libs/llm 层定义而非 libs/agent 层 —— 因为 Message.history
 * 字段 (toolCalls / toolCallId) 在 libs/llm/message.ts 用到。下层依赖上层
 * 是分层违规, 所以类型定义放在 llm 层。
 *
 * libs/agent/types.ts pure re-export 给 agent 层用, 不再自己定义。
 */

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

`libs/llm/message.ts` — modify (add 2 optional fields):

```ts
/**
 * libs/llm/message.ts
 *
 * ChatClient 抽象层的最小消息契约 (Day 02)。
 *
 * Day 04 加 2 个 optional 字段 (toolCalls / toolCallId) 支持 Agent Tool Calling。
 * Day 02/03 调用方无需感知 —— 未指定时 undefined, 行为同旧契约。
 *
 * 渐进式扩展路径:
 * - assistant 需要 tool_calls: 加 toolCalls 字段 (Day 04 已加)
 * - tool result 消息: 加 toolCallId 字段 (Day 04 已加)
 * - 未来 content 多模态: 加 contentBlocks?: ContentBlock[] 字段
 */

import type { ToolCallData } from './tool-call.js';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  readonly role: Role;
  readonly content: string;
  readonly toolCalls?: ReadonlyArray<ToolCallData>;
  readonly toolCallId?: string;
}
```

`libs/llm/index.ts` — extend exports:

```ts
/**
 * libs/llm/index.ts
 *
 * libs/llm 公共 API 导出。
 * Day 02 先导出 OpenAI provider；Day 02 延展 多导出 Anthropic provider。
 * Day 03 加 stream()。
 * Day 04 加 ToolCallData / ChatResponse / ToolDefinition (chatWithTools 相关类型)。
 */

export type { Role, Message } from './message.js';
export type { ToolCallData, ChatResponse, ToolDefinition } from './tool-call.js';
export type { ChatClient } from './chat-client.js';
export type { OpenAIChatClientOptions } from './openai-chat-client.js';
export { OpenAIChatClient } from './openai-chat-client.js';
export type { AnthropicChatClientOptions } from './anthropic-chat-client.js';
export { AnthropicChatClient } from './anthropic-chat-client.js';
```

- [ ] **Step 1: Create/modify the 3 files** with Write / Edit

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: exit 0. Day 02/03 callers don't set toolCalls/toolCallId, so they're undefined — compatible.

- [ ] **Step 3: Verify lint + format**

Run: `pnpm lint && pnpm format:check`

Expected: exit 0 each.

- [ ] **Step 4: Run Day 02/03 demos backward-compat check**

Run:
```bash
pnpm exec tsx examples/day02/ex_001_chat_client.ts
pnpm exec tsx examples/day02/ex_002_anthropic_chat_client.ts
pnpm exec tsx examples/day03/ex_001_openai_stream.ts
pnpm exec tsx examples/day03/ex_002_anthropic_stream.ts
```

Expected: all 4 produce real LLM responses. No regression.

- [ ] **Step 5: Commit**

```bash
git -c core.autocrlf=false add libs/llm/tool-call.ts libs/llm/message.ts libs/llm/index.ts
git -c core.autocrlf=false commit -m "feat(day04): add ToolCallData/ChatResponse types + Message optional fields" \
  -m "Day 04 libs/llm 层类型扩展:" -m "" \
  -m "libs/llm/tool-call.ts (新):" -m "  ToolCallData (id / toolName / args)" \
  -m "  ChatResponse ({kind:'content',content} | {kind:'tool_calls',toolCalls})" -m "  ToolDefinition (name / description / parameters)" \
  -m "  这些类型放 libs/llm 不放 libs/agent —— 因为 Message.history 字段依赖" \
  -m "" -m "libs/llm/message.ts (改):" \
  -m "  Message 加 2 个 optional 字段 (toolCalls / toolCallId)" \
  -m "  Role 增 'tool' (tool result 消息用)" \
  -m "  Day 02/03 调用方 0 行改动 (optional 不指定为 undefined)" \
  -m "" -m "libs/llm/index.ts: export 新类型。"
```

Expected: 4 demos still pass. lint-staged + commitlint clean.

---

### Task 3: Extend `ChatClient` interface with `chatWithTools` method

**Files:**
- Modify: `libs/llm/chat-client.ts`

**Interfaces:**
- Consumes: `ToolDefinition` and `ChatResponse` from `./tool-call.js`
- Produces: `ChatClient` interface gains `chatWithTools(messages, tools): Promise<ChatResponse>` method

**Implementation:**

`libs/llm/chat-client.ts` — extend interface:

```ts
/**
 * libs/llm/chat-client.ts
 *
 * ChatClient 抽象层的最小契约 —— libs/llm 的中心接口定义。
 *
 * 契约：
 *   chat(messages): 一次对话，传入历史，拿到 assistant 回复（string）。
 *   stream(messages): 流式对话，传入历史，逐 chunk yield 文本增量（AsyncIterable<string>）。
 *   chatWithTools(messages, tools): 工具增强对话，返回 ChatResponse（content 或 tool_calls）。
 *   setModel(model): 运行时切换模型（可选 set；如果不需要切换，可忽略）。
 *
 * Day 02 c851ad8 commit 时跟 OpenAI 实现共占 chat-client.ts。
 * Day 02 延展加 AnthropicChatClient 后，OpenAI 实现拆到 openai-chat-client.ts。
 * Day 03 加 stream() —— additive 增强（不改 chat() 契约）。
 * Day 04 加 chatWithTools() —— additive 增强（不改 chat/stream/setModel 契约）。
 *
 * 设计取舍：
 * - chat 返回 string 而非结构化 response：ChatClient 最克制的契约；
 *   usage / finish_reason / refusal 都不在基础范围里，需要时再升级。
 * - setModel 失败语义保持 void：模型无效由底层 SDK 抛 validation error。
 * - chatWithTools 返回 ChatResponse 判别联合：tool_calls / content 二选一。
 *   与 chat() 不同 —— tool calling 是 ChatClient 的扩展职责，不是 chat() 的修改。
 *
 * provider 实现目录：
 * - libs/llm/openai-chat-client.ts       —— OpenAI 兼容协议（含 chat/stream/chatWithTools）
 * - libs/llm/anthropic-chat-client.ts    —— Anthropic Messages API（含 chat/stream/chatWithTools）
 * - 未来新 provider：libs/llm/<name>-chat-client.ts，implements ChatClient
 */

import type { Message } from './message.js';
import type { ChatResponse, ToolDefinition } from './tool-call.js';

export interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;
  chatWithTools(
    messages: Message[],
    tools: ReadonlyArray<ToolDefinition>,
  ): Promise<ChatResponse>;
  setModel(model: string): void;
}
```

Note: This change will break typecheck on existing `OpenAIChatClient` and `AnthropicChatClient` because they don't implement `chatWithTools` yet. That's expected — Task 4 + Task 5 will fix it. Run typecheck after Task 3 to confirm the failure is TS2420 on the two provider classes (matching the Day 03 Task 1 pattern).

- [ ] **Step 1: Replace the file with Write tool**

- [ ] **Step 2: Verify typecheck** (EXPECTED FAILURE)

Run: `pnpm typecheck`

Expected: exit 2, with TS2420 errors on `OpenAIChatClient` and `AnthropicChatClient` (they don't yet implement `chatWithTools`). This is the same coordinated 3-step pattern as Day 03 Task 1 — interface change precedes implementations.

- [ ] **Step 3: Commit (interface-only)**

```bash
git -c core.autocrlf=false add libs/llm/chat-client.ts
git -c core.autocrlf=false commit -m "feat(day04): add chatWithTools to ChatClient interface" \
  -m "Day 04 additive: ChatClient 加 chatWithTools(messages, tools) method。" \
  -m "chat() / stream() / setModel() 完全不动。" \
  -m "" -m "返回 ChatResponse 判别联合 (libs/llm/tool-call.ts):" \
  -m "  { kind: 'content', content } | { kind: 'tool_calls', toolCalls }" \
  -m "" -m "Task 4 + Task 5 在 OpenAI / Anthropic provider 上实现 chatWithTools。"
```

Expected: commitlint pass. typecheck still red (expected, 2 TS2420 errors until Task 4/5 land).

---

### Task 4: Implement `OpenAIChatClient.chatWithTools`

**Files:**
- Modify: `libs/llm/openai-chat-client.ts` (add `chatWithTools` implementation, update header)

**Interfaces:**
- Consumes: `ChatClient` interface (from Task 3)
- Produces: `chatWithTools()` returns `ChatResponse` (text_delta or tool_calls)

**Implementation:**

Add to `OpenAIChatClient` class, alongside existing `chat()` and `stream()`:

```ts
async chatWithTools(
  messages: Message[],
  tools: ReadonlyArray<ToolDefinition>,
): Promise<ChatResponse> {
  const response = await this.client.chat.completions.create({
    model: this.model,
    messages: messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
    tools: tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as Record<string, unknown>,
      },
    })),
  });
  const choice = response.choices[0];
  if (!choice) {
    return { kind: 'content', content: '' };
  }
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
    return {
      kind: 'tool_calls',
      toolCalls: choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        toolName: tc.function.name,
        args: JSON.parse(tc.function.arguments) as unknown,
      })),
    };
  }
  return { kind: 'content', content: choice.message.content ?? '' };
}
```

Update header comment to mention `chatWithTools`.

- [ ] **Step 1: Add the method** with Edit tool

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: exit 2 — OpenAI side passes (TS2420 gone), but AnthropicChatClient still missing `chatWithTools` (TS2420 remains).

- [ ] **Step 3: Verify lint**

Run: `pnpm lint`

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git -c core.autocrlf=false add libs/llm/openai-chat-client.ts
git -c core.autocrlf=false commit -m "feat(day04): add OpenAIChatClient.chatWithTools implementation" \
  -m "OpenAI 工具调用实现: 走 SDK tools 参数, 解析 message.tool_calls[]。" \
  -m "返回 ChatResponse 判别联合 (content 或 tool_calls)。" \
  -m "" -m "协议适配:" \
  -m "- tools 数组转 OpenAI {type:'function', function:{name,description,parameters}}" \
  -m "- finish_reason==='tool_calls' 时 yield toolCalls (id + name + JSON.parse(args))" \
  -m "- 否则 yield content" \
  -m "" -m "typecheck OpenAI 侧 TS2420 消除 (Anthropic 侧待 Task 5)。"
```

Expected: lint-staged clean. Commitlint pass.

---

### Task 5: Implement `AnthropicChatClient.chatWithTools`

**Files:**
- Modify: `libs/llm/anthropic-chat-client.ts` (add `chatWithTools` implementation, update header)

**Interfaces:**
- Consumes: `ChatClient` interface (from Task 3)
- Produces: `chatWithTools()` returns `ChatResponse`

**Implementation:**

Add to `AnthropicChatClient` class:

```ts
async chatWithTools(
  messages: Message[],
  tools: ReadonlyArray<ToolDefinition>,
): Promise<ChatResponse> {
  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: this.maxTokens,
    messages: messages as unknown as Anthropic.MessageParam[],
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as unknown as Anthropic.Tool.InputSchema,
    })),
  });

  // Anthropic response.content is ContentBlock[]; tool_use blocks indicate tool calls.
  const toolUseBlocks = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (toolUseBlocks.length > 0) {
    return {
      kind: 'tool_calls',
      toolCalls: toolUseBlocks.map((b) => ({
        id: b.id,
        toolName: b.name,
        args: b.input as unknown,
      })),
    };
  }

  // Final answer path: extract first text block.
  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  return { kind: 'content', content: textBlock?.text ?? '' };
}
```

Update header comment to mention `chatWithTools`. Note: the existing `toApiMessages` helper from Day 03 Task 4 already handles system-prompt extraction + content-block conversion for the **non-tool** path. For the tool path, the SDK accepts `tool_result` blocks in user messages — Anthropic SDK handles this internally when messages have `toolCalls` / `toolCallId` fields. (Day 04 conversion handles the simple cases; more complex tool-result routing may need future refinement.)

- [ ] **Step 1: Add the method** with Edit tool

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: exit 0 — both providers now satisfy `ChatClient` interface.

- [ ] **Step 3: Verify lint**

Run: `pnpm lint && pnpm format:check`

Expected: exit 0 each.

- [ ] **Step 4: Commit**

```bash
git -c core.autocrlf=false add libs/llm/anthropic-chat-client.ts
git -c core.autocrlf=false commit -m "feat(day04): add AnthropicChatClient.chatWithTools implementation" \
  -m "Anthropic 工具调用实现: 走 SDK tools 参数, 解析 response.content[].type==='tool_use'。" \
  -m "返回 ChatResponse 判别联合。" \
  -m "" -m "协议适配:" \
  -m "- tools 数组转 Anthropic {name, description, input_schema}" \
  -m "- ContentBlock[] 过滤 tool_use 块, yield toolCalls (id + name + input)" \
  -m "- 否则取首个 text 块 yield content" \
  -m "" -m "typecheck 双 provider TS2420 全消除 (ChatClient 契约恢复绿)。"
```

Expected: lint-staged clean. Commitlint pass.

---

### Task 6: Create `libs/agent/` layer (Agent class + agent-loop)

**Files:**
- Create: `libs/agent/types.ts`
- Create: `libs/agent/agent-loop.ts`
- Create: `libs/agent/agent.ts`
- Create: `libs/agent/index.ts`

**Interfaces:**
- Consumes:
  - `ChatClient` from `libs/llm/chat-client.js`
  - `ToolRegistry` from `libs/tools/tool-registry.js`
  - `Message` from `libs/llm/message.js`
  - `ChatResponse` from `libs/llm/tool-call.js`
- Produces: `Agent` class with `run(userInput): Promise<string>` method

**Implementation:**

`libs/agent/types.ts` — re-export:

```ts
/**
 * libs/agent/types.ts
 *
 * libs/agent 公共类型。 Pure re-export 自 libs/llm/tool-call.ts。
 * 不重新定义 (避免下层 libs/llm 引用 libs/agent 形成循环)。
 */

export type { ToolCallData, ChatResponse, ToolDefinition } from '../llm/tool-call.js';
```

`libs/agent/agent-loop.ts` — loop algorithm:

```ts
/**
 * libs/agent/agent-loop.ts
 *
 * Agent Loop 主算法。 拆出便于单测 + 复用。
 *
 * 算法:
 *   1. messages = [system?, user]
 *   2. for iter in 1..maxIterations:
 *      a. response = await chat.chatWithTools(messages, toolDefs)
 *      b. if response.kind === 'content': return response.content
 *      c. messages.push(assistant with toolCalls)
 *      d. for tc in response.toolCalls:
 *           execute tool, append tool result to messages
 *   3. throw if maxIterations reached
 *
 * 边界保护:
 *   - maxIterations 默认 5 防无限循环
 *   - tool execute try/catch 错误返字符串不 throw (让 LLM 下轮纠正)
 *   - 未知 tool name 返错误字符串给 LLM
 */

import type { Message } from '../llm/message.js';
import type { ChatClient } from '../llm/chat-client.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

export interface AgentLoopOptions {
  readonly chat: ChatClient;
  readonly tools: ToolRegistry;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
}

export async function runAgentLoop(
  options: AgentLoopOptions,
  userInput: string,
): Promise<string> {
  const { chat, tools, systemPrompt, maxIterations = 5 } = options;
  const messages: Message[] = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    { role: 'user', content: userInput },
  ];
  const toolDefs = tools.toProviderTools();

  for (let i = 0; i < maxIterations; i++) {
    const response = await chat.chatWithTools(messages, toolDefs);
    if (response.kind === 'content') {
      return response.content;
    }
    messages.push({
      role: 'assistant',
      content: '',
      toolCalls: response.toolCalls,
    });
    for (const tc of response.toolCalls) {
      const tool = tools.get(tc.toolName);
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
  throw new Error(`Agent loop exceeded ${maxIterations} iterations without final answer`);
}
```

`libs/agent/agent.ts` — Agent class wrapper:

```ts
/**
 * libs/agent/agent.ts
 *
 * Agent 类: orchestration + loop 入口。
 * 把 runAgentLoop 包成有状态对象 (持有 chat / tools / options), 调用方只需 agent.run(input)。
 */

import type { ChatClient } from '../llm/chat-client.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { runAgentLoop } from './agent-loop.js';

export interface AgentOptions {
  readonly chat: ChatClient;
  readonly tools: ToolRegistry;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
}

export class Agent {
  constructor(private readonly options: AgentOptions) {}

  run(userInput: string): Promise<string> {
    return runAgentLoop(this.options, userInput);
  }
}
```

`libs/agent/index.ts` — exports:

```ts
/**
 * libs/agent/index.ts
 *
 * libs/agent 公共导出。
 */

export { Agent, type AgentOptions } from './agent.js';
export { runAgentLoop, type AgentLoopOptions } from './agent-loop.js';
export type { ToolCallData, ChatResponse, ToolDefinition } from './types.js';
```

- [ ] **Step 1: Create the 4 files** with Write tool

- [ ] **Step 2: Verify typecheck + lint + format**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`

Expected: exit 0 each.

- [ ] **Step 3: Commit**

```bash
git -c core.autocrlf=false add libs/agent/
git -c core.autocrlf=false commit -m "feat(day04): add libs/agent layer (Agent + runAgentLoop)" \
  -m "Day 04 libs/agent 层首次落地:" -m "" -m "libs/agent/types.ts: pure re-export 自 libs/llm/tool-call。" \
  -m "" -m "libs/agent/agent-loop.ts: 主算法 (拆出便于单测 + 复用)。" \
  -m "  for iter ≤ maxIterations (默认 5):" \
  -m "    response = chat.chatWithTools(messages, toolDefs)" \
  -m "    kind=content → return" \
  -m "    kind=tool_calls → execute tools, append to messages" \
  -m "  工具执行顺序 for-of (Day 04 YAGNI, 不 Promise.all)。" \
  -m "  错误处理: tool execute try/catch 返错误字符串, 不 throw。" \
  -m "" -m "libs/agent/agent.ts: Agent class 包装, 调用方只需 agent.run(input)。" \
  -m "" -m "libs/agent/index.ts: exports。"
```

Expected: lint-staged clean. Commitlint pass.

---

### Task 7: Create `examples/day04/ex_001_calculator_agent.ts` demo + verify end-to-end

**Files:**
- Create: `examples/day04/ex_001_calculator_agent.ts`

**Implementation:**

```ts
/**
 * examples/day04/ex_001_calculator_agent.ts
 *
 * Day 04 示例：用 Agent + CalculatorTool 跑一次带工具调用的对话。
 *
 * 课题：
 *   1. Agent Loop 真实跑通（LLM 判断 → calculator tool → 结果回传 → 最终回答）。
 *   2. OpenAIChatClient.chatWithTools 端到端验证。
 *   3. CalculatorTool 表达式求值正确性。
 *
 * 对比 examples/day03/ex_001_openai_stream.ts：
 *   旧 demo 走 streaming，单轮 chat 完成。
 *   新 demo 走 Agent Loop，可能多轮（LLM 调工具 → 工具结果 → 最终回答）。
 *
 * 用法：
 *   复制 .env.example 到 .env，填入 OPENAI_API_KEY
 *   pnpm exec tsx examples/day04/ex_001_calculator_agent.ts
 */

import 'dotenv/config';

import { OpenAIChatClient, Message, ToolDefinition, ChatResponse } from '../../libs/llm/index.js';
import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.MODEL_NAME ?? 'ai-coding';

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}

console.log(`[calculator-agent] baseURL=${baseURL}`);
console.log(`[calculator-agent] model=${model}`);
console.log('[calculator-agent] setting up agent + calculator tool...');

const client = new OpenAIChatClient({ apiKey, baseURL, model });
const registry = new ToolRegistry();
registry.register(calculatorTool);

const agent = new Agent({
  chat: client,
  tools: registry,
  systemPrompt: 'You are a math assistant. Use the calculator tool for any arithmetic computation.',
  maxIterations: 5,
});

const startMs = Date.now();
const userInput = '用 calculator 工具计算 1+2*3 的结果';
console.log(`[calculator-agent] user input: ${userInput}`);

const finalAnswer = await agent.run(userInput);
const elapsedMs = Date.now() - startMs;

console.log(`[calculator-agent] final answer: ${finalAnswer}`);
console.log(`[calculator-agent] elapsedMs=${elapsedMs}`);

// Verify correctness
const expected = 7; // 1 + 2 * 3 = 7
if (finalAnswer.includes(String(expected))) {
  console.log('[calculator-agent] ✓ result contains expected value 7');
} else {
  console.error(`[calculator-agent] ✗ result does not contain ${expected}`);
  process.exit(1);
}
```

- [ ] **Step 1: Create the file** with Write tool

- [ ] **Step 2: Run the demo end-to-end**

Run: `pnpm exec tsx examples/day04/ex_001_calculator_agent.ts`

Expected: 
- Demo completes without throw
- Final answer contains "7" (the result of 1+2*3)
- Verification log shows ✓

**Verification gate (must pass before commit):**
- Agent.run completes (no throw)
- Calculator result correct (final answer contains "7")
- The demo took at least 1 second (real LLM call)

If the LLM doesn't call calculator tool (returns content directly with wrong answer), that's a failure — investigate whether the prompt is being followed. If the API fails or auth fails, BLOCKED.

- [ ] **Step 3: Commit**

```bash
git -c core.autocrlf=false add examples/day04/ex_001_calculator_agent.ts
git -c core.autocrlf=false commit -m "feat(day04): add CalculatorTool + Agent end-to-end demo" \
  -m "Day 04 ex_001: Agent + CalculatorTool 端到端验证。" \
  -m "" -m "调用方代码 (0 业务逻辑代码):" \
  -m "  1. new OpenAIChatClient({...})" \
  -m "  2. new ToolRegistry().register(calculatorTool)" \
  -m "  3. new Agent({chat, tools, systemPrompt, maxIterations})" \
  -m "  4. await agent.run(userInput)" \
  -m "" -m "Demo 预期:" \
  -m "- user input: '用 calculator 工具计算 1+2*3 的结果'" \
  -m "- agent 调 calculator tool, 拿到 result=7" \
  -m "- 返回最终回答 (含 7)" \
  -m "" -m "对比 Day 03 ex_001:" \
  -m "- ex_001 (Day 03): client.stream() 流式打印, 单轮" \
  -m "- ex_001 (Day 04): agent.run() 多轮 Agent Loop, 可能调工具"
```

Expected: lint-staged + commitlint pass.

---

### Task 8: Quality gate + Day 02/03 backward-compat verification

**Files:** none modified (unless fixes needed)

- [ ] **Step 1: Run full quality gate**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected: all exit 0.

- [ ] **Step 2: Verify Day 02 + Day 03 demos still pass**

```bash
pnpm exec tsx examples/day02/ex_001_chat_client.ts
pnpm exec tsx examples/day02/ex_002_anthropic_chat_client.ts
pnpm exec tsx examples/day03/ex_001_openai_stream.ts
pnpm exec tsx examples/day03/ex_002_anthropic_stream.ts
```

Expected: all 4 produce real LLM responses. Day 02/03 contracts preserved (chat/stream/setModel unchanged).

- [ ] **Step 3: Run Day 04 demo one more time**

```bash
pnpm exec tsx examples/day04/ex_001_calculator_agent.ts
```

Expected: completes with "result contains 7" ✓.

- [ ] **Step 4: Print git log + commit (only if fixes needed)**

```bash
git log --oneline -12
```

If all gates pass, do NOT commit. If fixes needed, commit with `chore(day04): fix lint/format`.

---

### Task 9: Write Day 04 daily note

**Files:**
- Create: `docs/daily/day04.md`

**Implementation:**

Read `docs/daily/day02.md` and `docs/daily/day03.md` for structure template. Day 04 note should have:

1. **今日目标** — list the Day 04 goals (interface add, two providers, tools layer, agent layer, calculator demo, no breaking changes)
2. **今日产出物** — file tree showing new libs/tools + libs/agent + 1 demo + 1 daily note + spec/plan
3. **关键命令速查** — Day 04 demos + quality gates
4. **知识点** (8 subsections matching Day 02/03 depth):
   1. ChatClient 接口的 additive 演化再演一次（chat/stream/chatWithTools 三代）
   2. Message optional 字段 vs 判别联合 —— 为什么 Day 04 仍不加判别
   3. Tool 接口设计：execute 签名 + JSON Schema parameters
   4. ToolRegistry：集中 provider-format 转换
   5. Agent Loop 算法：状态机视角
   6. ChatResponse 判别联合：content / tool_calls 二选一
   7. OpenAI vs Anthropic 工具调用协议差异消化（4 维度：tools 参数 / 响应解析 / 消息回传 / finish 信号）
   8. CalculatorTool 自写 expression parser —— 安全性 + YAGNI 纪律
5. **思考题** (6-8 questions)
6. **踩坑** — Day 04 实际遇到的（write after implementing）
7. **验收清单** — all 17+ items checked
8. **Day 04 实施回顾** (SDD workflow notes)
9. **Day 05 预告** — 3 candidates (e.g., AbortSignal / streaming tool / parallel tool)

- [ ] **Step 1: Read Day 02/03 notes** for structure

- [ ] **Step 2: Write Day 04 note** with Write tool

- [ ] **Step 3: Verify format**

Run: `pnpm format:check`

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git -c core.autocrlf=false add docs/daily/day04.md
git -c core.autocrlf=false commit -m "docs(day04): add daily learning note" \
  -m "Day 04 学习笔记: 知识点 / 思考题 / 验收清单 / Day 05 预告。" \
  -m "与 Day 02/03 笔记风格对齐。"
```

Expected: lint-staged clean. Commitlint pass.

---

### Task 10 (NEW per user request): Day 04 summary commit

Mirrors Day 02's `100b71c` / Day 03's `be5e07b` pattern — refine the daily note with content that emerged after Task 9 wrote it (actual commit SHAs, SDD workflow retrospective, verified demo numbers, etc.).

**Files:**
- Modify: `docs/daily/day04.md` (add post-Task-9 content)

- [ ] **Step 1: Read Day 04 note + reports + git log** to know what to add

- [ ] **Step 2: Apply additions** using Edit tool (commit table, YAGNI retrospective, Day 05 refinement, cross-link section)

- [ ] **Step 3: Verify + commit**

```bash
pnpm format:check
git -c core.autocrlf=false add docs/daily/day04.md
git -c core.autocrlf=false commit -m "docs(day04): sync daily note with full Day 04 artifacts" \
  -m "Day 04 总结 commit: 加 commit 表 / YAGNI retrospective / Day 05 refinement / cross-link section。"
```

---

## Self-Review (plan ↔ spec coverage)

### Spec section ↔ Task mapping

| Spec Section | Covered by Task |
|---|---|
| §2.1 必须做 13 项 | Tasks 1, 2, 3, 4, 5, 6, 7 (all 13) |
| §2.2 YAGNI 8 项 | All in Global Constraints; tasks explicitly don't implement them |
| §3.1 分层 | Task 1 (tools), Task 6 (agent), Tasks 3-5 (llm extension) |
| §3.2 调用关系图 | Tasks 4, 5, 6 (implement the boxes in the diagram) |
| §4.1 Tool / ToolParameters | Task 1 |
| §4.2 ToolRegistry | Task 1 |
| §4.3 CalculatorTool + parser | Task 1 |
| §4.4 ToolCallData / ChatResponse (libs/llm/tool-call.ts) | Task 2 |
| §4.5 Message optional fields | Task 2 |
| §4.6 ChatClient interface | Task 3 |
| §4.7 Agent class | Task 6 |
| §4.8 Provider implementations | Tasks 4 (OpenAI), 5 (Anthropic) |
| §5 Agent Loop algorithm | Task 6 |
| §6 Demo | Task 7 |
| §7 文件改动清单 | Tasks 1-7, 9 |
| §8 验收清单 | Task 8 (gate verification) |
| §10 开放问题 | Tasks don't implement; spec document references for future days |

### Placeholder scan

- No "TBD" / "TODO" in steps (TODOs in code headers are intentional future-day markers).
- All code blocks complete; no "similar to Task N" placeholders.
- Demo verification gate explicitly stated.

### Type consistency

- `ToolCallData` defined in `libs/llm/tool-call.ts`, used by:
  - `libs/llm/message.ts` (Message.toolCalls field)
  - `libs/llm/openai-chat-client.ts` (chatWithTools return)
  - `libs/llm/anthropic-chat-client.ts` (chatWithTools return)
  - `libs/agent/types.ts` (re-export)
  - `libs/agent/agent-loop.ts` (consumed)
- `ChatResponse` defined in `libs/llm/tool-call.ts`, used by:
  - `ChatClient.chatWithTools()` return type
  - Provider implementations' return
- `ToolDefinition` defined in `libs/llm/tool-call.ts`, used by:
  - `ChatClient.chatWithTools()` parameter type
  - `ToolRegistry.toProviderTools()` return type

### Gap found during self-review

Initially forgot the layering issue (ToolCallData in libs/agent would be a downward dependency from libs/llm). Caught and fixed in spec §4.4 — ToolCallData/ChatResponse/ToolDefinition moved to libs/llm/tool-call.ts.

---

## Execution Handoff

Plan complete. Recommend Subagent-Driven execution since each task is well-bounded and benefits from a fresh context window. Tasks 1, 2, 3 are foundational (set up types/interfaces); Tasks 4, 5 parallel-implementable (OpenAI + Anthropic providers); Task 6 composes the agent layer; Task 7 verifies end-to-end; Task 8 gates; Task 9 documents; Task 10 summarizes.

Per the spec, no tests written today — verification via Day 04 demo + Day 02/03 backward-compat demos.