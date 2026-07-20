# Day 03 — ChatClient Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `stream(messages): AsyncIterable<string>` to `ChatClient` interface, implement on both `OpenAIChatClient` and `AnthropicChatClient`, and verify end-to-end with two CLI demos that show progressive character output.

**Architecture:** Additive change — extend `ChatClient` interface with a new `stream()` method. Both provider implementations use `async function*` syntax internally (returns `AsyncGenerator<string>` which is assignable to `AsyncIterable<string>`). Anthropic implementation filters SDK event stream to yield only `text_delta` events. Verification runs real LLM demos (no unit tests today — spec decision, deferred).

**Tech Stack:** TypeScript 5.7 + Node 22 + OpenAI SDK 6.47 + Anthropic SDK 0.111 + tsx + vitest + eslint + prettier + commitlint + pnpm 11.6.

## Global Constraints

From the spec, these apply to every task:

- **No breaking changes** to Day 02 contracts. `chat()` return type stays `Promise<string>`.
- **`stream()` returns `AsyncIterable<string>`** — not `AsyncGenerator<string>` (interface layer).
- **Implementation uses `async function*`** — returns `AsyncGenerator<string, void, undefined>` (subtype satisfies interface).
- **Anthropic implementation filters events** — only `content_block_delta` + `text_delta` events are yielded.
- **OpenAI implementation skips null deltas** — `if (delta) yield delta;` (start/end chunks have `null` content).
- **chunk = pure text delta** — never expose SDK raw events to caller.
- **No HTTP/SSE/Vue/express/fastify** — libs/llm stays Node-side only (CLAUDE.md Day 02 §9 宿主原则).
- **No unit tests today** — verification via running real LLM demos.
- **No AbortSignal / cancellation** — YAGNI, future TODO.
- **All file changes preserve existing code** — additive commits only.
- **TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes** — these flags are on, defensive coding required.
- **`exactOptionalPropertyTypes` rule**: optional fields (`baseURL`, `maxTokens`) must use conditional spread pattern (`...(value !== undefined ? { field: value } : {})`), never `field: undefined`.
- **Commit message format**: `feat(day03): ...` / `docs(day03): ...` etc. with commitlint-friendly line wrapping (≤100 chars per line). Use multiple `-m` flags, not heredoc.
- **Demo files must be runnable** via `pnpm exec tsx examples/day03/<file>.ts`.
- **Env vars**: Read from `.env` via `import 'dotenv/config'`. Required vars throw explicit errors.

## File Structure

```
libs/llm/
  chat-client.ts                    MODIFIED — add stream() to interface
  openai-chat-client.ts             MODIFIED — add async *stream() impl
  anthropic-chat-client.ts          MODIFIED — add async *stream() impl with event filtering
  message.ts                        unchanged
  index.ts                          unchanged

examples/day03/
  ex_001_openai_stream.ts           NEW — OpenAI streaming demo (CLI progressive print)
  ex_002_anthropic_stream.ts        NEW — Anthropic streaming demo (CLI progressive print)

docs/daily/day03.md                 NEW — Day 03 learning note
```

**Decomposition rationale:**
- `chat-client.ts` keeps its single responsibility (the contract) — only the interface grows, no implementation detail leaks.
- Each provider file is owned by one provider's SDK details. Anthropic's event filtering is purely internal — the interface stays opaque.
- Demos live under `examples/day03/` matching Day 02's `examples/day02/` pattern.

---

### Task 1: Add `stream()` to ChatClient interface

**Files:**
- Modify: `libs/llm/chat-client.ts` (entire file rewrite via Write tool — Edit may have CRLF issues per Day 02 笔记 §踩坑1)

**Interfaces:**
- Consumes: nothing new
- Produces: `stream(messages: Message[]): AsyncIterable<string>` method on `ChatClient` interface

**Implementation content (replace the whole file):**

