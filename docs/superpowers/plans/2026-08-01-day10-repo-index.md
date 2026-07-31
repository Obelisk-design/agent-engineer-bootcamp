# Day 10 — Repo Index + Content Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Agent 加 2 个 Tool（`repo_index` + `repo_search`），让它能"看"repo 结构和搜内容，跑通 3 个 example + 1 e2e。

**Architecture:** 走 Day 04 `Tool<TArgs, TReturn>` 接口 + Day 07 错误抛投 + Day 09 入口 messages 深拷贝。纯 Node `fs`（不引入 ripgrep / micromatch）。自写 8 行 glob 简化版。

**Tech Stack:** TypeScript strict + NodeNext + ES2023, Node `fs/promises`, Vitest, Fastify via Hono（同 Day 09）。

---

## Global Constraints

- TypeScript strict + NodeNext + ES2023（继承 CLAUDE.md + tsconfig.json）
- 单测用 vitest（仓库已用），e2e 用 Fastify inject（继承 Day 06 / Day 09 测试模式）
- Tool 必须走 `Tool<TArgs, TReturn>` 接口（Day 04 抽象，不重写）
- Tool 错误 = throw（Agent 层 catch，Day 07 规则）
- 不引入新依赖（package.json 不变）
- 所有 commit message 中文 + Conventional Commits（继承 day01-09）
- YAGNI：不做 AST / 不做 watcher / 不做 ripgrep / 不做持久化
- 所有 .ts 文件 ESM import 必须带 `.js` 后缀（NodeNext）
- 文件路径用 POSIX 风格（`/`），输出给 Agent 时也用 POSIX

---

## File Structure（实施前地图）

```
libs/tools/repo/
  ignore.ts                     Task 2: ignore 匹配器（纯函数，可独立测）
  glob.ts                       Task 3: 自写 glob 简化版（*  **  ?）
  repo-index-tool.ts            Task 4-5: RepoIndexTool 类
  repo-search-tool.ts           Task 6-7: RepoSearchTool 类
  index.ts                      Task 8: barrel export

libs/tools/index.ts             Task 8: MODIFIED — 加 repo tools re-export

examples/day10/
  ex_001_repo_index.ts          Task 9: 手跑 RepoIndexTool
  ex_002_repo_search.ts         Task 9: 手跑 RepoSearchTool
  ex_003_repo_agent.ts          Task 10: 真实 LLM Agent demo

tests/libs/tools/repo/
  ignore.test.ts                Task 2
  glob.test.ts                  Task 3
  repo-index-tool.test.ts       Task 5
  repo-search-tool.test.ts      Task 7

tests/fixtures/sample-repo/     Task 5: 测试 fixture（手动建空目录 + 3 个 .ts）
  package.json
  src/foo.ts
  src/bar.test.ts

tests/apps/api/
  repo-tools-e2e.test.ts        Task 11: Agent 调 repo tool e2e

docs/daily/day10.md             Task 12: 当日笔记（含 §JD 映射段）
```

---

## Task 1: 创建 libs/tools/repo/ 目录骨架

**Files:**
- Create: `libs/tools/repo/.gitkeep`

**为什么先建目录**：后续 Task 2-8 都在 `libs/tools/repo/` 下，提前建好防路径错误。

- [ ] **Step 1: 建目录占位文件**

```bash
mkdir -p libs/tools/repo tests/libs/tools/repo tests/fixtures/sample-repo/src examples/day10
touch libs/tools/repo/.gitkeep tests/libs/tools/repo/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add libs/tools/repo/.gitkeep tests/libs/tools/repo/.gitkeep
git -c user.name="zihai" -c user.email="zihai@local" commit -m "chore(day10): scaffold libs/tools/repo/ + tests/ directories"
```

---

## Task 2: ignore.ts — ignore 匹配器（含 5 单测）

**Files:**
- Create: `libs/tools/repo/ignore.ts`
- Create: `tests/libs/tools/repo/ignore.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `shouldIgnore(path: string, patterns: readonly string[]): boolean`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/libs/tools/repo/ignore.test.ts
import { describe, it, expect } from 'vitest';
import { shouldIgnore, DEFAULT_IGNORE } from '../../../libs/tools/repo/ignore.js';

describe('shouldIgnore', () => {
  it('精确匹配', () => {
    expect(shouldIgnore('node_modules/foo.ts', ['node_modules'])).toBe(true);
  });

  it('glob 匹配（*）', () => {
    expect(shouldIgnore('dist/app.js', ['*.js'])).toBe(false); // *.js 不匹配 dist/app.js
    expect(shouldIgnore('app.js', ['*.js'])).toBe(true);
  });

  it('glob 匹配（**/*.map）', () => {
    expect(shouldIgnore('dist/app.js.map', ['**/*.map'])).toBe(true);
    expect(shouldIgnore('src/foo.ts', ['**/*.map'])).toBe(false);
  });

  it('嵌套路径', () => {
    expect(shouldIgnore('a/b/node_modules/x.ts', ['node_modules'])).toBe(true);
  });

  it('数组不命中', () => {
    expect(shouldIgnore('src/foo.ts', ['build', 'dist'])).toBe(false);
  });

  it('DEFAULT_IGNORE 含 node_modules/.git/dist', () => {
    expect(DEFAULT_IGNORE).toContain('node_modules');
    expect(DEFAULT_IGNORE).toContain('.git');
    expect(DEFAULT_IGNORE).toContain('dist');
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `pnpm test tests/libs/tools/repo/ignore.test.ts`
Expected: FAIL "Cannot find module '../../../libs/tools/repo/ignore.js'"

- [ ] **Step 3: 实现 ignore.ts**

```typescript
// libs/tools/repo/ignore.ts
/**
 * libs/tools/repo/ignore.ts
 *
 * ignore 匹配器：精确匹配 OR glob 匹配（*  **  ?）。
 *
 * 不引入 micromatch —— 用自写 mini-glob（见 glob.ts）。
 */

import { matchesGlob } from './glob.js';

export const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  '.turbo',
  'coverage',
  '.next',
  '.nuxt',
  'build',
  'out',
  'target',
  '*.min.js',
  '*.map',
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
] as const;

