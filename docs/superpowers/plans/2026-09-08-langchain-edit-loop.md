# LangChain Edit Loop 对照实验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Step lists use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库根新建独立项目 `langchain-cmp/`，用 LangChain 全量套件 + dev 网关，完成与子系统 A 同等能力的 file_read → file_edit → file_read 闭环；对照报告写入项目 README 与副线 README cross-link。

**Architecture:** 独立 `langchain-cmp/` 项目；所有 LangChain 依赖只进仓库根 `devDependencies`；不复用 `examples/langchain-side/` 任何 step，也不直接 import 主线 `libs/tools/`；file_read / file_edit 在项目内部做最小复刻（精确匹配 + 原子写入 + 错误前缀统一）；通过 LangChain `tool()` 工厂 + createAgent / 自建 loop 实现多轮反馈。

**Tech Stack:** TypeScript strict、LangChain v1.x 全量套件（`@langchain/core` / `@langchain/openai` / `@langchain/community` / `langchain`）、zod、dev 网关 OpenAI 兼容 provider。

**Spec:** [docs/superpowers/specs/2026-09-08-langchain-edit-loop-design.md](../specs/2026-09-08-langchain-edit-loop-design.md)

## Global Constraints

- 所有 LangChain / OpenAI / community 依赖只入仓库根 `package.json` 的 `devDependencies`，不进 `dependencies`；`apps/` / `libs/` 不引入 LangChain。
- 不复用 [examples/langchain-side/](examples/langchain-side/) 任何文件；不直接 import 主线 [libs/tools/](libs/tools/)。
- 任何代码改动禁止触碰主线 `libs/` / `apps/` / `package.json` 的 `dependencies` 字段。
- file_read / file_edit 复刻保留与主线一致的「绝对路径 / 原子写入 / 错误前缀统一」安全约束；不做权限 / symlink / binary 处理。
- 不接 SSE / 前端；不做 e2e / Playwright。
- 使用 dev 网关 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `CHAT_MODEL_NAME`，不另行申请凭据。
- CI / 测试用例不依赖真 LLM（用 fake chat model 验证工具调度），dev 网关失败不破坏 CI。

---

## 文件结构

- Create: [langchain-cmp/package.json](langchain-cmp/package.json)
- Create: [langchain-cmp/tsconfig.json](langchain-cmp/tsconfig.json)
- Create: [langchain-cmp/README.md](langchain-cmp/README.md)
- Create: [langchain-cmp/.gitignore](langchain-cmp/.gitignore)
- Create: [langchain-cmp/src/run_edit_agent.ts](langchain-cmp/src/run_edit_agent.ts)
- Create: [langchain-cmp/src/chat_model.ts](langchain-cmp/src/chat_model.ts)
- Create: [langchain-cmp/src/fake_chat_model.ts](langchain-cmp/src/fake_chat_model.ts)
- Create: [langchain-cmp/tools/file_read_tool.ts](langchain-cmp/tools/file_read_tool.ts)
- Create: [langchain-cmp/tools/file_edit_tool.ts](langchain-cmp/tools/file_edit_tool.ts)
- Create: [langchain-cmp/scenarios/happy_path.ts](langchain-cmp/scenarios/happy_path.ts)
- Create: [langchain-cmp/scenarios/multi_match_failure.ts](langchain-cmp/scenarios/multi_match_failure.ts)
- Create: [langchain-cmp/scenarios/relative_path_rejected.ts](langchain-cmp/scenarios/relative_path_rejected.ts)
- Modify: [examples/langchain-side/README.md](examples/langchain-side/README.md) — 加 cross-link。

---

### Task 1: 仓库根 devDependencies 增加 LangChain 全量套件

**Files:**
- Modify: `package.json` 的 `devDependencies` 段。

**Interfaces:**
- Consumes: 既有 `package.json`。
- Produces: devDependencies 含：
  - `@langchain/core`
  - `@langchain/openai`
  - `@langchain/community`
  - `langchain`
  - `zod`（若尚未声明）
  - `tsx`（已存在则跳过）

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

### Task 2: 初始化 `langchain-cmp/` 项目结构

**Files:**
- Create: `langchain-cmp/package.json`
- Create: `langchain-cmp/tsconfig.json`
- Create: `langchain-cmp/.gitignore`

