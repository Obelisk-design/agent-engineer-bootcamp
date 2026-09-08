/**
 * langchain-cmp/scenarios/multi_match_failure.ts
 *
 * 验证：replaceAll=false + 多匹配 → 抛错带 file_edit: 前缀，且 file 不被修改。
 * 直接调 fileEditLangChainTool（不走 agent），避免依赖 dev 网关 / 模型。
 */

import 'dotenv/config';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'langchain-cmp-multi-'));
  const fixture = path.join(tmp, 'multi.ts');
  await writeFile(fixture, 'foo foo foo\n');

  try {
    await fileEditLangChainTool.invoke({
      path: fixture,
      oldString: 'foo',
      newString: 'bar',
      replaceAll: false,
    });
    throw new Error('expected throw');
  } catch (err) {
    const message = (err as Error).message;
    console.log(JSON.stringify({ message }, null, 2));
    if (!message.includes('file_edit:')) {
      throw new Error('missing file_edit: prefix in LangChain ToolException');
    }
    if (!message.includes('2') && !message.includes('3')) {
      throw new Error('expected match count in error message');
    }
  }

  const after = await readFile(fixture, 'utf8');
  if (after !== 'foo foo foo\n') throw new Error('file must remain unchanged on failure');
  console.log('OK: file unchanged, error prefix preserved');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
