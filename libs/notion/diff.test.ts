import { describe, it, expect } from 'vitest';
import { diffNotion } from './diff.js';

const now = Date.now();
const hash = (s: string): string => `h_${s}`;

describe('diffNotion', () => {
  it('classifies new pages as added', () => {
    const out = diffNotion(
      [{ pageId: 'p1', lastEditedMs: now, lastEditedIso: '', sourceKind: 'notion', sourceLabel: 'P1', content: 'a' }],
      new Map(),
    );
    expect(out.added).toEqual(['p1']);
    expect(out.modified).toEqual([]);
    expect(out.removed).toEqual([]);
  });

  it('classifies mtime-changed pages as modified', () => {
    const out = diffNotion(
      [{ pageId: 'p1', lastEditedMs: now + 1, lastEditedIso: '', sourceKind: 'notion', sourceLabel: 'P1', content: 'a' }],
      new Map([['p1', { mtimeMs: now, hash: hash('a') }]]),
    );
    expect(out.modified).toEqual(['p1']);
  });

  it('treats hash-changed even when mtime unchanged as modified', () => {
    const out = diffNotion(
      [{ pageId: 'p1', lastEditedMs: now, lastEditedIso: '', sourceKind: 'notion', sourceLabel: 'P1', content: 'a2' }],
      new Map([['p1', { mtimeMs: now, hash: hash('a1') }]]),
    );
    expect(out.modified).toEqual(['p1']);
  });

  it('classifies disappeared pages as removed', () => {
    const out = diffNotion(
      [],
      new Map([['p1', { mtimeMs: now, hash: hash('a') }]]),
    );
    expect(out.removed).toEqual(['p1']);
  });

  it('treats unreachable (hash=UNREACHABLE) as stable skip', () => {
    const out = diffNotion(
      [{ pageId: 'p1', lastEditedMs: now, lastEditedIso: '', sourceKind: 'notion', sourceLabel: 'P1', content: '', unreachable: true }],
      new Map([['p1', { mtimeMs: 0, hash: 'UNREACHABLE' }]]),
    );
    expect(out.unchanged).toEqual(['p1']);
  });
});