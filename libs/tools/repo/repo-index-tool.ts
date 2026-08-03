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
import { z } from 'zod';
import type { Tool } from '../tool.js';
import { shouldIgnore, DEFAULT_IGNORE } from './ignore.js';

const MAX_FILES = 5000;
const DEFAULT_MAX_DEPTH = 3;
const ABSOLUTE_MAX_DEPTH = 10;

/**
 * 参数契约事实源（Day 11 / ADR 0003）。
 *
 * - `maxDepth` 用 `z.coerce.number()`：LLM 偶尔把数字发成 `"3"`，无损转换不该让整个
 *   tool call 失败。但**必须**带 `.min(1)` —— 实测 `z.coerce.number().parse("")` 返回 0，
 *   没有下界的话空串会静默变成 0。
 * - `ignorePatterns` 声明成 `array` 而非 `string`。Day 10 的 bug B 正是因为 schema 说
 *   string、代码要 array，LLM 老实传 string 后被 `Array.isArray` 静默丢弃。
 */
const repoIndexSchema = z.object({
  rootPath: z.string().describe('Absolute path to repo root'),
  maxDepth: z.coerce
    .number()
    .int()
    .min(1)
    .max(ABSOLUTE_MAX_DEPTH)
    .default(DEFAULT_MAX_DEPTH)
    .describe(`Max directory depth to walk, 1-${ABSOLUTE_MAX_DEPTH}`),
  ignorePatterns: z
    .array(z.string())
    .optional()
    .describe('Override the default ignore list (node_modules, .git, dist, ...)'),
});

export type RepoIndexArgs = z.infer<typeof repoIndexSchema>;

export interface RepoIndexResult {
  readonly files: readonly string[];
  readonly total: number;
  readonly truncated: boolean;
}

async function walk(
  dir: string,
  rootPath: string,
  depth: number,
  maxDepth: number,
  ignore: readonly string[],
  files: string[],
  truncatedRef: { value: boolean },
): Promise<void> {
  if (truncatedRef.value) return;
  if (depth > maxDepth) return;

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
      await walk(abs, rootPath, depth + 1, maxDepth, ignore, files, truncatedRef);
    } else if (entry.isFile()) {
      files.push(rel);
      if (files.length >= MAX_FILES) {
        truncatedRef.value = true;
        return;
      }
    }
  }
}

export const repoIndexTool: Tool<typeof repoIndexSchema, RepoIndexResult> = {
  name: 'repo_index',
  description:
    'List files in a repository directory tree (respects .gitignore-style ignores). ' +
    'Use this when you need to know "what files exist in this repo" or "what is the structure". ' +
    'Returns: { files: string[]; total: number; truncated: boolean }. ' +
    'Files are POSIX-relative to rootPath. Truncated=true means hit the 5000-file cap.',
  schema: repoIndexSchema,
  execute: async ({ rootPath, maxDepth, ignorePatterns }) => {
    // 类型 / 范围校验已由 ToolRegistry.execute 完成。
    // 这里只做 zod 管不了的 IO 前置条件检查。
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

    const ignore = ignorePatterns ?? Array.from(DEFAULT_IGNORE);

    const files: string[] = [];
    const truncatedRef = { value: false };
    await walk(rootPath, rootPath, 1, maxDepth, ignore, files, truncatedRef);

    return { files, total: files.length, truncated: truncatedRef.value };
  },
};
