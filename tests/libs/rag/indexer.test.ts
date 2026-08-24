/**
 * tests/libs/rag/indexer.test.ts
 *
 * 覆盖：
 * - hashText：确定性 + 顺序敏感
 * - diffDocs：added / modified(mtime) / modified(hash) / unchanged / removed
 *
 * 集成测试（incrementalIndex 端到端 + lancedb delete）走 vitest integration setup，
 * 见 tests/integration/rag-incremental.test.ts（Day 13 follow-up）。
 */

import { describe, expect, it } from 'vitest';
import { diffDocs, hashText, type DocMeta } from '../../../libs/rag/indexer.js';

describe('hashText', () => {
  it('相同输入 → 相同 hash', () => {
    expect(hashText('hello')).toBe(hashText('hello'));
  });

  it('不同输入 → 不同 hash', () => {
    expect(hashText('hello')).not.toBe(hashText('Hello'));
    expect(hashText('hello')).not.toBe(hashText('hello '));
  });

  it('空字符串是合法输入', () => {
    const h = hashText('');
    expect(h).toHaveLength(64); // SHA-256 hex
  });

  it('返回 64 字符 hex（SHA-256）', () => {
    const h = hashText('a');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('diffDocs', () => {
  const meta = (overrides: Partial<DocMeta>): DocMeta => ({
    source: overrides.source ?? 'a.md',
    mtimeMs: overrides.mtimeMs ?? 1000,
    hash: overrides.hash ?? 'h1',
    chunkCount: overrides.chunkCount ?? { heading: 1, paragraph: 2 },
  });

  it('空 current + 空 cached → 全空', () => {
    const d = diffDocs([], new Map());
    expect(d).toEqual({ added: [], modified: [], removed: [], unchanged: [] });
  });

  it('新文档 → added', () => {
    const d = diffDocs(
      [{ source: 'a.md', mtimeMs: 1000, hash: 'h1' }],
      new Map(),
    );
    expect(d.added).toEqual(['a.md']);
    expect(d.modified).toEqual([]);
    expect(d.unchanged).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('mtime 变 → modified', () => {
    const cached = new Map<string, DocMeta>([['a.md', meta({ source: 'a.md', mtimeMs: 1000, hash: 'h1' })]]);
    const d = diffDocs([{ source: 'a.md', mtimeMs: 2000, hash: 'h1' }], cached);
    expect(d.modified).toEqual(['a.md']);
    expect(d.unchanged).toEqual([]);
  });

  it('mtime 同 + hash 变 → modified（mtime 假阴性兜底）', () => {
    const cached = new Map<string, DocMeta>([['a.md', meta({ source: 'a.md', mtimeMs: 1000, hash: 'h1' })]]);
    const d = diffDocs([{ source: 'a.md', mtimeMs: 1000, hash: 'h2' }], cached);
    expect(d.modified).toEqual(['a.md']);
  });

  it('mtime 同 + hash 同 → unchanged', () => {
    const cached = new Map<string, DocMeta>([['a.md', meta({ source: 'a.md', mtimeMs: 1000, hash: 'h1' })]]);
    const d = diffDocs([{ source: 'a.md', mtimeMs: 1000, hash: 'h1' }], cached);
    expect(d.unchanged).toEqual(['a.md']);
    expect(d.modified).toEqual([]);
  });

  it('cached 有但 current 没 → removed', () => {
    const cached = new Map<string, DocMeta>([
      ['a.md', meta({ source: 'a.md' })],
      ['b.md', meta({ source: 'b.md' })],
    ]);
    const d = diffDocs([{ source: 'a.md', mtimeMs: 1000, hash: 'h1' }], cached);
    expect(d.removed).toEqual(['b.md']);
    expect(d.unchanged).toEqual(['a.md']);
  });

  it('混合场景：added + modified + unchanged + removed', () => {
    const cached = new Map<string, DocMeta>([
      ['keep.md', meta({ source: 'keep.md', mtimeMs: 1, hash: 'a' })],
      ['change.md', meta({ source: 'change.md', mtimeMs: 1, hash: 'old' })],
      ['gone.md', meta({ source: 'gone.md', mtimeMs: 1, hash: 'c' })],
    ]);
    const d = diffDocs(
      [
        { source: 'keep.md', mtimeMs: 1, hash: 'a' },      // unchanged
        { source: 'change.md', mtimeMs: 2, hash: 'new' },  // modified (both mtime + hash)
        { source: 'new.md', mtimeMs: 1, hash: 'd' },       // added
      ],
      cached,
    );
    expect(d.added).toEqual(['new.md']);
    expect(d.modified).toEqual(['change.md']);
    expect(d.unchanged).toEqual(['keep.md']);
    expect(d.removed).toEqual(['gone.md']);
  });
});