**Interfaces:**
- Consumes: Task 1 的依赖；主仓库 `tsconfig.json` 的 strict 配置。
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
  },
  "dependencies": {
    "@langchain/core": "workspace:*",
    "@langchain/openai": "workspace:*",
    "@langchain/community": "workspace:*",
    "langchain": "workspace:*",
    "zod": "workspace:*"
  }
}
```

> 注意：实际 `workspace:*` 占位符是否能被仓库识别取决于 pnpm 配置；若 root package.json 已有 `workspace` 字段且声明了 `packages`，则改成对应版本号或真实 `*`。最简方案：不写 `package.json` 的 dependencies 字段，依赖通过 root workspace 直接继承。

简化版：

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

### Task 3: 复刻 file_read tool（最小安全集）

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

- [ ] **Step 2: 写最小验证脚本（独立 tsx，不进 tests/）**

```ts
// 临时 scripts/probe-file-read.ts —— 跑完即丢
import { fileReadLangChainTool } from '../tools/file_read_tool.js';
const tmp = '/tmp/probe.ts';
const out = await fileReadLangChainTool.invoke({ path: tmp });
console.log(JSON.stringify(out, null, 2));
```

Run: `pnpm exec tsx --cwd langchain-cmp scripts/probe-file-read.ts`

Expected: 打印 `path` / `content` / `startLine` / `endLine` / `totalLines`；绝对路径校验 throw 含 `file_read:` 前缀。

- [ ] **Step 3: 删除 probe 脚本**

Run: `rm langchain-cmp/scripts/probe-file-read.ts`

- [ ] **Step 4: Commit**

```bash
git add langchain-cmp/tools/file_read_tool.ts
git commit -m "feat(langchain-cmp): replicate file_read tool"
```

---

### Task 4: 复刻 file_edit tool（最小安全集）

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

> 范围拒绝：未实现 review 待修复项（错误前缀统一 / diff 上限 / 权限 / symlink / binary）；本期只对齐主线最小安全集。

- [ ] **Step 2: 验证 happy path 与错误路径**

Run 临时 probe（跑完删）：

```ts
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
const tmp = await mkdtemp('/tmp/cmp-');
const f = `${tmp}/x.ts`;
await writeFile(f, 'const answer = 1;\n');
console.log(await fileEditLangChainTool.invoke({ path: f, oldString: 'const answer = 1;', newString: 'const answer = 42;' }));
try: { await fileEditLangChainTool.invoke({ path: 'relative.ts', oldString: 'x', newString: 'y' }); } catch (e) { console.log('ERR', (e as Error).message); }
```

Expected: happy path 返回 `{ path, replacements: 1, ... }`；相对路径抛错且消息含 `file_edit:` 前缀。

- [ ] **Step 3: 删除 probe 脚本**

Run: `rm langchain-cmp/scripts/probe-file-edit.ts`

- [ ] **Step 4: Commit**

```bash
git add langchain-cmp/tools/file_edit_tool.ts
git commit -m "feat(langchain-cmp): replicate file_edit tool"
```

---

### Task 5: 创建 ChatOpenAI 工厂与 fake chat model

**Files:**
- Create: `langchain-cmp/src/chat_model.ts`
- Create: `langchain-cmp/src/fake_chat_model.ts`

**Interfaces:**
- Consumes: `@langchain/openai` 的 `ChatOpenAI`；`@langchain/core/language_models`。
- Produces:
  - `createChatModel()`: 真实 ChatOpenAI，从仓库根 `.env` 读 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `CHAT_MODEL_NAME`。
  - `createFakeChatModel(responses)`: 单元测试 / CI 用，依次返回预设 AIMessage 序列。

- [ ] **Step 1: 写 `chat_model.ts`**

```ts
import { ChatOpenAI } from '@langchain/openai';
import 'dotenv/config';

export function createChatModel() {
  return new ChatOpenAI({
    model: process.env.CHAT_MODEL_NAME ?? 'gpt-4o-mini',
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
  });
}
```

- [ ] **Step 2: 写 `fake_chat_model.ts`**

```ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, BaseMessageLike } from '@langchain/core/schema';

export function createFakeChatModel(plan: BaseMessageLike[]) {
  let idx = 0;
  return class FakeModel extends BaseChatModel {
    async _generate(messages: BaseMessage[], options?: this['ParsedCallOptions']) {
      const ai = plan[idx++ ?? 0];
      return {
        generations: [{ text: '', message: typeof ai === 'string' ? new (await import('@langchain/core/schema')).AIMessage(ai) : ai as any }],
      };
    }
    _llmType() {
      return 'fake';
    }
  };
}
```

> 简化：实际实现可换成内置 fake list（v1.x 内置）或返回 AIMessageContent 数组；本 Task 仅提供可被 `createAgent` / `AgentExecutor` 消费的最小 fake；后续 Task 若 需要扩展再补。

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/src/chat_model.ts langchain-cmp/src/fake_chat_model.ts
git commit -m "feat(langchain-cmp): add chat model factory and fake chat"
```

---

### Task 6: 编写 happy_path scenario

