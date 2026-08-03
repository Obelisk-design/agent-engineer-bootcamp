/**
 * libs/tools/repo/file-read-tool.ts
 *
 * FileReadTool: 读单个文件，带 cat -n 行号 + 三层截断。
 *
 * Day 11 补齐 L1 Repo Understanding 的第三只手：
 *   repo_index（这个 repo 有什么） → repo_search（X 在哪） → file_read（完整读出来）
 *
 * 三层截断（均在 tool 层 enforce，见 output-limits.ts 的说明）：
 *   1. 行数：单次最多 MAX_READ_LINES 行
 *   2. 单行字符：超长行截到 MAX_LINE_CHARS
 *   3. 总字符：整体输出不超过 MAX_READ_OUTPUT_CHARS
 *
 * 任一层触发截断，尾部都会带一条自然语言 marker 告诉模型怎么读下一段。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Tool } from '../tool.js';
import {
  MAX_READ_LINES,
  MAX_READ_OUTPUT_CHARS,
  renderWithLineNumbers,
  truncateLine,
  truncationNotice,
} from './output-limits.js';

const fileReadSchema = z.object({
  path: z.string().describe('Absolute path to the file to read'),
  startLine: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe('1-based line to start reading from (default 1)'),
  endLine: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`1-based inclusive last line (default startLine + ${MAX_READ_LINES} - 1)`),
});

export type FileReadArgs = z.infer<typeof fileReadSchema>;

export interface FileReadResult {
  readonly path: string;
  /** cat -n 渲染后的内容；截断时尾部带 marker（marker 是给模型看的载荷） */
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly totalLines: number;
  /** 冗余于 content 里的 marker，仅供程序判断；模型只看 marker */
  readonly truncated: boolean;
}

export const fileReadTool: Tool<typeof fileReadSchema, FileReadResult> = {
  name: 'file_read',
  description:
    'Read the contents of a single file with line numbers. ' +
    'Use this after repo_search / repo_index to see full context around a match. ' +
    `Reads at most ${MAX_READ_LINES} lines per call — pass startLine/endLine to page through larger files. ` +
    'Returns content in "  42 | code" format; the line numbers are stable anchors you can refer to.',
  schema: fileReadSchema,
  execute: async ({ path: filePath, startLine, endLine }) => {
    // 类型 / 下界校验已由框架层完成。这里只做 zod 管不了的 IO 前置条件。
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

    const from = startLine ?? 1;
    const requestedTo = endLine ?? from + MAX_READ_LINES - 1;
    if (requestedTo < from) {
      throw new Error(`file_read: endLine (${requestedTo}) must be >= startLine (${from})`);
    }

    const raw = await fs.readFile(filePath, 'utf-8');
    if (raw === '') {
      return {
        path: filePath,
        content: '',
        startLine: 0,
        endLine: 0,
        totalLines: 0,
        truncated: false,
      };
    }

    const allLines = raw.split(/\r?\n/);
    const totalLines = allLines.length;

    if (from > totalLines) {
      throw new Error(`file_read: startLine (${from}) is past end of file (${totalLines} lines)`);
    }

    // 第 1 层：行数上限（显式 endLine 也不能突破 MAX_READ_LINES）
    const hardTo = Math.min(requestedTo, totalLines, from + MAX_READ_LINES - 1);

    // 第 2 层：单行字符上限
    let selected = allLines.slice(from - 1, hardTo).map((l) => truncateLine(l));

    // 第 3 层：总字符上限 —— 从尾部丢行直到装得下
    let to = hardTo;
    let body = renderWithLineNumbers(selected, from);
    while (body.length > MAX_READ_OUTPUT_CHARS && selected.length > 1) {
      selected = selected.slice(0, -1);
      to = from + selected.length - 1;
      body = renderWithLineNumbers(selected, from);
    }

    const truncated = from > 1 || to < totalLines;
    const content = truncated ? `${body}\n\n${truncationNotice(from, to, totalLines)}` : body;

    return { path: filePath, content, startLine: from, endLine: to, totalLines, truncated };
  },
};
