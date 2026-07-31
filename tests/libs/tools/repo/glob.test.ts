import { describe, it, expect } from 'vitest';
import { matchesGlob } from '../../../../libs/tools/repo/index.js';

describe('matchesGlob', () => {
  it('字面匹配', () => {
    expect(matchesGlob('foo.ts', 'foo.ts')).toBe(true);
    expect(matchesGlob('foo.ts', 'bar.ts')).toBe(false);
  });

  it('* 匹配单层', () => {
    expect(matchesGlob('app.ts', '*.ts')).toBe(true);
    expect(matchesGlob('app.tsx', '*.ts')).toBe(false); // tsx 不匹配 *.ts
    expect(matchesGlob('src/app.ts', '*.ts')).toBe(false); // 单层不含 /
  });

  it('** 匹配多层', () => {
    expect(matchesGlob('src/foo/app.ts', '**/*.ts')).toBe(true);
    expect(matchesGlob('app.ts', '**/*.ts')).toBe(true);
    expect(matchesGlob('app.js', '**/*.ts')).toBe(false);
  });

  it('? 匹配单字符', () => {
    expect(matchesGlob('foo.ts', 'fo?.ts')).toBe(true);
    expect(matchesGlob('fop.ts', 'fo?.ts')).toBe(true);
    expect(matchesGlob('foo.ts', 'fo??.ts')).toBe(false); // foo 3 字符 vs ??.ts 2 字符
  });

  it('混合 ** 和 *', () => {
    expect(matchesGlob('src/utils/foo/bar.ts', 'src/**/foo/*.ts')).toBe(true);
    expect(matchesGlob('src/foo/bar.ts', 'src/**/foo/*.ts')).toBe(true);
    // src/**/foo/*.ts 中 ** 必须匹配 ≥1 层（utils 段）
    expect(matchesGlob('src/foo/baz.ts', 'src/a/foo/*.ts')).toBe(false);
    expect(matchesGlob('src/a/foo/baz.ts', 'src/a/foo/*.ts')).toBe(true);
  });
});