```ts
/**
 * libs/llm/chat-client.ts
 *
 * ChatClient 抽象层的最小契约 —— libs/llm 的中心接口定义。
 *
 * 契约：
 *   chat(messages): 一次对话，传入历史，拿到 assistant 回复（string）。
 *   stream(messages): 流式对话，传入历史，逐 chunk yield 文本增量（AsyncIterable<string>）。
 *   setModel(model): 运行时切换模型（可选 set；如果不需要切换，可忽略）。
 *
 * Day 02 c851ad8 commit 时跟 OpenAI 实现共占 chat-client.ts。
 * Day 02 延展加 AnthropicChatClient 后，OpenAI 实现拆到 openai-chat-client.ts，
 * 本文件只保留契约 —— 每个 provider 一个对称文件的命名 pattern 由此立下。
 *
 * 设计取舍（对应 Day 02 Review 决策）：
 * - chat 返回 string 而非结构化 response：ChatClient 最克制的契约；
 *   usage / finish_reason / refusal 都不在基础范围里，需要时再升级。
 * - setModel 失败语义保持 void：模型无效由底层 SDK 抛 validation error，
 *   ChatClient 层不接管校验。
 *
 * Day 03 加 stream() —— additive 增强（不改 chat() 契约）：
 * - 返回 AsyncIterable<string>（不是 AsyncGenerator）= 接口层只承诺可被 for await 消费，
 *   不锁定实现策略。Provider 实现可以用 async function*（AsyncGenerator 是子类型）。
 * - chunk = 纯文本增量，不暴露 SDK 原始事件（Anthropic 事件流在 provider 内过滤）。
 * - 取消 / AbortSignal / 结构化事件 chunk 都不在 Day 03 范围，留 TODO。
 *
 * provider 实现目录：
 * - libs/llm/openai-chat-client.ts       —— OpenAI 兼容协议（含 stream）
 * - libs/llm/anthropic-chat-client.ts    —— Anthropic Messages API（含 stream + 事件过滤）
 * - 未来新 provider：libs/llm/<name>-chat-client.ts，implements ChatClient，
 *   复用 libs/llm/message.ts
 */

import type { Message } from './message.js';

export interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;
  setModel(model: string): void;
}
```

- [ ] **Step 1: Replace the file with Write tool**

Use Write tool to overwrite `libs/llm/chat-client.ts` with the content above (preserve existing 头注释 style + add new section explaining stream design choices).

- [ ] **Step 2: Verify typecheck**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm typecheck`

Expected: exit 0, "0 errors". The new `stream()` method is declared on the interface but not yet implemented on either class — typecheck should still pass because we're only adding a new method to the interface (existing `implements ChatClient` classes are valid as long as they satisfy the contract; missing method would be caught when providers are compiled).

- [ ] **Step 3: Commit**

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp
git -c core.autocrlf=false add libs/llm/chat-client.ts
git -c core.autocrlf=false commit -m "feat(day03): add stream() to ChatClient interface" \
  -m "Day 03 additive change: ChatClient 加 stream(messages): AsyncIterable<string>" \
  -m "method。" \
  -m "" \
  -m "为什么不改 chat() 返回类型:" \
  -m "- Day 02 chat() 返回 Promise<string> 的契约不动" \
  -m "- 新增 stream() = for-await 消费的并行入口" \
  -m "- 调用方按场景选 chat() 或 stream(), 互不干扰" \
  -m "" \
  -m "为什么 AsyncIterable 不是 AsyncGenerator:" \
  -m "- 接口层只承诺可 for-await, 不锁实现策略" \
  -m "- 未来 provider 包第三方 AsyncIterable 不会被挡路" \
  -m "- 实现侧用 async function* (AsyncGenerator 是子类型)" \
  -m "" \
  -m "Day 03 不实现 (留 TODO 写进头注释):" \
  -m "- AbortSignal 取消 / 单测 / HTTP/SSE / Vue"
```

Expected: lint-staged runs prettier + eslint on `libs/llm/chat-client.ts` and exits 0. Commit message passes commitlint (subject ≤72 chars, body lines ≤100 chars).

---

### Task 2: Implement `OpenAIChatClient.stream()`

**Files:**
- Modify: `libs/llm/openai-chat-client.ts` (add `async *stream()` method, update 头注释)

**Interfaces:**
- Consumes: `ChatClient` interface (from Task 1) — `stream()` method now required
- Produces: `OpenAIChatClient.stream()` returns `AsyncGenerator<string, void, undefined>` (assignable to `AsyncIterable<string>`)

**Replace the entire file content:**

