/**
 * langchain-cmp/tools/file_edit_tool.ts
 *
 * 复刻主线 libs/tools/repo/file-edit-tool.ts 的 file_edit 工具。
 *
 * 安全约束（与主线对齐，最小集）：
 * - 绝对路径校验（拒绝相对路径）
 * - oldString 必填非空
 * - 零匹配 → 抛错（避免静默 noop）
 * - replaceAll=false 且多匹配 → 抛错（避免误改）
 * - 临时文件 + rename 原子写入：失败时原文件不被破坏
 * - 错误前缀 `file_edit:` 统一，便于上层定位
 *
 * 不做（YAGNI / 与主线一致）：
 * - 权限校验
 * - 并发安全（同进程内多次 edit 同一文件最后写赢）
 * - 大文件流式
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';

const fileEditSchema = z.object({
  path: z.string().describe('Absolute path to the file'),
  oldString: z.string().min(1).describe('Exact text to replace'),
  newString: z.string().describe('Replacement text'),
  replaceAll: z.boolean().default(false),
});

export const fileEditLangChainTool = tool(
  async ({ path: filePath, oldString, newString, replaceAll }) => {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`file_edit: path must be absolute, got: ${filePath}`);
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new Error(`file_edit: path does not exist: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`file_edit: not a file: ${filePath}`);
    }
    const source = await fs.readFile(filePath, 'utf8');

    const indices: number[] = [];
    let cursor = 0;
    while (true) {
      const idx = source.indexOf(oldString, cursor);
      if (idx < 0) break;
      indices.push(idx);
      cursor = idx + oldString.length;
    }

    if (indices.length === 0) {
      throw new Error(`file_edit: oldString not found in ${filePath}`);
    }
    if (!replaceAll && indices.length !== 1) {
      throw new Error(`file_edit: expected exactly one match, got ${indices.length}`);
    }

    const updated = replaceAll
      ? source.split(oldString).join(newString)
      : source.replace(oldString, newString);

    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, updated, { encoding: 'utf8', flag: 'wx' });
    try {
      await fs.rename(tempPath, filePath);
    } finally {
      await fs.rm(tempPath, { force: true });
    }

    return {
      path: filePath,
      replacements: replaceAll ? indices.length : 1,
      content: updated,
      diff: `- ${oldString}\n+ ${newString}`,
    };
  },
  {
    name: 'file_edit',
    description:
      'Edit one file by exact string replacement. Returns { path, replacements, content, diff }. Throws on zero or ambiguous matches.',
    schema: fileEditSchema,
  },
);
