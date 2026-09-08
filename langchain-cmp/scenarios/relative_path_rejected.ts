/**
 * langchain-cmp/scenarios/relative_path_rejected.ts
 *
 * 验证：file_read / file_edit 都拒绝相对路径，且错误前缀统一。
 */

import 'dotenv/config';
import { fileReadLangChainTool } from '../tools/file_read_tool.js';
import { fileEditLangChainTool } from '../tools/file_edit_tool.js';

async function probe(label: 'file_read' | 'file_edit', fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(JSON.stringify({ label, ok: false, reason: 'expected throw' }));
    process.exitCode = 1;
  } catch (err) {
    const message = (err as Error).message;
    const ok = message.includes(`${label}: path must be absolute`);
    console.log(JSON.stringify({ label, ok, message }));
    if (!ok) process.exitCode = 1;
  }
}

await probe('file_read', () => fileReadLangChainTool.invoke({ path: 'relative.ts' }));
await probe('file_edit', () =>
  fileEditLangChainTool.invoke({ path: 'relative.ts', oldString: 'x', newString: 'y' }),
);
