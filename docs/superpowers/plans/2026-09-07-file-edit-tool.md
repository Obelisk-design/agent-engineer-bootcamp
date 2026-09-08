# FileEditTool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `repo_index → repo_search → file_read` 只读链路之后补齐一个安全、可验证的 `file_edit` Tool，为下一阶段 Agent 修改反馈 loop 提供稳定的文件写入能力。

**Architecture:** 新增独立的 `file_edit` Tool，沿用 `Tool<TSchema, TReturn>` 和 `ToolRegistry.execute()` 的 Zod 单一事实源。工具只负责单文件精确文本替换、原子落盘及可审计结果；不修改 Agent 消息协议或循环逻辑，后一阶段通过该稳定契约接入完整 loop。

**Tech Stack:** TypeScript strict、Node.js `fs/promises`、Zod、Vitest、pnpm workspace。

**Spec:** `docs/superpowers/specs/2026-08-03-day11-tool-contract-and-file-read-design.md`（FileReadTool/参数单一事实源约束）及 `docs/daily/day14.md` §Day 15 路线预告（FileEditTool 范围）。

## Global Constraints

- `Tool.schema` 是参数契约唯一事实源；运行时校验只能经 `ToolRegistry.execute()` / `runTool()`。
- `execute` 不重复做类型判断；仅检查 Zod 无法表达的文件系统前置条件。
- 文件路径必须是绝对路径。
- `replaceAll` 使用 `z.union([z.boolean(), z.stringbool()])`，布尔分支在前，并提供默认值 `false`。
- `replaceAll: false` 要求 `oldString` 恰好匹配一次；零次或多次都失败且不得写文件。
- `replaceAll: true` 要求至少匹配一次，并替换全部匹配。
- `oldString` 不得为空，避免无意义的全文件插入式替换。
- 写入采用临时文件后 rename 的原子策略；不能直接截断原文件后写入。
- 不引入新依赖，不修改既有 `FileReadTool` 行为，不接 Agent loop。
- 失败信息包含 `file_edit:` 前缀；所有失败路径都不应留下临时文件。

---

## 文件结构

- Create: `libs/tools/repo/file-edit-tool.ts` — schema、结果类型、精确替换、原子写入。
- Modify: `libs/tools/repo/index.ts` — 导出 `fileEditTool`、参数和结果类型。
- Modify: `libs/tools/index.ts` — 保持 repo barrel 的公共导出可从 `libs/tools` 使用。
- Create: `tests/libs/tools/repo/file-edit-tool.test.ts` — schema、匹配语义、IO 和原子写入行为。
- Create: `examples/day15/ex_001_file_edit.ts` — 手跑 `file_read → file_edit` 的最小演示。
- Modify: `docs/daily/day14.md` — 将 FileEditTool 的下一步范围与实际实现状态记录清楚；不把第二阶段 Agent loop 写成已完成。

---

### Task 1: 先建立 FileEditTool 的失败测试

**Files:**
- Create: `tests/libs/tools/repo/file-edit-tool.test.ts`

**Interfaces:**
- Consumes: `fileEditTool` and `ToolRegistry` from `libs/tools`.
- Produces: executable expectations for `FileEditResult` with `path`, `replacements`, `content`, and `diff`.

- [ ] **Step 1: 写测试夹具和成功路径测试**

测试必须使用 `fs.mkdtemp` 建临时目录，并在每个用例结束后 `rm(..., { recursive: true, force: true })`；通过 `registry.execute('file_edit', rawArgs)` 调用，验证 schema 默认值会被填充。至少覆盖：

```ts
const result = await registry.execute('file_edit', {
  path: file,
  oldString: 'const answer = 1;',
  newString: 'const answer = 42;',
});
expect(result).toMatchObject({ path: file, replacements: 1 });
expect(await readFile(file, 'utf8')).toContain('const answer = 42;');
```

- [ ] **Step 2: 写精确匹配和参数失败测试**

覆盖以下可观察行为：

```ts
await expect(edit({ oldString: 'missing' })).rejects.toThrow(/not found/);
await expect(edit({ oldString: 'x', newString: 'y' })).rejects.toThrow(/exactly once/); // 2 次匹配
await expect(edit({ oldString: '' })).rejects.toThrow(/oldString/);
await expect(edit({ path: 'relative/path' })).rejects.toThrow(/invalid arguments|absolute/);
await expect(edit({ replaceAll: 'false' })).resolves.toMatchObject({ replacements: 1 });
```

