# FileEditTool Safety Hardening Plan (Review 5 项修复)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Step lists use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 FileEditTool review 提出的 5 个安全边界问题全部修复：错误前缀统一 / diff 大小上限 / 权限保持 / symlink 语义 / binary 文件检测。

**Architecture:** 在 `libs/tools/repo/file-edit-tool.ts` 内部增加：(a) 统一 try/catch 包装层把 `fs.writeFile` / `fs.rename` / `fs.stat` 的所有错误压成 `file_edit:` 前缀；(b) `buildDiffSummary` 加字节上限判断；(c) 写入前保留 `stat.mode` 并在 rename 成功后恢复；(d) 把 `fs.stat` 改为 `fs.lstat` 检测 symlink，对 symlink 显式拒绝；(e) 加 binary 文件嗅探：读前 8KB 检测 NUL 字节比例，超过阈值则抛 `file_edit:` 错误。

**Tech Stack:** TypeScript strict、Node.js `fs/promises`、Vitest、pnpm workspace。

**Spec:** 本计划覆盖 review 提的 5 个 finding，无需新写 spec；可参考 [libs/tools/repo/file-read-tool.ts](libs/tools/repo/file-read-tool.ts) 的同类安全处理风格。

## Global Constraints

- 既有 18 用例（[tests/libs/tools/repo/file-edit-tool.test.ts](tests/libs/tools/repo/file-edit-tool.test.ts)）必须**全部继续通过**；不允许改既有断言意图。
- 不动 `Tool<T` schema 契约；不动 `ToolRegistry.execute()` 校验入口（ADR 0003）。
- 不接 LangChain；不接 SSE；不引入新依赖；不修改 `package.json` 的 `dependencies`。
- 所有错误信息仍以 `file_edit:` 前缀开头，便于上游 tool_result 解析。
- 不触碰 symlink 的 platform 限制：Windows 上 symlink 创建需管理员或开发者模式；测试可在 skip 时说明；不能掩盖 Linux/macOS 上的语义。
- binary 嗅探阈值定义在常量；不引 magic-byte 表（YAGNI）；用 NUL 比例判定即可。
- 修复不引入「乐观默认」：`replaceAll=false` 多匹配必须报错并保持原文件不变（已有）；新增的 symlink / binary 错误路径同样不能让原文件被改动。

---

## 文件结构

- Modify: [libs/tools/repo/file-edit-tool.ts](libs/tools/repo/file-edit-tool.ts) — 5 个修复 + helper 提取。
- Modify: [tests/libs/tools/repo/file-edit-tool.test.ts](tests/libs/tools/repo/file-edit-tool.test.ts) — 新增 5 个 describe 块覆盖 5 项安全场景。
- Modify: [docs/daily/day15.md](docs/daily/day15.md) — 更新「本 day 已知遗留」段：FileEditTool review 5 项已修。
- 不修改 ADR 0003 / ADR 0005 / day14.md（这些 ADR 已正确记录契约，不含 review 待修项）。

---

### Task 1: 修复 1 — 统一写入/rename/stat 错误的 `file_edit:` 前缀

**Files:**
- Modify: `libs/tools/repo/file-edit-tool.ts:130-198`

**Interfaces:**
- Consumes: 现有 `execute(args)`；当前只有 `path` / `oldString` / `replaceAll` 错误有前缀。
- Produces: 所有 throw 都带 `file_edit:` 前缀；新增 `wrapFsError(stage, err)` helper。

- [ ] **Step 1: 写失败测试**

在 `tests/libs/tools/repo/file-edit-tool.test.ts` 末尾追加：

```ts
import { promises as fs } from 'node:fs';

describe('FileEditTool error prefix unification (Day 15 hardening)', () => {
  it('writeFile failure is wrapped with file_edit: prefix and original file is unchanged', async () => {
    const tmp = await fs.mkdtemp('/tmp/fedit-prefix-');
    try {
      const f = path.join(tmp, 'x.ts');
      await fs.writeFile(f, 'const answer = 1;\n');
      // 在同目录预占临时文件名让 wx flag 失败
      const sibling = path.join(tmp, `.x.ts.file-edit-${process.pid}-collide.tmp`);
      await fs.writeFile(sibling, '', 'utf8');
      // 直接调 execute 不走 helper：临时文件名碰撞触发 wx EEXIST。
      // 用 vi.spyOn 让 makeTempPath 返回 sibling。
      const tool = await import('../../../libs/tools/repo/file-edit-tool.js');
      // 这里我们改用注入方式：把目标路径锁定到 sibling 同样的目录，碰撞概率高；
      // 真正可重复的方式 = 预占 .file-edit- 前缀文件，然后用固定随机后缀撞上。
      // 简化：直接断言 path is read-only 的情况（chmod 0444 让 writeFile 抛 EACCES）
      await fs.chmod(f, 0o444);
      await expect(
        registry.execute('file_edit', { path: f, oldString: 'const answer = 1;', newString: 'const answer = 2;' }),
      ).rejects.toThrow(/^file_edit: /);
      const after = await fs.readFile(f, 'utf8');
      expect(after).toBe('const answer = 1;\n');
      await fs.chmod(f, 0o644);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
```

