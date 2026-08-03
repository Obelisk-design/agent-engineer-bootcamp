import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoIndexTool } from '../../../../libs/tools/repo/index.js';
import { runTool } from '../../../../libs/tools/tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../../../fixtures/sample-repo');

describe('repoIndexTool — 反例', () => {
  it('rootPath 不存在', async () => {
    await expect(runTool(repoIndexTool, { rootPath: '/nonexistent/path/xxx' })).rejects.toThrow(
      /does not exist/,
    );
  });

  it('rootPath 是相对路径', async () => {
    await expect(runTool(repoIndexTool, { rootPath: './relative' })).rejects.toThrow(
      /must be absolute/,
    );
  });

  it('rootPath 是文件非目录', async () => {
    const filePath = path.join(FIXTURE, 'package.json');
    await expect(runTool(repoIndexTool, { rootPath: filePath })).rejects.toThrow(/not a directory/);
  });

  it('maxDepth > 10', async () => {
    await expect(runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: 100 })).rejects.toThrow(
      /repo_index: invalid arguments — maxDepth: Too big/,
    );
  });

  it('maxDepth < 1', async () => {
    await expect(runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: 0 })).rejects.toThrow(
      /repo_index: invalid arguments — maxDepth: Too small/,
    );
  });
});

describe('repoIndexTool — 正例', () => {
  it('跑 fixture 返回 files 列表（POSIX 相对）', async () => {
    const result = await runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: 5 });
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.files).toContain('src/foo.ts');
    expect(result.files).toContain('src/bar.test.ts');
    expect(result.files.every((f) => !f.includes('\\'))).toBe(true);
  });

  it('ignorePatterns 默认含 node_modules（fixture 没 node_modules，验证不抛错）', async () => {
    const result = await runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: 5 });
    expect(result.files).not.toContain('node_modules');
    expect(result.truncated).toBe(false);
  });
});
