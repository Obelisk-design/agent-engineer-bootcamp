import { describe, it, expect } from 'vitest';
import { shouldIgnore, DEFAULT_IGNORE } from '../../../../libs/tools/repo/index.js';

describe('shouldIgnore', () => {
  it('精确匹配', () => {
    expect(shouldIgnore('node_modules/foo.ts', ['node_modules'])).toBe(true);
  });

  it('glob 匹配（*）', () => {
    expect(shouldIgnore('dist/app.js', ['*.js'])).toBe(false); // *.js 不匹配 dist/app.js
    expect(shouldIgnore('app.js', ['*.js'])).toBe(true);
  });

  it('glob 匹配（**/*.map）', () => {
    expect(shouldIgnore('dist/app.js.map', ['**/*.map'])).toBe(true);
    expect(shouldIgnore('src/foo.ts', ['**/*.map'])).toBe(false);
  });

  it('嵌套路径', () => {
    expect(shouldIgnore('a/b/node_modules/x.ts', ['node_modules'])).toBe(true);
  });

  it('数组不命中', () => {
    expect(shouldIgnore('src/foo.ts', ['build', 'dist'])).toBe(false);
  });

  it('DEFAULT_IGNORE 含 node_modules/.git/dist', () => {
    expect(DEFAULT_IGNORE).toContain('node_modules');
    expect(DEFAULT_IGNORE).toContain('.git');
    expect(DEFAULT_IGNORE).toContain('dist');
  });
});
