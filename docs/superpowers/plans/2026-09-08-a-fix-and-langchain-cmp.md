# Agent Event Order Fix + Web SSE Guard + LangChain 对照实验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Step lists use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Plan A 留下的 2 个未修缺陷（事件顺序与 ADR 描述对齐、前端 `isAgentEvent` guard 扩新 2 kind + SSE 传播表驱动测试），并完成 Plan B 的 LangChain 对照实验项目 `langchain-cmp/`。

**Architecture:**
- Plan A 修复：把 `tool_call_end` yield 从 `tool_result` 之前移到之后，与 ADR 0005 / plan / day14.md 描述完全对齐；同时扩 `apps/web/src/api/agentClient.ts` 的 `isAgentEvent` guard；新增 `tests/apps/web/agent-event-roundtrip.test.ts` 做表驱动断言，保证未来新增 kind 时能被自动捕获。
- Plan B：`langchain-cmp/` 独立项目，全量 LangChain 套件仅在 devDependencies，复刻 file_read / file_edit（最小安全集）+ 3 个场景脚本 + README + 副线 cross-link。

**Tech Stack:** TypeScript strict、LangChain v1.x 全量套件、zod、dev 网关 OpenAI 兼容 provider、Vitest、pnpm workspace。

**Spec:**
- A 修复：基于 [docs/adr/0005-agent-event-tool-call-start-end.md](../adr/0005-agent-event-tool-call-start-end.md) 中 ADR 描述的顺序契约。
- B：基于 [docs/superpowers/specs/2026-09-08-langchain-edit-loop-design.md](../specs/2026-09-08-langchain-edit-loop-design.md) 与 [docs/superpowers/plans/2026-09-08-langchain-edit-loop.md](2026-09-08-langchain-edit-loop.md)。

## Global Constraints

- 既有 14 kind AgentEvent 字段不变；A 修复后事件顺序为 `tool_call_start → tool_call → tool_result → tool_call_end`（end 在 result 之后，与 ADR 0005 / plan / day14.md 描述对齐）。
- 不修改 [libs/tools/repo/file-edit-tool.ts](libs/tools/repo/file-edit-tool.ts) 的 review 待修复项。
- 不接 SSE 后端协议；前端 SSE 客户端只补 `isAgentEvent` guard，不改 `agentEventToSSEMessage`（已经是 kind-agnostic）。
- LangChain / OpenAI / community 依赖只进仓库根 `package.json` 的 `devDependencies`。
- 不复用 [examples/langchain-side/](examples/langchain-side/) 任何文件；不直接 import 主线 [libs/tools/](libs/tools/)。
- file_read / file_edit 复刻保留与主线一致的「绝对路径 / 原子写入 / 错误前缀统一」安全约束；不做权限 / symlink / binary 处理。
- 不接 SSE / 前端；不做 e2e / Playwright。
- CI / 测试用例不依赖真 LLM（用 fake chat model 验证工具调度）；dev 网关失败不破坏 CI。

---

## 文件结构

### Plan A 修复

- Modify: [libs/agent/agent.ts](libs/agent/agent.ts) — 调整 yield 顺序。
- Modify: [apps/web/src/api/agentClient.ts](apps/web/src/api/agentClient.ts) — 扩 `isAgentEvent` guard。
- Create: [tests/apps/web/agent-event-roundtrip.test.ts](tests/apps/web/agent-event-roundtrip.test.ts) — 表驱动测试覆盖全部 14 kind。
- Modify: [docs/adr/0005-agent-event-tool-call-start-end.md](../adr/0005-agent-event-tool-call-start-end.md) — 如需要追加 parallel tool tokenUsage 注释。

### Plan B（LangChain 对照实验）

