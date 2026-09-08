/**
 * langchain-cmp/tools/file_read_tool.ts
 *
 * 复刻主线 libs/tools/repo/file-read-tool.ts 的 file_read 工具。
 *
 * 安全约束（与主线对齐，最小集）：
 * - 绝对路径校验（拒绝相对路径）
 * - cat-n 行号输出（4 字符宽度，左对齐填充空格）
 * - 范围读取：startLine / endLine（默认读取 200 行窗口）
 * - 错误前缀 `file_read:` 统一，便于上层定位
 *
 * 不做（YAGNI / 与主线一致）：
 * - 权限校验
 * - symlink / 大文件分块
 * - 二进制检测
 * - 并发安全（fs.stat → fs.readFile 非原子）
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';

const fileReadSchema = z.object({
  path: z.string().describe('Absolute path to the file'),
  startLine: z.coerce.number().int().min(1).optional(),
  endLine: z.coerce.number().int().min(1).optional(),
});

export const fileReadLangChainTool = tool(
  async ({ path: filePath, startLine, endLine }) => {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`file_read: path must be absolute, got: ${filePath}`);
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new Error(`file_read: path does not exist: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`file_read: path is not a file: ${filePath}`);
    }
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const totalLines = lines.length;
    const from = startLine ?? 1;
    const to = Math.min(endLine ?? from + 199, totalLines);
    const body = lines
      .slice(from - 1, to)
      .map((line, idx) => `${String(from + idx).padStart(4)} | ${line}`)
      .join('\n');
    return { path: filePath, content: body, startLine: from, endLine: to, totalLines };
  },
  {
    name: 'file_read',
    description:
      'Read a file with cat -n line numbers. Returns { path, content, startLine, endLine, totalLines }.',
    schema: fileReadSchema,
  },
);