```ts
/**
 * libs/llm/openai-chat-client.ts
 *
 * ChatClient 接口（libs/llm/chat-client.ts）的 OpenAI 兼容协议实现。
 *
 * 设计取舍（沿用 Day 02 c851ad8 commit 的 Review 决策）：
 * - chat 返回 string 而非结构化 response：ChatClient 层最克制的契约。
 * - setModel 失败语义保持 void：模型无效由底层 SDK 抛 validation error。
 * - 构造函数对象传参：3 个配置项 + 1 个可选 future-proof，对象比位置参数更可扩展。
 * - 空 content 返回 ''：保留"原本是空"的信号给调用方，不静默吞掉。
 *
 * 多 provider 形态（c851ad8 时只有一个，Day 02 延展后加 Anthropic）：
 * - ChatClient interface：libs/llm/chat-client.ts
 * - OpenAI provider：本文件
 * - Anthropic provider：libs/llm/anthropic-chat-client.ts
 *
 * Day 03 加 stream() —— additive 实现：
 * - async function* stream() 返回 AsyncGenerator<string>（满足 AsyncIterable<string> 契约）
 * - 用 OpenAI SDK 的 stream: true 路径
 * - 跳过 delta.content 为 null 的 chunk（stream 开头 / 结尾事件常见）
 * - 一次性拿到 delta.content 就 yield，不缓存、不聚合
 *
 * TODO（按 CLAUDE.md "Progressive Design — Leave TODO"）：
 * - 单测覆盖（README 强制）：smoke + mock 调用，Day 03 不做（spec 决策）。
 * - AbortSignal 取消：stream() 不支持（YAGNI），未来 day 加。
 * - tool_use / structured output：不在前期范围。
 *
 * 注：本文件 c851ad8 时叫 chat-client.ts（含 ChatClient interface）。
 *     Day 02 延展加 AnthropicChatClient 后被拆分 —— rename + 拆分见
 *     Day 02 延展 commit。
 */

import OpenAI from 'openai';

import type { ChatClient } from './chat-client.js';
import type { Message } from './message.js';

export interface OpenAIChatClientOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly model: string;
}

export class OpenAIChatClient implements ChatClient {
  private readonly client: OpenAI;
  private model: string;

  constructor(options: OpenAIChatClientOptions) {
    // exactOptionalPropertyTypes 下不能用 baseURL: undefined；
    // 可选字段存在才注入，否则交给 OpenAI SDK 用默认 baseURL。
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    });
    this.model = options.model;
  }

  async chat(messages: Message[]): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
    });
    // OpenAI SDK 的返回类型对 strict + noUncheckedIndexedAccess 比较宽；
    // 这里用 ?? 把"原本是空"显式暴露给调用方。
    return completion.choices[0]?.message?.content ?? '';
  }

  async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      stream: true,
    });
    for await (const chunk of stream) {
      // OpenAI stream 的首尾 chunk 通常 delta.content = null（role-only 或 finish_reason），
      // 跳过这些 chunk，只 yield 真实的文本增量。
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  setModel(model: string): void {
    this.model = model;
  }
}
```

- [ ] **Step 1: Replace the file with Write tool**

Use Write tool to overwrite `libs/llm/openai-chat-client.ts` with the content above.

- [ ] **Step 2: Verify typecheck**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm typecheck`

Expected: exit 0. The OpenAI SDK's `Stream<ChatCompletionChunk>` should be iterable via `for await`. If `chunk.choices[0]?.delta?.content` typing complains, check that the OpenAI SDK type definitions expose `delta.content: string | null`.

- [ ] **Step 3: Verify lint**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm lint`

Expected: exit 0, 0 errors.

- [ ] **Step 4: Commit**

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp
git -c core.autocrlf=false add libs/llm/openai-chat-client.ts
git -c core.autocrlf=false commit -m "feat(day03): add OpenAIChatClient.stream() implementation" \
  -m "OpenAI 流式实现: 用 SDK stream: true 路径, async function* yield" \
  -m "delta.content。null delta (stream 首尾事件) 跳过。" \
  -m "" \
  -m "契约一致性:" \
  -m "- 接口层 ChatClient.stream(): AsyncIterable<string>" \
  -m "- 实现层 AsyncGenerator<string, void, undefined> (子类型满足)" \
  -m "- chunk = 纯文本增量, 不暴露 SDK 内部细节"
