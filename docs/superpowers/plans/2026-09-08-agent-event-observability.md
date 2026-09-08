# Agent Event Observability + Edit Loop Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Step lists use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `Agent.runEvents` 在 file_read / file_edit 等 tool 执行时，额外 yield 两条可观测事件 (`tool_call_start` / `tool_call_end`)，并通过一个新 example 演示 file_read → file_edit → file_read 的完整多轮反馈闭环。

**Architecture:** 不替换既有 12 kind 的 `tool_call` / `tool_result` 事件，而是在工具执行前后各 yield 1 个新事件，让消费方得到 tool 起始 / 结束时间戳、耗时、ok 状态与当前 turn 的累计 usage 快照。所有修改收敛在 `libs/agent/{event,agent}.ts`，并通过一个 example 覆盖整套流程，不修改 `FileEditTool` 自身的 review 待修复项。

**Tech Stack:** TypeScript strict、Node.js、Vitest、pnpm workspace。

**Spec:** [docs/daily/day14.md](../daily/day14.md) §Day 15 路线预告；本计划为子系统 A 的 bounded 实现，不另写 spec 文件。

## Global Constraints

- 既有 12 kind AgentEvent 的字段、顺序、消费者契约不动；新增的 `tool_call_start` / `tool_call_end` 只能在 `tool_call` 之前与 `tool_result` 之后 yield。
- `Tool<T` schema 契约、`ToolRegistry.execute()` 校验入口、ADR 0003 保持不变。
- 不修改 [libs/tools/repo/file-edit-tool.ts](libs/tools/repo/file-edit-tool.ts)（review 5 项留待独立阶段修复）。
- 不接 SSE / 前端；不接 LangChain；不接 Retry / Reranker / Patch 格式 / 多文件批改 / 并行 tool。
- 不引入新依赖到 `apps/` / `libs/` / `package.json` 的 `dependencies`。
- 任何 commit 不触碰现有 12 kind AgentEvent 的语义（消费方零回归）。
- example 使用 `mkdtemp` 临时目录 + `finally` 清理，不修改任何真实仓库文件。

---

## 文件结构

- Modify: [libs/agent/event.ts](libs/agent/event.ts) — 在 12 kind 之后追加 2 kind，总计 14 kind。
- Modify: [libs/agent/agent.ts](libs/agent/agent.ts) — 在 `for (const tc of response.toolCalls)` 内增加 start/end yield，不动其他逻辑。
- Create: [tests/libs/agent/agent.test.ts](tests/libs/agent/agent.test.ts) — 覆盖新增事件的产出顺序、ok 语义、latencyMs 非负、tokenUsage 字段。
- Create: [examples/day15/ex_002_edit_agent.ts](examples/day15/ex_002_edit_agent.ts) — file_read → file_edit → file_read 闭环演示。
- Create: [docs/adr/0005-agent-event-tool-call-start-end.md](docs/adr/0005-agent-event-tool-call-start-end.md) — 决策记录。
- Modify: [docs/daily/day14.md](docs/daily/day14.md) — 增补段落记录新事件与 example 位置（不重开已完成路线）。

---

### Task 1: 增加 AgentEvent 判别联合的 2 个新 kind

**Files:**
- Modify: `libs/agent/event.ts:38-81`

**Interfaces:**
- Consumes: 既有 12 kind 定义。
- Produces:
  ```ts
  | { readonly kind: 'tool_call_start'; readonly id: string; readonly name: string; readonly args: unknown; readonly startedAt: number }
  | { readonly kind: 'tool_call_end'; readonly id: string; readonly name: string; readonly latencyMs: number; readonly ok: boolean; readonly tokenUsage?: { readonly promptTokens: number; readonly completionTokens: number } }
  ```

- [ ] **Step 1: 在 event.ts 第81 行（`{ kind: 'error' }` 之前）插入新 kind**

