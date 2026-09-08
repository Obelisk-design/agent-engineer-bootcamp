/**
 * tests/libs/tools/repo/file-edit-tool.test.ts
 *
 * Day 15 FileEditTool 红 → 绿契约测试。
 *
 * 与 file-read-tool.test.ts 同风格：mkdtemp 造临时目录，每个 describe 用 beforeAll/afterAll。
 * 测三类不变量：
 *   1. schema 校验 + default 填充（走 ToolRegistry.execute，不直调 execute）
 *   2. 匹配语义：唯一替换 / 全部替换 / 不存在 / 多次匹配失败
 *   3. IO 前置条件 + 原子写入 + diff 格式
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ToolRegistry } from '../../../../libs/tools/index.js';
import { fileEditTool, type FileEditResult } from '../../../../libs/tools/repo/file-edit-tool.js';

let tmpDir: string;
let sampleFile: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-edit-test-'));
  sampleFile = path.join(tmpDir, 'sample.ts');
  await fs.writeFile(sampleFile, ['const answer = 1;', 'const other = 2;'].join('\n'), 'utf8');
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('fileEditTool — schema 与成功路径', () => {
  it('走 ToolRegistry.execute 触发 schema 校验 + default 填充', async () => {
    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const result = (await registry.execute('file_edit', {
      path: sampleFile,
      oldString: 'const answer = 1;',
      newString: 'const answer = 42;',
    })) as FileEditResult;

    expect(result.path).toBe(sampleFile);
    expect(result.replacements).toBe(1);
    expect(await fs.readFile(sampleFile, 'utf8')).toContain('const answer = 42;');
  });

  it('replaceAll=false 多匹配 → 拒绝（默认行为不允许歧义替换）', async () => {
    const file = path.join(tmpDir, 'duplicate.ts');
    const original = 'foo\nfoo\nbar\n';
    await fs.writeFile(file, original, 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: file,
        oldString: 'foo',
        newString: 'baz',
      }),
    ).rejects.toThrow(/matched 2 times/);

    // 原文件不变（写入步骤未发生）
    expect(await fs.readFile(file, 'utf8')).toBe(original);
  });
});

describe('fileEditTool — 匹配语义', () => {
  it('oldString 不存在 → throw', async () => {
    const file = path.join(tmpDir, 'missing.ts');
    await fs.writeFile(file, 'const a = 1;\n', 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: file,
        oldString: 'no-such-text',
        newString: 'x',
      }),
    ).rejects.toThrow(/not found/);
  });

  it('replaceAll=false 多匹配 → throw，原文件不变', async () => {
    const file = path.join(tmpDir, 'multi.ts');
    const original = 'x\nx\ny\n';
    await fs.writeFile(file, original, 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: file,
        oldString: 'x',
        newString: 'z',
        replaceAll: false,
      }),
    ).rejects.toThrow(/exactly once/);

    expect(await fs.readFile(file, 'utf8')).toBe(original);
  });

  it('replaceAll=false 零匹配 → throw，原文件不变', async () => {
    const file = path.join(tmpDir, 'zero.ts');
    const original = 'aaa\n';
    await fs.writeFile(file, original, 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: file,
        oldString: 'zzz',
        newString: 'x',
        replaceAll: false,
      }),
    ).rejects.toThrow(/not found/);

    expect(await fs.readFile(file, 'utf8')).toBe(original);
  });

  it('replaceAll=true 替换所有匹配并返回总数', async () => {
    const file = path.join(tmpDir, 'all.ts');
    await fs.writeFile(file, 'foo\nfoo\nfoo\n', 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const result = (await registry.execute('file_edit', {
      path: file,
      oldString: 'foo',
      newString: 'baz',
      replaceAll: true,
    })) as FileEditResult;

    expect(result.replacements).toBe(3);
    expect(await fs.readFile(file, 'utf8')).toBe('baz\nbaz\nbaz\n');
  });

  it('replaceAll=true 零匹配 → throw', async () => {
    const file = path.join(tmpDir, 'all-zero.ts');
    await fs.writeFile(file, 'aaa\n', 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: file,
        oldString: 'zzz',
        newString: 'x',
        replaceAll: true,
      }),
    ).rejects.toThrow(/not found/);
  });

  it('oldString="" → schema 拒绝（min(1)）', async () => {
    const file = path.join(tmpDir, 'empty-old.ts');
    await fs.writeFile(file, 'a\n', 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: file,
        oldString: '',
        newString: 'x',
      }),
    ).rejects.toThrow(/file_edit: invalid arguments/);
  });

  it('相对路径 → execute 抛 absolute 错误', async () => {
    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: 'relative/path.ts',
        oldString: 'a',
        newString: 'b',
      }),
    ).rejects.toThrow(/file_edit: invalid arguments|absolute/);
  });

  it('replaceAll="false" 字符串被 looseBoolean 接受', async () => {
    const file = path.join(tmpDir, 'stringbool.ts');
    await fs.writeFile(file, 'a\n', 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const result = (await registry.execute('file_edit', {
      path: file,
      oldString: 'a',
      newString: 'b',
      replaceAll: 'false',
    })) as FileEditResult;

    expect(result.replacements).toBe(1);
    expect(await fs.readFile(file, 'utf8')).toBe('b\n');
  });
});

describe('fileEditTool — 文件系统前置条件', () => {
  it('不存在路径 → throw', async () => {
    const missing = path.join(tmpDir, 'nope.ts');
    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: missing,
        oldString: 'a',
        newString: 'b',
      }),
    ).rejects.toThrow(/does not exist/);
  });

  it('目录路径 → throw', async () => {
    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    await expect(
      registry.execute('file_edit', {
        path: tmpDir,
        oldString: 'a',
        newString: 'b',
      }),
    ).rejects.toThrow(/not a file/);
  });
});

describe('fileEditTool — 结果与 diff', () => {
  it('content 字段返回完整新内容（不是 cat -n）', async () => {
    const file = path.join(tmpDir, 'result.ts');
    await fs.writeFile(file, ['line1', 'const answer = 1;', 'line3'].join('\n') + '\n', 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const result = (await registry.execute('file_edit', {
      path: file,
      oldString: 'const answer = 1;',
      newString: 'const answer = 42;',
    })) as FileEditResult;

    const updated = await fs.readFile(file, 'utf8');
    expect(result.content).toBe(updated);
  });

  it('diff 字段至少包含一条 - 旧片段和 + 新片段', async () => {
    const file = path.join(tmpDir, 'diff.ts');
    await fs.writeFile(file, 'const answer = 1;\n', 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const result = (await registry.execute('file_edit', {
      path: file,
      oldString: 'const answer = 1;',
      newString: 'const answer = 42;',
    })) as FileEditResult;

    expect(result.diff).toContain('-const answer = 1;');
    expect(result.diff).toContain('+const answer = 42;');
    expect(result.diff).toContain('file_edit:');
  });

  it('多匹配场景（replaceAll=true）diff 输出摘要而非全文件', async () => {
    const file = path.join(tmpDir, 'multi-diff.ts');
    const bigOld = 'X'.repeat(200);
    await fs.writeFile(file, `${bigOld}\n${bigOld}\n${bigOld}\n`, 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const result = (await registry.execute('file_edit', {
      path: file,
      oldString: bigOld,
      newString: 'Y',
      replaceAll: true,
    })) as FileEditResult;

    // 多匹配时 diff 不应包含原始 600 字节大片段（避免 tool result 膨胀）
    expect(result.diff).not.toContain(bigOld);
    expect(result.replacements).toBe(3);
  });

  it('oldString 含换行 → 精确替换跨行内容', async () => {
    const file = path.join(tmpDir, 'newline.ts');
    await fs.writeFile(file, 'a\nb\nc\nd\n', 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const result = (await registry.execute('file_edit', {
      path: file,
      oldString: 'b\nc',
      newString: 'B\nC',
    })) as FileEditResult;

    expect(result.replacements).toBe(1);
    expect(await fs.readFile(file, 'utf8')).toBe('a\nB\nC\nd\n');
  });

  it('保留文件末尾换行', async () => {
    const file = path.join(tmpDir, 'eof.ts');
    const original = 'line1\nline2\n';
    await fs.writeFile(file, original, 'utf8');

    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const result = (await registry.execute('file_edit', {
      path: file,
      oldString: 'line1',
      newString: 'LINE1',
    })) as FileEditResult;

    expect(result.replacements).toBe(1);
    expect(await fs.readFile(file, 'utf8')).toBe('LINE1\nline2\n');
  });
});

describe('fileEditTool — provider schema', () => {
  it('replaceAll JSON Schema 是 boolean-first anyOf，且不在 required 中', () => {
    const registry = new ToolRegistry();
    registry.register(fileEditTool);

    const provider = registry.toProviderTools().find((t) => t.name === 'file_edit');
    expect(provider).toBeDefined();

    const params = provider!.parameters as {
      properties?: Record<string, unknown>;
      required?: string[];
    };

    const replaceAllSchema = params.properties?.['replaceAll'] as
      { anyOf?: Array<{ type: string }> } | undefined;
    expect(replaceAllSchema?.anyOf?.[0]).toEqual({ type: 'boolean' });
    expect(replaceAllSchema?.anyOf?.[1]).toEqual({ type: 'string' });
    expect(params.required ?? []).not.toContain('replaceAll');
  });
});