- Create: [langchain-cmp/package.json](langchain-cmp/package.json)
- Create: [langchain-cmp/tsconfig.json](langchain-cmp/tsconfig.json)
- Create: [langchain-cmp/.gitignore](langchain-cmp/.gitignore)
- Create: [langchain-cmp/README.md](langchain-cmp/README.md)
- Create: [langchain-cmp/tools/file_read_tool.ts](langchain-cmp/tools/file_read_tool.ts)
- Create: [langchain-cmp/tools/file_edit_tool.ts](langchain-cmp/tools/file_edit_tool.ts)
- Create: [langchain-cmp/src/chat_model.ts](langchain-cmp/src/chat_model.ts)
- Create: [langchain-cmp/src/fake_chat_model.ts](langchain-cmp/src/fake_chat_model.ts)
- Create: [langchain-cmp/scenarios/happy_path.ts](langchain-cmp/scenarios/happy_path.ts)
- Create: [langchain-cmp/scenarios/multi_match_failure.ts](langchain-cmp/scenarios/multi_match_failure.ts)
- Create: [langchain-cmp/scenarios/relative_path_rejected.ts](langchain-cmp/scenarios/relative_path_rejected.ts)
- Modify: [examples/langchain-side/README.md](examples/langchain-side/README.md) — 加 cross-link。

---

### Task 1: 修复 agent.ts 事件顺序

**Files:**
- Modify: `libs/agent/agent.ts:271-325`

**Interfaces:**
- Consumes: 既有 yield 顺序 `tool_call_start → tool_call → tool_result → tool_call_end`。
- Produces: 调整后顺序与上同（end 在 result 之后），与 ADR 0005「Decision」段描述一致。

- [ ] **Step 1: 调整 `for (const tc of response.toolCalls)` 内部顺序**

将 `tool_call_end` 的 yield 从 `tools.execute` 之后、`tool_result` 之前移到 `tool_result` 之后。

