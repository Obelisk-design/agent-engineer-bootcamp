/**
 * libs/rag/fixtures/docs-corpus.ts
 *
 * 从仓库里加载真文档作为 RAG corpus：
 *   - docs/daily/*.md           （Day 01-12 的笔记）—— 默认扫描
 *   - docs/adr/*.md             （3 个 ADR）          —— 默认扫描
 *   - docs/test-corpus/*.md     （评测专用语料）        —— 默认不扫，需 include.testCorpus=true
 *
 * 为什么不写在 libs/rag/index.ts：fixture 涉及 fs 读盘，单测不一定想加载真文件。
 *
 * Why 默认不扫 test-corpus：
 * - test-corpus 是**评估专用语料**，混进默认 corpus 会让检索时被"任何 md 都能搜中"
 * - 评测 query（如 "紫光云是什么"）只在 test-corpus 上跑检索，确保 ground truth 干净
 * - 真实业务场景下，agent 的检索 base 应该跟评测 base 隔离
 *
 * 已知边界：
 * - 文件不存在 → 返回空数组（fixture 不是 hard requirement，单测可覆盖）
 * - 文件名匹配 dayXX.md / NNNN-*.md / *.md 模式（test-corpus 不限命名）
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DocEntry {
  readonly absPath: string;
  readonly relPath: string;
  readonly kind: 'daily' | 'adr' | 'spec' | 'plan' | 'test-corpus';
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

/**
 * 加载默认 corpus（daily + adr）。不含 test-corpus。
 * 旧调用方零改动（drop-in 替换旧 loadDocsCorpus）。
 */
export async function loadDocsCorpus(): Promise<readonly DocEntry[]> {
  const [daily, adr] = await Promise.all([
    loadDir(path.join(REPO_ROOT, 'docs', 'daily'), 'docs/daily', 'daily', /^day\d+\.md$/),
    loadDir(path.join(REPO_ROOT, 'docs', 'adr'), 'docs/adr', 'adr', /^\d{4}-.*\.md$/),
  ]);
  return [...daily, ...adr];
}

/**
 * 加载 test-corpus（评估专用语料）。不限命名（*.md），未来加新条目不用改文件名规则。
 */
export async function loadTestCorpus(): Promise<readonly DocEntry[]> {
  return loadDir(
    path.join(REPO_ROOT, 'docs', 'test-corpus'),
    'docs/test-corpus',
    'test-corpus',
    /\.md$/,
  );
}

/**
 * 加载全量 corpus（daily + adr + test-corpus）。绝大多数场景下不需要这个 —— 默认语料和评测语料隔离更干净。
 */
export async function loadAllCorpus(): Promise<readonly DocEntry[]> {
  const [main, test] = await Promise.all([loadDocsCorpus(), loadTestCorpus()]);
  return [...main, ...test];
}