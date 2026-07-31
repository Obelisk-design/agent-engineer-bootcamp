// stub — 完整实现在 Task 6
import type { Tool } from '../tool.js';

export interface RepoSearchArgs {
  readonly rootPath: string;
  readonly pattern: string;
}

export interface RepoSearchMatch {
  readonly file: string;
  readonly line: number;
  readonly content: string;
}

export interface RepoSearchResult {
  readonly matches: readonly RepoSearchMatch[];
  readonly total: number;
  readonly truncated: boolean;
}

export const repoSearchTool: Tool<RepoSearchArgs, RepoSearchResult> = {
  name: 'repo_search',
  description: 'stub',
  parameters: {
    type: 'object',
    properties: {
      rootPath: { type: 'string' },
      pattern: { type: 'string' },
    },
    required: ['rootPath', 'pattern'],
  },
  execute: async () => ({ matches: [], total: 0, truncated: false }),
};