```

Expected: lint-staged runs prettier + eslint, exits 0. Commitlint passes.

---

### Task 3: Create OpenAI streaming demo

**Files:**
- Create: `examples/day03/ex_001_openai_stream.ts`

**Implementation content:**

```ts
/**
 * examples/day03/ex_001_openai_stream.ts
 *
 * Day 03 示例：用 libs/llm 里的 OpenAIChatClient 跑一次流式对话。
 *
 * 今天的例子里我们能学到的：
 *   1. ChatClient.stream() 在 OpenAI 兼容协议下走 SDK 的 stream: true 路径。
 *   2. 调用方用 for await 逐 chunk 消费 —— 这里 process.stdout.write 不换行，
 *      让字符"流"式打印出来，区别于 chat() 一次性打印完整字符串。
 *   3. 累计 chunk 数 + 总耗时 log，便于肉眼区分"真流式"与"快速 batch"。
 *
 * 对比 examples/day02/ex_001_chat_client.ts：
 *   旧 demo 用 client.chat(...) 等字符串一次性返回。
 *   新 demo 用 client.stream(...) 逐 chunk 处理 —— 是 Day 03 课题的端到端验证。
 *
 * 用法：
 *   复制 .env.example 到 .env，填入 OPENAI_API_KEY
 *   pnpm exec tsx examples/day03/ex_001_openai_stream.ts
 */

import 'dotenv/config';

import { OpenAIChatClient } from '../../libs/llm/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.MODEL_NAME ?? 'ai-coding';

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required (set in .env or shell env)');
}

console.log(`[openai-stream] baseURL=${baseURL}`);
console.log(`[openai-stream] model=${model}`);
console.log('[openai-stream] sending request...');

const client = new OpenAIChatClient({ apiKey, baseURL, model });

const startMs = Date.now();
let chunkCount = 0;
let totalChars = 0;

console.log('[openai-stream] reply:');
for await (const chunk of client.stream([
  { role: 'system', content: '你是个刺猬。' },
  { role: 'user', content: '用三句话介绍你自己，每句话末尾加一个表情。' },
])) {
  chunkCount += 1;
  totalChars += chunk.length;
  process.stdout.write(chunk);
}

const elapsedMs = Date.now() - startMs;
console.log(`\n[openai-stream] done. chunks=${chunkCount} chars=${totalChars} elapsedMs=${elapsedMs}`);
```

- [ ] **Step 1: Create the file with Write tool**

Create `examples/day03/ex_001_openai_stream.ts` with the content above.

- [ ] **Step 2: Run the demo end-to-end**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm exec tsx examples/day03/ex_001_openai_stream.ts`

Expected: see three sentences appear progressively (not all at once). The final log line shows `chunks=N` where N ≥ 3 (typically 10-50 depending on model output length), `chars>0`, and `elapsedMs` showing non-zero duration.

**Verification gate (must pass before commit)**:
- Reply appears character-by-character (or in small chunks with visible delays), NOT as one big string dump.
- If you see `[openai-stream] reply:` followed by the full reply printed instantly with no perceptible streaming → streaming is broken. Investigate before committing.

- [ ] **Step 3: Commit**

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp
git -c core.autocrlf=false add examples/day03/ex_001_openai_stream.ts
git -c core.autocrlf=false commit -m "feat(day03): add OpenAI streaming demo" \
  -m "Day 03 ex_001: 端到端验证 OpenAIChatClient.stream() 真发请求" \
  -m "输出字符逐步打印。chunks/chars/elapsedMs log 便于区分" \
  -m "真流式 vs 快速 batch。" \
  -m "" \
  -m "对比 Day 02 ex_001:" \
  -m "- ex_001 (Day 02): client.chat() 等完整字符串" \
  -m "- ex_001 (Day 03): client.stream() 逐 chunk 打印" \
  -m "- 调用方代码差异: await → for await, 0 break"