```ts
| {
    readonly kind: 'tool_call_start';
    readonly id: string;
    readonly name: string;
    readonly args: unknown;
    readonly startedAt: number;
  }
| {
    readonly kind: 'tool_call_end';
    readonly id: string;
    readonly name: string;
    readonly latencyMs: number;
    readonly ok: boolean;
    readonly tokenUsage?: {
      readonly promptTokens: number;
      readonly completionTokens: number;
    };
  }
```

保持判别联合写法风格不变（`|` 缩进与既有 12 kind 一致）。

- [ ] **Step 2: 运行 typecheck 验证类型扩展**

Run: `pnpm typecheck`

Expected: exit 0（仅类型扩展，未消费方应仍编译；切换联合后任何缺失分支会报错）。

- [ ] **Step 3: Commit**

```bash
git add libs/agent/event.ts
git commit -m "feat(agent): add tool_call_start and tool_call_end events"
```

---

### Task 2: 在 Agent.runEvents 中 yield 新事件

**Files:**
- Modify: `libs/agent/agent.ts:271-307`

**Interfaces:**
- Consumes: Task 1 新增的 2 kind；既有的 `response.toolCalls` / `totalPromptTokens` / `totalCompletionTokens`。
- Produces: 在 tool 执行流程中按 `tool_call_start → tool_call → tool_call_end → tool_result` 顺序 yield。

- [ ] **Step 1: 在 `for (const tc of response.toolCalls)` 内增加 start/end yield**

修改后该循环体等价于：

```ts
for (const tc of response.toolCalls) {
  const startedAt = Date.now();
  yield {
    kind: 'tool_call_start',
    id: tc.id,
    name: tc.toolName,
    args: tc.args,
    startedAt,
  };

  yield {
    kind: 'tool_call',
    id: tc.id,
    name: tc.toolName,
    args: tc.args,
  };

  let ok = true;
  let resultContent: string;
  try {
    const result = await this.options.tools.execute(tc.toolName, tc.args);
    resultContent = JSON.stringify(result);
  } catch (err) {
    ok = false;
    resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const latencyMs = Date.now() - startedAt;

  yield {
    kind: 'tool_call_end',
    id: tc.id,
    name: tc.toolName,
    latencyMs,
    ok,
    tokenUsage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
  };

  yield {
    kind: 'tool_result',
    id: tc.id,
    name: tc.toolName,
    output: resultContent,
  };

  workingMessages.push({
    role: 'tool',
    content: resultContent,
    toolCallId: tc.id,
  });
}
```

`tokenUsage` 字段**始终**写入（不依赖 `ok`），让消费方在 error 路径也能把 tool 关联到轮次。注意 `totalPromptTokens` / `totalCompletionTokens` 在 tool 调用前已被 LLM 那一轮 `response.usage` 累加过一次，所以这个快照反映「tool 执行时该 turn 的累计 usage」。

- [ ] **Step 2: 运行 typecheck 验证实现**

Run: `pnpm typecheck`

Expected: exit 0。

- [ ] **Step 3: Commit**

```bash
git add libs/agent/agent.ts
git commit -m "feat(agent): yield tool_call_start and tool_call_end in loop"
```

---

### Task 3: 为新事件写失败测试

**Files:**
- Create: `tests/libs/agent/agent.test.ts`

**Interfaces:**
- Consumes: `Agent` / `AgentEvent` from `libs/agent`；`ToolRegistry` / 自建 fake `ChatClient`。
- Produces: 验证新增事件产出顺序、字段语义、ok 标志。

- [ ] **Step 1: 写测试夹具与失败路径**

文件结构：

```ts
import { describe, it, expect } from 'vitest';
import { Agent } from '../../../libs/agent/index.js';
import { ToolRegistry } from '../../../libs/tools/index.js';
import type { ChatClient, ChatResponse, Message } from '../../../libs/llm/index.js';

function makeFakeChat(responses: ChatResponse[]): ChatClient {
  let idx = 0;
  return {
    chat: async () => responses[idx++ ?? 0]!,
    stream: async function* () {
      yield { content: 'final' };
    },
  } as unknown as ChatClient;
}
```

