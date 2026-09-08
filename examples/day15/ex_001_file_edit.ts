/**
 * examples/day15/ex_001_file_edit.ts
 *
 * 手跑 file_read → file_edit 最小演示（不在仓库真实文件上改）。
 *
 * 流程：
 *   1. mkdtemp 建临时目录 + 写入带唯一目标字符串的 fixture
 *   2. runTool(fileReadTool, { path: fixture }) —— 打印 cat -n 带行号内容
 *   3. runTool(fileEditTool, { path, oldString, newString }) —— 打印 replacements + diff
 *   4. runTool(fileReadTool, { path }) —— 打印修改后内容
 *   5. finally 删除临时目录
 *
 * 跑法：pnpm exec tsx examples/day15/ex_001_file_edit.ts
 *
 * 预期：exit 0；输出修改前后带行号内容、replacements: 1、含 -/+ 的 diff 摘要。
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runTool } from '../../libs/tools/tool.js';
import { fileReadTool } from '../../libs/tools/repo/file-read-tool.js';
import { fileEditTool, type FileEditResult } from '../../libs/tools/repo/file-edit-tool.js';

const FIXTURE_BODY = [
  '// example fixture for file_edit demo',
  'export const answer = 1;',
  'export const label = "before";',
].join('\n');

async function main(): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'day15-ex-001-'));
  const fixture = path.join(tmpDir, 'fixture.ts');

  try {
    await fs.writeFile(fixture, FIXTURE_BODY + '\n', 'utf8');

    console.log('========== BEFORE: file_read ==========');
    const before = await runTool(fileReadTool, { path: fixture });
    console.log(before.content);
    console.log();

    console.log('========== file_edit (replaceAll: false) ==========');
    const result = (await runTool(fileEditTool, {
      path: fixture,
      oldString: 'export const answer = 1;',
      newString: 'export const answer = 42;',
    })) as FileEditResult;
    console.log(`>>> replacements: ${result.replacements}`);
    console.log(`>>> diff:`);
    console.log(result.diff);
    console.log();

    console.log('========== AFTER: file_read ==========');
    const after = await runTool(fileReadTool, { path: fixture });
    console.log(after.content);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