调整后核心循环：

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
  const tokenUsage = { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens };

  yield {
    kind: 'tool_result',
    id: tc.id,
    name: tc.toolName,
    output: resultContent,
  };

  yield {
    kind: 'tool_call_end',
    id: tc.id,
    name: tc.toolName,
    latencyMs,
    ok,
    tokenUsage,
  };

  workingMessages.push({
    role: 'tool',
    content: resultContent,
    toolCallId: tc.id,
  });
}
```

> 注意：`tokenUsage` 字段照旧始终写入；调整顺序后 `ok=false` 仍然能 yield `tokenUsage`，error 路径也能关联到 turn。

- [ ] **Step 2: 运行 typecheck + 既有序列测试**

Run:

```bash
pnpm typecheck
pnpm test tests/libs/agent/run-events.test.ts tests/apps/api/trace-collector.test.ts tests/libs/agent/agent.test.ts
```

Expected: exit 0；如果既有测试断言的序列顺序需要从 `tool_call → tool_call_end → tool_result` 改为 `tool_call → tool_result → tool_call_end`，同步更新断言中的数组顺序（仅插入位置，不改测试意图）。这是 Plan A review finding 7（序列断言硬编码）的预期内改动。

- [ ] **Step 3: Commit**

```bash
git add libs/agent/agent.ts tests/libs/agent/agent.test.ts tests/libs/agent/run-events.test.ts tests/apps/api/trace-collector.test.ts
git commit -m "fix(agent): align tool_call_end order with ADR 0005 (after tool_result)"
```

---

### Task 2: 补前端 `isAgentEvent` guard

**Files:**
- Modify: `apps/web/src/api/agentClient.ts:113` 附近（`isAgentEvent` 函数体）

**Interfaces:**
- Consumes: 既有 12 kind allowlist；`AgentEvent` 判别联合。
- Produces: 扩 `isAgentEvent` 加入 `tool_call_start` / `tool_call_end` 2 kind；同时删除该文件里仍写"当前 AgentEvent 12 kind（Day 08 末态）"的过时注释。

- [ ] **Step 1: 扩 guard 函数**

```ts
function isAgentEvent(value: unknown): value is AgentEvent {
  if (value === null || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  switch (kind) {
    case 'message_start':
    case 'iteration':
    case 'request':
    case 'response':
    case 'message_delta':
    case 'context':
    case 'tool_call':
    case 'tool_call_start':   // 🆕 Day 15
    case 'tool_call_end':     // 🆕 Day 15
    case 'tool_result':
    case 'message_end':
    case 'run_summary':
    case 'done':
    case 'error':
      return true;
    default:
      return false;
  }
}
```

如 `isAgentEvent` 实现是 `kinds.includes(parsed.kind)` 形式而非 switch，则把 2 个新 kind 加入 allowlist 数组。

同时把"12 kind（Day 08 末态）"注释更新为"14 kind（Day 15 增量）"。

- [ ] **Step 2: 跑前端 typecheck**

Run: `pnpm typecheck:web`

Expected: exit 0。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/agentClient.ts
git commit -m "fix(web): extend isAgentEvent guard for tool_call_start and tool_call_end"
```

---

### Task 3: 表驱动 SSE roundtrip 测试

**Files:**
- Create: `tests/apps/web/agent-event-roundtrip.test.ts`

**Interfaces:**
- Consumes: `agentClient.ts` 导出的相关函数（`agentEventToSSEMessage` / `parseFrame` / `defaultAgentClient.stream`）；`AgentEvent` 判别联合。
- Produces: 一组用例，逐个枚举 14 kind，断言它能从 SSE 帧里解析并到达消费方。

- [ ] **Step 1: 写表驱动测试**

至少覆盖以下场景：

```ts
import { describe, it, expect } from 'vitest';
import type { AgentEvent } from '../../../../libs/agent/index.js';
import { agentEventToSSEMessage } from '../../../../apps/web/src/api/agentClient.js';
import { parseFrame } from '../../../../apps/web/src/api/agentClient.js'; // 若导出

const ALL_KINDS: AgentEvent[] = [
  { kind: 'message_start' },
  { kind: 'iteration', n: 1 },
  { kind: 'request', iteration: 1, messages: [] },
  { kind: 'response', iteration: 1, content: 'x' },
  { kind: 'message_delta', content: 'x' },
  { kind: 'context', iteration: 1, promptTokens: 0, limit: 200000 },
  { kind: 'tool_call_start', id: 't1', name: 'echo', args: {}, startedAt: 0 },
  { kind: 'tool_call', id: 't1', name: 'echo', args: {} },
  { kind: 'tool_call_end', id: 't1', name: 'echo', latencyMs: 1, ok: true, tokenUsage: { promptTokens: 0, completionTokens: 0 } },
  { kind: 'tool_result', id: 't1', name: 'echo', output: '{}' },
  { kind: 'message_end', content: 'done' },
  { kind: 'run_summary', totalPromptTokens: 0, totalCompletionTokens: 0, peakPromptTokens: 0, iterations: 1 },
  { kind: 'done' },
  { kind: 'error', message: 'x' },
];

describe('AgentEvent SSE roundtrip', () => {
  for (const event of ALL_KINDS) {
    it(`survives roundtrip for kind=${event.kind}`, () => {
      const frame = agentEventToSSEMessage(event);
      // 期望：parseFrame 返回与原 event 等价的 AgentEvent
      // 实际函数签名取决于 agentClient.ts 暴露的 API；按真实签名调整。
      expect(frame.event).toBe(event.kind);
      expect(JSON.parse(frame.data)).toEqual(event);
    });
  }
});
```

如 `agentEventToSSEMessage` / `parseFrame` 未在 agentClient.ts 导出，需先在 agentClient.ts 加 `export`（不改实现），或在本测试里直接 inline 一个相同形式的最小 `parseFrame` helper。

- [ ] **Step 2: 运行测试确认绿灯**

Run: `pnpm test tests/apps/web/agent-event-roundtrip.test.ts`

Expected: 14 / 14 PASS。

- [ ] **Step 3: Commit**

```bash
git add tests/apps/web/agent-event-roundtrip.test.ts
git commit -m "test(web): table-driven SSE roundtrip covers all 14 AgentEvent kinds"
```

---

### Task 4: 在仓库根 devDependencies 增加 LangChain 全量套件

**Files:**
- Modify: `package.json` 的 `devDependencies` 段。

**Interfaces:**
- Consumes: 既有 `package.json`。
- Produces: devDependencies 含：
  - `@langchain/core`
  - `@langchain/openai`
  - `@langchain/community`
  - `langchain`

- [ ] **Step 1: 跑 `pnpm add -D` 安装依赖**

Run:

```bash
pnpm add -D @langchain/core @langchain/openai @langchain/community langchain
```

Expected: exit 0；`package.json` devDependencies 段新增上述 4 项；`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 验证主仓库不引入 LangChain 到 dependencies**

Run: `grep -A 5 '"dependencies"' package.json | head -20`

Expected: `dependencies` 段不含 langchain / openai 等包。

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(langchain-cmp): add LangChain full stack to devDependencies"
```

---

### Task 5: 初始化 `langchain-cmp/` 项目结构

**Files:**
- Create: `langchain-cmp/package.json`
- Create: `langchain-cmp/tsconfig.json`
- Create: `langchain-cmp/.gitignore`

**Interfaces:**
- Consumes: Task 4 的依赖；主仓库 `tsconfig.json` 的 strict 配置。
- Produces: `langchain-cmp/` 目录可独立 `pnpm exec tsx`。

- [ ] **Step 1: 写 `langchain-cmp/package.json`**

```json
{
  "name": "langchain-cmp",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "edit-agent": "tsx src/run_edit_agent.ts",
    "scenario:happy": "tsx scenarios/happy_path.ts",
    "scenario:multi-match": "tsx scenarios/multi_match_failure.ts",
    "scenario:relative": "tsx scenarios/relative_path_rejected.ts"
  }
}
```

> 不写 `dependencies` 字段；依赖通过 root workspace 继承。

- [ ] **Step 2: 写 `langchain-cmp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src/**/*", "tools/**/*", "scenarios/**/*"]
}
```

- [ ] **Step 3: 写 `langchain-cmp/.gitignore`**

```
node_modules/
*.fixture
*.tmp
.DS_Store
```

- [ ] **Step 4: Commit**

```bash
git add langchain-cmp/package.json langchain-cmp/tsconfig.json langchain-cmp/.gitignore
git commit -m "feat(langchain-cmp): scaffold independent LangChain comparison project"
```

---

### Task 6: 复刻 file_read tool（最小安全集）

**Files:**
- Create: `langchain-cmp/tools/file_read_tool.ts`

**Interfaces:**
- Consumes: `tool` from `@langchain/core/tools`；`z` from `zod`；`node:fs/promises`；`node:path`。
- Produces: 导出 `fileReadLangChainTool`，与主线 `FileReadTool` 行为对齐（绝对路径校验 + cat-n 行号 + 文件存在性 + 普通文件判断 + 错误前缀 `file_read:`）。

- [ ] **Step 1: 写复刻实现**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';

const fileReadSchema = z.object({
  path: z.string().describe('Absolute path to the file'),
  startLine: z.coerce.number().int().min(1).optional(),
  endLine: z.coerce.number().int().min(1).optional(),
});

export const fileReadLangChainTool = tool(
  async ({ path: filePath, startLine, endLine }) => {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`file_read: path must be absolute, got: ${filePath}`);
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new Error(`file_read: path does not exist: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`file_read: path is not a file: ${filePath}`);
    }
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const totalLines = lines.length;
    const from = startLine ?? 1;
    const to = Math.min(endLine ?? from + 199, totalLines);
    const body = lines
      .slice(from - 1, to)
      .map((line, idx) => `${String(from + idx).padStart(4)} | ${line}`)
      .join('\n');
    return { path: filePath, content: body, startLine: from, endLine: to, totalLines };
  },
  { name: 'file_read', description: 'Read a file with cat -n line numbers.', schema: fileReadSchema },
);
```

- [ ] **Step 2: 验证 happy path**

Run:

```bash
pnpm exec tsx -e "import('/langchain-cmp/tools/file_read_tool.js').then(m => m.fileReadLangChainTool.invoke({ path: process.cwd() + '/pnpm-workspace.yaml' }).then(console.log))"
```

Expected: 返回 `{ path, content, startLine, endLine, totalLines }`。

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/tools/file_read_tool.ts
git commit -m "feat(langchain-cmp): replicate file_read tool"
```

---

### Task 7: 复刻 file_edit tool（最小安全集）

**Files:**
- Create: `langchain-cmp/tools/file_edit_tool.ts`

**Interfaces:**
- Consumes: `tool` from `@langchain/core/tools`；`z` from `zod`；`node:fs/promises`；`node:path`。
- Produces: 导出 `fileEditLangChainTool`，与主线 `FileEditTool` 对齐（绝对路径 + `oldString.min(1)` + `replaceAll: boolean` + 临时文件 + rename 原子写入 + 错误前缀 `file_edit:`）。

- [ ] **Step 1: 写复刻实现**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';

const fileEditSchema = z.object({
  path: z.string().describe('Absolute path to the file'),
  oldString: z.string().min(1).describe('Exact text to replace'),
  newString: z.string().describe('Replacement text'),
  replaceAll: z.boolean().default(false),
});

export const fileEditLangChainTool = tool(
  async ({ path: filePath, oldString, newString, replaceAll }) => {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`file_edit: path must be absolute, got: ${filePath}`);
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new Error(`file_edit: path does not exist: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`file_edit: not a file: ${filePath}`);
    }
    const source = await fs.readFile(filePath, 'utf8');

    const indices: number[] = [];
    let cursor = 0;
    while (true) {
      const idx = source.indexOf(oldString, cursor);
      if (idx < 0) break;
      indices.push(idx);
      cursor = idx + oldString.length;
    }

    if (indices.length === 0) {
      throw new Error(`file_edit: oldString not found in ${filePath}`);
    }
    if (!replaceAll && indices.length !== 1) {
      throw new Error(`file_edit: expected exactly one match, got ${indices.length}`);
    }

    const updated = replaceAll
      ? source.split(oldString).join(newString)
      : source.replace(oldString, newString);

    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, updated, { encoding: 'utf8', flag: 'wx' });
    try {
      await fs.rename(tempPath, filePath);
    } finally {
      await fs.rm(tempPath, { force: true });
    }

    return {
      path: filePath,
      replacements: replaceAll ? indices.length : 1,
      content: updated,
      diff: `- ${oldString}\n+ ${newString}`,
    };
  },
  { name: 'file_edit', description: 'Edit one file by exact string replacement.', schema: fileEditSchema },
);
```

- [ ] **Step 2: 验证 happy path 与相对路径 throw**

Run:

```bash
pnpm exec tsx -e "import('/langchain-cmp/tools/file_edit_tool.js').then(async m => {
  const tmp = require('os').tmpdir();
  const f = require('path').join(tmp, 'cmp-x.ts');
  require('fs').writeFileSync(f, 'const answer = 1;\n');
  console.log(await m.fileEditLangChainTool.invoke({ path: f, oldString: 'const answer = 1;', newString: 'const answer = 42;' }));
  try { await m.fileEditLangChainTool.invoke({ path: 'relative.ts', oldString: 'x', newString: 'y' }); } catch (e) { console.log('ERR', e.message); }
})"
```

Expected: happy path 返回 `{ path, replacements: 1, ... }`；相对路径 throw 含 `file_edit:` 前缀。

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/tools/file_edit_tool.ts
git commit -m "feat(langchain-cmp): replicate file_edit tool"
```