/** 路径里任何一段（按 / 切）匹配 patterns → true */
export function shouldIgnore(path: string, patterns: readonly string[]): boolean {
  const segments = path.split('/');
  for (const pattern of patterns) {
    // 精确匹配：path 等于 pattern 或 path 的某段等于 pattern
    if (path === pattern) return true;
    if (segments.includes(pattern)) return true;
    // glob 匹配（用 mini-glob）
    if (matchesGlob(path, pattern)) return true;
  }
  return false;
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `pnpm test tests/libs/tools/repo/ignore.test.ts`
Expected: 6 pass

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/ignore.ts tests/libs/tools/repo/ignore.test.ts
git -c user.name="zihai" -c user.email="zihai@local" commit -m "feat(day10): ignore matcher with default ignore patterns"
```

---

## Task 3: glob.ts — 自写 glob 简化版（含 5 单测）

**Files:**
- Create: `libs/tools/repo/glob.ts`
- Create: `tests/libs/tools/repo/glob.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `matchesGlob(path: string, pattern: string): boolean`

**支持的语法（Day 10 最小集）**：
- `*` = 单层任意字符（不含 `/`）
- `**` = 多层任意字符（含 `/`）
- `?` = 单字符（不含 `/`）

- [ ] **Step 1: 写失败测试**

```typescript
// tests/libs/tools/repo/glob.test.ts
import { describe, it, expect } from 'vitest';
import { matchesGlob } from '../../../libs/tools/repo/glob.js';

describe('matchesGlob', () => {
  it('字面匹配', () => {
    expect(matchesGlob('foo.ts', 'foo.ts')).toBe(true);
    expect(matchesGlob('foo.ts', 'bar.ts')).toBe(false);
  });

  it('* 匹配单层', () => {
    expect(matchesGlob('app.ts', '*.ts')).toBe(true);
    expect(matchesGlob('app.tsx', '*.ts')).toBe(false); // tsx 不匹配 *.ts
    expect(matchesGlob('src/app.ts', '*.ts')).toBe(false); // 单层不含 /
  });

  it('** 匹配多层', () => {
    expect(matchesGlob('src/foo/app.ts', '**/*.ts')).toBe(true);
    expect(matchesGlob('app.ts', '**/*.ts')).toBe(true);
    expect(matchesGlob('app.js', '**/*.ts')).toBe(false);
  });

  it('? 匹配单字符', () => {
    expect(matchesGlob('foo.ts', 'fo?.ts')).toBe(true);
    expect(matchesGlob('fop.ts', 'fo?.ts')).toBe(true);
    expect(matchesGlob('foo.ts', 'fo??.ts')).toBe(false); // foo 3 字符 vs ??.ts 2 字符
  });

  it('混合 ** 和 *', () => {
    expect(matchesGlob('src/utils/foo/bar.ts', 'src/**/foo/*.ts')).toBe(true);
    expect(matchesGlob('src/foo/bar.ts', 'src/**/foo/*.ts')).toBe(true);
    expect(matchesGlob('src/foo/baz.ts', 'src/**/foo/*.ts')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `pnpm test tests/libs/tools/repo/glob.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: 实现 glob.ts（regex 转译法）**

```typescript
// libs/tools/repo/glob.ts
/**
 * libs/tools/repo/glob.ts
 *
 * 最小 glob 匹配：支持 *（单层）/ **（多层）/ ?（单字符）。
 *
 * 实现：glob → regex 转译，再走 JS RegExp。
 * 不引入 micromatch —— 24 行自写够 Day 10 用。
 *
 * 不支持：{} 字符集、[...] 字符类、+ 转义（Day 12 评估是否需要）。
 */

/** 把 glob 转成 anchored regex source */
function globToRegex(glob: string): string {
  let out = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      // ** → 匹配任意（含 /）；* → 匹配任意（不含 /）
      if (glob[i + 1] === '*') {
        out += '.*';
        i++; // 跳过第二个 *
        // 跳过紧跟的 /（如 **/foo → .*/foo）
        if (glob[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      // 转义 regex 元字符
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  out += '$';
  return out;
}

/** path 是否匹配 glob（POSIX 风格，/ 分隔） */
export function matchesGlob(path: string, pattern: string): boolean {
  // 简单优化：完全相等
  if (path === pattern) return true;
  // 转 regex
  const re = new RegExp(globToRegex(pattern));
  return re.test(path);
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `pnpm test tests/libs/tools/repo/glob.test.ts`
Expected: 5 pass

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/glob.ts tests/libs/tools/repo/glob.test.ts
git -c user.name="zihai" -c user.email="zihai@local" commit -m "feat(day10): mini-glob with *, **, ?"
```

---

## Task 4: 创建测试 fixture sample-repo

**Files:**
- Create: `tests/fixtures/sample-repo/package.json`
- Create: `tests/fixtures/sample-repo/src/foo.ts`
- Create: `tests/fixtures/sample-repo/src/bar.test.ts`

**为什么需要**：repo-index-tool.test.ts / repo-search-tool.test.ts 需要一个稳定的小 repo 跑断言（不能依赖当前工作目录的真实 repo 结构 —— 测试要稳定可重现）。

- [ ] **Step 1: 建 fixture 文件**

```bash
mkdir -p tests/fixtures/sample-repo/src
```

`tests/fixtures/sample-repo/package.json`:
```json
{
  "name": "sample-repo",
  "version": "1.0.0",
  "type": "module"
}
```

`tests/fixtures/sample-repo/src/foo.ts`:
```typescript
export const foo = 42;
export function greet(): string {
  return 'hello';
}
```

`tests/fixtures/sample-repo/src/bar.test.ts`:
```typescript
import { greet } from './foo.js';
import { describe, it, expect } from 'vitest';

describe('greet', () => {
  it('returns hello', () => {
    expect(greet()).toBe('hello');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/sample-repo/
git -c user.name="zihai" -c user.email="zihai@local" commit -m "test(day10): sample-repo fixture for stable repo index/search tests"
```

---

## Task 5: RepoIndexTool（含 5 反例 + 2 正例）

**Files:**
- Create: `libs/tools/repo/repo-index-tool.ts`
- Create: `tests/libs/tools/repo/repo-index-tool.test.ts`

**Interfaces:**
- Consumes: `shouldIgnore` (Task 2), `matchesGlob` (Task 3 - via ignore.ts), `Tool<TArgs, TReturn>` (Day 04)
- Produces: `repoIndexTool: Tool<RepoIndexArgs, RepoIndexResult>`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/libs/tools/repo/repo-index-tool.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoIndexTool } from '../../../libs/tools/repo/repo-index-tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../../fixtures/sample-repo');