至少覆盖以下 3 个测试：

```ts
it('yields tool_call_start before tool_call and tool_call_end after execute', async () => {
  const chat = makeFakeChat([
    {
      toolCalls: [{ id: 't1', toolName: 'echo', args: { value: 'hi' } }],
    },
    { content: 'done' },
  ]);
  const tools = new ToolRegistry();
  tools.register({
    name: 'echo',
    description: 'echo',
    schema: { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) } as any,
    execute: async (args: any) => ({ echoed: args.value }),
  });
  const agent = new Agent({ chat, tools });
  const events: string[] = [];
  for await (const ev of agent.runEvents([{ role: 'user', content: 'go' }])) {
    if (ev.kind.startsWith('tool_')) events.push(ev.kind);
  }
  expect(events).toEqual(['tool_call_start', 'tool_call', 'tool_call_end', 'tool_result']);
});

it('marks ok=false when tool throws, still yields tool_result with Error string', async () => {
  const chat = makeFakeChat([
    { toolCalls: [{ id: 't1', toolName: 'boom', args: {} }] },
    { content: 'done' },
  ]);
  const tools = new ToolRegistry();
  tools.register({
    name: 'boom',
    description: 'boom',
    schema: { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) } as any,
    execute: async () => { throw new Error('kaboom'); },
  });
  const agent = new Agent({ chat, tools });
  let endEvent: any = null;
  let resultEvent: any = null;
  for await (const ev of agent.runEvents([{ role: 'user', content: 'go' }])) {
    if (ev.kind === 'tool_call_end') endEvent = ev;
    if (ev.kind === 'tool_result') resultEvent = ev;
  }
  expect(endEvent?.ok).toBe(false);
  expect(resultEvent?.output).toContain('kaboom');
});

it('latencyMs is non-negative and tokenUsage echoes turn-1 accumulated usage', async () => {
  const chat = makeFakeChat([
    {
      toolCalls: [{ id: 't1', toolName: 'echo', args: {} }],
      usage: { promptTokens: 10, completionTokens: 5 },
    },
    { content: 'done' },
  ]);
  const tools = new ToolRegistry();
  tools.register({
    name: 'echo',
    description: 'echo',
    schema: { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) } as any,
    execute: async () => ({}),
  });
  const agent = new Agent({ chat, tools });
  let endEvent: any = null;
  for await (const ev of agent.runEvents([{ role: 'user', content: 'go' }])) {
    if (ev.kind === 'tool_call_end') endEvent = ev;
  }
  expect(endEvent?.latencyMs).toBeGreaterThanOrEqual(0);
  expect(endEvent?.tokenUsage).toEqual({ promptTokens: 10, completionTokens: 5 });
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm test tests/libs/agent/agent.test.ts`

Expected: 至少 1 个 FAIL（视 Task 2 是否已落地）。如果 Task 2 已 commit 并 typecheck 0 errors，本步骤可能全部 PASS；若是绿灯，跳到 Task 4。

- [ ] **Step 3: Commit**

```bash
git add tests/libs/agent/agent.test.ts
git commit -m "test(agent): cover tool_call_start and tool_call_end semantics"
```

---

### Task 4: 新增 file_read → file_edit → file_read example

**Files:**
- Create: `examples/day15/ex_002_edit_agent.ts`

**Interfaces:**
- Consumes: `Agent` / `ToolRegistry` / `fileReadTool` / `fileEditTool` / 仓库根 `.env` 的 dev 网关凭据。
- Produces: 演示完整闭环的 CLI；不修改任何真实仓库文件。

- [ ] **Step 1: 写 example 主体**