其中 `replaceAll: false` 的多匹配失败前后，断言原文件内容不变；`replaceAll: true` 断言全部替换且返回总次数。

- [ ] **Step 3: 写文件系统和结果测试**

覆盖不存在路径、目录路径、旧字符串含换行、文件末尾换行保持，以及返回内容和 diff 至少包含替换前后片段：

```ts
await expect(edit({ path: missingFile })).rejects.toThrow(/does not exist/);
await expect(edit({ path: tempDir })).rejects.toThrow(/not a file/);
expect(result.content).toBe(updatedContent);
expect(result.diff).toContain('-const answer = 1;');
expect(result.diff).toContain('+const answer = 42;');
```

- [ ] **Step 4: 运行失败测试确认红灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts`

Expected: FAIL because `fileEditTool` is not implemented/exported yet。

- [ ] **Step 5: Commit**

```bash
git add tests/libs/tools/repo/file-edit-tool.test.ts
git commit -m "test(day15): specify file edit safety contract"
```

---

### Task 2: 实现核心 FileEditTool

**Files:**
- Create: `libs/tools/repo/file-edit-tool.ts`

**Interfaces:**
- Consumes: `Tool` from `../tool.js`; Node `fs/promises` and `node:path`。
- Produces:

```ts
export type FileEditArgs = z.infer<typeof fileEditSchema>;
export interface FileEditResult {
  readonly path: string;
  readonly replacements: number;
  readonly content: string;
  readonly diff: string;
}
export const fileEditTool: Tool<typeof fileEditSchema, FileEditResult>;
```

- [ ] **Step 1: 定义 schema**

```ts
const looseBoolean = z.union([z.boolean(), z.stringbool()]);
const fileEditSchema = z.object({
  path: z.string().describe('Absolute path to the file to edit'),
  oldString: z.string().min(1).describe('Exact text to replace'),
  newString: z.string().describe('Replacement text'),
  replaceAll: looseBoolean.default(false).describe('Replace every match; default false'),
});
```

- [ ] **Step 2: 实现读取、前置条件和匹配计数**

只检查绝对路径、存在性、普通文件；读取 UTF-8。用 `indexOf` 循环计数，必须支持重叠匹配的确定性策略：匹配成功后按 `index + oldString.length` 前进；由于 `oldString` 非空，不会死循环。`replaceAll=false` 时匹配数不是 1 立即抛错，且不进入写入步骤。

- [ ] **Step 3: 实现替换和最小 diff**

`replaceAll=false` 用单次 `replace`；`true` 使用基于索引的拼接，避免把 `oldString` 当正则。结果 `content` 是完整新内容；`diff` 采用单文件摘要格式，至少包含 path、替换次数、一条 `-` 旧片段和一条 `+` 新片段，并对多匹配场景只输出摘要，避免把大文件整个复制进 tool result。

- [ ] **Step 4: 实现原子写入并清理临时文件**

临时文件放在原文件同目录，文件名包含 basename、进程号和随机后缀；先以 `wx` 创建并写入 UTF-8，再 `rename(tempPath, filePath)`。成功 rename 后不删除目标文件。任意写入/rename 异常进入 `finally`，尝试删除临时文件；清理失败不覆盖原始错误。

- [ ] **Step 5: 运行核心测试确认绿灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add libs/tools/repo/file-edit-tool.ts
git commit -m "feat(day15): add atomic file edit tool"
```

---

### Task 3: 接入公共导出并验证 Provider schema

**Files:**
- Modify: `libs/tools/repo/index.ts:13-20`
- Modify: `libs/tools/index.ts:7-11`
- Modify: `tests/libs/tools/repo/file-edit-tool.test.ts`

**Interfaces:**
- Consumes: `fileEditTool` from Task 2。
- Produces: `import { fileEditTool } from 'libs/tools'` and registry provider definition with `replaceAll` JSON Schema containing boolean-first `anyOf`。

- [ ] **Step 1: 在 repo barrel 增加导出**

加入：

```ts
export { fileEditTool, type FileEditArgs, type FileEditResult } from './file-edit-tool.js';
```

根 barrel 已有 `export * from './repo/index.js'`，仅确认无需重复命名导出。

- [ ] **Step 2: 增加 provider schema 断言**