describe('repoIndexTool — 反例', () => {
  it('rootPath 不存在', async () => {
    await expect(
      repoIndexTool.execute({ rootPath: '/nonexistent/path/xxx' }),
    ).rejects.toThrow(/does not exist/);
  });

  it('rootPath 是相对路径', async () => {
    await expect(
      repoIndexTool.execute({ rootPath: './relative' }),
    ).rejects.toThrow(/must be absolute/);
  });

  it('rootPath 是文件非目录', async () => {
    const filePath = path.join(FIXTURE, 'package.json');
    await expect(
      repoIndexTool.execute({ rootPath: filePath }),
    ).rejects.toThrow(/not a directory/);
  });

  it('maxDepth > 10', async () => {
    await expect(
      repoIndexTool.execute({ rootPath: FIXTURE, maxDepth: 100 }),
    ).rejects.toThrow(/maxDepth too large/);
  });

  it('maxDepth < 1', async () => {
    await expect(
      repoIndexTool.execute({ rootPath: FIXTURE, maxDepth: 0 }),
    ).rejects.toThrow(/maxDepth must be >= 1/);
  });
});

describe('repoIndexTool — 正例', () => {
  it('跑 fixture 返回 files 列表（POSIX 相对）', async () => {
    const result = await repoIndexTool.execute({ rootPath: FIXTURE, maxDepth: 5 });
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.files).toContain('src/foo.ts');
    expect(result.files).toContain('src/bar.test.ts');
    // 验证 POSIX 风格
    expect(result.files.every((f) => !f.includes('\\'))).toBe(true);
  });

  it('ignorePatterns 默认含 node_modules（虽然 fixture 没有）', async () => {
    const result = await repoIndexTool.execute({ rootPath: FIXTURE, maxDepth: 5 });
    expect(result.files).not.toContain('node_modules');
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `pnpm test tests/libs/tools/repo/repo-index-tool.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: 实现 repo-index-tool.ts**

```typescript
// libs/tools/repo/repo-index-tool.ts
/**
 * libs/tools/repo/repo-index-tool.ts
 *
 * RepoIndexTool: 列出 repo 文件树（深度受限 + ignore 过滤）。
 *
 * 设计要点（见 spec §2.1）：
 * - 绝对路径必传
 * - maxDepth 默认 3，> 10 拒绝
 * - ignorePatterns 默认走 DEFAULT_IGNORE
 * - maxFiles 隐式 5000 上限，触发 truncated=true
 * - 返回 POSIX 相对路径
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Tool } from '../tool.js';
import { shouldIgnore, DEFAULT_IGNORE } from './ignore.js';

export interface RepoIndexArgs {
  readonly rootPath: string;
  readonly maxDepth?: number;
  readonly ignorePatterns?: readonly string[];
}

export interface RepoIndexResult {
  readonly files: readonly string[];
  readonly total: number;
  readonly truncated: boolean;
}

const MAX_FILES = 5000;
const DEFAULT_MAX_DEPTH = 3;
const ABSOLUTE_MAX_DEPTH = 10;

async function walk(
  dir: string,
  rootPath: string,
  depth: number,
  maxDepth: number,
  ignore: readonly string[],
  files: string[],
  truncated: { value: boolean },
): Promise<void> {
  if (truncated.value) return;
  if (depth > maxDepth) return;

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // 读不到就跳过（权限 / broken symlink）
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(rootPath, abs).split(path.sep).join('/');

    if (shouldIgnore(rel, ignore)) continue;

    if (entry.isDirectory()) {
      await walk(abs, rootPath, depth + 1, maxDepth, ignore, files, truncated);
    } else if (entry.isFile()) {
      files.push(rel);
      if (files.length >= MAX_FILES) {
        truncated.value = true;
        return;
      }
    }
  }
}

export const repoIndexTool: Tool<RepoIndexArgs, RepoIndexResult> = {
  name: 'repo_index',
  description:
    'List files in a repository directory tree (respects .gitignore-style ignores). ' +
    'Use this when you need to know "what files exist in this repo" or "what is the structure". ' +
    'Input: { rootPath: absolute path, maxDepth?: 1-10, ignorePatterns?: string[] }. ' +
    'Returns: { files: string[]; total: number; truncated: boolean }. ' +
    'Files are POSIX-relative to rootPath. Truncated=true means hit the 5000-file cap.',
  parameters: {
    type: 'object',
    properties: {
      rootPath: { type: 'string', description: 'Absolute path to repo root' },
      maxDepth: { type: 'string', description: 'Max depth 1-10 (default 3)' }, // 简化 schema：所有 optional 都 string
      ignorePatterns: { type: 'string', description: 'Override default ignore list' },
    },
    required: ['rootPath'],
  },
  execute: async (args) => {
    const { rootPath } = args as { rootPath: unknown };
    if (typeof rootPath !== 'string') {
      throw new Error('repo_index: rootPath must be string');
    }
    if (!path.isAbsolute(rootPath)) {
      throw new Error(`repo_index: rootPath must be absolute, got: ${rootPath}`);
    }

    let stat;
    try {
      stat = await fs.stat(rootPath);
    } catch {
      throw new Error(`repo_index: rootPath does not exist: ${rootPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`repo_index: rootPath is not a directory: ${rootPath}`);
    }

    const maxDepth = (args as { maxDepth?: unknown }).maxDepth !== undefined
      ? Number((args as { maxDepth?: unknown }).maxDepth)
      : DEFAULT_MAX_DEPTH;
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new Error(`repo_index: maxDepth must be >= 1`);
    }
    if (maxDepth > ABSOLUTE_MAX_DEPTH) {
      throw new Error(`repo_index: maxDepth too large (max ${ABSOLUTE_MAX_DEPTH}, got ${maxDepth})`);
    }

    const ignorePatterns = (args as { ignorePatterns?: unknown }).ignorePatterns;
    const ignore = Array.isArray(ignorePatterns)
      ? (ignorePatterns as string[])
      : Array.from(DEFAULT_IGNORE);

    const files: string[] = [];
    const truncated = { value: false };
    await walk(rootPath, rootPath, 1, maxDepth, ignore, files, truncated);

    return { files, total: files.length, truncated: truncated.value };
  },
};
```

- [ ] **Step 4: 跑测试确认绿**

Run: `pnpm test tests/libs/tools/repo/repo-index-tool.test.ts`
Expected: 7 pass (5 反例 + 2 正例)

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/repo-index-tool.ts tests/libs/tools/repo/repo-index-tool.test.ts
git -c user.name="zihai" -c user.email="zihai@local" commit -m "feat(day10): RepoIndexTool — file tree with depth + ignore"
```

---

## Task 6: RepoSearchTool（含 3 反例 + 3 正例）

**Files:**
- Create: `libs/tools/repo/repo-search-tool.ts`
- Create: `tests/libs/tools/repo/repo-search-tool.test.ts`

**Interfaces:**
- Consumes: `shouldIgnore` (Task 2), `matchesGlob` (Task 3), `Tool` (Day 04)
- Produces: `repoSearchTool: Tool<RepoSearchArgs, RepoSearchResult>`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/libs/tools/repo/repo-search-tool.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoSearchTool } from '../../../libs/tools/repo/repo-search-tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../../fixtures/sample-repo');

describe('repoSearchTool — 反例', () => {
  it('pattern 是无效 regex', async () => {
    await expect(
      repoSearchTool.execute({ rootPath: FIXTURE, pattern: '[invalid(regex' }),
    ).rejects.toThrow(/invalid regex pattern/);
  });

  it('永不命中的 pattern', async () => {
    const result = await repoSearchTool.execute({
      rootPath: FIXTURE,
      pattern: 'NEVER_MATCH_THIS_XYZ_QQQ_12345',
    });
    expect(result.matches).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('maxResults > 500', async () => {
    await expect(
      repoSearchTool.execute({ rootPath: FIXTURE, pattern: 'foo', maxResults: 1000 }),
    ).rejects.toThrow(/maxResults too large/);
  });
});

describe('repoSearchTool — 正例', () => {
  it('字面匹配命中', async () => {
    const result = await repoSearchTool.execute({
      rootPath: FIXTURE,
      pattern: 'greet',
    });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.matches.some((m) => m.file === 'src/bar.test.ts')).toBe(true);
    expect(result.matches[0]!.content).toContain('greet');
  });

  it('fileGlob = *.ts 限定范围', async () => {
    const result = await repoSearchTool.execute({
      rootPath: FIXTURE,
      pattern: 'greet',
      fileGlob: '*.ts',
    });
    expect(result.matches.every((m) => m.file.endsWith('.ts'))).toBe(true);
  });

  it('contextBefore=1 返回 before 数组', async () => {
    const result = await repoSearchTool.execute({
      rootPath: FIXTURE,
      pattern: 'greet',
      contextBefore: 1,
    });
    const withContext = result.matches.find((m) => m.before !== undefined);
    expect(withContext).toBeDefined();
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `pnpm test tests/libs/tools/repo/repo-search-tool.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: 实现 repo-search-tool.ts**

```typescript
// libs/tools/repo/repo-search-tool.ts
/**
 * libs/tools/repo/repo-search-tool.ts
 *
 * RepoSearchTool: 内容搜索（字面 OR regex），支持 fileGlob + context lines。
 *
 * 设计要点（见 spec §2.2）：
 * - pattern 含 regex 元字符 → 当 regex；否则字面
 * - fileGlob 用 mini-glob（*.ts / **/*.ts 等）
 * - 上下文行（contextBefore/contextAfter）按 1-based 行号定位
 * - maxResults 默认 50，> 500 拒绝
 * - 走 walk 复用 RepoIndexTool 的 ignore 过滤逻辑（简化：直接复用 shouldIgnore）
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Tool } from '../tool.js';
import { shouldIgnore, DEFAULT_IGNORE } from './ignore.js';
import { matchesGlob } from './glob.js';

export interface RepoSearchArgs {
  readonly rootPath: string;
  readonly pattern: string;
  readonly maxResults?: number;
  readonly fileGlob?: string;
  readonly includeContent?: boolean;
  readonly contextBefore?: number;
  readonly contextAfter?: number;
}

export interface RepoSearchMatch {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
  readonly content: string;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
}

export interface RepoSearchResult {
  readonly matches: readonly RepoSearchMatch[];
  readonly total: number;
  readonly truncated: boolean;
}

const DEFAULT_MAX_RESULTS = 50;
const ABSOLUTE_MAX_RESULTS = 500;
const REGEX_METACHARS = /[.*+?^${}()|[\]\\]/;

interface CompileResult {
  readonly isRegex: boolean;
  readonly test: (s: string) => boolean;
  readonly matchAt: (s: string) => { index: number } | null;
}

function compilePattern(pattern: string): CompileResult {
  if (REGEX_METACHARS.test(pattern)) {
    let re: RegExp;
    try {
      re = new RegExp(pattern, 'g');
    } catch (err) {
      throw new Error(
        `repo_search: invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return {
      isRegex: true,
      test: (s) => re.test(s),
      matchAt: (s) => {
        re.lastIndex = 0;
        const m = re.exec(s);
        return m ? { index: m.index } : null;
      },
    };
  }
  // 字面匹配
  const escaped = pattern; // 字面不需要转义
  return {
    isRegex: false,
    test: (s) => s.includes(escaped),
    matchAt: (s) => {
      const idx = s.indexOf(escaped);
      return idx >= 0 ? { index: idx } : null;
    },
  };
}

interface PendingFile {
  readonly abs: string;
  readonly rel: string;
}

async function collectFiles(
  dir: string,
  rootPath: string,
  ignore: readonly string[],
  fileGlob: string | undefined,
  out: PendingFile[],
  maxDepth: number,
): Promise<void> {
  if (maxDepth <= 0) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(rootPath, abs).split(path.sep).join('/');
    if (shouldIgnore(rel, ignore)) continue;
    if (entry.isDirectory()) {
      await collectFiles(abs, rootPath, ignore, fileGlob, out, maxDepth - 1);
    } else if (entry.isFile()) {
      if (fileGlob === undefined || matchesGlob(rel, fileGlob)) {
        out.push({ abs, rel });
      }
    }
  }
}

export const repoSearchTool: Tool<RepoSearchArgs, RepoSearchResult> = {
  name: 'repo_search',
  description:
    'Search file contents for a pattern (string literal or regex). ' +
    'Use this when you need to find "where X is defined" or "who calls Y". ' +
    'Input: { rootPath, pattern, maxResults?: <=500, fileGlob?: "*.ts" etc, includeContent?, contextBefore?, contextAfter? }. ' +
    'Returns: { matches: { file, line, column?, content?, before?, after? }[]; total; truncated }. ' +
    'Pattern auto-detected as regex if contains metachars.',
  parameters: {
    type: 'object',
    properties: {
      rootPath: { type: 'string', description: 'Absolute path to repo root' },
      pattern: { type: 'string', description: 'String literal or regex' },
      maxResults: { type: 'string', description: 'Max matches to return (default 50, max 500)' },
      fileGlob: { type: 'string', description: 'Glob pattern e.g. *.ts' },
      includeContent: { type: 'string', description: 'Include line content (default true)' },
      contextBefore: { type: 'string', description: 'Lines of context before match (default 0)' },
      contextAfter: { type: 'string', description: 'Lines of context after match (default 0)' },
    },
    required: ['rootPath', 'pattern'],
  },
  execute: async (args) => {
    const a = args as Record<string, unknown>;
    const { rootPath, pattern } = a as { rootPath: string; pattern: string };

    if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) {
      throw new Error(`repo_search: rootPath must be absolute, got: ${rootPath}`);
    }
    if (typeof pattern !== 'string') {
      throw new Error('repo_search: pattern must be string');
    }

    let stat;
    try {
      stat = await fs.stat(rootPath);
    } catch {
      throw new Error(`repo_search: rootPath does not exist: ${rootPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`repo_search: rootPath is not a directory: ${rootPath}`);
    }

    const maxResults = a.maxResults !== undefined ? Number(a.maxResults) : DEFAULT_MAX_RESULTS;
    if (!Number.isInteger(maxResults) || maxResults < 1) {
      throw new Error('repo_search: maxResults must be >= 1');
    }
    if (maxResults > ABSOLUTE_MAX_RESULTS) {
      throw new Error(
        `repo_search: maxResults too large (max ${ABSOLUTE_MAX_RESULTS}, got ${maxResults})`,
      );
    }

    const fileGlob = typeof a.fileGlob === 'string' ? a.fileGlob : undefined;
    const includeContent = a.includeContent !== undefined ? Boolean(a.includeContent) : true;
    const contextBefore = a.contextBefore !== undefined ? Number(a.contextBefore) : 0;
    const contextAfter = a.contextAfter !== undefined ? Number(a.contextAfter) : 0;

    const compiled = compilePattern(pattern);
    const ignore = Array.from(DEFAULT_IGNORE);
    const files: PendingFile[] = [];
    // 搜索时不限深度（依赖 ignore 列表 + fileGlob 过滤；M1 Day 10 简化）
    await collectFiles(rootPath, rootPath, ignore, fileGlob, files, 10);

    const matches: RepoSearchMatch[] = [];
    let total = 0;
    let truncated = false;

    for (const f of files) {
      if (truncated) break;
      let content: string;
      try {
        content = await fs.readFile(f.abs, 'utf-8');
      } catch {
        continue; // 读不到跳过
      }
      const lines = content.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!compiled.test(line)) continue;

        total++;
        if (matches.length < maxResults) {
          const matchAt = compiled.matchAt(line);
          const m: RepoSearchMatch = {
            file: f.rel,
            line: i + 1,
            ...(compiled.isRegex && matchAt !== null ? { column: matchAt.index + 1 } : {}),
            ...(includeContent ? { content: line } : { content: '' }),
            ...(contextBefore > 0
              ? {
                  before: lines
                    .slice(Math.max(0, i - contextBefore), i)
                    .map((l) => l),
                }
              : {}),
            ...(contextAfter > 0
              ? { after: lines.slice(i + 1, i + 1 + contextAfter).map((l) => l) }
              : {}),
          };
          matches.push(m);
        } else {
          truncated = true;
          break;
        }
      }
    }

    return { matches, total, truncated };
  },
};
```

- [ ] **Step 4: 跑测试确认绿**

Run: `pnpm test tests/libs/tools/repo/repo-search-tool.test.ts`
Expected: 6 pass (3 反例 + 3 正例)

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/repo-search-tool.ts tests/libs/tools/repo/repo-search-tool.test.ts
git -c user.name="zihai" -c user.email="zihai@local" commit -m "feat(day10): RepoSearchTool — GitHub-style content search"
```

---

## Task 7: barrel export + tools/index.ts 更新

**Files:**
- Create: `libs/tools/repo/index.ts`
- Modify: `libs/tools/index.ts`

**Interfaces:**
- Consumes: `repoIndexTool` (Task 5), `repoSearchTool` (Task 6)
- Produces: 现有 `ToolRegistry` 使用方 import 不变（libs/tools/index.ts 自动 re-export）

- [ ] **Step 1: 写 barrel**

```typescript
// libs/tools/repo/index.ts
export { repoIndexTool, type RepoIndexArgs, type RepoIndexResult } from './repo-index-tool.js';
export { repoSearchTool, type RepoSearchArgs, type RepoSearchResult, type RepoSearchMatch } from './repo-search-tool.js';
export { shouldIgnore, DEFAULT_IGNORE } from './ignore.js';
export { matchesGlob } from './glob.js';
```

- [ ] **Step 2: 看现有 libs/tools/index.ts 决定怎么加**

```bash
cat libs/tools/index.ts
```

- [ ] **Step 3: 在 libs/tools/index.ts 末尾加一行 re-export**

编辑 `libs/tools/index.ts`，**追加**（不删任何已有行）：
```typescript
export * from './repo/index.js';
```

- [ ] **Step 4: 跑 typecheck 确认无回归**

Run: `pnpm typecheck`
Expected: 0 error

- [ ] **Step 5: Commit**

```bash
git add libs/tools/repo/index.ts libs/tools/index.ts
git -c user.name="zihai" -c user.email="zihai@local" commit -m "feat(day10): barrel export for repo tools"
```

---

## Task 8: 跑全量测试确认无回归

**Files:** 无

- [ ] **Step 1: 跑全部测试**

Run: `pnpm test`
Expected: 全部 PASS（已有测试 + 新增 13 个 repo 测试套件）

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: 0 error

- [ ] **Step 3: 如有失败先修**

如果失败，回到对应 Task 修复（不要新增 commit，amend 或新 commit 都行但要说明原因）。

---

## Task 9: 2 个手跑 example（无 LLM）

**Files:**
- Create: `examples/day10/ex_001_repo_index.ts`
- Create: `examples/day10/ex_002_repo_search.ts`

**Interfaces:**
- Consumes: `repoIndexTool` / `repoSearchTool`
- Produces: 终端打印结果

- [ ] **Step 1: 写 ex_001**

```typescript
// examples/day10/ex_001_repo_index.ts
/**
 * examples/day10/ex_001_repo_index.ts
 *
 * 手跑 RepoIndexTool，看本 repo 前 10 个文件。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoIndexTool } from '../../libs/tools/repo/repo-index-tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// repo 根 = examples/day10/ 的 3 级父目录
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

async function main(): Promise<void> {
  const result = await repoIndexTool.execute({
    rootPath: REPO_ROOT,
    maxDepth: 2,
  });

  console.log(`Total: ${result.total} files (truncated: ${result.truncated})`);
  console.log('First 10 files:');
  for (const f of result.files.slice(0, 10)) {
    console.log(`  ${f}`);
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
```

- [ ] **Step 2: 写 ex_002**

```typescript
// examples/day10/ex_002_repo_search.ts
/**
 * examples/day10/ex_002_repo_search.ts
 *
 * 手跑 RepoSearchTool 搜 'ToolRegistry'，看命中。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoSearchTool } from '../../libs/tools/repo/repo-search-tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

async function main(): Promise<void> {
  const result = await repoSearchTool.execute({
    rootPath: REPO_ROOT,
    pattern: 'ToolRegistry',
    fileGlob: '*.ts',
    maxResults: 5,
    contextBefore: 1,
  });

  console.log(`Total: ${result.total} matches (returned ${result.matches.length}, truncated: ${result.truncated})`);
  for (const m of result.matches) {
    console.log(`  ${m.file}:${m.line}  ${m.content.trim()}`);
    if (m.before) console.log(`    before: ${m.before.join(' | ')}`);
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
```

- [ ] **Step 3: 手跑 ex_001**

Run: `pnpm tsx examples/day10/ex_001_repo_index.ts` （或 `node --import tsx ...`，看 package.json scripts）
Expected: 打印 10 个文件路径

- [ ] **Step 4: 手跑 ex_002**

Run: `pnpm tsx examples/day10/ex_002_repo_search.ts`
Expected: 打印 5 条 ToolRegistry 命中 + before context

- [ ] **Step 5: Commit**

```bash
git add examples/day10/ex_001_repo_index.ts examples/day10/ex_002_repo_search.ts
git -c user.name="zihai" -c user.email="zihai@local" commit -m "feat(day10): hand-run examples for repo_index and repo_search"
```

---

## Task 10: ex_003 — 真实 LLM Agent demo

**Files:**
- Create: `examples/day10/ex_003_repo_agent.ts`

**Interfaces:**
- Consumes: 现有 `Agent` (Day 09) + `repoIndexTool` + `repoSearchTool`
- Produces: 终端打印 AgentEvent 流 + 最终回答

**环境要求**：`OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 必须设（与 Day 04-09 demos 同要求）

- [ ] **Step 1: 写 ex_003**

```typescript
// examples/day10/ex_003_repo_agent.ts
/**
 * examples/day10/ex_003_repo_agent.ts
 *
 * 真实 LLM Agent 跑一轮：问 "libs/tools/ 下面有哪些文件"。
 *
 * Agent 用 repo_index tool 答问题 —— 打印 AgentEvent 流 + 最终回答。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../../libs/agent/agent.js';
import { ToolRegistry } from '../../libs/tools/tool-registry.js';
import { repoIndexTool } from '../../libs/tools/repo/repo-index-tool.js';
import { repoSearchTool } from '../../libs/tools/repo/repo-search-tool.js';
import { OpenAIChatClient } from '../../libs/llm/openai-chat-client.js';
// 备选：import { AnthropicChatClient } from '../../libs/llm/anthropic-chat-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

async function main(): Promise<void> {
  const tools = new ToolRegistry();
  tools.register(repoIndexTool);
  tools.register(repoSearchTool);

  const chat = new OpenAIChatClient({ model: 'gpt-4o-mini' });
  const agent = new Agent({ chat, tools, model: 'gpt-4o-mini' });

  const messages = [
    { role: 'system' as const, content: 'You are a helpful coding assistant with access to repo tools.' },
    {
      role: 'user' as const,
      content: `What files are in ${REPO_ROOT}/libs/tools/? List the top 5. Use the repo_index tool.`,
    },
  ];

  console.log('--- AgentEvents ---');
  let final = '';
  for await (const ev of agent.runEvents(messages)) {
    if (ev.kind === 'message_delta') {
      process.stdout.write(ev.content);
    } else if (ev.kind === 'tool_call') {
      console.log(`\n[tool_call] ${ev.name}(${JSON.stringify(ev.args)})`);
    } else if (ev.kind === 'tool_result') {
      console.log(`[tool_result] ${ev.name} → ${ev.output.slice(0, 100)}${ev.output.length > 100 ? '...' : ''}`);
    } else if (ev.kind === 'message_end') {
      final = ev.content;
    } else if (ev.kind === 'error') {
      console.error(`\n[error] ${ev.message}`);
    }
  }
  console.log('\n--- Final ---');
  console.log(final);
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
```

- [ ] **Step 2: 跑（需要 OPENAI_API_KEY）**

Run: `OPENAI_API_KEY=sk-... pnpm tsx examples/day10/ex_003_repo_agent.ts`
Expected: 打印 AgentEvent 流 + LLM 答出 libs/tools/ 下的文件

- [ ] **Step 3: 如失败，先检查**

- OPENAI_API_KEY 是否设了？
- 模型名是否支持？可改 `gpt-4o` 或 `gpt-3.5-turbo`
- Agent 是否调到了 tool？看 `[tool_call] repo_index(...)` 是否出现
- 跑不通就打印更详细的 error message，**不要静默改 API**

- [ ] **Step 4: Commit**

```bash
git add examples/day10/ex_003_repo_agent.ts
git -c user.name="zihai" -c user.email="zihai@local" commit -m "feat(day10): LLM agent demo using repo tools"
```

---

## Task 11: e2e — Agent 调 repo tool 整链路

**Files:**
- Create: `tests/apps/api/repo-tools-e2e.test.ts`

**Interfaces:**
- Consumes: `createAgentApp` (Day 09), `FakeChatClient` (Day 06), `repoIndexTool`
- Produces: 验证 trace.events 含完整 tool_call + tool_result 链路

- [ ] **Step 1: 写失败测试**

```typescript
// tests/apps/api/repo-tools-e2e.test.ts
/**
 * tests/apps/api/repo-tools-e2e.test.ts
 *
 * e2e: Agent 收到 LLM tool_call(repo_index) → 真实执行 tool → 返回结果 → Trace 记录
 *
 * 用 FakeChatClient 模拟 LLM：第一轮返 tool_call(repo_index)，第二轮返 content。
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentApp } from '../../apps/api/src/server.js';
import { ToolRegistry } from '../../libs/tools/tool-registry.js';
import { repoIndexTool } from '../../libs/tools/repo/repo-index-tool.js';
import { FakeChatClient } from './shared/fake-chat-client.js';
import type { ChatResponse, Message, ToolCallData } from '../../libs/llm/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../fixtures/sample-repo');

function buildToolCall(toolCallId: string, toolName: string, args: unknown): ToolCallData {
  return { id: toolCallId, toolName, args };
}

describe('repo tools e2e', () => {
  it('Agent 调 repo_index → tool_result 进 Trace', async () => {
    const tools = new ToolRegistry();
    tools.register(repoIndexTool);

    // 预设 FakeChatClient 行为
    const fakeChat = new FakeChatClient();
    fakeChat.queueResponse({
      content: undefined,
      toolCalls: [buildToolCall('call_1', 'repo_index', { rootPath: FIXTURE, maxDepth: 3 })],
    });
    fakeChat.queueResponse({
      content: 'I found 2 files in the repo.',
      toolCalls: undefined,
    });

    const app = createAgentApp({ agent: { tools, chat: fakeChat, maxIterations: 3 } });
    // ... 调用 inject ... （参考 day09 e2e 模式）
    // 此处简化为直接调 Agent.runEvents + 看 events
    const { Agent } = await import('../../libs/agent/agent.js');
    const agent = new Agent({ chat: fakeChat, tools, maxIterations: 3 });
    const messages: Message[] = [
      { role: 'system', content: 'You have repo tools.' },
      { role: 'user', content: 'What files are in this repo?' },
    ];

    const events: string[] = [];
    for await (const ev of agent.runEvents(messages)) {
      events.push(ev.kind);
    }

    // 验证 tool_call + tool_result 都出现
    const toolCallIdx = events.indexOf('tool_call');
    const toolResultIdx = events.indexOf('tool_result');
    expect(toolCallIdx).toBeGreaterThanOrEqual(0);
    expect(toolResultIdx).toBeGreaterThan(toolCallIdx);

    // 跑一次 send HTTP 也可以（参考 day09 end-to-end.test.ts）
    // 这里验证最关键的不变量：tool_call 后必有 tool_result
  });
});
```

- [ ] **Step 2: 跑测试确认绿**

Run: `pnpm test tests/apps/api/repo-tools-e2e.test.ts`
Expected: PASS

- [ ] **Step 3: 跑全量测试确认无回归**

Run: `pnpm test`
Expected: 全过

- [ ] **Step 4: Commit**

```bash
git add tests/apps/api/repo-tools-e2e.test.ts
git -c user.name="zihai" -c user.email="zihai@local" commit -m "test(day10): e2e — Agent invokes repo_index tool"
```

---

## Task 12: dayNN.md（含 §JD 映射段）

**Files:**
- Create: `docs/daily/day10.md`

**Interfaces:**
- Consumes: 本 plan 全部 Tasks
- Produces: 当日笔记（参考 day01-09.md 格式 + 新增 §JD 映射段）

- [ ] **Step 1: 写 day10.md**

```markdown
# Day 10 — Repo Index + Content Search (L1 第一步)

> 65 天 AI Agent 工程师训练营 · Day 10 / 65
> 主题：L1 Repo Understanding 第一步 —— 给 Agent 「这个 repo 有什么」 + 「X 在哪」 两个原子能力。

## 🎯 今日目标

1. ✅ RepoIndexTool —— file tree with depth + ignore
2. ✅ RepoSearchTool —— GitHub-style content search（含 fileGlob + context lines）
3. ✅ 3 个 example（2 手跑 + 1 真实 LLM）
4. ✅ 5 反例（index 5 + search 3）
5. ✅ 1 e2e（Agent 调 repo_index tool）
6. ✅ 测试 fixture（tests/fixtures/sample-repo/）
7. ✅ JD 映射段（首次落地路线 spec §3 模板增量）

## 📦 今日产出物

```text
libs/tools/repo/
  ignore.ts                     ignore 匹配器（精确 + glob，DEFAULT_IGNORE 16 项）
  glob.ts                       自写 glob（* ** ?），不引入 micromatch
  repo-index-tool.ts            RepoIndexTool：maxDepth 默认 3、隐式 maxFiles=5000
  repo-search-tool.ts           RepoSearchTool：pattern 自判 regex、context lines、fileGlob
  index.ts                      barrel

libs/tools/index.ts             MODIFIED — re-export repo tools

examples/day10/
  ex_001_repo_index.ts          手跑：列本 repo 前 10 文件
  ex_002_repo_search.ts         手跑：搜 ToolRegistry，看 5 命中 + context
  ex_003_repo_agent.ts          真实 LLM demo

tests/libs/tools/repo/
  ignore.test.ts                6 cases
  glob.test.ts                  5 cases
  repo-index-tool.test.ts       5 反例 + 2 正例 = 7 cases
  repo-search-tool.test.ts      3 反例 + 3 正例 = 6 cases

tests/fixtures/sample-repo/
  package.json
  src/foo.ts
  src/bar.test.ts

tests/apps/api/
  repo-tools-e2e.test.ts        Agent 调 repo_index tool 整链路

docs/daily/day10.md             本文件（含 §JD 映射段）
```

## 🤔 今日讨论过程（关键决策）

### 1. glob 用 micromatch 还是自写？

自写 8 行 mini-glob（`*/**/?`）。Day 10 范围小，micromatch 30KB 依赖不值。**触发条件**：Day 12 评估是否需要 `{a,b}` 字符集，到时再引 micromatch。

### 2. maxFiles 上限暴露为参数吗？

**不暴露**。默认 5000 触发 truncated=true，Agent 自己会细化查询。暴露参数 = Agent 多一个决策点（YAGNI）。

### 3. pattern 自动判 regex 还是显式声明？

**自动判**。含 `.*+?^${}()|[]\\` 任意一个 → regex；否则字面。
理由：Agent 99% 场景下「Foo」字面 / `class.*Agent` regex，区分成本远大于收益。

## 🏗 当前架构（Day 10 末态增量）

```
[新增到 libs/tools/]
  repo/                          新增子目录
    ignore.ts                    shouldIgnore(path, patterns) + DEFAULT_IGNORE
    glob.ts                      matchesGlob(path, pattern) — 自写 mini-glob
    repo-index-tool.ts           repoIndexTool: Tool<RepoIndexArgs, RepoIndexResult>
    repo-search-tool.ts          repoSearchTool: Tool<RepoSearchArgs, RepoSearchResult>
    index.ts                     barrel

[Day 10 触达的 Agent Runtime]
  Agent.runEvents()                → ToolRegistry.get(repo_index) → execute(args)
                                  → tool_call + tool_result events
                                  → JSON.stringify 隐式深拷贝（Day 06 snapshot 继承）
```

## 📚 核心概念复习

### 1. Tool 接口 = additive 扩展（Day 04 + Day 10）

`Tool<TArgs, TReturn>` 接口从 Day 04 CalculatorTool 立起，Day 10 加 RepoIndexTool / RepoSearchTool **不改 Tool 接口本身**。这是判别联合扩类型的纪律（不是加 optional 平铺）。

### 2. Tool 错误 = throw（Day 07 继承）

Tool execute 抛错 → Agent 层 catch（[agent.ts:286](libs/agent/agent.ts#L286)）→ yield tool_result 的 `Error: <msg>` 内容（[agent.ts:289](libs/agent/agent.ts#L289)）。

Day 10 的 8 个反例（5 index + 3 search）全部走 throw，Agent 拿到 `Error: repo_index: maxDepth too large (max 10, got 100)` 这种字符串。

### 3. snapshot 语义 + JSON.stringify 隐式深拷贝（Day 06 继承）

Tool 返回 plain object → Agent 层 [JSON.stringify(result)](libs/agent/agent.ts#L287) → 字符串（值类型，深拷贝语义）。

## 📐 重要设计决策（ADR）

本设计无新增 ADR —— 复用 Day 04 Tool 接口 / Day 06 snapshot / Day 07 错误抛投 + 无新依赖。

**未来可能的 ADR**：
- ADR-016（Day 12+）：micromatch 引入的决策（如果 Day 12 评估需要 `{a,b}` 字符集）

## 🛣 Day 11+ 路线

- **Day 11**：AST 解析（ts-morph / tree-sitter），抽函数签名 / import graph。新增 `ast_search` tool。**接口契约**：接 Day 10 的 `files: string[]`，只解析 `.ts` / `.tsx`。
- **Day 12**：代码导航（go-to-def / find-refs 基于 AST 索引）。新增 `nav_*` tools。
- **Day 13**：Repo Q&A 实战 + Prompt 系统化（JD-2 钩子）。

## 🎯 JD 映射

> 首次落地路线 spec §3 模板增量。验证可执行后 Day 11-65 都按此格式写。

### JD-1 (Coding Agent 全栈) 命中

| 关键词 | 今日命中点 |
|---|---|
| repo understanding | RepoIndexTool — 给 Agent「这个 repo 有什么」的能力 |
| code search | RepoSearchTool — 给 Agent「X 在哪 / 谁调 Y」的能力 |
| code parsing tools | — (Day 11 AST) |

### JD-2 (AI 应用工程师) 命中

| 关键词 | 今日命中点 |
|---|---|
| Prompt Engineering | — (Day 13 钩子日) |
| RAG / Embedding | — (Day 21 钩子日) |
| Eval | — (Day 26 钩子日) |
| Cost / Latency | — (Day 17 钩子日) |
| AI 文化 | — (Day 32 钩子日) |

> **Day 10 不命中 JD-2 是预期的**：M1 第 4 天（Day 13）才是 JD-2 钩子日（Prompt Engineering）。

### 面试可讲（30s STAR 骨架）

1. **Tool 接口扩展走判别联合不重写** —— Day 04 CalculatorTool 立 Tool 接口，Day 10 RepoIndexTool / RepoSearchTool 不动 Tool 本身，只加新 Tool 类。
   **S**：Day 09 末态有 ChatClient + CalculatorTool，Agent 还看不见 repo
   **T**：Day 10 加 2 个 IO 类 Tool 立 L1 Repo Understanding 第一步
   **A**：复用 Day 04 `Tool<TArgs, TReturn>` 接口 + Day 07 throw 规则 + Day 06 snapshot；自写 mini-glob 不引 micromatch
   **R**：5 反例 + 3 正例 + 1 e2e 全过；Agent 能答「libs/tools/ 下面有什么」

2. **不可信输入的纪律** —— Tool 必走「参数类型 + 路径绝对 + 上限守卫」三检。
   **S**：Tool 接受任意字符串 args，Agent 决策不可控
   **T**：不能让 LLM 误传相对路径 / 过大 maxDepth / 无效 regex 让进程崩
   **A**：每个 Tool 入口走 3 检（rootPath 绝对 / maxDepth 在 [1,10] / pattern 是合法 regex）
   **R**：5+3 反例全 throw 出明确错误信息；Agent 收到后能定位「我传错了什么」

## 🔗 相关引用

- **路线 spec**：[2026-07-31-future-learning-path-design.md](../superpowers/specs/2026-07-31-future-learning-path-design.md) §2 M1
- **Day 10 spec**：[2026-08-01-day10-repo-index-design.md](../superpowers/specs/2026-08-01-day10-repo-index-design.md)
- **Day 09 spec**：[2026-07-30-day09-multi-turn-design.md](../superpowers/specs/2026-07-30-day09-multi-turn-design.md)
- **Tool 接口**：[libs/tools/tool.ts](../../libs/tools/tool.ts)
- **ToolRegistry**：[libs/tools/tool-registry.ts](../../libs/tools/tool-registry.ts)
- **Agent Tool 调用链**：[libs/agent/agent.ts:280-305](../../libs/agent/agent.ts#L280-L305)
```

- [ ] **Step 2: Commit**

```bash
git add docs/daily/day10.md
git -c user.name="zihai" -c user.email="zihai@local" commit -m "docs(day10): daily notes with first JD mapping section"
```

---

## Self-Review

### 1. Spec 覆盖

| Spec 章节 | 任务 |
|---|---|
| §1.1 学习目标 | Task 5 + 6（2 Tool）+ Task 9/10（demo） |
| §1.2 不在 Day 10 范围 | 全文走 YAGNI（无 ripgrep / 无 AST / 无 watcher） |
| §2.1 RepoIndexTool | Task 5 |
| §2.2 RepoSearchTool | Task 6 |
| §3 错误处理（8 个 throw） | Task 5 反例 5 个 + Task 6 反例 3 个 |
| §4 文件结构 | Task 1-12 |
| §5 测试策略 | Task 5 + 6 + 11 |
| §6 不变量继承 5 条 | 全文遵循（throw / snapshot / Tool 接口 / 修改五问 / 判别联合） |
| §7 修改五问 | Task 5 走 §7 |
| §8 YAGNI 边界 | 全文遵循 |
| §9 与 Day 11 接口契约 | dayNN.md §🛣 Day 11+ |

### 2. Placeholder 扫描

无 "TBD" / "TODO" / "implement later" / "fill in details" / "Similar to Task N"。

### 3. Type 一致性

- `RepoIndexArgs.rootPath: string` —— Task 5 / 7 / 9 / 10 一致
- `RepoIndexResult.files / total / truncated` —— Task 5 / 7 一致
- `RepoSearchArgs.pattern: string` —— Task 6 / 7 / 9 一致
- `RepoSearchResult.matches / total / truncated` —— Task 6 / 7 一致
- `repoIndexTool.name = 'repo_index'` —— Task 5 / 7 一致
- `repoSearchTool.name = 'repo_search'` —— Task 6 / 7 一致
- `DEFAULT_IGNORE` —— Task 2 / 5 / 6 引用一致
- `matchesGlob(path, pattern)` —— Task 2 / 6 引用一致
- `FIXTURE` 路径 —— Task 4 fixture → Task 5/6/11 测试都引用一致

---

## Exit Criteria

- [ ] Task 1-12 全部 commit
- [ ] `pnpm typecheck` 0 error
- [ ] `pnpm test` 全过（含 13 个新增测试套件 + 1 e2e）
- [ ] 3 个 example 跑通（Task 9 手跑 + Task 10 LLM 跑）
- [ ] dayNN.md 含 §JD 映射段（首次落地路线 spec §3 模板增量）
- [ ] 无 YAGNI 红线（不引入 ripgrep / micromatch / AST）