```

Expected: lint-staged runs prettier + eslint, exits 0. Commitlint passes.

---

### Task 4: Implement `AnthropicChatClient.stream()`

**Files:**
- Modify: `libs/llm/anthropic-chat-client.ts` (add `async *stream()` method with event filtering, update 头注释)

**Interfaces:**
- Consumes: `ChatClient` interface (from Task 1) — `stream()` method now required
- Produces: `AnthropicChatClient.stream()` returns `AsyncGenerator<string, void, undefined>` (assignable to `AsyncIterable<string>`)

**Replace the entire file content:**

```ts
/**
 * libs/llm/anthropic-chat-client.ts
 *
 * ChatClient 接口的第二个 provider —— Anthropic Messages API 实现。
 *
 * 课题 = 验证 ChatClient 接口在多 provider 下仍然稳定。
 *
 * Anthropic Messages API 与 Chat Completions API 三个关键差异，本文件消化：
 *   1. system 不在 messages 里，是顶层字段
 *   2. content 是 blocks 数组（{ type: 'text', text: ... }），不是 string
 *   3. max_tokens 强制要求（本文件提供 1024 兜底）
 *
 * 业务方代码（`client.chat([...])`）与 OpenAIChatClient 完全一致 —— 这是
 * ChatClient 抽象层的核心价值兑现。
 *
 * Day 02 commit c851ad8 (OpenAI provider) 落地时已经在头注释里写了 Day 03
 * 的 AnthropicChatClient 设计路径。这份文件 = 把那条 TODO 实装起来。
 *
 * Day 03 加 stream() —— Anthropic SDK 的特殊形态：
 *   client.messages.stream() 返回 MessageStream（implements AsyncIterable<MessageStreamEvent>）。
 *   事件是判别联合，包括 message_start / content_block_start /
 *   content_block_delta / content_block_stop / message_delta / message_stop。
 *
 *   ChatClient.stream() 契约要求只 yield 文本增量（string），所以本文件内部：
 *   - 只在 event.type === 'content_block_delta' && event.delta.type === 'text_delta'
 *     时 yield event.delta.text
 *   - 其它所有事件类型全部跳过（调用方看不到协议细节）
 *
 * 注意：调用方应通过环境变量提供 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL /
 * ANTHROPIC_MODEL，永远不要硬编码到任何源文件。
 */

import Anthropic from '@anthropic-ai/sdk';

import type { Message } from './message.js';
import type { ChatClient } from './chat-client.js';

export interface AnthropicChatClientOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly model: string;
  readonly maxTokens?: number;
}

export class AnthropicChatClient implements ChatClient {
  private readonly client: Anthropic;
  private model: string;
  private readonly maxTokens: number;

  constructor(options: AnthropicChatClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 1024;
  }

  async chat(messages: Message[]): Promise<string> {
    // (1) system 从 messages 抽到顶层字段
    let systemPrompt: string | undefined;
    const convoMessages = messages.flatMap((m) => {
      if (m.role === 'system') {
        systemPrompt = m.content;
        return [];
      }
      return [m];
    });

    // (2) content string → [{type:'text', text}] blocks
    const apiMessages = convoMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: [{ type: 'text' as const, text: m.content }],
    }));

    // (3) 调 Messages API
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      ...(systemPrompt !== undefined ? { system: systemPrompt } : {}),
      messages: apiMessages,
    });

    // 提取首个 text block 的 text（response.content 是 ContentBlock[]）
    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return '';
  }

  async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
    // (1) system 从 messages 抽到顶层字段（与 chat() 同样的协议适配）
    let systemPrompt: string | undefined;
    const convoMessages = messages.flatMap((m) => {
      if (m.role === 'system') {
        systemPrompt = m.content;
        return [];
      }
      return [m];
    });

    // (2) content string → [{type:'text', text}] blocks（与 chat() 同样的协议适配）
    const apiMessages = convoMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: [{ type: 'text' as const, text: m.content }],
    }));

    // (3) 启动 Anthropic 流。MessageStream implements AsyncIterable<MessageStreamEvent>。
    // MessageStreamEvent 是判别联合（RawMessageStreamEvent）：
    //   - 'message_start' / 'content_block_start' / 'content_block_stop' /
    //     'message_delta' / 'message_stop' —— 框架/元信息事件，跳过
    //   - 'content_block_delta' —— 携带 delta: RawContentBlockDelta
    //       RawContentBlockDelta 也是判别联合：
    //         - TextDelta       (type: 'text_delta')        —— yield event.delta.text
    //         - InputJSONDelta  (type: 'input_json_delta')  —— 跳过（未来 tool_use）
    //         - CitationsDelta  (type: 'citations_delta')    —— 跳过
    //         - ThinkingDelta   (type: 'thinking_delta')     —— 跳过
    //         - SignatureDelta  (type: 'signature_delta')    —— 跳过
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      ...(systemPrompt !== undefined ? { system: systemPrompt } : {}),
      messages: apiMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }

  setModel(model: string): void {
    this.model = model;
  }
}
```

- [ ] **Step 1: Replace the file with Write tool**

Use Write tool to overwrite `libs/llm/anthropic-chat-client.ts` with the content above.

- [ ] **Step 2: Verify typecheck**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm typecheck`