---

### Task 8: 创建 ChatOpenAI 工厂与 fake chat model

**Files:**
- Create: `langchain-cmp/src/chat_model.ts`
- Create: `langchain-cmp/src/fake_chat_model.ts`

**Interfaces:**
- Consumes: `@langchain/openai` 的 `ChatOpenAI`；`@langchain/core/language_models`。
- Produces:
  - `createChatModel()`: 真实 ChatOpenAI，从仓库根 `.env 读 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL_NAME`。
  - `createFakeChatModel(responses)`: 单元测试 / CI 用 fake 模型。

- [ ] **Step 1: 写 `chat_model.ts`**

```ts
import { ChatOpenAI } from '@langchain/openai';
import 'dotenv/config';

export function createChatModel() {
  return new ChatOpenAI({
    model: process.env.MODEL_NAME ?? 'gpt-4o-mini',
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
  });
}
```

> env 名称采用 `MODEL_NAME` 而非 `CHAT_MODEL_NAME`，与既有 example 一致。

- [ ] **Step 2: 写 `fake_chat_model.ts`**

```ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, AIMessage } from '@langchain/core/schema';

export function createFakeChatModel(responses: AIMessage[]) {
  let idx = 0;
  return class FakeModel extends BaseChatModel {
    async _generate(messages: BaseMessage[]) {
      const ai = responses[idx++];
      if (!ai) throw new Error('fake chat exhausted');
      return { generations: [{ text: typeof ai.content === 'string' ? ai.content : '', message: ai }] };
    }
    _llmType() {
      return 'fake';
    }
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/src/chat_model.ts langchain-cmp/src/fake_chat_model.ts
git commit -m "feat(langchain-cmp): add chat model factory and fake chat"
```

