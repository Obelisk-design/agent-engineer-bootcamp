/**
 * examples/day11/ex_001_file_read.ts
 *
 * 手跑 FileReadTool：读本 repo 的 libs/tools/tool.ts，看 cat -n 行号 + 分页。
 *
 * 跑法：npx tsx examples/day11/ex_001_file_read.ts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileReadTool } from '../../libs/tools/repo/file-read-tool.js';
import { runTool } from '../../libs/tools/tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function main(): Promise<void> {
  const target = path.join(REPO_ROOT, 'libs', 'tools', 'tool.ts');

  console.log('--- 1. 读前 12 行 ---');
  const head = await runTool(fileReadTool, { path: target, startLine: 1, endLine: 12 });
  console.log(head.content);
  console.log(`\n(total ${head.totalLines} lines, truncated=${head.truncated})\n`);

  console.log('--- 2. LLM 常把行号发成字符串，应无损转换 ---');
  const asString = await runTool(fileReadTool, { path: target, startLine: '5', endLine: '7' });
  console.log(asString.content);
  console.log(`\nstartLine 实际类型: ${typeof asString.startLine} = ${asString.startLine}\n`);

  console.log('--- 3. 参数传错类型 → 明确报错（不是静默失败）---');
  try {
    await runTool(fileReadTool, { path: target, startLine: 'abc' });
  } catch (err) {
    console.log(err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