Expected: exit 0. If TypeScript complains about `event.delta.type` narrowing, check that the Anthropic SDK's `RawContentBlockDelta` discriminant uses string literal types correctly. The pattern `event.type === 'content_block_delta' && event.delta.type === 'text_delta'` should narrow `event.delta` to `TextDelta` automatically.

- [ ] **Step 3: Verify lint**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm lint`

Expected: exit 0, 0 errors.

- [ ] **Step 4: Commit**

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp
git -c core.autocrlf=false add libs/llm/anthropic-chat-client.ts
git -c core.autocrlf=false commit -m "feat(day03): add AnthropicChatClient.stream() implementation" \
  -m "Anthropic 流式实现: 用 client.messages.stream() 路径, async" \
  -m "function* yield TextDelta.text。" \
  -m "" \
  -m "事件过滤 (协议隐藏):" \
  -m "- 只 yield content_block_delta + text_delta" \
  -m "- 跳过 message_start / content_block_start /" \
  -m "  content_block_stop / message_delta / message_stop" \
  -m "- 跳过 content_block_delta 下其它 delta type" \
  -m "  (input_json_delta / citations_delta / thinking_delta / signature_delta)" \
  -m "" \
  -m "调用方契约: 只看到纯文本增量, 永远看不到 Anthropic 协议事件"
```

Expected: lint-staged runs prettier + eslint, exits 0. Commitlint passes.

---

### Task 5: Create Anthropic streaming demo

**Files:**
- Create: `examples/day03/ex_002_anthropic_stream.ts`

**Implementation content:**

```ts
/**
 * examples/day03/ex_002_anthropic_stream.ts
 *
 * Day 03 示例：用 libs/llm 里的 AnthropicChatClient 跑一次流式对话。
 *
 * 今天的例子里我们能学到的：
 *   1. ChatClient.stream() 在 Anthropic 协议下走 messages.stream() 路径。
 *   2. 内部过滤 RawMessageStreamEvent 判别联合 —— 调用方只看到纯文本增量，
 *      看不到 message_start / content_block_start 等框架事件。
 *   3. 调用代码与 OpenAI 流式 demo 完全一致（都是 for await + stdout.write），
 *      多 provider 一致性兑现。
 *
 * 对比 examples/day03/ex_001_openai_stream.ts：
 *   两个 demo 调用代码 0 行差异。Provider 差异封装在 class 里，
 *   ChatClient 抽象层的核心价值兑现。
 *
 * 用法：
 *   1. 在 .env 里填入 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL
 *   2. pnpm exec tsx examples/day03/ex_002_anthropic_stream.ts
 */

import 'dotenv/config';

import { AnthropicChatClient } from '../../libs/llm/index.js';

const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
const baseURL = process.env.ANTHROPIC_BASE_URL;
const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-...';

if (!apiKey) {
  throw new Error('ANTHROPIC_AUTH_TOKEN is required (set in .env)');
}
if (!baseURL) {
  throw new Error('ANTHROPIC_BASE_URL is required (set in .env)');
}

console.log(`[anthropic-stream] baseURL=${baseURL}`);
console.log(`[anthropic-stream] model=${model}`);
console.log('[anthropic-stream] sending request...');

const client = new AnthropicChatClient({ apiKey, baseURL, model });

const startMs = Date.now();
let chunkCount = 0;
let totalChars = 0;

console.log('[anthropic-stream] reply:');
for await (const chunk of client.stream([
  { role: 'system', content: '你是个刺猬.' },
  { role: 'user', content: '用三句话介绍你自己，每句话末尾加一个表情。' },
])) {
  chunkCount += 1;
  totalChars += chunk.length;
  process.stdout.write(chunk);
}

const elapsedMs = Date.now() - startMs;
console.log(`\n[anthropic-stream] done. chunks=${chunkCount} chars=${totalChars} elapsedMs=${elapsedMs}`);
```

- [ ] **Step 1: Create the file with Write tool**

Create `examples/day03/ex_002_anthropic_stream.ts` with the content above.

