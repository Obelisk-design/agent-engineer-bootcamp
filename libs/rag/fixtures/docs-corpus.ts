/**
 * libs/rag/fixtures/docs-corpus.ts
 *
 * 从仓库里加载真文档作为 RAG corpus：
 *   - docs/daily/*.md        （Day 01-12 的笔记）
 *   - docs/adr/*.md          （3 个 ADR）
 *
 * 为什么不写在 libs/rag/index.ts：fixture 涉及 fs 读盘，单测不一定想加载真文件。
 *
 * 已知边界：
 * - 文件不存在 → 返回空数组（fixture 不是 hard requirement，单测可覆盖）
 * - 文件名匹配 dayXX.md / NNNN-*.md 模式即可，不用校验内容
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DocEntry {
  readonly absPath: string;
  readonly relPath: string;
  readonly kind: 'daily' | 'adr' | 'spec' | 'plan';
  readonly content: string;
}

/**
 * 推算仓库根（libs/rag/fixtures/*.ts → 上 3 级 → repo root）。
 * 与 import.meta.dirname 在 node 22 上行为一致；用 fileURLToPath 兼容 ESM。
 */
export const REPO_ROOT = (() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..');
})();

async function listDir(dir: string): Promise<readonly string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((n) => !n.startsWith('.')).sort();
  } catch {
    return [];
  }
}

async function loadDir(
  absDir: string,
  relDir: string,
  kind: DocEntry['kind'],
  pattern: RegExp,
): Promise<DocEntry[]> {
  const names = await listDir(absDir);
  const out: DocEntry[] = [];
  for (const name of names) {
    if (!pattern.test(name)) continue;
    const abs = path.join(absDir, name);
    let content: string;
    try {
      content = await fs.readFile(abs, 'utf-8');
    } catch {
      continue;
    }
    out.push({ absPath: abs, relPath: path.posix.join(relDir, name), kind, content });
  }
  return out;
}

export async function loadDocsCorpus(): Promise<readonly DocEntry[]> {
  const daily = await loadDir(
    path.join(REPO_ROOT, 'docs', 'daily'),
    'docs/daily',
    'daily',
    /^day\d+\.md$/,
  );
  const adr = await loadDir(
    path.join(REPO_ROOT, 'docs', 'adr'),
    'docs/adr',
    'adr',
    /^\d{4}-.*\.md$/,
  );
  return [...daily, ...adr];
}