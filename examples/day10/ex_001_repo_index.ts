/**
 * examples/day10/ex_001_repo_index.ts
 *
 * 手跑 RepoIndexTool，看本 repo 前 10 个文件。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoIndexTool } from '../../libs/tools/repo/repo-index-tool.js';
import { runTool } from '../../libs/tools/tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// repo 根 = examples/day10/ 的 3 级父目录
const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function main(): Promise<void> {
  const result = await runTool(repoIndexTool, {
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