- [ ] **Step 2: Run the demo end-to-end**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm exec tsx examples/day03/ex_002_anthropic_stream.ts`

Expected: see three sentences appear progressively. Final log line shows `chunks=N chars>0 elapsedMs>0`.

**Verification gate (must pass before commit)**:
- Reply appears character-by-character (small chunks with visible delays).
- If reply prints instantly → streaming broken. Investigate.

- [ ] **Step 3: Commit**

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp
git -c core.autocrlf=false add examples/day03/ex_002_anthropic_stream.ts
git -c core.autocrlf=false commit -m "feat(day03): add Anthropic streaming demo" \
  -m "Day 03 ex_002: 端到端验证 AnthropicChatClient.stream() 真发请求。" \
  -m "调用代码与 ex_001 (OpenAI) 0 行差异, 多 provider 一致性兑现。"
```

Expected: lint-staged runs prettier + eslint, exits 0. Commitlint passes.

---

### Task 6: Full quality gate + Day 02 backward-compat verification

**Files:** none modified (unless issues found)

- [ ] **Step 1: Run full quality gate**

Run all four checks back-to-back:

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp

pnpm typecheck
# Expected: exit 0, 0 errors

pnpm lint
# Expected: exit 0, 0 errors

pnpm format:check
# Expected: exit 0, "All matched files use Prettier code style!"

pnpm test
# Expected: exit 0, "3/3 passed" or similar (Day 02 baseline)
```

If any check fails, fix the issue (likely a Prettier formatting issue from manual file creation, or a type narrowing issue from Anthropic SDK types) and re-run from the top.

- [ ] **Step 2: Verify Day 02 demos still pass (backward-compat)**

Run both Day 02 demos to confirm `chat()` behavior is unchanged:

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp

pnpm exec tsx examples/day02/ex_001_chat_client.ts
# Expected: chat() returns full string, prints once. No regression.

pnpm exec tsx examples/day02/ex_002_anthropic_chat_client.ts
# Expected: chat() returns full string, prints once. No regression.
```

**Verification gate**: Both demos complete with their original LLM response (no breaking changes). If either errors or produces empty output, investigate the implementation — additive change should not affect chat() path.

- [ ] **Step 3: Final verification log**

Print the commit log to confirm Day 03 history is clean:

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp
git log --oneline -10
```

Expected output (approximate, dates may vary):
```
122b5c1 docs(day03): spec self-review fixes
471469c docs(day03): add streaming design spec
<new commits from Tasks 1-5>
<Day 02 commits>
```

- [ ] **Step 4: Commit (only if any formatting/lint fixes were needed)**

If Steps 1-2 required fixes, commit them with `chore(day03): fix lint/format` message. Otherwise this task produces no commit.

---

### Task 7: Write Day 03 daily note

**Files:**
- Create: `docs/daily/day03.md`

**Implementation content:**

Use the existing `docs/daily/day02.md` as a template (read it first to match the section structure: 今日目标 / 今日产出物 / 关键命令 / 知识点 / 思考题 / 踩坑 / 验收清单 / 附录).

The note should cover:
1. **今日目标** — list the 7-8 verifiable goals (interface add, two impls, two demos, no regressions, quality gate)
2. **今日产出物** — file tree showing 3 new + 3 modified files
3. **关键命令** — same as Day 02 quality gate commands
4. **知识点** (most important — match Day 02's depth):
   - **AsyncIterable vs AsyncGenerator 的接口-实现分离** — why interface uses the broader type
   - **AsyncGenerator 自带 cleanup 的语义** — `iterator.return()` 在 break 时被调用, 未来 AbortSignal 留路
   - **Anthropic 事件流的协议隐藏** — 7 类事件过滤到 1 类 yield
   - **OpenAI null delta 的 skip 模式** — `if (delta) yield delta` vs `yield delta ?? ''`
   - **async function* 的 for await 内部消费** — generator 内部还能再 for await SDK stream
   - **chunk 拼接 ≈ chat() 返回的语义等价** — `[...chunks].join('') ≈ await chat()` 的契约承诺
   - **CLAUDE.md Day 02 §9 宿主原则的 streaming 兑现** — libs/llm 边界在 stream 上同样守住
5. **思考题** (5-7 questions matching Day 02's pattern):
   - stream() 的 chunk 拼接 ≈ chat() 的字符串 —— 未来加 tool_use / structured output 时等价性如何破？
   - AsyncIterable<string> 契约的 round-trip SSE 安全性 —— 浏览器侧如何反序列化？
   - generator 自带 cleanup 在 AbortSignal 场景下够用吗？
   - 多 provider 下 Anthropic 事件过滤 vs OpenAI delta 跳过，错误处理对称吗？
   - ChatClient 接口已扩到 3 个 method，未来加 tool_use / structured output 还能保住「接口最小」吗？
6. **踩坑** — if any actual issues arose during Tasks 1-6, document them
7. **验收清单** — copy from spec section 10 + mark all checked
8. **Day 04 预告** — follow Day 02's pattern (候选 1/2/3 + 推荐 + 决定保留)

- [ ] **Step 1: Read Day 02 note for template**

Run: Read `d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp/docs/daily/day02.md` to confirm section structure matches what was implemented in this task.

- [ ] **Step 2: Write Day 03 note**

Use Write tool to create `docs/daily/day03.md` with the content above.

- [ ] **Step 3: Verify it formats correctly**

Run: `cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp && pnpm format:check`

Expected: exit 0 (or fix any formatting issues and re-run).

- [ ] **Step 4: Commit**

```bash
cd d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp
git -c core.autocrlf=false add docs/daily/day03.md
git -c core.autocrlf=false commit -m "docs(day03): add daily learning note" \
  -m "Day 03 学习笔记: 知识点 / 思考题 / 验收清单 / Day 04 预告。" \
  -m "与 Day 02 笔记风格对齐 (基于已 commit 的 spec 122b5c1)。"
