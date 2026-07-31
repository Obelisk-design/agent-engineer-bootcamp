// stub — 完整实现在 Task 5
import type { Tool } from '../tool.js';

export interface RepoIndexArgs {
  readonly rootPath: string;
}

export interface RepoIndexResult {
  readonly files: readonly string[];
  readonly total: number;
  readonly truncated: boolean;
}

export const repoIndexTool: Tool<RepoIndexArgs, RepoIndexResult> = {
  name: 'repo_index',
  description: 'stub',
  parameters: { type: 'object', properties: { rootPath: { type: 'string' } }, required: ['rootPath'] },
  execute: async () => ({ files: [], total: 0, truncated: false }),
};