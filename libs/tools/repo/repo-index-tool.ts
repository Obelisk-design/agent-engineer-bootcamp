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
      maxDepth: { type: 'string', description: 'Max depth 1-10 (default 3)' },
      ignorePatterns: { type: 'string', description: 'Override default ignore list' },
    },
    required: ['rootPath'],
  },
  execute: async (args) => {
    const rootPath = (args as Partial<RepoIndexArgs>).rootPath;
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

    const maxDepthRaw = (args as Partial<RepoIndexArgs>).maxDepth;
    const maxDepth = maxDepthRaw !== undefined ? Number(maxDepthRaw) : DEFAULT_MAX_DEPTH;
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new Error('repo_index: maxDepth must be >= 1');
    }
    if (maxDepth > ABSOLUTE_MAX_DEPTH) {
      throw new Error(
        `repo_index: maxDepth too large (max ${ABSOLUTE_MAX_DEPTH}, got ${maxDepth})`,
      );
    }

    const ignorePatterns = (args as Partial<RepoIndexArgs>).ignorePatterns;
    const ignore = Array.isArray(ignorePatterns)
      ? (ignorePatterns as string[])
      : Array.from(DEFAULT_IGNORE);

    const files: string[] = [];
    const truncatedRef = { value: false };
    await walk(rootPath, rootPath, 1, maxDepth, ignore, files, truncatedRef);

    return { files, total: files.length, truncated: truncatedRef.value };
  },
};