```ts
import 'dotenv/config';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Agent } from '../../libs/agent/index.js';
import { ToolRegistry } from '../../libs/tools/index.js';
import { fileReadTool } from '../../libs/tools/repo/file-read-tool.js';
import { fileEditTool } from '../../libs/tools/repo/file-edit-tool.js';
import { createOpenAIChat } from '../../libs/llm/openai.js';

async function main() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'day15-edit-agent-'));
  const fixture = path.join(tmp, 'fixture.ts');
  await writeFile(fixture, 'export const answer = 1;\n', 'utf8');

  const registry = new ToolRegistry();
  registry.register(fileReadTool);
  registry.register(fileEditTool);

  const chat = createOpenAIChat({
    model: process.env.CHAT_MODEL_NAME ?? 'gpt-4o-mini',
  });

  const agent = new Agent({ chat, tools: registry, model: process.env.CHAT_MODEL_NAME });

  try {
    for await (const ev of agent.runEvents(
      [
        { role: 'system', content: '你是文件编辑助手，编辑前必须先 file_read，编辑后必须再 file_read 验证。' },
        { role: 'user', content: `读取 ${fixture}，把 answer 从 1 改成 42，再读一遍确认。` },
      ],
      { signal: AbortSignal.timeout(60_000) },
    )) {
      console.log(JSON.stringify({ kind: ev.kind, ...ev })); // 不打印 content
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

**注意**：

- 不直接 import `libs/llm/openai.js`（其路径请按真实入口调整；如不存在则改用 `libs/llm/index.js` 的 factory）。可先 `grep -RE "createOpenAIChat|class OpenAIChat" libs/llm/` 确认真实导出。
- `process.env.CHAT_MODEL_NAME` 与 dev 网关对齐；若该 env 未设，`createOpenAIChat` 自身有 fallback。
- signal 超时 60s 避免 hang。

- [ ] **Step 2: 运行 example**

Run: `pnpm exec tsx examples/day15/ex_002_edit_agent.ts`

Expected: exit 0；stdout 包含至少 1 次 `tool_call_start` / `tool_call_end` / `tool_call` / `tool_result` 序列；最终事件 `done`；不修改仓库真实文件。

- [ ] **Step 3: Commit**

```bash
git add examples/day15/ex_002_edit_agent.ts
git commit -m "docs(day15): add edit loop agent example"
```

---

### Task 5: 写 ADR 0005

**Files:**
- Create: `docs/adr/0005-agent-event-tool-call-start-end.md`

**Interfaces:**
- Consumes: 既有 ADR 风格（[docs/adr/0001.md](docs/adr/0001.md) / [0002.md](docs/adr/0002.md) / [0003.md](docs/adr/0003.md) / [0004.md](docs/adr/0004.md)）。
- Produces: 1 段 Context / 1 段 Decision / 1 段 Consequences / 1 段 Enforcement。

- [ ] **Step 1: 起草 ADR**

```md
# 0005 — AgentEvent 增量 tool_call_start / tool_call_end，不替换既有 tool_call / tool_result

## Status

Accepted (Day 15 阶段)

## Context

Day 04–08 建立的 12 kind AgentEvent 已稳定，是 SSE / TraceCollector 唯一消费契约。其中 `tool_call` / `tool_result` 严格 1:1 配对（agent.ts 注释明确）。

当前缺失：tool 调用的耗时、起止时间戳、当前 turn 的累计 usage 快照。DevTools / TraceCollector / 后续 e2e 可观测性需要这些字段。如果替换现有 `tool_call` / `tool_result`（改为合并事件），会破坏 4 天 (Day 05–09) 的消费方；如果新增平铺字段（混入 `tool_event_meta`），违反判别联合设计。

## Decision

在 `AgentEvent` 判别联合中追加 2 个新 kind：

- `tool_call_start` —— 在 `tool_call` 之前 yield，携带 `id` / `name` / `args` / `startedAt: number`。
- `tool_call_end` —— 在 `tool_result` 之后 yield，携带 `id` / `name` / `latencyMs: number` / `ok: boolean` / `tokenUsage?: { promptTokens, completionTokens }`。

`tokenUsage` 始终写当前 turn 的累计 usage（即 tool 调用执行后那一刻的 `totalPromptTokens` / `totalCompletionTokens` 快照），不依赖 `ok`，让 error 路径也能关联到轮次。