---

### Task 9: 编写 happy_path scenario

**Files:**
- Create: `langchain-cmp/scenarios/happy_path.ts`

**Interfaces:**
- Consumes: Task 6/7/8 的产物；`mkdtemp` / `writeFile` / `rm` / `readFile`。
- Produces: 真实调 dev 网关，让 LangChain agent 顺序执行 `file_read → file_edit → file_read`，打印每步事件链，校验最终文件内容含 `42`。

- [ ] **Step 1: 写场景**

```ts
import 'dotenv/config';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createChatModel } from '../src/chat_model.js';
import { fileReadLangChainTool } from '../tools/file_read_tool.js';
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';
// 入口依据 LangChain v1.x 实际暴露的 API 选择：
//   v1.x: `import { createAgent } from 'langchain'`
//   旧版: `import { createReactAgent } from '@langchain/langgraph/prebuilt'`
// 在 commit 前先 `grep -rE "createAgent|createReactAgent" node_modules/@langchain` 确认真实入口；
// 如 v1.x 推荐 createAgent 则使用：
import { createAgent } from 'langchain';

async function main() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'langchain-cmp-happy-'));
  const fixture = path.join(tmp, 'fixture.ts');
  await writeFile(fixture, 'export const answer = 1;\n', 'utf8');

  const llm = createChatModel();
  const tools = [fileReadLangChainTool, fileEditLangChainTool];

  const agent = createAgent({ model: llm, tools });

  try {
    const events: string[] = [];
    for await (const chunk of await agent.stream(
      {
        messages: [
          { role: 'system', content: '你必须先用 file_read，再用 file_edit，最后再 file_read 确认。' },
          { role: 'user', content: `读取 ${fixture}，把 answer 从 1 改成 42，再读一遍确认。` },
        ],
      },
      { streamMode: 'values', recursionLimit: 6 },
    )) {
      const last = (chunk as any).messages?.at(-1);
      if (last?.tool_calls?.length) {
        for (const tc of last.tool_calls) events.push(`tool_call:${tc.name}`);
      } else if (last?.content) {
        events.push('assistant');
      }
    }

    const finalContent = await readFile(fixture, 'utf8');
    console.log(JSON.stringify({ events, finalContent }, null, 2));
    if (!finalContent.includes('42')) throw new Error('fixture not updated');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: 运行**

Run: `pnpm exec tsx langchain-cmp/scenarios/happy_path.ts`

Expected: exit 0；events 至少含 3 个 `tool_call:file_read` / `tool_call:file_edit`；fixture 最终含 `42`。

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/scenarios/happy_path.ts
git commit -m "feat(langchain-cmp): add happy path scenario"
```