```

Expected: lint-staged runs prettier, exits 0. Commitlint passes.

---

## Self-Review (plan ↔ spec coverage)

I ran this check after writing the plan:

### Spec section ↔ Task mapping

| Spec Section | Covered by Task |
|---|---|
| §2.1 必须做 (5 项) | T1 (interface) / T2 (OpenAI impl) / T3 (OpenAI demo) / T4 (Anthropic impl) / T5 (Anthropic demo) |
| §3.1 接口改动 | T1 |
| §3.2 实现策略 async function* | T2 + T4 |
| §3.3 chunk 语义 (skip null delta) | T2 (注释 + 代码) + T5 (demo 验证) |
| §3.4 Anthropic 事件过滤 | T4 (代码 + 详细注释) |
| §4 数据流 | T1+T2+T4 (注释 + 数据流图对应到代码) |
| §5 错误处理 | T2+T4 (注释说明), T3+T5 (验证走通) |
| §6 Demo 设计 | T3+T5 |
| §7 多 provider 一致性 | T3+T5 (调用代码 0 行差异对照) |
| §8 Vue/HTTP/SSE 留 TODO | T1+T2+T4 (头注释明确写 TODO), spec §8 内容直接复制到 Plan global constraints |
| §9 文件改动清单 | T1-T7 完全覆盖（6 个代码文件 + 1 daily note） |
| §10 验收清单 | T6 (4 项质量门) + T3/T5 (demo 跑通) + T6 step 2 (backward-compat) |

### Placeholder scan

- No "TBD" / "TODO" in any step (the TODO references in 头注释 are intentional, part of the spec).
- No "implement later" / "fill in details" / "similar to Task N" — every code block is complete.
- Demo code is fully shown, not pseudo-code.

### Type consistency

- `ChatClient.stream(messages: Message[]): AsyncIterable<string>` defined in T1, used by T2 + T4 implementations.
- T2 returns `AsyncGenerator<string, void, undefined>` — confirmed assignable to `AsyncIterable<string>` per TypeScript's generator-iterable relationship.
- T4 same shape — symmetric with T2.
- Demo files (T3, T5) call `client.stream(msgs)` and iterate via `for await (const chunk of ...)` — consistent with the contract.

### Gap found & fixed during self-review

Initially I had Step 2 of Task 3 say "verify typecheck" — but Task 3 (demo file) doesn't touch any code that typecheck would care about. Changed to "run the demo end-to-end" which is the actual verification step for a demo file. Same for Task 5.

---

## Execution Handoff

Plan complete. Recommend Subagent-Driven execution since each task is well-bounded and benefits from a fresh context window. Tasks 1-2 (interface + OpenAI impl) can be one subagent or split; Task 3 (OpenAI demo) needs LLM access verification; Tasks 4-5 mirror that pattern for Anthropic; Task 6 is pure verification; Task 7 is documentation.

Per the spec, no tests are written today — verification runs through real LLM demos. Each task commits independently so reviewers can gate between tasks.