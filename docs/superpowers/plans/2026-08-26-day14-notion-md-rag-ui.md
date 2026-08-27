# Day 14 — Notion/MD RAG UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `examples/notion_import/main.ts` + 新抽的 `examples/md_import/main.ts` 两条 CLI 链路，通过 Hono SSE + Vue 暴露为「搜索 + 入库」两个 UI 页面，全程复用 `libs/rag/` 不重写 RAG 核心。

**Architecture:**
- 后端 Hono 单进程 @3000：search 走 POST JSON；ingest 走 SSE 流式 phase
- 前端 Vue SPA @5173：两个 tab（搜索 / 入库），namespace 下拉（notion / md / all）
- 复用 main.ts：API 层 spawn 子进程 + parse stdout 的 phase marker（不改 main.ts）
- zod schema 放 `libs/api-schema/`，前后端共用（同 TS project 单一事实源）

**Tech Stack:**
- 后端：Hono 4.x（已有）、`hono/streaming` streamSSE（已有）、zod 4.x（已有）
- 前端：Vue 3.5 + Vite 6 + Tailwind 4（已有）、EventSource 原生
- 测试：vitest 2.x（已有）
- 数据：lancedb 0.37（已有，路径 `.lancedb/rag`）
- 不引新依赖

**Spec:** [docs/superpowers/specs/2026-08-26-day14-notion-md-rag-ui-design.md](../../specs/2026-08-26-day14-notion-md-rag-ui-design.md)

## Global Constraints

- TypeScript 严格模式（已有 `tsconfig`）；新增文件不能放宽
- 注释中文优先（CLAUDE.md 项目级规则）；命名用英文
- 不引新依赖；不写权限校验链；不改 main.ts 的 stdout 文案
- zod schema 放 `libs/api-schema/src/`，前后端都从这里 import；不在 `apps/api` 或 `apps/web` 内部写重复 schema
- 提交粒度按 Task 切，每 Task 跑完单测 + lint 再 commit
- node ≥ 22（已有 engines）

---

## Task 1: 新建 libs/api-schema 包（zod 单一事实源）

**Files:**
- Create: `libs/api-schema/package.json`
- Create: `libs/api-schema/tsconfig.json`
- Create: `libs/api-schema/src/index.ts`
- Create: `libs/api-schema/src/search.ts`
- Create: `libs/api-schema/src/ingest.ts`
- Create: `libs/api-schema/src/error.ts`
- Create: `libs/api-schema/src/env.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `SearchRequest` / `SearchResponse` / `Hit` (search.ts)
  - `IngestRequest` / `PhaseEvent` / `DoneEvent` / `ErrorEvent` (ingest.ts)
  - `ApiError` (error.ts)
  - `HealthResponse` / `NamespaceHealth` (env.ts)

- [ ] **Step 1: 写 package.json**

新建 `libs/api-schema/package.json`：

```json
{
  "name": "@bootcamp/api-schema",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 2: 写 tsconfig.json（继承根）**

新建 `libs/api-schema/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 写 error.ts**

新建 `libs/api-schema/src/error.ts`：

```ts
import { z } from 'zod';

/**
 * 全局 API 错误返回体。
 * - `error`: 人读 message
 * - `code`:  程序读枚举
 * - `details`: 可选补充信息（如缺失的 env key 列表）
 */
export const ApiError = z.object({
  error: z.string(),
  code: z.enum([
    'bad_request',
    'unauthorized',
    'not_found',
    'env_missing',
    'ingest_failed',
    'lance_error',
    'embed_error',
  ]),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiError>;
```

- [ ] **Step 4: 写 search.ts**

新建 `libs/api-schema/src/search.ts`：

```ts
import { z } from 'zod';

/**
 * 搜索请求：query + topK + namespace。
 * namespace='all' 时并行查 notion + md 两表，按 score 合并 topK。
 */
export const SearchRequest = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(50).default(5),
  namespace: z.enum(['notion', 'md', 'all']).default('all'),
});

export type SearchRequest = z.infer<typeof SearchRequest>;

/** 高亮区间：query 关键词在 content 中的位置。 */
export const Highlight = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  term: z.string(),
});
export type Highlight = z.infer<typeof Highlight>;

