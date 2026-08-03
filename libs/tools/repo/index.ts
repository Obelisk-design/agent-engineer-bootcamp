/**
 * libs/tools/repo/index.ts
 *
 * barrel — 暴露 repo 模块公共 API
 */

export { repoIndexTool, type RepoIndexArgs, type RepoIndexResult } from './repo-index-tool.js';
export {
  repoSearchTool,
  type RepoSearchArgs,
  type RepoSearchResult,
  type RepoSearchMatch,
} from './repo-search-tool.js';
export { fileReadTool, type FileReadArgs, type FileReadResult } from './file-read-tool.js';
export {
  MAX_READ_LINES,
  MAX_LINE_CHARS,
  MAX_READ_OUTPUT_CHARS,
  LINE_TRUNCATED_SUFFIX,
} from './output-limits.js';
export { shouldIgnore, DEFAULT_IGNORE } from './ignore.js';
export { matchesGlob } from './glob.js';