---

### Task 10: 编写 multi_match_failure scenario

**Files:**
- Create: `langchain-cmp/scenarios/multi_match_failure.ts`

**Interfaces:**
- Consumes: Task 7 复刻的 file_edit tool；fake chat model。
- Produces: 验证 `replaceAll: false` + 多匹配场景下，LangChain `ToolException` 是否带 `file_edit:` 前缀。

- [ ] **Step 1: 写场景**

```ts
import 'dotenv/config';
import { mkdtemp, writeFile, readFile } from from 'node:fs/promises';
import path from 'node:path';
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';

async function main() {
  const tmp = await mkdtemp(path.join(require('os').tmpdir(), 'langchain-cmp-multi-'));
  const fixture = path.join(tmp, 'multi.ts');
  await writeFile(fixture, 'foo foo foo\n');

  try {
    await fileEditLangChainTool.invoke({
      path: fixture,
      oldString: 'foo',
      newString: 'bar',
      replaceAll: false,
    });
    throw new Error('expected throw');
  } catch (err) {
    const message = (err as Error).message;
    console.log(JSON.stringify({ message }));
    if (!message.includes('file_edit:')) {
      throw new Error('missing file_edit: prefix in LangChain ToolException');
    }
    if (!message.includes('2') && !message.includes('3')) {
      throw new Error('expected match count in error message');
    }
  }

  const after = await readFile(fixture, 'utf8');
  if (after !== 'foo foo foo\n') throw new Error('file must remain unchanged on failure');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

> 修正：`from from 'node:fs/promises'` 是 typo，应为 `from 'node:fs/promises'`。修正：

```ts
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
```

- [ ] **Step 2: 运行**

Run: `pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts`

Expected: exit 0；message 含 `file_edit:` 前缀；file 未被修改。

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/scenarios/multi_match_failure.ts
git commit -m "feat(langchain-cmp): add multi match failure scenario"
```