> 简化版测试：直接用 `chmod 0444` 让 writeFile 抛 EACCES，断言错误消息含 `file_edit:` 前缀，并断言原文件不变（即使 writeFile 失败，原子性应保留）。

- [ ] **Step 2: 跑测试确认红灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts -t "error prefix unification"`

Expected: FAIL，原 `execute` 在 `writeFile` EACCES 时抛裸 `EACCES` 不带前缀。

- [ ] **Step 3: 在 execute 内增加 wrapFsError**

修改 `libs/tools/repo/file-edit-tool.ts`：

```ts
import { promises as fs } from 'node:fs';

function wrapFsError(stage: string, err: unknown): Error {
  const reason = err instanceof Error ? err.message : String(err);
  return new Error(`file_edit: ${stage} failed: ${reason}`);
}
```

把 execute 内 `writeFile` / `rename` 包成 try/catch：

```ts
try {
  await fs.writeFile(tempPath, updated, { encoding: 'utf8', flag: 'wx' });
  tempCreated = true;
} catch (err) {
  throw wrapFsError('write temp file', err);
}
try {
  await fs.rename(tempPath, filePath);
} catch (err) {
  throw wrapFsError('rename into place', err);
}
```

stat 失败路径已有 `file_edit:` 前缀，无需改。`fs.rm` 临时清理仍是 catch-and-swallow（按现状）。

- [ ] **Step 4: 跑测试确认绿灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts`

