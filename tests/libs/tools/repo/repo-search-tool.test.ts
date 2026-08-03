import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoSearchTool } from '../../../../libs/tools/repo/index.js';
import { runTool } from '../../../../libs/tools/tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../../../fixtures/sample-repo');

describe('repoSearchTool — 反例', () => {
  it('pattern 是无效 regex', async () => {
    await expect(
      runTool(repoSearchTool, { rootPath: FIXTURE, pattern: '[invalid(regex' }),
    ).rejects.toThrow(/invalid regex pattern/);
  });

  it('永不命中的 pattern', async () => {
    const result = await runTool(repoSearchTool, {
      rootPath: FIXTURE,
      pattern: 'NEVER_MATCH_THIS_XYZ_QQQ_12345',
    });
    expect(result.matches).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('maxResults > 500', async () => {
    await expect(
      runTool(repoSearchTool, { rootPath: FIXTURE, pattern: 'foo', maxResults: 1000 }),
    ).rejects.toThrow(/repo_search: invalid arguments — maxResults: Too big/);
  });
});

describe('repoSearchTool — 正例', () => {
  it('字面匹配命中', async () => {
    const result = await runTool(repoSearchTool, {
      rootPath: FIXTURE,
      pattern: 'greet',
    });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.matches.some((m) => m.file === 'src/bar.test.ts')).toBe(true);
    const m = result.matches.find((mm) => mm.file === 'src/bar.test.ts')!;
    expect(m.content).toContain('greet');
  });

  it('fileGlob = *.ts 限定范围', async () => {
    const result = await runTool(repoSearchTool, {
      rootPath: FIXTURE,
      pattern: 'greet',
      fileGlob: '*.ts',
    });
    expect(result.matches.every((m) => m.file.endsWith('.ts'))).toBe(true);
  });

  it('contextBefore=1 返回 before 数组', async () => {
    const result = await runTool(repoSearchTool, {
      rootPath: FIXTURE,
      pattern: 'greet',
      contextBefore: 1,
    });
    const withContext = result.matches.find((m) => m.before !== undefined);
    expect(withContext).toBeDefined();
    expect(Array.isArray(withContext!.before)).toBe(true);
  });
});
