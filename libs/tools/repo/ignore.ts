/**
 * libs/tools/repo/ignore.ts
 *
 * ignore 匹配器：精确匹配 OR glob 匹配（*  **  ?）。
 *
 * 不引入 micromatch —— 用自写 mini-glob（见 glob.ts）。
 */

import { matchesGlob } from './glob.js';

export const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  '.turbo',
  'coverage',
  '.next',
  '.nuxt',
  'build',
  'out',
  'target',
  '*.min.js',
  '*.map',
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
] as const;

/** 路径里任何一段（按 / 切）匹配 patterns → true */
export function shouldIgnore(path: string, patterns: readonly string[]): boolean {
  const segments = path.split('/');
  for (const pattern of patterns) {
    // 精确匹配：path 等于 pattern 或 path 的某段等于 pattern
    if (path === pattern) return true;
    if (segments.includes(pattern)) return true;
    // glob 匹配（用 mini-glob）
    if (matchesGlob(path, pattern)) return true;
  }
  return false;
}