Expected: 全部 19 用例 PASS（含新增 1）。

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/file-edit-tool.ts tests/libs/tools/repo/file-edit-tool.test.ts
git commit -m "fix(tool): wrap write/rename errors with file_edit: prefix"
```

---

### Task 2: 修复 2 — diff 大小上限（按字节总量而非匹配次数）

**Files:**
- Modify: `libs/tools/repo/file-edit-tool.ts:216-227`
- Modify: `libs/tools/repo/file-edit-tool.ts:1-30`（顶部注释同步更新）

**Interfaces:**
- Consumes: 既有 `buildDiffSummary`。
- Produces: 新增常量 `MAX_DIFF_OLD_BYTES = 200` / `MAX_DIFF_NEW_BYTES = 200`；单匹配时若 oldString 或 newString 超过字节上限，转成 `<N chars>` 摘要 + 提示调用方 file_read 复查。

- [ ] **Step 1: 写失败测试**

```ts
describe('FileEditTool diff size cap (Day 15 hardening)', () => {
  it('large single-match oldString is summarized not inlined', async () => {
    const tmp = await fs.mkdtemp('/tmp/fedit-diff-cap-');
    try {
      const f = path.join(tmp, 'big.ts');
      const oldBlock = 'a'.repeat(500);
      const newBlock = 'b'.repeat(500);
      await fs.writeFile(f, `prefix\n${oldBlock}\nsuffix\n`);
      const result = await registry.execute('file_edit', {
        path: f,
        oldString: oldBlock,
        newString: newBlock,
      });
      expect(result.replacements).toBe(1);
      expect(result.diff).toMatch(/<500 chars>/);
      expect(result.diff).not.toContain(oldBlock);
      expect(result.diff).toContain('(large match; read the file to verify)');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 跑测试确认红灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts -t "diff size cap"`

Expected: FAIL（当前实现对单匹配总是内联整段）。

- [ ] **Step 3: 修改 buildDiffSummary**

```ts
const MAX_DIFF_OLD_BYTES = 200;
const MAX_DIFF_NEW_BYTES = 200;

function buildDiffSummary(input: DiffSummaryInput): string {
  const { path: filePath, replacements, oldString, newString } = input;
  const head = `file_edit: ${filePath} (${replacements} replacement${replacements === 1 ? '' : 's'})`;
  if (replacements > 1) {
    return `${head}\n- <${oldString.length} chars>\n+ <${newString.length} chars>\n(multiple matches; read the file to verify)`;
  }
  const oldTruncated = oldString.length > MAX_DIFF_OLD_BYTES;
  const newTruncated = newString.length > MAX_DIFF_NEW_BYTES;
  if (oldTruncated || newTruncated) {
    return `${head}\n- <${oldString.length} chars>\n+ <${newString.length} chars>\n(large match; read the file to verify)`;
  }
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const oldBlock = oldLines.map((l) => `-${l}`).join('\n');
  const newBlock = newLines.map((l) => `+${l}`).join('\n');
  return `${head}\n${oldBlock}\n${newBlock}`;
}
```

- [ ] **Step 4: 跑测试确认绿灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts`

Expected: 20/20 PASS。

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/file-edit-tool.ts tests/libs/tools/repo/file-edit-tool.test.ts
git commit -m "fix(tool): cap diff summary by byte size, not match count"
```

---

### Task 3: 修复 3 — 写入后保留原文件权限位

**Files:**
- Modify: `libs/tools/repo/file-edit-tool.ts:170-183`

**Interfaces:**
- Consumes: 既有 `stat.mode`；`fs.chmod`。
- Produces: rename 成功后若原文件 mode 与临时文件 mode 不一致，调 `fs.chmod(target, stat.mode)` 恢复。

- [ ] **Step 1: 写失败测试**

```ts
describe('FileEditTool preserve file mode (Day 15 hardening)', () => {
  it('keeps original 0o600 permission after edit', async () => {
    const tmp = await fs.mkdtemp('/tmp/fedit-mode-');
    try {
      const f = path.join(tmp, 'priv.ts');
      await fs.writeFile(f, 'const a = 1;\n', { mode: 0o600 });
      const before = (await fs.stat(f)).mode & 0o777;
      expect(before).toBe(0o600);
      await registry.execute('file_edit', {
        path: f,
        oldString: 'const a = 1;',
        newString: 'const a = 2;',
      });
      const after = (await fs.stat(f)).mode & 0o777;
      expect(after).toBe(0o600);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('keeps original 0o755 permission after edit', async () => {
    const tmp = await fs.mkdtemp('/tmp/fedit-mode-');
    try {
      const f = path.join(tmp, 'script.sh');
      await fs.writeFile(f, 'echo hi\n', { mode: 0o755 });
      const before = (await fs.stat(f)).mode & 0o777;
      expect(before).toBe(0o755);
      await registry.execute('file_edit', {
        path: f,
        oldString: 'echo hi',
        newString: 'echo bye',
      });
      const after = (await fs.stat(f)).mode & 0o777;
      expect(after).toBe(0o755);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
```

> 单元测试在 Windows 上 chmod / mode 行为可能与 POSIX 不同。测试在 Windows 上跳过；CI Linux 跑。**前提**：仓库主 line 在 Linux/macOS CI 跑。

- [ ] **Step 2: 跑测试确认红灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts -t "preserve file mode"`

Expected: FAIL on POSIX / SKIP on Windows（写入后 mode 退化为 umask 默认）。

- [ ] **Step 3: 在 rename 成功后 chmod 还原**

```ts
const originalMode = stat.mode & 0o777;
try {
  await fs.writeFile(tempPath, updated, { encoding: 'utf8', flag: 'wx' });
  tempCreated = true;
} catch (err) {
  throw wrapFsError('write temp file', err);
}
try {
  await fs.rename(tempPath, filePath);
  // 还原原文件 mode（writeFile 用 umask 默认值，rename 继承临时文件的 mode）
  const newMode = (await fs.stat(filePath)).mode & 0o777;
  if (newMode !== originalMode) {
    await fs.chmod(filePath, originalMode);
  }
} catch (err) {
  throw wrapFsError('rename into place', err);
}
```

- [ ] **Step 4: 跑测试确认绿灯（POSIX 环境）**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts -t "preserve file mode"`

Expected: PASS。

> Windows 下若 mode 比对不工作，用 `it.runIf(process.platform !== 'win32')` 包裹避免挂；本计划默认保留直跑 + Windows 自动 NUL（POSIX 是真值）。

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/file-edit-tool.ts tests/libs/tools/repo/file-edit-tool.test.ts
git commit -m "fix(tool): preserve original file mode after atomic write"
```

---

### Task 4: 修复 4 — symlink 显式拒绝

**Files:**
- Modify: `libs/tools/repo/file-edit-tool.ts:136-143`

**Interfaces:**
- Consumes: 既有 `fs.stat`；`fs.lstat`。
- Produces: 入口用 `fs.lstat` 检测 symlink；若 `lstat` 结果是 symlink，抛 `file_edit: symlink not supported: <path>`。

- [ ] **Step 1: 写失败测试**

```ts
describe('FileEditTool symlink rejection (Day 15 hardening)', () => {
  it('rejects editing a symlink and leaves the link unchanged', async () => {
    const tmp = await fs.mkdtemp('/tmp/fedit-symlink-');
    try {
      const target = path.join(tmp, 'target.ts');
      await fs.writeFile(target, 'const a = 1;\n');
      const link = path.join(tmp, 'link.ts');
      await fs.symlink(target, link);
      await expect(
        registry.execute('file_edit', {
          path: link,
          oldString: 'const a = 1;',
          newString: 'const a = 2;',
        }),
      ).rejects.toThrow(/file_edit: symlink not supported/);
      // target 不应被改
      const after = await fs.readFile(target, 'utf8');
      expect(after).toBe('const a = 1;\n');
      // link 仍应是 symlink
      const lst = await fs.lstat(link);
      expect(lst.isSymbolicLink()).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 跑测试确认红灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts -t "symlink rejection"`

Expected: FAIL（当前 symlink 上 rename 会替换 symlink 本身）。

- [ ] **Step 3: 把 stat 改为 lstat 检测 symlink**

```ts
let lstat;
try {
  lstat = await fs.lstat(filePath);
} catch {
  throw new Error(`file_edit: path does not exist: ${filePath}`);
}
if (lstat.isSymbolicLink()) {
  throw new Error(
    `file_edit: symlink not supported: ${filePath} ` +
      `(resolve to the target path first; this avoids replacing the link with a regular file)`,
  );
}
if (!lstat.isFile()) {
  throw new Error(`file_edit: path is not a file: ${filePath}`);
}
const stat = lstat; // 后续 stat.mode 仍来自 lstat
```

> lstat 已经给出完整 stat 信息（除 symlink target），mode / size 准确。

- [ ] **Step 4: 跑测试确认绿灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts`

Expected: 21/21 PASS（POSIX 23 含 2 个 mode 测试；Windows 自动 NUL）。

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/file-edit-tool.ts tests/libs/tools/repo/file-edit-tool.test.ts
git commit -m "fix(tool): reject symlinks instead of replacing them"
```

---

### Task 5: 修复 5 — binary 文件检测

**Files:**
- Modify: `libs/tools/repo/file-edit-tool.ts:146`

**Interfaces:**
- Consumes: `fs.readFile(filePath, 'utf8')`；当前会把 binary 字节强转 UTF-8。
- Produces: 读取内容后做 binary 嗅探：取前 8KB（`BINARY_SNIFF_BYTES`），统计 NUL 字节比例 > `BINARY_RATIO`（默认 0.1 = 10%）→ 抛 `file_edit: binary file not supported: <path>`。

- [ ] **Step 1: 写失败测试**

```ts
describe('FileEditTool binary detection (Day 15 hardening)', () => {
  it('rejects editing a binary file with many NUL bytes', async () => {
    const tmp = await fs.mkdtemp('/tmp/fedit-binary-');
    try {
      const f = path.join(tmp, 'blob.bin');
      const buf = Buffer.concat([
        Buffer.from([0x00, 0xff, 0xfe, 0x41, 0x42, 0x43, 0x00, 0x00, 0x00]),
        Buffer.alloc(200, 0x00),
      ]);
      await fs.writeFile(f, buf);
      await expect(
        registry.execute('file_edit', {
          path: f,
          oldString: 'ABC',
          newString: 'XYZ',
        }),
      ).rejects.toThrow(/file_edit: binary file not supported/);
      // 原文件不变
      const after = await fs.readFile(f);
      expect(after.equals(buf)).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 跑测试确认红灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts -t "binary detection"`

Expected: FAIL（当前会把 binary 字节按 UTF-8 解码并替换 → `0x00` 变 `U+FFFD`，写入损坏）。

- [ ] **Step 3: 加 BINARY_SNIFF_BYTES / BINARY_RATIO 常量 + 嗅探**

在 `libs/tools/repo/file-edit-tool.ts` 顶部 helper 区域加：

```ts
const BINARY_SNIFF_BYTES = 8 * 1024;
const BINARY_RATIO = 0.1;

function looksBinary(content: string): boolean {
  const sniff = content.slice(0, BINARY_SNIFF_BYTES);
  if (sniff.length === 0) return false;
  let nulCount = 0;
  for (let i = 0; i < sniff.length; i++) {
    if (sniff.charCodeAt(i) === 0) nulCount++;
  }
  return nulCount / sniff.length > BINARY_RATIO;
}
```

在 `readFile` 之后调用：

```ts
const original = await fs.readFile(filePath, 'utf8');
if (looksBinary(original)) {
  throw new Error(
    `file_edit: binary file not supported: ${filePath} ` +
      `(looks binary by NUL ratio in first ${BINARY_SNIFF_BYTES} bytes; refuse to round-trip non-text bytes through UTF-8)`,
  );
}
```

> 注意：UTF-8 解码后 NUL 字节 `0x00` 仍为 `charCodeAt === 0`；其他高位字节（`0xff` 等）会被解码为 `U+FFFD`（`charCodeAt === 0xFFFD`），不算 NUL。比例阈值足以识别大多数 binary 文件。

- [ ] **Step 4: 跑测试确认绿灯**

Run: `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts`

Expected: 22/22 PASS。

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/file-edit-tool.ts tests/libs/tools/repo/file-edit-tool.test.ts
git commit -m "fix(tool): reject binary files by NUL ratio sniff"
```

---

### Task 6: 同步 day15.md 的「已知遗留」段

**Files:**
- Modify: `docs/daily/day15.md`

**Interfaces:**
- Consumes: Tasks 1–5 实际落地。
- Produces: 把「本 day 已知遗留」里 FileEditTool review 5 项状态从「未修」改成「已修」，列出 commit SHA。

- [ ] **Step 1: 改写该段**

把当前：

```md
- ⚠️ `FileEditTool` review 5 项（错误前缀统一 / diff 上限 / 权限 / symlink / binary）未修；user 决策「不修只验证」
```

改成：

```md
- ✅ `FileEditTool` review 5 项已修（错误前缀统一 / diff 大小上限 / 权限保留 / symlink 拒绝 / binary 检测）—— 详见 [libs/tools/repo/file-edit-tool.ts](../../libs/tools/repo/file-edit-tool.ts) 的对应 commit 与本 day 「踩坑与修复」段。
```

并在「踩坑与修复」段追加 5 项总结（每项 1 行：症状 / 根因 / 修法 / Why）。

- [ ] **Step 2: Commit**

```bash
git add docs/daily/day15.md
git commit -m "docs(day15): record FileEditTool review 5 hardening commits"
```

---

### Task 7: 跑全部质量门禁 + Plan A 反例验证

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

Expected: 全部 exit 0；`tests/libs/tools/repo/file-edit-tool.test.ts` 现 ~22 用例 PASS（含既有 18 + 新增 5）。Windows 上 mode 测试可能 NUL / skip，但 schema / diff / symlink / binary / prefix 测试均 PASS。

- [ ] **Step 2: 跑 example + 反例验证**

Run:

```bash
pnpm exec tsx examples/day15/ex_001_file_edit.ts
pnpm exec tsx examples/day15/ex_002_edit_agent.ts
```

Expected: 全部 exit 0。

- [ ] **Step 3: 跑 3 个反例（手跑或临时脚本）**

- 反例 1：相对路径 → `file_edit: path must be absolute`
- 反例 2：multi-match + replaceAll=false → throw + 原文件 byte-equal 不变
- 反例 3：binary 文件（写 NUL>10% 的内容）→ `file_edit: binary file not supported` + 原文件不变

---

## Self-Review Checklist

- [ ] Spec coverage：5 项修复（错误前缀统一 / diff 大小上限 / 权限 / symlink / binary）全部对应到 Task 1–5。
- [ ] Placeholder scan：无 `TBD` / 泛化「自行处理」；所有代码块给出接口与运行命令。
- [ ] Type consistency：`wrapFsError` / `buildDiffSummary` / `looksBinary` 在 Task 1/2/5 定义，Task 6 文档引用一致。
- [ ] Scope check：本计划只修 FileEditTool；不动 Agent loop / LangChain / FileReadTool / ToolRegistry。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-08-file-edit-tool-hardening.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + review between tasks.

**2. Inline Execution** — execute tasks in this session with checkpoints.

请选择执行方式。在你选择前我不会动实现代码。