---

### Task 11: 编写 relative_path_rejected scenario

**Files:**
- Create: `langchain-cmp/scenarios/relative_path_rejected.ts`

**Interfaces:**
- Consumes: Task 6/7 的 file_read / file_edit tools。
- Produces: 验证相对路径被拒绝且错误前缀统一。

- [ ] **Step 1: 写场景**

```ts
import 'dotenv/config';
import { fileReadLangChainTool } from '../tools/file_read_tool.js';
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';

async function probe(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(JSON.stringify({ label, ok: false, reason: 'expected throw' }));
    process.exitCode = 1;
  } catch (err) {
    const message = (err as Error).message;
    const ok = message.includes(`${label}: path must be absolute`);
    console.log(JSON.stringify({ label, ok, message }));
    if (!ok) process.exitCode = 1;
  }
}

await probe('file_read', () =>
  fileReadLangChainTool.invoke({ path: 'relative.ts' }),
);
await probe('file_edit', () =>
  fileEditLangChainTool.invoke({ path: 'relative.ts', oldString: 'x', newString: 'y' }),
);
```

- [ ] **Step 2: 运行**

Run: `pnpm exec tsx langchain-cmp/scenarios/relative_path_rejected.ts`

Expected: exit 0；两条 `ok: true`（错误消息同时含 `${label}:` 与 `absolute`）。

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/scenarios/relative_path_rejected.ts
git commit -m "feat(langchain-cmp): add relative path rejection scenario"
```

---

### Task 12: 写 README + 副线 cross-link

**Files:**
- Create: `langchain-cmp/README.md`
- Modify: `examples/langchain-side/README.md`

**Interfaces:**
- Consumes: 全部前置 Task 的成果。
- Produces:
  - `langchain-cmp/README.md` 含「项目目标 / 与副线关系 / 运行说明 / 复盘摘要 / 待办」。
  - `examples/langchain-side/README.md` 加 cross-link。

- [ ] **Step 1: 写 `langchain-cmp/README.md`**

```md
# langchain-cmp —— LangChain 编辑回环对照实验

