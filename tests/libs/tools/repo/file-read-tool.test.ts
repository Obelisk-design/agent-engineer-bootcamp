/**
 * tests/libs/tools/repo/file-read-tool.test.ts
 *
 * Day 11 FileReadTool 反例（spec §4.2，反例 8-15）。
 *
 * 用临时目录造大文件 / 超长行 / 空文件，不污染 fixture。
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fileReadTool } from '../../../../libs/tools/repo/file-read-tool.js';
import { runTool } from '../../../../libs/tools/tool.js';
import {
  MAX_LINE_CHARS,
  MAX_READ_LINES,
  LINE_TRUNCATED_SUFFIX,
} from '../../../../libs/tools/repo/output-limits.js';

let tmpDir: string;
let smallFile: string;
let bigFile: string;
let longLineFile: string;
let emptyFile: string;

const BIG_FILE_LINES = 5_000;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-read-test-'));

  smallFile = path.join(tmpDir, 'small.ts');
  await fs.writeFile(smallFile, ['const a = 1;', 'const b = 2;', 'const c = 3;'].join('\n'));

  bigFile = path.join(tmpDir, 'big.ts');
  await fs.writeFile(
    bigFile,
    Array.from({ length: BIG_FILE_LINES }, (_, i) => `line ${i + 1}`).join('\n'),
  );

  longLineFile = path.join(tmpDir, 'minified.js');
  await fs.writeFile(longLineFile, 'x'.repeat(5_000));

  emptyFile = path.join(tmpDir, 'empty.ts');
  await fs.writeFile(emptyFile, '');
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('fileReadTool — IO 前置条件反例', () => {
  // 反例 8
  it('相对路径 → throw', async () => {
    await expect(runTool(fileReadTool, { path: './relative.ts' })).rejects.toThrow(
      /file_read: path must be absolute/,
    );
  });

  // 反例 9
  it('不存在的路径 → throw', async () => {
    await expect(runTool(fileReadTool, { path: path.join(tmpDir, 'nope.ts') })).rejects.toThrow(
      /file_read: path does not exist/,
    );
  });

  // 反例 10
  it('目录而非文件 → throw', async () => {
    await expect(runTool(fileReadTool, { path: tmpDir })).rejects.toThrow(
      /file_read: path is not a file/,
    );
  });

  // 反例 12
  it('startLine > endLine → throw', async () => {
    await expect(
      runTool(fileReadTool, { path: smallFile, startLine: 3, endLine: 1 }),
    ).rejects.toThrow(/endLine \(1\) must be >= startLine \(3\)/);
  });

  it('startLine 超出文件末尾 → throw', async () => {
    await expect(runTool(fileReadTool, { path: smallFile, startLine: 999 })).rejects.toThrow(
      /past end of file/,
    );
  });

  it('startLine:0 被 schema 拦住（下界守卫）', async () => {
    await expect(runTool(fileReadTool, { path: smallFile, startLine: 0 })).rejects.toThrow(
      /file_read: invalid arguments — startLine/,
    );
  });
});

describe('fileReadTool — 截断三层', () => {
  // 反例 11
  it(`${BIG_FILE_LINES} 行文件默认只读 ${MAX_READ_LINES} 行 + 尾部 marker`, async () => {
    const result = await runTool(fileReadTool, { path: bigFile });

    expect(result.totalLines).toBe(BIG_FILE_LINES);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(MAX_READ_LINES);
    expect(result.truncated).toBe(true);
    expect(result.content).toContain(`of ${BIG_FILE_LINES}`);
    expect(result.content).toContain('Use startLine/endLine to read other sections.');
  });

  it('显式 endLine 也不能突破 MAX_READ_LINES', async () => {
    const result = await runTool(fileReadTool, { path: bigFile, startLine: 1, endLine: 4999 });
    expect(result.endLine).toBe(MAX_READ_LINES);
    expect(result.truncated).toBe(true);
  });

  it('分页读第二段，行号连续', async () => {
    const result = await runTool(fileReadTool, {
      path: bigFile,
      startLine: 2001,
      endLine: 2003,
    });
    expect(result.startLine).toBe(2001);
    expect(result.endLine).toBe(2003);
    expect(result.content).toContain('2001 | line 2001');
    expect(result.content).toContain('2003 | line 2003');
  });

  // 反例 13
  it('单行 5000 字符 → 截到 MAX_LINE_CHARS + 标记', async () => {
    const result = await runTool(fileReadTool, { path: longLineFile });
    expect(result.content).toContain(LINE_TRUNCATED_SUFFIX);
    // 去掉 "1 | " 前缀后，正文长度 = MAX_LINE_CHARS + suffix
    const bodyLine = result.content.split('\n')[0] ?? '';
    const payload = bodyLine.slice(bodyLine.indexOf(' | ') + 3);
    expect(payload.length).toBe(MAX_LINE_CHARS + LINE_TRUNCATED_SUFFIX.length);
  });
});

describe('fileReadTool — 正常路径', () => {
  // 反例 14
  it('空文件不 throw，返回空内容', async () => {
    const result = await runTool(fileReadTool, { path: emptyFile });
    expect(result.content).toBe('');
    expect(result.totalLines).toBe(0);
    expect(result.truncated).toBe(false);
  });

  // 反例 15 —— Edit 锚点契约
  it('cat -n 行号格式：第 N 行必须渲染成 "N | 内容"', async () => {
    const result = await runTool(fileReadTool, { path: smallFile });
    const lines = result.content.split('\n');
    expect(lines[0]).toBe('1 | const a = 1;');
    expect(lines[1]).toBe('2 | const b = 2;');
    expect(lines[2]).toBe('3 | const c = 3;');
  });

  it('行号右对齐（宽度按最大行号）', async () => {
    const result = await runTool(fileReadTool, { path: bigFile, startLine: 9, endLine: 11 });
    const lines = result.content.split('\n');
    expect(lines[0]).toBe(' 9 | line 9');
    expect(lines[1]).toBe('10 | line 10');
  });

  it('完整读小文件时不带 marker（不该有噪音）', async () => {
    const result = await runTool(fileReadTool, { path: smallFile });
    expect(result.truncated).toBe(false);
    expect(result.content).not.toContain('Use startLine/endLine');
  });

  it('startLine 传字符串数字 → 无损转换（LLM 常这么传）', async () => {
    const result = await runTool(fileReadTool, { path: smallFile, startLine: '2' });
    expect(result.startLine).toBe(2);
    expect(result.content).toContain('2 | const b = 2;');
  });
});