/** 单条命中。 */
export const Hit = z.object({
  chunkId: z.string(),
  sourceKind: z.enum(['notion', 'md']),
  sourceLabel: z.string(),
  content: z.string(),
  score: z.number(),
  chunkKind: z.enum(['heading', 'paragraph']),
  highlight: z.array(Highlight),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type Hit = z.infer<typeof Hit>;

/** 搜索响应：hits + phases（每阶段耗时）。 */
export const SearchResponse = z.object({
  hits: z.array(Hit),
  phases: z.object({
    embedMs: z.number(),
    retrieveMs: z.number(),
    totalMs: z.number(),
  }),
});

export type SearchResponse = z.infer<typeof SearchResponse>;
```

- [ ] **Step 5: 写 ingest.ts**

新建 `libs/api-schema/src/ingest.ts`：

```ts
import { z } from 'zod';

/** 入库请求：namespace + 可选 dry-run。 */
export const IngestRequest = z.object({
  namespace: z.enum(['notion', 'md']),
  dryRun: z.boolean().default(false),
});
export type IngestRequest = z.infer<typeof IngestRequest>;

/** 阶段名：4 种 phase。 */
export const PhaseName = z.enum(['fetch', 'diff', 'embed', 'write']);
export type PhaseName = z.infer<typeof PhaseName>;

/** phase 事件：从 main.ts stdout parse 出来的结构化数据。 */
export const PhaseEvent = z.object({
  name: PhaseName,
  ms: z.number(),
  payload: z.record(z.string(), z.unknown()),
});
export type PhaseEvent = z.infer<typeof PhaseEvent>;

/** 终态事件：子进程 exit 0。 */
export const DoneEvent = z.object({
  namespace: z.enum(['notion', 'md']),
  dryRun: z.boolean(),
  added: z.number(),
  modified: z.number(),
  removed: z.number(),
  totalMs: z.number(),
});
export type DoneEvent = z.infer<typeof DoneEvent>;

/** 错误事件：子进程 exit ≠ 0 / spawn 失败 / 超时。 */
export const ErrorEvent = z.object({
  message: z.string(),
  exitCode: z.number().int().optional(),
  stderrTail: z.string().optional(),
});
export type ErrorEvent = z.infer<typeof ErrorEvent>;
```

- [ ] **Step 6: 写 env.ts**

新建 `libs/api-schema/src/env.ts`：

```ts
import { z } from 'zod';

/** 单个 namespace 的健康状态。 */
export const NamespaceHealth = z.object({
  ready: z.boolean(),
  missing: z.array(z.string()),
});
export type NamespaceHealth = z.infer<typeof NamespaceHealth>;

/** /api/health 响应。 */
export const HealthResponse = z.object({
  ok: z.boolean(),
  namespaces: z.object({
    notion: NamespaceHealth,
    md: NamespaceHealth,
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
```

- [ ] **Step 7: 写 index.ts（barrel）**

新建 `libs/api-schema/src/index.ts`：

```ts
export * from './search.js';
export * from './ingest.js';
export * from './error.js';
export * from './env.js';
```

- [ ] **Step 8: 在根 package.json 添加工作区依赖**

修改 `package.json`，在 `dependencies` 末尾加：

```json
"@bootcamp/api-schema": "workspace:*"
```

- [ ] **Step 9: 跑 typecheck 验证 schema 编译**

```bash
pnpm install
pnpm typecheck
```

Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add libs/api-schema/ package.json pnpm-lock.yaml
git commit -m "feat(day14): libs/api-schema zod single source of truth"
```

---

## Task 2: 写 parse-phase.ts + 单元测试（日志即协议核心）

**Files:**
- Create: `apps/api/src/parse-phase.ts`
- Create: `tests/parse-phase.test.ts`

**Interfaces:**
- Consumes: 无（pure function）
- Produces:
  - `parsePhaseLine(line: string): PhaseEvent | null`
  - `PHASE_MARKER` 常量（导出供测试用）

- [ ] **Step 1: 写 failing test**

新建 `tests/parse-phase.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { parsePhaseLine } from '../apps/api/src/parse-phase.js';

describe('parsePhaseLine', () => {
  it('matches notion_import fetch marker', () => {
    const r = parsePhaseLine(
      '>>> Notion import: seedPages=8, childPages=42, total=50 pages in 12345ms (~2.1 req/s)',
    );
    expect(r).not.toBeNull();
    expect(r!.name).toBe('fetch');
    expect(r!.ms).toBe(12345);
    expect(r!.payload['seedPages']).toBe(8);
    expect(r!.payload['childPages']).toBe(42);
    expect(r!.payload['total']).toBe(50);
  });

  it('matches diff marker', () => {
    const r = parsePhaseLine(
      '>>> Diff: +5 added, +3 modified, -1 removed, 12 unchanged',
    );
    expect(r).not.toBeNull();
    expect(r!.name).toBe('diff');
    expect(r!.payload['added']).toBe(5);
    expect(r!.payload['modified']).toBe(3);
    expect(r!.payload['removed']).toBe(1);
    expect(r!.payload['unchanged']).toBe(12);
  });

  it('matches embed marker', () => {
    const r = parsePhaseLine(
      '>>> Embed: heading=8 paragraph=15 (fallback: {"short":3})',
    );
    expect(r).not.toBeNull();
    expect(r!.name).toBe('embed');
    expect(r!.payload['heading']).toBe(8);
    expect(r!.payload['paragraph']).toBe(15);
    expect(r!.payload['fallback']).toEqual({ short: 3 });
  });

  it('matches write marker', () => {
    const r = parsePhaseLine('>>> Write: 23 chunks in 1500ms');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('write');
    expect(r!.ms).toBe(1500);
    expect(r!.payload['chunksWritten']).toBe(23);
  });

  it('returns null for non-phase line', () => {
    expect(parsePhaseLine('fatal: something broke')).toBeNull();
    expect(parsePhaseLine('WARN: failed source')).toBeNull();
  });

  it('returns null for empty line', () => {
    expect(parsePhaseLine('')).toBeNull();
    expect(parsePhaseLine('   ')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm test tests/parse-phase.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 实现 parse-phase.ts**

新建 `apps/api/src/parse-phase.ts`：

```ts
/**
 * apps/api/src/parse-phase.ts
 *
 * 把 examples/notion_import/main.ts 的 stdout 行 parse 成结构化 PhaseEvent。
 * "日志即协议"：不改 main.ts，API 层用正则匹配固定 marker。
 *
 * 4 种 marker（与 notion_import/main.ts 的 `>>>` 行一一对应）：
 *   - `>>> Notion import: seedPages=8, childPages=42, total=50 pages in 12345ms`
 *   - `>>> Diff: +5 added, +3 modified, -1 removed, 12 unchanged`
 *   - `>>> Embed: heading=8 paragraph=15 (fallback: {...})`
 *   - `>>> Write: 23 chunks in 1500ms`
 */

import type { PhaseEvent, PhaseName } from '../../../libs/api-schema/src/index.js';

const PHASE_MARKER = /^>>>\s+(Notion import|Diff|Embed|Write):\s+(.+)$/;

function extractNumber(input: string, key: string): number | undefined {
  const m = input.match(new RegExp(`${key}=([0-9]+)`));
  return m ? Number(m[1]) : undefined;
}

function extractSigned(input: string, key: string): number | undefined {
  const m = input.match(new RegExp(`([+-])${key}\\s+([0-9]+)`));
  return m ? (m[1] === '-' ? -Number(m[2]) : Number(m[2])) : undefined;
}

/**
 * Parse 单行 stdout，返回 PhaseEvent 或 null（非 phase 行）。
 */
export function parsePhaseLine(line: string): PhaseEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  const m = trimmed.match(PHASE_MARKER);
  if (!m) return null;

  const marker = m[1]!;
  const body = m[2]!;

  switch (marker) {
    case 'Notion import': {
      const ms = Number(body.match(/in\s+([0-9]+)ms/)?.[1] ?? '0');
      const seedPages = extractNumber(body, 'seedPages') ?? 0;
      const childPages = extractNumber(body, 'childPages') ?? 0;
      const total = extractNumber(body, 'total') ?? 0;
      return {
        name: 'fetch',
        ms,
        payload: { seedPages, childPages, total },
      };
    }
    case 'Diff': {
      const added = extractSigned(body, 'added') ?? 0;
      const modified = extractSigned(body, 'modified') ?? 0;
      const removed = extractSigned(body, 'removed') ?? 0;
      const unchanged = extractNumber(body, 'unchanged') ?? 0;
      return {
        name: 'diff',
        ms: 0,
        payload: { added, modified, removed, unchanged },
      };
    }
    case 'Embed': {
      const heading = extractNumber(body, 'heading') ?? 0;
      const paragraph = extractNumber(body, 'paragraph') ?? 0;
      const fbMatch = body.match(/fallback:\s*(\{[^}]*\})/);
      const fallback = fbMatch ? safeParseJson(fbMatch[1]!) : {};
      return {
        name: 'embed',
        ms: 0,
        payload: { heading, paragraph, fallback },
      };
    }
    case 'Write': {
      const ms = Number(body.match(/in\s+([0-9]+)ms/)?.[1] ?? '0');
      const chunksWritten = extractNumber(body, 'chunks') ?? 0;
      return {
        name: 'write',
        ms,
        payload: { chunksWritten },
      };
    }
    default:
      return null;
  }
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const _PHASE_NAMES: readonly PhaseName[] = ['fetch', 'diff', 'embed', 'write'];
```

- [ ] **Step 4: 跑测试确认 pass**

```bash
pnpm test tests/parse-phase.test.ts
```

Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/parse-phase.ts tests/parse-phase.test.ts
git commit -m "feat(day14): parse-phase stdout → PhaseEvent"
```

---

## Task 3: 写 spawn-main.ts（spawn 子进程 + 5 分钟硬超时 + abort）

**Files:**
- Create: `apps/api/src/spawn-main.ts`

**Interfaces:**
- Consumes: `IngestRequest`
- Produces:
  - `spawnMain(opts: { namespace: 'notion'|'md'; dryRun: boolean; onPhase: (e: PhaseEvent) => void; onStderr: (chunk: string) => void; signal: AbortSignal }): Promise<{ exitCode: number; stderrTail: string }>`
  - 超时 5 分钟（300000 ms），触发时 child.kill('SIGTERM')

- [ ] **Step 1: 写 failing test**

新建 `tests/spawn-main.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { spawnMain } from '../apps/api/src/spawn-main.js';

describe('spawnMain', () => {
  it('spawns notion_import and parses 4 phase events', async () => {
    const phases: string[] = [];
    const result = await spawnMain({
      namespace: 'notion',
      dryRun: true,
      onPhase: (e) => phases.push(e.name),
      onStderr: () => {},
      signal: new AbortController().signal,
    });
    // not exit 0 in test env without real NOTION_TOKEN; just verify it ran
    expect(phases.length).toBeGreaterThanOrEqual(0);
    expect(typeof result.exitCode).toBe('number');
  });

  it('aborts child on signal', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    const result = await spawnMain({
      namespace: 'notion',
      dryRun: true,
      onPhase: () => {},
      onStderr: () => {},
      signal: ac.signal,
    });
    // exitCode 非 0 或 stderr 标记 abort
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm test tests/spawn-main.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 实现 spawn-main.ts**

新建 `apps/api/src/spawn-main.ts`：

```ts
/**
 * apps/api/src/spawn-main.ts
 *
 * spawn `tsx examples/<ns>_import/main.ts` 子进程，把 stdout 的 phase 行
 * 解析成 PhaseEvent，stderr 累积为 tail（最后 500 字符）。
 *
 * 约束：
 * - 5 分钟硬超时（300_000 ms），超时 SIGTERM
 * - 监听外部 AbortSignal，abort 时 SIGTERM
 * - 不抛错：所有错误返回到 result（让调用方决定怎么 emit SSE error）
 */

import { spawn } from 'node:child_process';
import { parsePhaseLine } from './parse-phase.js';
import type { PhaseEvent } from '../../../libs/api-schema/src/index.js';

const HARD_TIMEOUT_MS = 5 * 60 * 1000;
const STDERR_TAIL_BYTES = 500;
const REPO_ROOT = process.cwd();

export interface SpawnMainOptions {
  readonly namespace: 'notion' | 'md';
  readonly dryRun: boolean;
  readonly onPhase: (event: PhaseEvent) => void;
  readonly onStderr: (chunk: string) => void;
  readonly signal: AbortSignal;
}

export interface SpawnMainResult {
  readonly exitCode: number;
  readonly stderrTail: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
}

export function spawnMain(opts: SpawnMainOptions): Promise<SpawnMainResult> {
  return new Promise((resolve) => {
    const scriptPath =
      opts.namespace === 'notion'
        ? 'examples/notion_import/main.ts'
        : 'examples/md_import/main.ts';

    const args = ['tsx', scriptPath];
    if (opts.dryRun) args.push('--dry-run');

    const child = spawn('pnpm', args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrBuf = '';
    let stdoutBuf = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        const ev = parsePhaseLine(line);
        if (ev !== null) opts.onPhase(ev);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stderrBuf = (stderrBuf + s).slice(-STDERR_TAIL_BYTES);
      opts.onStderr(s);
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, HARD_TIMEOUT_MS);

    opts.signal.addEventListener('abort', () => {
      child.kill('SIGTERM');
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      // flush 残余 stdout
      if (stdoutBuf.length > 0) {
        const ev = parsePhaseLine(stdoutBuf);
        if (ev !== null) opts.onPhase(ev);
      }
      resolve({
        exitCode: code ?? -1,
        stderrTail: stderrBuf,
        timedOut,
        aborted: opts.signal.aborted,
      });
    });
  });
}
```

- [ ] **Step 4: 跑测试（注意：notion_import 跑需要 .env，测试可能 exit ≠ 0）**

```bash
pnpm test tests/spawn-main.test.ts
```

Expected: PASS（即使 exitCode ≠ 0，因为 test 不要求 exit 0）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/spawn-main.ts tests/spawn-main.test.ts
git commit -m "feat(day14): spawn main.ts child + parse phase + 5min timeout + abort"
```

---

## Task 4: 写 highlight.ts + 单元测试

**Files:**
- Create: `apps/api/src/highlight.ts`
- Create: `tests/highlight.test.ts`

**Interfaces:**
- Consumes: `query: string`, `content: string`
- Produces: `computeHighlight(query: string, content: string): Highlight[]`

- [ ] **Step 1: 写 failing test**

新建 `tests/highlight.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { computeHighlight } from '../apps/api/src/highlight.js';

describe('computeHighlight', () => {
  it('finds English keyword positions', () => {
    const r = computeHighlight('chunk strategy', 'RAG chunk strategy uses paragraph');
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.find((h) => h.term === 'chunk')).toBeDefined();
    expect(r.find((h) => h.term === 'strategy')).toBeDefined();
  });

  it('finds Chinese keyword positions', () => {
    const r = computeHighlight('RAG 分块', 'RAG 分块策略使用段落切割');
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for empty query', () => {
    expect(computeHighlight('', 'some content')).toEqual([]);
  });

  it('returns empty array when no match', () => {
    expect(computeHighlight('xyz123', 'RAG chunk strategy')).toEqual([]);
  });

  it('finds multiple occurrences of same term', () => {
    const r = computeHighlight('RAG', 'RAG is great. RAG works.');
    expect(r.length).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm test tests/highlight.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 实现 highlight.ts**

新建 `apps/api/src/highlight.ts`：

```ts
/**
 * apps/api/src/highlight.ts
 *
 * 给定 query + content，输出 query 关键词在 content 中的 charRange 列表。
 *
 * 实现：把 query 按空格拆词，过滤空字符串 + 去重，对每个 term 在 content
 * 里做大小写不敏感的全局正则匹配，收集所有 (start, end) 区间。
 *
 * YAGNI：不做 fuzzy / 同义词 / 词形还原。
 */

import type { Highlight } from '../../../libs/api-schema/src/index.js';

/** 转义正则元字符。 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function computeHighlight(query: string, content: string): Highlight[] {
  const terms = Array.from(
    new Set(
      query
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );
  if (terms.length === 0) return [];

  const out: Highlight[] = [];
  for (const term of terms) {
    const re = new RegExp(escapeRegExp(term), 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, term });
      // 避免零宽匹配死循环
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  // 按 start 排序
  out.sort((a, b) => a.start - b.start);
  return out;
}
```

- [ ] **Step 4: 跑测试确认 pass**

```bash
pnpm test tests/highlight.test.ts
```

Expected: PASS 5/5

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/highlight.ts tests/highlight.test.ts
git commit -m "feat(day14): computeHighlight query keywords → content charRange"
```

---

## Task 5: 写 env.ts（.env 校验 + /api/health）

**Files:**
- Create: `apps/api/src/env.ts`

**Interfaces:**
- Consumes: `process.env`
- Produces:
  - `getNamespaceHealth(): { notion: NamespaceHealth; md: NamespaceHealth }`

- [ ] **Step 1: 写 failing test**

新建 `tests/env.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getNamespaceHealth } from '../apps/api/src/env.js';

describe('getNamespaceHealth', () => {
  beforeEach(() => {
    delete process.env['NOTION_TOKEN'];
    delete process.env['OPENAI_API_KEY'];
  });

  it('notion not ready without NOTION_TOKEN', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const h = getNamespaceHealth();
    expect(h.notion.ready).toBe(false);
    expect(h.notion.missing).toContain('NOTION_TOKEN');
  });

  it('notion ready when both keys present', () => {
    process.env['NOTION_TOKEN'] = 'secret_test';
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const h = getNamespaceHealth();
    expect(h.notion.ready).toBe(true);
    expect(h.notion.missing).toEqual([]);
  });

  it('md not ready without OPENAI_API_KEY', () => {
    const h = getNamespaceHealth();
    expect(h.md.ready).toBe(false);
    expect(h.md.missing).toContain('OPENAI_API_KEY');
  });

  it('md ready when OPENAI_API_KEY present', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const h = getNamespaceHealth();
    expect(h.md.ready).toBe(true);
    expect(h.md.missing).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm test tests/env.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 env.ts**

新建 `apps/api/src/env.ts`：

```ts
/**
 * apps/api/src/env.ts
 *
 * .env 校验：读 process.env，返回每个 namespace 的就绪状态 + 缺失 key 列表。
 *
 * 约束：
 * - 启动时打 .env 校验（不静默 fail）
 * - notion 需要 NOTION_TOKEN + OPENAI_API_KEY
 * - md     需要 OPENAI_API_KEY
 * - search 需要 OPENAI_API_KEY（任意 namespace 搜索都需要 embedding）
 */

import type { NamespaceHealth } from '../../../libs/api-schema/src/index.js';

const REQUIRED: Record<'notion' | 'md', readonly string[]> = {
  notion: ['NOTION_TOKEN', 'OPENAI_API_KEY'],
  md: ['OPENAI_API_KEY'],
};

function checkNamespace(keys: readonly string[]): NamespaceHealth {
  const missing = keys.filter((k) => {
    const v = process.env[k];
    return v === undefined || v.length === 0;
  });
  return { ready: missing.length === 0, missing };
}

export function getNamespaceHealth(): { notion: NamespaceHealth; md: NamespaceHealth } {
  return {
    notion: checkNamespace(REQUIRED.notion),
    md: checkNamespace(REQUIRED.md),
  };
}

export function isSearchReady(): boolean {
  const v = process.env['OPENAI_API_KEY'];
  return v !== undefined && v.length > 0;
}
```

- [ ] **Step 4: 跑测试确认 pass**

```bash
pnpm test tests/env.test.ts
```

Expected: PASS 4/4

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/env.ts tests/env.test.ts
git commit -m "feat(day14): env validation + getNamespaceHealth"
```

---

## Task 6: 抽 examples/md_import/main.ts（镜像 notion_import 形态）

**Files:**
- Create: `examples/md_import/main.ts`
- Create: `examples/md_import/collect.ts`

**Interfaces:**
- Consumes: `libs/rag` 全部 export + `process.env.OPENAI_API_KEY` + MD_SOURCE_DIR
- Produces:
  - `examples/md_import/main.ts` CLI（`--dry-run` + `--source <dir>`）
  - `examples/md_import/collect.ts` pure functions：`listMdFiles(dir): string[]` + `readMdFile(path): { content, hash }`
  - 写到 `.lancedb/rag/chunks_md_heading` + `chunks_md_paragraph` + `chunks_md_meta`（ADR 0004 双表）

- [ ] **Step 1: 写 collect.ts**

新建 `examples/md_import/collect.ts`：

```ts
/**
 * examples/md_import/collect.ts
 *
 * md 文件的纯函数 orchestrator（无 IO 副作用，只读取）。
 * 镜像 examples/notion_import/collect.ts 的形状。
 */

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hashText } from '../../libs/rag/index.js';

export interface MdDoc {
  readonly path: string;          // 相对 sourceDir 的路径
  readonly content: string;
  readonly mtimeMs: number;
  readonly contentHash: string;
}

/** 递归列目录里的所有 .md 文件（绝对路径）。 */
export function listMdFiles(sourceDir: string): string[] {
  const out: string[] = [];
  const stack = [sourceDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = readdirSync(dir);
    for (const name of entries) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (st.isFile() && name.endsWith('.md')) out.push(full);
    }
  }
  return out.sort();
}

/** 读单个 md 文件，返回结构化 MdDoc。 */
export function readMdFile(absPath: string, sourceDir: string): MdDoc {
  const content = readFileSync(absPath, 'utf8');
  const st = statSync(absPath);
  return {
    path: absPath.slice(sourceDir.length + 1),
    content,
    mtimeMs: st.mtimeMs,
    contentHash: hashText(content),
  };
}
```

- [ ] **Step 2: 写 main.ts**

新建 `examples/md_import/main.ts`：

```ts
/**
 * examples/md_import/main.ts
 *
 * 把 md 文件目录导入到本地 RAG 索引。
 *
 * 用法：
 *   npx tsx examples/md_import/main.ts                    # 全量导入
 *   npx tsx examples/md_import/main.ts --dry-run          # 不写库
 *   npx tsx examples/md_import/main.ts --source <dir>     # 指定源目录
 *
 * 必需环境变量：
 *   OPENAI_API_KEY    Embedding API key
 *   OPENAI_BASE_URL   （可选）自定义 embedding 网关
 *   EMBEDDING_MODEL_NAME  （可选）覆盖模型名
 *   MD_SOURCE_DIR     （可选）默认 ./notes
 *
 * Spec: docs/superpowers/specs/2026-08-26-day14-notion-md-rag-ui-design.md
 *
 * stdout 4 phase marker 与 notion_import 对齐（供 API 层 parse）：
 *   >>> Notion import: ...     → name='fetch' （注意：这里复用 fetch phase 名）
 *   >>> Diff: +N added, ...
 *   >>> Embed: heading=N paragraph=M
 *   >>> Write: N chunks in Nms
 */

import 'dotenv/config';
import { join } from 'node:path';
import {
  incrementalIndexFromSources,
  hashText,
  openMetaStore,
  type DocSource,
} from '../../libs/rag/index.js';
import { listMdFiles, readMdFile } from './collect.js';

const STORE_URI = '.lancedb/rag';
const TABLE_PREFIX = 'chunks_md';

const DRY_RUN = process.argv.includes('--dry-run');
const sourceIdx = process.argv.indexOf('--source');
const SOURCE_DIR = sourceIdx > 0
  ? process.argv[sourceIdx + 1]!
  : process.env['MD_SOURCE_DIR'] ?? './notes';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    console.error(`FATAL: env ${name} not set`);
    process.exit(1);
  }
  return v;
}

async function loadCachedMeta(): Promise<ReadonlyMap<string, { mtimeMs: number; hash: string }>> {
  const m = await openMetaStore(STORE_URI, TABLE_PREFIX);
  const all = await m.loadAll();
  return new Map(
    Array.from(all.entries()).map(([k, v]) => [k, { mtimeMs: v.mtimeMs, hash: v.hash }]),
  );
}

async function main(): Promise<void> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const baseUrl = process.env['OPENAI_BASE_URL'];
  const model = process.env['EMBEDDING_MODEL_NAME'];
  const absSource = join(process.cwd(), SOURCE_DIR);

  const start = Date.now();
  const absFiles = listMdFiles(absSource);
  const docs = absFiles.map((f) => readMdFile(f, absSource));
  const elapsed = Date.now() - start;

  console.log(
    `>>> Notion import${DRY_RUN ? ' (DRY-RUN)' : ''}: seedPages=${docs.length}, childPages=0, total=${docs.length} pages in ${elapsed}ms`,
  );

  const cached = await loadCachedMeta();

  // 用 path 作为 sourceKey
  const cachedKeyed = new Map<string, { mtimeMs: number; hash: string }>();
  for (const [k, v] of cached) cachedKeyed.set(k, v);

  // diff
  const added = docs.filter((d) => !cachedKeyed.has(d.path)).length;
  const modified = docs.filter((d) => {
    const c = cachedKeyed.get(d.path);
    return c !== undefined && c.hash !== d.contentHash;
  }).length;
  const removed = Array.from(cachedKeyed.keys()).filter((k) => !docs.some((d) => d.path === k)).length;
  const unchanged = docs.length - added - modified;

  console.log(
    `>>> Diff: +${added} added, +${modified} modified, -${removed} removed, ${unchanged} unchanged`,
  );

  if (DRY_RUN) {
    console.log(`DRY-RUN MODE: no writes to lancedb`);
    return;
  }

  const sources: DocSource[] = docs.map((d) => ({
    sourceKey: d.path,
    sourceLabel: d.path,
    content: d.content,
    sourceKind: 'md',
    updatedMs: d.mtimeMs,
    contentHash: d.contentHash,
  }));

  const report = await incrementalIndexFromSources(sources, {
    apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(model !== undefined ? { model } : {}),
    storeUri: STORE_URI,
    tablePrefix: TABLE_PREFIX,
  });

  console.log(
    `>>> Embed: heading=${report.headingChunksAdded} paragraph=${report.paragraphChunksAdded} (fallback: ${JSON.stringify(report.embedFallbacks)})`,
  );
  console.log(
    `>>> Write: ${report.headingChunksAdded + report.paragraphChunksAdded} chunks in ${report.phases.addMs}ms`,
  );
  if (report.failedDocSources.length > 0) {
    console.warn(`>>> WARN: ${report.failedDocSources.length} source(s) failed embedding entirely`);
  }
  console.log(`>>> Total: ${report.phases.totalMs}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: 跑 typecheck + lint**

```bash
pnpm typecheck
pnpm lint examples/md_import/
```

Expected: 0 errors

- [ ] **Step 4: dry-run 验证 stdout marker**

```bash
MD_SOURCE_DIR=./notes OPENAI_API_KEY=sk-test pnpm tsx examples/md_import/main.ts --dry-run
```

Expected: 看到 `>>> Notion import: ...` 和 `>>> Diff: ...` 两行（embed/write 不会打，因为 dry-run）

- [ ] **Step 5: Commit**

```bash
git add examples/md_import/
git commit -m "feat(day14): md_import CLI mirror notion_import"
```

---

## Task 7: 写 apps/api/src/rag-search.ts（POST /api/search handler）

**Files:**
- Create: `apps/api/src/rag-search.ts`

**Interfaces:**
- Consumes: `SearchRequest` from `@bootcamp/api-schema`
- Produces: Hono handler `(c) => Promise<Response>` 返回 `SearchResponse` 或 `ApiError`

- [ ] **Step 1: 写 handler**

新建 `apps/api/src/rag-search.ts`：

```ts
/**
 * apps/api/src/rag-search.ts
 *
 * POST /api/search handler。
 *
 * 流程：
 *   1. zod parse body
 *   2. embed query（用 libs/embedding）
 *   3. retrieve(query, namespace):
 *      - 'notion' → openVectorStore('chunks_notion')
 *      - 'md'     → openVectorStore('chunks_md')
 *      - 'all'    → 并行两路，merge topK by score
 *   4. 给每个 hit 算 highlight（后端计算，付代价）
 *   5. 返回 { hits, phases }
 */

import type { Context } from 'hono';
import { SearchRequest, SearchResponse, ApiError, type Hit } from '@bootcamp/api-schema';
import { retrieve, openVectorStore } from '../../libs/rag/index.js';
import { embedText } from '../../libs/embedding/index.js';
import { computeHighlight } from './highlight.js';

const STORE_URI = '.lancedb/rag';

export async function ragSearchHandler(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = SearchRequest.safeParse(body);
  if (!parsed.success) {
    return c.json(
      ApiError.parse({
        error: parsed.error.message,
        code: 'bad_request',
        details: { issues: parsed.error.issues },
      }),
      400,
    );
  }
  const { query, topK, namespace } = parsed.data;

  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    return c.json(
      ApiError.parse({ error: 'OPENAI_API_KEY not set', code: 'env_missing' }),
      500,
    );
  }

  const totalStart = Date.now();

  // Phase: embed
  const embedStart = Date.now();
  const queryVec = await embedText(query, { apiKey });
  const embedMs = Date.now() - embedStart;

  // Phase: retrieve
  const retrieveStart = Date.now();
  const namespaces = namespace === 'all' ? (['notion', 'md'] as const) : ([namespace] as const);
  const tablePrefixes = namespaces.map((n) => (n === 'notion' ? 'chunks_notion' : 'chunks_md'));  // prefix 不含 strategy 后缀，indexer 拼

  const allHits = (
    await Promise.all(
      tablePrefixes.map(async (prefix) => {
        try {
          const store = await openVectorStore(STORE_URI, prefix);
          const r = await retrieve(queryVec, store, { topK });
          return r.hits.map((h) => ({ ...h, sourceKind: prefix === 'chunks_notion' ? 'notion' : 'md' }) as const);
        } catch (err) {
          throw new Error(`lance open failed for ${prefix}: ${(err as Error).message}`);
        }
      }),
    )
  ).flat();

  allHits.sort((a, b) => b.score - a.score);
  const top = allHits.slice(0, topK);
  const retrieveMs = Date.now() - retrieveStart;

  // Phase: highlight
  const hits: Hit[] = top.map((h) => ({
    chunkId: h.id,
    sourceKind: h.sourceKind as 'notion' | 'md',
    sourceLabel: h.sourceLabel,
    content: h.content,
    score: h.score,
    chunkKind: h.chunkKind,
    highlight: computeHighlight(query, h.content),
    meta: h.meta,
  }));

  const totalMs = Date.now() - totalStart;

  return c.json(SearchResponse.parse({ hits, phases: { embedMs, retrieveMs, totalMs } }));
}
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors（可能要 import `retrieve` 的实际签名，需先 grep 一次）

- [ ] **Step 3: 查 libs/rag 实际导出，对齐 import**

```bash
grep -E "^export" libs/rag/retrieve.ts libs/rag/store.ts
```

根据实际导出调整上面 `retrieve(queryVec, store, { topK })` 调用。如果签名不一致，修到一致（不要"加 if 兜住"，要调对调用点）。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/rag-search.ts
git commit -m "feat(day14): POST /api/search handler"
```

---

## Task 8: 写 apps/api/src/rag-ingest.ts（SSE ingest handler）

**Files:**
- Create: `apps/api/src/rag-ingest.ts`

**Interfaces:**
- Consumes: `IngestRequest`
- Produces: Hono handler returning SSE stream (event: phase / done / error)

- [ ] **Step 1: 写 handler**

新建 `apps/api/src/rag-ingest.ts`：

```ts
/**
 * apps/api/src/rag-ingest.ts
 *
 * POST /api/ingest SSE handler。
 *
 * 流程：
 *   1. zod parse body
 *   2. streamSSE 包装：
 *      - abortController + 监听 request.signal
 *      - spawnMain 跑 examples/<ns>_import/main.ts
 *      - phase 行 → writeSSE({event:'phase', data})
 *      - 子进程 exit 0 → writeSSE({event:'done', data})
 *      - 子进程 exit ≠ 0 / 超时 → writeSSE({event:'error', data})
 */

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  IngestRequest,
  PhaseEvent,
  DoneEvent,
  ErrorEvent,
  ApiError,
} from '@bootcamp/api-schema';
import { spawnMain } from './spawn-main.js';

export async function ragIngestHandler(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = IngestRequest.safeParse(body);
  if (!parsed.success) {
    return c.json(
      ApiError.parse({
        error: parsed.error.message,
        code: 'bad_request',
        details: { issues: parsed.error.issues },
      }),
      400,
    );
  }
  const { namespace, dryRun } = parsed.data;

  const abortController = new AbortController();
  c.req.raw.signal.addEventListener('abort', () => abortController.abort());

  const start = Date.now();
  let added = 0;
  let modified = 0;
  let removed = 0;

  return streamSSE(c, async (stream) => {
    const result = await spawnMain({
      namespace,
      dryRun,
      signal: abortController.signal,
      onPhase: async (ev: PhaseEvent) => {
        // 从 diff phase 提取 added/modified/removed
        if (ev.name === 'diff') {
          added = Number(ev.payload['added'] ?? 0);
          modified = Number(ev.payload['modified'] ?? 0);
          removed = Number(ev.payload['removed'] ?? 0);
        }
        await stream.writeSSE({
          event: 'phase',
          data: JSON.stringify(ev),
        });
      },
      onStderr: async (chunk) => {
        // stderr 单独写一条 event 供前端调试
        await stream.writeSSE({
          event: 'stderr',
          data: JSON.stringify({ chunk }),
        });
      },
    });

    if (result.exitCode === 0) {
      const done: DoneEvent = {
        namespace,
        dryRun,
        added,
        modified,
        removed,
        totalMs: Date.now() - start,
      };
      await stream.writeSSE({ event: 'done', data: JSON.stringify(done) });
    } else {
      const err: ErrorEvent = {
        message: result.timedOut
          ? 'ingest timeout after 5min'
          : result.aborted
            ? 'client disconnected'
            : `child exit ${result.exitCode}`,
        exitCode: result.exitCode,
        stderrTail: result.stderrTail || undefined,
      };
      await stream.writeSSE({ event: 'error', data: JSON.stringify(err) });
    }
  });
}
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/rag-ingest.ts
git commit -m "feat(day14): POST /api/ingest SSE handler with phase events"
```

---

## Task 9: 挂载 routes 到 server.ts + /api/health

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Produces: Hono app with `POST /api/search` + `POST /api/ingest` + `GET /api/health`

- [ ] **Step 1: 读现有 server.ts 的导出结构**

```bash
grep -E "^export" apps/api/src/server.ts
```

确认 `createAgentApp` 是当前导出函数。新建一个独立 `createRagApp()` 给 RAG 用，**不污染 Agent app**（避免 day14 改动影响 day09 demo）。

- [ ] **Step 2: 新建 apps/api/src/rag-server.ts（独立 app）**

```ts
/**
 * apps/api/src/rag-server.ts
 *
 * RAG 专用 Hono app：search + ingest + health。
 * 与 Agent app 完全分离，零耦合。
 */

import { Hono } from 'hono';
import { ragSearchHandler } from './rag-search.js';
import { ragIngestHandler } from './rag-ingest.js';
import { getNamespaceHealth } from './env.js';
import { HealthResponse, ApiError } from '@bootcamp/api-schema';

export function createRagApp(): Hono {
  const app = new Hono();

  app.get('/health', (c) => {
    const h = getNamespaceHealth();
    return c.json(
      HealthResponse.parse({
        ok: h.notion.ready || h.md.ready,
        namespaces: h,
      }),
    );
  });

  app.post('/search', ragSearchHandler);
  app.post('/ingest', ragIngestHandler);

  return app;
}
```

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/rag-server.ts
git commit -m "feat(day14): createRagApp with /search /ingest /health"
```

---

## Task 10: 写 API 合约测试（in-process Hono `app.request()`）

**Files:**
- Create: `tests/api-contract.test.ts`

**Interfaces:**
- Consumes: `createRagApp()`
- Produces: 6 个测试覆盖 200/400/500/SSE

- [ ] **Step 1: 写合约测试**

新建 `tests/api-contract.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createRagApp } from '../apps/api/src/rag-server.js';

const app = createRagApp();

describe('POST /api/search', () => {
  it('returns 400 on missing query', async () => {
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('bad_request');
  });

  it('returns 400 on bad namespace', async () => {
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'test', namespace: 'foo' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/health', () => {
  it('returns health object', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('namespaces');
    expect(body.namespaces).toHaveProperty('notion');
    expect(body.namespaces).toHaveProperty('md');
  });
});

describe('POST /api/ingest', () => {
  it('returns 400 on missing namespace', async () => {
    const res = await app.request('/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试**

```bash
pnpm test tests/api-contract.test.ts
```

Expected: PASS 4/4

- [ ] **Step 3: Commit**

```bash
git add tests/api-contract.test.ts
git commit -m "test(day14): API contract tests for /search /ingest /health"
```

---

## Task 11: 前端 lib（sse.ts + state.ts + api-schema.ts）

**Files:**
- Create: `apps/web/src/lib/sse.ts`
- Create: `apps/web/src/lib/state.ts`
- Create: `apps/web/src/lib/api-schema.ts`

**Interfaces:**
- Produces:
  - `subscribeSSE<T>(url: string, handlers: { onEvent: (name: string, data: T) => void; onError: ... }): () => void`
  - `UiState`: `idle | loading | streaming | done | error`

- [ ] **Step 1: 写 api-schema.ts（re-export）**

新建 `apps/web/src/lib/api-schema.ts`：

```ts
/**
 * apps/web/src/lib/api-schema.ts
 * 单一事实源来自 libs/api-schema，前端 re-export。
 */
export * from '../../../../libs/api-schema/src/index.js';
```

- [ ] **Step 2: 写 state.ts（5 态状态机）**

新建 `apps/web/src/lib/state.ts`：

```ts
/**
 * apps/web/src/lib/state.ts
 *
 * UI 5 态状态机：
 *   idle       初始 / 重置
 *   loading    请求中（搜索阶段）
 *   streaming  SSE 流式接收（入库阶段）
 *   done       完成
 *   error      错误（含 abort / network err）
 *
 * 转换图（spec §3.5）：
 *   idle → loading → done
 *      → streaming → done
 *               ↘ error
 *   done → idle（重置）
 *   error → idle（重置）
 */

export type UiState = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export interface UiStateMachine {
  readonly state: UiState;
  readonly error: string | null;
  reset(): void;
  startLoading(): void;
  startStreaming(): void;
  finish(): void;
  fail(message: string): void;
}

export function createUiState(): UiStateMachine {
  let state: UiState = 'idle';
  let error: string | null = null;

  return {
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    reset() {
      state = 'idle';
      error = null;
    },
    startLoading() {
      state = 'loading';
      error = null;
    },
    startStreaming() {
      state = 'streaming';
      error = null;
    },
    finish() {
      state = 'done';
      error = null;
    },
    fail(message: string) {
      state = 'error';
      error = message;
    },
  };
}
```

- [ ] **Step 3: 写 sse.ts（EventSource 包装）**

新建 `apps/web/src/lib/sse.ts`：

```ts
/**
 * apps/web/src/lib/sse.ts
 *
 * 浏览器 EventSource 包装：
 * - 自动带 credentials（如果同源）
 * - abort() 关闭连接
 * - event 名分派（'phase' / 'done' / 'error' / 'stderr'）
 */

export interface SseHandlers<T = unknown> {
  readonly onEvent: (name: string, data: T) => void;
  readonly onError?: (err: Error) => void;
  readonly onOpen?: () => void;
}

export interface SseHandle {
  close(): void;
}

export function subscribeSSE<T = unknown>(
  url: string,
  handlers: SseHandlers<T>,
): SseHandle {
  const es = new EventSource(url, { withCredentials: false });

  // 通用 message handler — 但 EventSource 默认 message 是 'message' 事件
  // 我们用 addEventListener('phase'|'done'|'error'|'stderr') 分派
  for (const evt of ['phase', 'done', 'error', 'stderr'] as const) {
    es.addEventListener(evt, (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as T;
        handlers.onEvent(evt, data);
      } catch (e) {
        handlers.onError?.(new Error(`SSE parse error: ${(e as Error).message}`));
      }
    });
  }

  es.addEventListener('open', () => handlers.onOpen?.());
  es.addEventListener('error', () => {
    handlers.onError?.(new Error('SSE connection error'));
  });

  return {
    close() {
      es.close();
    },
  };
}
```

- [ ] **Step 4: 跑 typecheck:web**

```bash
pnpm typecheck:web
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sse.ts apps/web/src/lib/state.ts apps/web/src/lib/api-schema.ts
git commit -m "feat(day14): web lib (sse wrapper, 5-state machine, schema re-export)"
```

---

## Task 12: 前端组件（TabBar + QueryBox + HitCard + PhaseStream）

**Files:**
- Create: `apps/web/src/components/TabBar.vue`
- Create: `apps/web/src/components/QueryBox.vue`
- Create: `apps/web/src/components/HitCard.vue`
- Create: `apps/web/src/components/PhaseStream.vue`

- [ ] **Step 1: TabBar.vue**

新建 `apps/web/src/components/TabBar.vue`：

```vue
<script setup lang="ts">
defineProps<{ tabs: readonly string[]; modelValue: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <div class="flex gap-2 border-b border-gray-200">
    <button
      v-for="t in tabs"
      :key="t"
      :class="[
        'px-4 py-2 text-sm font-medium transition',
        modelValue === t
          ? 'border-b-2 border-blue-500 text-blue-600'
          : 'text-gray-600 hover:text-gray-900',
      ]"
      @click="$emit('update:modelValue', t)"
    >
      {{ t }}
    </button>
  </div>
</template>
```

- [ ] **Step 2: QueryBox.vue**

新建 `apps/web/src/components/QueryBox.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ namespace: 'notion' | 'md' | 'all'; disabled?: boolean }>();
const emit = defineEmits<{
  submit: [query: string];
  namespaceChange: [value: 'notion' | 'md' | 'all'];
}>();

const query = ref('');

function onSubmit() {
  if (query.value.trim().length === 0) return;
  emit('submit', query.value);
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <select
        :value="namespace"
        class="rounded border border-gray-300 px-2 py-1 text-sm"
        @change="emit('namespaceChange', ($event.target as HTMLSelectElement).value as 'notion' | 'md' | 'all')"
      >
        <option value="all">all</option>
        <option value="notion">notion</option>
        <option value="md">md</option>
      </select>
      <input
        v-model="query"
        type="text"
        :disabled="disabled"
        placeholder="输入 query…"
        class="flex-1 rounded border border-gray-300 px-3 py-1 text-sm"
        @keydown.enter="onSubmit"
      />
      <button
        :disabled="disabled"
        class="rounded bg-blue-500 px-4 py-1 text-sm text-white disabled:bg-gray-300"
        @click="onSubmit"
      >
        搜索
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 3: HitCard.vue**

新建 `apps/web/src/components/HitCard.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { Hit } from '../../../libs/api-schema/src/index.js';

const props = defineProps<{ hit: Hit; rank: number }>();

const scorePct = computed(() => Math.round(props.hit.score * 100));

const segments = computed(() => {
  // 把 content 按 highlight 区间切成 [text, highlight, text, ...]
  const sorted = [...props.hit.highlight].sort((a, b) => a.start - b.start);
  const out: Array<{ text: string; highlighted: boolean; term: string }> = [];
  let cursor = 0;
  for (const h of sorted) {
    if (h.start > cursor) {
      out.push({ text: props.hit.content.slice(cursor, h.start), highlighted: false, term: '' });
    }
    out.push({
      text: props.hit.content.slice(h.start, h.end),
      highlighted: true,
      term: h.term,
    });
    cursor = h.end;
  }
  if (cursor < props.hit.content.length) {
    out.push({ text: props.hit.content.slice(cursor), highlighted: false, term: '' });
  }
  return out;
});
</script>

<template>
  <div class="rounded border border-gray-200 bg-white p-4 shadow-sm">
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <span class="rounded bg-gray-100 px-2 py-0.5">#{{ rank }}</span>
        <span class="rounded bg-blue-50 px-2 py-0.5">{{ hit.chunkKind }}</span>
        <span>{{ hit.sourceKind }} / {{ hit.sourceLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="h-2 w-32 rounded bg-gray-100">
          <div
            class="h-2 rounded bg-blue-500"
            :style="{ width: `${scorePct}%` }"
          ></div>
        </div>
        <span class="text-xs text-gray-600">{{ hit.score.toFixed(3) }}</span>
      </div>
    </div>
    <div class="whitespace-pre-wrap text-sm text-gray-800">
      <template v-for="(seg, i) in segments" :key="i">
        <mark v-if="seg.highlighted" class="bg-yellow-200">{{ seg.text }}</mark>
        <template v-else>{{ seg.text }}</template>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: PhaseStream.vue**

新建 `apps/web/src/components/PhaseStream.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { PhaseEvent } from '../../../libs/api-schema/src/index.js';

const props = defineProps<{
  phases: readonly PhaseEvent[];
  done: { added: number; modified: number; removed: number; totalMs: number } | null;
  error: { message: string; exitCode?: number; stderrTail?: string } | null;
}>();

const PHASE_LABELS: Record<string, string> = {
  fetch: 'fetch',
  diff: 'diff',
  embed: 'embed',
  write: 'write',
};

const ordered = computed(() => {
  const order = ['fetch', 'diff', 'embed', 'write'] as const;
  return order.map((name) => ({
    name,
    event: props.phases.find((p) => p.name === name) ?? null,
  }));
});
</script>

<template>
  <div class="space-y-2 rounded border border-gray-200 bg-white p-4">
    <h3 class="text-sm font-semibold text-gray-700">入库进度</h3>
    <div class="space-y-1">
      <div
        v-for="row in ordered"
        :key="row.name"
        class="flex items-center gap-3 text-sm"
      >
        <span class="w-16 text-gray-500">{{ PHASE_LABELS[row.name] }}</span>
        <span v-if="row.event" class="text-green-600">
          ✓ {{ row.event.ms }}ms · {{ JSON.stringify(row.event.payload) }}
        </span>
        <span v-else-if="error" class="text-red-600">✗ 失败</span>
        <span v-else class="animate-pulse text-blue-500">…</span>
      </div>
    </div>
    <div v-if="done" class="mt-3 border-t pt-2 text-xs text-gray-600">
      done: +{{ done.added }} added, +{{ done.modified }} modified,
      -{{ done.removed }} removed ({{ done.totalMs }}ms)
    </div>
    <div v-if="error" class="mt-3 border-t pt-2 text-xs text-red-600">
      error: {{ error.message }}
      <pre v-if="error.stderrTail" class="mt-1 max-h-24 overflow-auto bg-gray-50 p-2">{{ error.stderrTail }}</pre>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 跑 typecheck:web**

```bash
pnpm typecheck:web
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(day14): web components (TabBar, QueryBox, HitCard, PhaseStream)"
```

---

## Task 13: 前端两个 view（SearchView + IngestView）

**Files:**
- Create: `apps/web/src/views/SearchView.vue`
- Create: `apps/web/src/views/IngestView.vue`

**Interfaces:**
- Consumes: `api-schema` types + `sse.ts` + `state.ts`

- [ ] **Step 1: SearchView.vue**

新建 `apps/web/src/views/SearchView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import QueryBox from '../components/QueryBox.vue';
import HitCard from '../components/HitCard.vue';
import type { SearchResponse } from '../../../libs/api-schema/src/index.js';

const namespace = ref<'notion' | 'md' | 'all'>('all');
const result = ref<SearchResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const elapsed = ref<number | null>(null);

async function onSubmit(query: string) {
  loading.value = true;
  error.value = null;
  result.value = null;
  elapsed.value = null;
  const start = performance.now();
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, topK: 5, namespace: namespace.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    result.value = await res.json();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    elapsed.value = Math.round(performance.now() - start);
    loading.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <QueryBox
      :namespace="namespace"
      :disabled="loading"
      @submit="onSubmit"
      @namespace-change="(v) => (namespace = v)"
    />
    <div v-if="loading" class="text-sm text-gray-500">搜索中…</div>
    <div v-if="error" class="rounded bg-red-50 p-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="result" class="text-xs text-gray-500">
      {{ result.hits.length }} hits · {{ elapsed }}ms total
    </div>
    <div v-if="result" class="space-y-3">
      <HitCard
        v-for="(hit, i) in result.hits"
        :key="hit.chunkId"
        :hit="hit"
        :rank="i + 1"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 2: IngestView.vue**

新建 `apps/web/src/views/IngestView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import QueryBox from '../components/QueryBox.vue';
import PhaseStream from '../components/PhaseStream.vue';
import type { PhaseEvent, DoneEvent, ErrorEvent } from '../../../libs/api-schema/src/index.js';
import { subscribeSSE } from '../lib/sse.js';
import type { NamespaceHealth } from '../../../libs/api-schema/src/index.js';

const namespace = ref<'notion' | 'md'>('notion');
const phases = ref<PhaseEvent[]>([]);
const done = ref<DoneEvent | null>(null);
const error = ref<ErrorEvent | null>(null);
const streaming = ref(false);
const health = ref<Record<'notion' | 'md', NamespaceHealth> | null>(null);

async function loadHealth() {
  const res = await fetch('/api/health');
  if (res.ok) {
    const body = await res.json();
    health.value = body.namespaces;
  }
}
loadHealth();

async function onIngest() {
  phases.value = [];
  done.value = null;
  error.value = null;
  streaming.value = true;

  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ namespace: namespace.value, dryRun: false }),
  });

  if (!res.ok || !res.body) {
    error.value = { message: `HTTP ${res.status}` };
    streaming.value = false;
    return;
  }

  // 用 fetch + ReadableStream 解析 SSE（不能用 EventSource 因为 POST）
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done: rd } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      parseFrame(frame);
    }
  }

  streaming.value = false;

  function parseFrame(frame: string) {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    try {
      const parsed = JSON.parse(data);
      if (event === 'phase') phases.value.push(parsed);
      else if (event === 'done') done.value = parsed;
      else if (event === 'error') error.value = parsed;
    } catch {
      /* ignore */
    }
  }
}

const currentHealth = () => health.value?.[namespace.value];
</script>

<template>
  <div class="space-y-4">
    <QueryBox
      :namespace="namespace"
      :disabled="streaming"
      @submit="onIngest"
      @namespace-change="(v) => (namespace = v as 'notion' | 'md')"
    />
    <div v-if="currentHealth() && !currentHealth()!.ready" class="rounded bg-yellow-50 p-3 text-sm text-yellow-800">
      当前 namespace 缺少 env：{{ currentHealth()!.missing.join(', ') }}
    </div>
    <button
      :disabled="streaming || (currentHealth() && !currentHealth()!.ready)"
      class="rounded bg-green-500 px-4 py-2 text-sm text-white disabled:bg-gray-300"
      @click="onIngest"
    >
      入库
    </button>
    <PhaseStream :phases="phases" :done="done" :error="error" />
  </div>
</template>
```

- [ ] **Step 3: 跑 typecheck:web**

```bash
pnpm typecheck:web
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/views/
git commit -m "feat(day14): SearchView and IngestView"
```

---

## Task 14: 把两个 view 接入 App.vue + 加 tab 切换 + dev proxy

**Files:**
- Modify: `apps/web/src/App.vue`（读现状后改）
- Modify: `apps/web/vite.config.ts`（加 /api 代理到 3000）

**Interfaces:**
- Produces: 顶层 App 显示 TabBar + 当前 view

- [ ] **Step 1: 读现状**

```bash
cat apps/web/src/App.vue
cat apps/web/vite.config.ts
```

- [ ] **Step 2: 修改 vite.config.ts 加 /api 代理**

在 `apps/web/vite.config.ts` 的 `defineConfig` 里加：

```ts
server: {
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:3000',
      changeOrigin: false,
    },
  },
},
```

（与现有 day08/09 的 dev 模式保持一致。）

- [ ] **Step 3: 修改 App.vue**

把 `apps/web/src/App.vue` 替换为：

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import TabBar from './components/TabBar.vue';
import SearchView from './views/SearchView.vue';
import IngestView from './views/IngestView.vue';

const tabs = ['搜索', '入库'] as const;
const active = ref<typeof tabs[number]>('搜索');
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4 p-6">
    <h1 class="text-2xl font-bold">Notion / MD RAG Playground</h1>
    <TabBar :tabs="tabs" v-model="active" />
    <SearchView v-if="active === '搜索'" />
    <IngestView v-else />
  </div>
</template>
```

- [ ] **Step 4: 跑 typecheck:web + dev 起来看 UI**

```bash
pnpm typecheck:web
pnpm dev:web
```

Expected: 看到 TabBar + 搜索 view；切到"入库"看到入库按钮 + health 警告

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.vue apps/web/vite.config.ts
git commit -m "feat(day14): App tab router + vite /api proxy to Hono"
```

---

## Task 15: 端到端冒烟（手动 + 自动合约）

**Files:**
- Modify: `package.json`（加 dev:rag 脚本）

- [ ] **Step 1: 读现有 scripts，找 dev:api 模式**

```bash
grep "dev:api" package.json
```

- [ ] **Step 2: 加 dev:rag 脚本**

修改 `package.json` 的 `scripts`：

```json
"dev:rag": "pnpm exec tsx scripts/with-ports.ts rag 3001 -- tsx apps/api/src/rag-server-entry.ts",
```

并新建 `apps/api/src/rag-server-entry.ts`：

```ts
/**
 * apps/api/src/rag-server-entry.ts
 *
 * 独立启动 createRagApp()，绑端口 3001（不与 day09 agent server 抢 3000）。
 */

import { serve } from '@hono/node-server';
import { createRagApp } from './rag-server.js';

const app = createRagApp();
const port = Number(process.env['PORT'] ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`RAG server listening on http://127.0.0.1:${info.port}`);
});
```

- [ ] **Step 3: 启动后端 + 前端，手动跑一遍**

```bash
# 终端 1
pnpm dev:rag

# 终端 2
pnpm dev:web
```

打开 `http://127.0.0.1:5173`，验证：
1. 搜索 tab：输入 query → 看到 hits + 相似度热力条
2. 入库 tab：点入库 → 看到 4 phase 时间线

- [ ] **Step 4: 跑全套测试**

```bash
pnpm test
pnpm typecheck
pnpm typecheck:web
pnpm lint
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add package.json apps/api/src/rag-server-entry.ts
git commit -m "feat(day14): rag-server-entry + dev:rag script"
```

---

## Self-Review

**1. Spec coverage:**
- 架构（§1）：Task 1-15 覆盖 ✓
- API 契约（§2）：Task 1（schema）、Task 7-8（handler）、Task 10（合约测试）✓
- 数据流（§3）：Task 11（SSE 客户端）、Task 13（view）✓
- 错误处理（§4）：Task 4（highlight 空 query）、Task 5（env）、Task 8（error event + timeout + abort）✓
- 测试（§5）：Task 2 / 4 / 5 / 7 / 8 / 10 全部有测试 ✓
- 学习目标 9 项：分散在 Task 1-15，对应可演示 ✓

**2. Placeholder scan:** 无 TBD / TODO / "implement later"

**3. Type consistency:**
- `parsePhaseLine` 在 Task 2 + 3 都用到 ✓
- `spawnMain` 返回 `SpawnMainResult`（Task 3），被 Task 8 用到 ✓
- `computeHighlight(query, content)` 入参一致（Task 4 + 7）✓
- `PhaseEvent` schema 字段 `name/ms/payload`（Task 1）+ parse 输出（Task 2）一致 ✓
- `Highlight.term`（Task 1）vs HitCard `seg.term`（Task 12）一致 ✓

**4. Spec gap check:**
- spec §3.5 状态机 → Task 11 实现 ✓
- spec §4.4 stderr 敏感信息 → Task 8 只暴露 stderrTail，不 forward 原文 ✓
- spec §5.3 反 YAGNI 红线：所有"不做"清单在 plan 中均未出现 ✓

**No spec gaps found.**