## 项目目标

用 LangChain 全量套件 + dev 网关实现与子系统 A 同等能力的 file_read → file_edit → file_read 闭环；作为 bootcamp 自研 Agent loop 的对照实验。

## 与 examples/langchain-side/ 的关系

副线 step 1–5 关注「单次 chat / chain / RAG / chunk / Tool 抽象」，尚未涉及「tool loop / agent 多轮反馈」。本项目与副线平行，单独承载该对照实验，避免与副线 stepN 编号风格冲突。

## 运行说明

\`\`\`bash
# 一次性安装
pnpm add -D @langchain/core @langchain/openai @langchain/community langchain

# 跑场景
pnpm exec tsx langchain-cmp/scenarios/happy_path.ts
pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts
pnpm exec tsx langchain-cmp/scenarios/relative_path_rejected.ts
\`\`\`

## 复盘摘要（runbook 后填）

- 代码量对比（langchain vs bootcamp 手写）
- tool 调度细节（LangChain on_tool_start / on_tool_end vs bootcamp AgentEvent 14 kind）
- 错误前缀一致性问题
- dev 网关白名单 / 超时 / 重试表现
- 与副线 step 1–5 的一致性 / 差异

## 待办（runbook 后续填）
```

- [ ] **Step 2: 改 `examples/langchain-side/README.md`**

在「Step 进度」表格后追加：

```md
## 与 langchain-cmp/ 的关系

副线 step 1–5 关注单一对照点（chat / chain / RAG / chunk / Tool 抽象）。「tool loop / agent 多轮反馈」对照实验放在 [langchain-cmp/](../../langchain-cmp/) —— 独立项目避免与 stepN 编号风格冲突。详见 [langchain-cmp/README.md](../../langchain-cmp/README.md)。
```

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/README.md examples/langchain-side/README.md
git commit -m "docs(langchain-cmp): document independent comparison project"
```

---

### Task 13: 跑全部质量门禁

**Files:** 无代码改动。

- [ ] **Step 1: 主仓库闸**

Run:

```bash
pnpm typecheck
pnpm typecheck:web
pnpm lint
pnpm format:check
pnpm test
```

Expected: 全部 exit 0；与 Plan A 同样接受 RAG namespace isolation 历史超时。**新增 RED 必须立刻修复或回退。**

- [ ] **Step 2: 跑 langchain-cmp 三个场景**

Run:

```bash
pnpm exec tsx langchain-cmp/scenarios/happy_path.ts
pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts
pnpm exec tsx langchain-cmp/scenarios/relative_path_rejected.ts
```

Expected: 全部 exit 0。

- [ ] **Step 3: 验证 LangChain 仅在 devDependencies**

Run: `grep -E '"langchain' package.json`

Expected: 输出只在 `devDependencies` 段。

- [ ] **Step 4: 验证主线 libs/apps 不依赖 LangChain**

Run: `grep -RE "from 'langchain|require\('langchain" libs apps`

Expected: 无输出。

---

## Self-Review Checklist

- [ ] Spec coverage：A 修复 3 个文件 + B 13 个文件全部对应到 Task 1–12。
- [ ] Placeholder scan：无 `TBD` / 泛化「自行处理」；所有代码块都给出接口。
- [ ] Type consistency：`fileReadLangChainTool` / `fileEditLangChainTool` / `createChatModel` / `createFakeChatModel` 在 Task 6/7/8 定义，Task 9/10/11 使用一致。
- [ ] Scope check：本计划只做 A 修复 + LangChain 对照实验；不动 FileEditTool / Agent loop 实现 / 主线 libs。