事件顺序：`tool_call_start → tool_call → tool_call_end → tool_result`，与既有节奏一致。

## Consequences

### 收益

1. 可观测性：DevTools / TraceCollector / 未来 e2e 可直接读 start / end / latencyMs。
2. 错误关联：`tokenUsage` 让 tool error 也能追溯到具体 turn。
3. 判别联合保持：消费方继续用 `switch (ev.kind)`，新增分支即可，无需重构。

### 代价

1. 事件序列变长：tool 相关从 2 个事件变 4 个，对旧消费方无影响（仍是同一份 `switch`）。
2. Date.now() 精度：取决于 Node 进程时钟；不引入高精度计时依赖（YAGNI）。

## Enforcement

- [x] 既有 `tool_call` / `tool_result` 字段未改。
- [x] 不替换、不重排既有 12 kind。
- [x] `libs/tools/repo/file-edit-tool.ts` 未触（review 待修复项留给后续阶段）。
- [x] `Tool<T` schema 契约未触。
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0005-agent-event-tool-call-start-end.md
git commit -m "docs(adr): record tool_call_start and tool_call_end decision"
```

---

### Task 6: 在 day14 daily note 中记录新事件位置

**Files:**
- Modify: `docs/daily/day14.md`（在文件末尾或「已知遗留」段之后追加新段）

**Interfaces:**
- Consumes: Task 1–5 的实际落地。
- Produces: 1 段简短记录新事件与 example，不重开已完成路线。

- [ ] **Step 1: 追加新段**

```md
## 🆕 Day 15 阶段增量（AgentEvent 可观测性 + edit loop example）

仅记录已落地事项，不重开 Day 14 范围：

- `AgentEvent` 新增 2 kind：`tool_call_start` / `tool_call_end`（共 14 kind）。详见 ADR 0005。
- `examples/day15/ex_002_edit_agent.ts` —— file_read → file_edit → file_read 完整多轮反馈闭环示例。
- 既有 `tool_call` / `tool_result` 字段不变；`FileEditTool` review 5 项未修（后续阶段）。
```

- [ ] **Step 2: Commit**

```bash
git add docs/daily/day14.md
git commit -m "docs(day15): record AgentEvent observability and edit loop example"
```

---

### Task 7: 跑完整质量门禁

**Files:** 无代码改动。

- [ ] **Step 1: 跑 5 闸**

Run:

```bash
pnpm typecheck
pnpm typecheck:web
pnpm lint
pnpm format:check
pnpm test
```

Expected: 全部 exit 0；5 个 RAG namespace isolation 历史超时用例**已知，不在本期修复范围**；如有新 RED 出现，必须回退该 task 找根因。

- [ ] **Step 2: 跑 example**

Run: `pnpm exec tsx examples/day15/ex_002_edit_agent.ts`

Expected: exit 0；至少 1 个 `tool_call_start` / `tool_call_end` 出现；最终 `done`。

- [ ] **Step 3: 跑反例验证**

确认：

1. 既有 Day 11 example `ex_002_read_agent.ts` 仍能跑（消费 `tool_call` / `tool_result` 的代码路径不变）。
2. 既有 Day 09 SSE 多轮客户端不报新事件处理错误（如果客户端仅 switch 既有 kind，新增 2 kind 不影响）。

Run: `pnpm exec tsx examples/day11/ex_002_read_agent.ts`

Expected: exit 0。

---

## Self-Review Checklist

- [ ] Spec coverage：14 kind / Agent.ts 修改 / 单测 / example / ADR / daily note 全部对应到 Task 1–6。
- [ ] Placeholder scan：无 `TBD` / 泛化「自行处理」/ 未定义函数；所有代码块都给出接口。
- [ ] Type consistency：`tool_call_start` / `tool_call_end` 在 Task 1 定义，Task 2/3/4 使用一致字段。
- [ ] Scope check：本计划只做 AgentEvent 增量 + example；LangChain 对照实验留到独立 plan。