```ts
const definition = new ToolRegistry();
definition.register(fileEditTool);
const provider = definition.toProviderTools().find((tool) => tool.name === 'file_edit');
expect(provider?.parameters).toMatchObject({ properties: { replaceAll: { anyOf: [{ type: 'boolean' }, { type: 'string' }] } } });
expect(provider?.parameters).not.toHaveProperty('required', expect.arrayContaining(['replaceAll']));
```

- [ ] **Step 3: 运行工具层测试**

Run: `pnpm test tests/libs/tools`

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add libs/tools/repo/index.ts libs/tools/index.ts tests/libs/tools/repo/file-edit-tool.test.ts
git commit -m "feat(day15): export file edit tool"
```

---

### Task 4: 增加 `file_read → file_edit` 手跑 example

**Files:**
- Create: `examples/day15/ex_001_file_edit.ts`

**Interfaces:**
- Consumes: `fileReadTool`, `fileEditTool`, `runTool`/`ToolRegistry`。
- Produces: 一个不修改仓库真实文件的 CLI 演示，创建临时 fixture，先读取带行号内容，再编辑，再读取验证，最后清理 fixture。

- [ ] **Step 1: 写 example**

Example 必须：

1. `mkdtemp` 创建临时目录；
2. 写入包含唯一目标字符串的 fixture；
3. 调用 `runTool(fileReadTool, { path: fixture })` 打印 `cat -n` 内容；
4. 调用 `runTool(fileEditTool, { path: fixture, oldString: ..., newString: ... })` 打印 replacements 和 diff；
5. 再次 `runTool(fileReadTool, ...)` 打印修改后内容；
6. `finally` 删除临时目录。

- [ ] **Step 2: 运行 example**

Run: `pnpm exec tsx examples/day15/ex_001_file_edit.ts`

Expected: exit 0；输出修改前/后带行号内容、`replacements: 1` 和 `-`/`+` diff。

- [ ] **Step 3: Commit**

```bash
git add examples/day15/ex_001_file_edit.ts
git commit -m "docs(day15): add file read edit example"
```

---

### Task 5: 同步 daily note 并做完整验证

**Files:**
- Modify: `docs/daily/day14.md`

**Interfaces:**
- Consumes: Tasks 1-4 的实际代码与命令输出。
- Produces: 文档明确区分：Day 14 RAG UI 已完成；FileEditTool 是后续阶段；Agent loop 仍未实现。

- [ ] **Step 1: 更新 Day 14 路线说明**

在现有“Day 15 路线预告”附近补充实际边界：`FileEditTool` 作为下一阶段独立任务，当前阶段不包含 Agent loop；只有在第二阶段完成后，才可声称形成“model 改 → tool 执行 → model 重新 file_read”的反馈回路。

- [ ] **Step 2: 跑全部质量闸**

Run:

```bash
pnpm typecheck
pnpm typecheck:web
pnpm lint
pnpm format:check
pnpm test
pnpm exec tsx examples/day15/ex_001_file_edit.ts
```

Expected: 所有命令 exit 0；测试全绿；example exit 0。

- [ ] **Step 3: 做 3 个反例验证**

分别验证：

1. 相对路径被 schema/execute 拒绝；
2. 多匹配且 `replaceAll=false` 时原文件保持不变；
3. `replaceAll='true'` 替换全部匹配。

记录命令和结果，确保文档不把未自动化的 Agent loop 写成已验证。

- [ ] **Step 4: Commit**

```bash
git add docs/daily/day14.md
git commit -m "docs(day15): record file edit boundary and verification"
```

---

## Self-Review Checklist

- [ ] Spec coverage：参数单一事实源、绝对路径、唯一/全部替换、行号配对、原子写入、测试和手跑 example 均有对应任务。
- [ ] Placeholder scan：计划中没有 `TBD`、泛化的“自行处理边界”或未定义函数；所有代码步骤都给出接口和验证命令。
- [ ] Type consistency：`FileEditArgs` / `FileEditResult` / `fileEditTool` 在 Task 2 定义，Task 1/3/4 使用一致。
- [ ] Scope check：本计划只实现 FileEditTool，不修改 Agent loop；Agent loop 另写设计和计划。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-07-file-edit-tool.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个任务派 fresh subagent，任务间做 review。

**2. Inline Execution** — 在当前会话按 executing-plans 分批执行并设置检查点。

请选择执行方式；在你选择前我不会修改实现代码。
