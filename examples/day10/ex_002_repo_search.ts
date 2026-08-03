/**
 * examples/day10/ex_002_repo_search.ts
 *
 * 手跑 RepoSearchTool 搜 'ToolRegistry'，看命中。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoSearchTool } from '../../libs/tools/repo/repo-search-tool.js';
import { runTool } from '../../libs/tools/tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function main(): Promise<void> {
  const result = await runTool(repoSearchTool, {
    rootPath: REPO_ROOT,
    pattern: 'ToolRegistry',
    fileGlob: '**/*.ts',
    maxResults: 5,
    contextBefore: 1,
  });

  console.log(
    `Total: ${result.total} matches (returned ${result.matches.length}, truncated: ${result.truncated})`,
  );
  for (const m of result.matches) {
    console.log(`  ${m.file}:${m.line}  ${m.content.trim()}`);
    if (m.before) console.log(`    before: ${m.before.join(' | ')}`);
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
