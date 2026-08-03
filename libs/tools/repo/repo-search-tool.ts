/**
 * libs/tools/repo/repo-search-tool.ts
 *
 * RepoSearchTool: 内容搜索（字面 OR regex），支持 fileGlob + context lines。
 *
 * 设计要点（见 spec §2.2）：
 * - pattern 含 regex 元字符 → 当 regex；否则字面
 * - fileGlob 用 mini-glob（点 ts、点 ts 多层 等）
 * - 上下文行（contextBefore/contextAfter）按 1-based 行号定位
 * - maxResults 默认 50，> 500 拒绝
 * - 走 walk 复用 RepoIndexTool 的 ignore 过滤逻辑（直接复用 shouldIgnore）
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Tool } from '../tool.js';
import { shouldIgnore, DEFAULT_IGNORE } from './ignore.js';
import { matchesGlob } from './glob.js';

const DEFAULT_MAX_RESULTS = 50;
const ABSOLUTE_MAX_RESULTS = 500;
const SEARCH_MAX_DEPTH = 10;
const REGEX_METACHARS = /[.*+?^${}()|[\]\\]/;

/**
 * 参数契约事实源（Day 11 / ADR 0003）。
 *
 * ⚠️ 布尔参数写成 `z.union([z.boolean(), z.stringbool()])`，三种写法都不对：
 *
 *   - `z.coerce.boolean()` —— 实测 `parse("false") === true`（JS 非空字符串皆真值），
 *     原样复现 Day 10 bug A。
 *   - `z.boolean()` 单用 —— LLM 发 `"false"` 字符串时整个 tool call 失败，一轮 token 白烧。
 *   - `z.stringbool()` 单用 —— JSON Schema 输出 `type: "string"`，**仍然没告诉 LLM
 *     这是布尔**；而且实测它**拒绝原生 `true`/`false`**，越聪明的模型越容易踩。
 *
 * union 的 JSON Schema 是 `anyOf: [{type:boolean},{type:string}]`：boolean 在前是给
 * LLM 的主信号，string 分支兜住 `"true"`/`"false"`。`"abc"` 两个分支都不匹配 → 报错。
 */
const looseBoolean = z.union([z.boolean(), z.stringbool()]);

const repoSearchSchema = z.object({
  rootPath: z.string().describe('Absolute path to repo root'),
  pattern: z.string().describe('String literal or regex to search for'),
  maxResults: z.coerce
    .number()
    .int()
    .min(1)
    .max(ABSOLUTE_MAX_RESULTS)
    .default(DEFAULT_MAX_RESULTS)
    .describe(`Max matches to return, 1-${ABSOLUTE_MAX_RESULTS}`),
  fileGlob: z.string().optional().describe('Glob pattern to filter files, e.g. "*.ts"'),
  includeContent: looseBoolean
    .default(true)
    .describe('Include the matched line content in each result'),
  contextBefore: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Lines of context before each match'),
  contextAfter: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Lines of context after each match'),
});

export type RepoSearchArgs = z.infer<typeof repoSearchSchema>;

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
      test: (s) => {
        re.lastIndex = 0;
        return re.test(s);
      },
      matchAt: (s) => {
        re.lastIndex = 0;
        const m = re.exec(s);
        return m ? { index: m.index } : null;
      },
    };
  }
  const literal = pattern;
  return {
    isRegex: false,
    test: (s) => s.includes(literal),
    matchAt: (s) => {
      const idx = s.indexOf(literal);
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
  depth: number,
): Promise<void> {
  if (depth <= 0) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, String(entry.name));
    const rel = path.relative(rootPath, abs).split(path.sep).join('/');
    if (shouldIgnore(rel, ignore)) continue;
    if (entry.isDirectory()) {
      await collectFiles(abs, rootPath, ignore, fileGlob, out, depth - 1);
    } else if (entry.isFile()) {
      if (fileGlob === undefined || matchesGlob(rel, fileGlob)) {
        out.push({ abs, rel });
      }
    }
  }
}

export const repoSearchTool: Tool<typeof repoSearchSchema, RepoSearchResult> = {
  name: 'repo_search',
  description:
    'Search file contents for a pattern (string literal or regex). ' +
    'Use this when you need to find "where X is defined" or "who calls Y". ' +
    'Returns: { matches: { file, line, column?, content?, before?, after? }[]; total; truncated }. ' +
    'Pattern auto-detected as regex if contains metachars.',
  schema: repoSearchSchema,
  execute: async ({
    rootPath,
    pattern,
    maxResults,
    fileGlob,
    includeContent,
    contextBefore,
    contextAfter,
  }) => {
    // 类型 / 范围校验已由 ToolRegistry.execute 完成。这里只做 IO 前置条件检查。
    if (!path.isAbsolute(rootPath)) {
      throw new Error(`repo_search: rootPath must be absolute, got: ${rootPath}`);
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

    const compiled = compilePattern(pattern);
    const ignore = Array.from(DEFAULT_IGNORE);
    const files: PendingFile[] = [];
    await collectFiles(rootPath, rootPath, ignore, fileGlob, files, SEARCH_MAX_DEPTH);

    const matches: RepoSearchMatch[] = [];
    let total = 0;
    let truncated = false;

    for (const f of files) {
      if (truncated) break;
      let content: string;
      try {
        content = await fs.readFile(f.abs, 'utf-8');
      } catch {
        continue;
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
                  before: lines.slice(Math.max(0, i - contextBefore), i).map((l) => l),
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