**Files:**
- Create: `langchain-cmp/scenarios/happy_path.ts`

**Interfaces:**
- Consumes: Task 3/4/5 的产物；`mkdtemp` / `writeFile` / `rm`。
- Produces: 真实调 dev 网关，让 LangChain agent 顺序执行 `file_read → file_edit → file_read`，打印每步事件链，校验最终文件内容含 `42`。

- [ ] **Step 1: 写场景**

```ts
import 'dotenv/config';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createChatModel } from '../src/chat_model.js';
import { fileReadLangChainTool } from '../tools/file_read_tool.js';
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';
// 入口仅参考 createAgent / AgentExecutor；若 LangChain v1.x 推荐 createAgent，import from 'langchain'。
// 占位 import 以仓库实际依赖为准：
import { createReactAgent } from '@langchain/langgraph/prebuilt';

async function main() {
  const tmp = await mkdtemp('/tmp/langchain-cmp-happy-');
  const fixture = path.join(tmp, 'fixture.ts');
  await writeFile(fixture, 'export const answer = 1;\n');

  const llm = createChatModel();
  const tools = [fileReadLangChainTool, fileEditLangChainTool];

  const agent = createReactAgent({ llm, tools });

  try {
    const events: string[] = [];
    const stream = await agent.stream(
      {
        messages: [
          { role: 'system', content: '你必须先用 file_read，再用 file_edit，最后再 file_read 确认。' },
          { role: 'user', content: `读取 ${fixture}，把 answer 从 1 改成 42，再读一遍确认。` },
        ],
      },
      { streamMode: 'values', recursionLimit: 6 },
    );
    for await (const chunk of stream) {
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

> 占位：`createReactAgent` 是 LangGraph 包入口；若实际依赖未引入 LangGraph，改用 LangChain 自带 `createAgent`（v1.x 推荐 from `'langchain'`）。**先按当前依赖列表 grep 真实 API**：运行 `pnpm exec node -e "import('langchain').then(m => console.log(Object.keys(m)))"` 找到 `createAgent` / `createReactAgent` 实际位置后再写代码。

- [ ] **Step 2: 运行**

Run: `pnpm exec tsx langchain-cmp/scenarios/happy_path.ts`

Expected: exit 0；events 至少含 3 个 `tool_call:file_read` / `tool_call:file_edit`；fixture 最终含 `42`；dev 网关非 401 / 403。

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/scenarios/happy_path.ts
git commit -m "feat(langchain-cmp): add happy path scenario"
```

---

### Task 7: 编写 multi_match_failure scenario

**Files:**
- Create: `langchain-cmp/scenarios/multi_match_failure.ts`

**Interfaces:**
- Consumes: Task 4 复刻的 file_edit tool；fake chat model。
- Produces: 验证 `replaceAll: false` + 多匹配场景下，LangChain `ToolException` 是否带 `file_edit:` 前缀。

- [ ] **Step 1: 写场景**

```ts
import 'dotenv/config';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';

async function main() {
  const tmp = await mkdtemp('/tmp/langchain-cmp-multi-');
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

- [ ] **Step 2: 运行**

Run: `pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts`

Expected: exit 0；message 含 `file_edit:` 前缀；file未被修改。

- [ ] **Step 3: Commit**

```bash
git add langchain-cmp/scenarios/multi_match_failure.ts
git commit -m "feat(langchain-cmp): add multi match failure scenario"
```

---

### Task 8: 编写 relative_path_rejected scenario

**Files:**
- Create: `langchain-cmp/scenarios/relative_path_rejected.ts`

**Interfaces:**
- Consumes: Task 3/4 的 file_read / file_edit tools。
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

### Task 9: 写 README + 副线 cross-link

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

```bash
# 一次性安装
pnpm add -D @langchain/core @langchain/openai @langchain/community langchain

# 跑场景
pnpm exec tsx langchain-cmp/scenarios/happy_path.ts
pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts
pnpm exec tsx langchain-cmp/scenarios/relative_path_rejected.ts
```

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

### Task 10: 跑全部质量门禁

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

Expected: 全部 exit 0；与计划 A 同样接受 5 个 RAG namespace isolation 历史超时。**新增 RED 必须立刻修复或回退。**

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

- [ ] Spec coverage：4 个 Components、3 个场景、README、cross-link 全部对应到 Task 1–9。
- [ ] Placeholder scan：无 `TBD` / 泛化「自行处理」；所有代码块都给出接口与运行命令。
- [ ] Type consistency：`fileReadLangChainTool` / `fileEditLangChainTool` 在 Task 3/4 定义，Task 6/7/8 使用一致。
- [ ] Scope check：本计划只做 LangChain 对照实验；自研 loop 接入留到独立 plan。