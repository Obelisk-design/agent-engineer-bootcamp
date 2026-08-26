import { describe, it, expect } from 'vitest';
import { computeHighlight } from '../apps/api/src/highlight.js';

describe('computeHighlight', () => {
  it('finds English keyword positions', () => {
    const r = computeHighlight('chunk strategy', 'RAG chunk strategy uses paragraph');
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.find((h) => h.term === 'chunk')).toBeDefined();
    expect(r.find((h) => h.term === 'strategy')).toBeDefined();
  });

  it('finds Chinese keyword positions', () => {
    const r = computeHighlight('RAG 分块', 'RAG 分块策略使用段落切割');
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for empty query', () => {
    expect(computeHighlight('', 'some content')).toEqual([]);
  });

  it('returns empty array when no match', () => {
    expect(computeHighlight('xyz123', 'RAG chunk strategy')).toEqual([]);
  });

  it('finds multiple occurrences of same term', () => {
    const r = computeHighlight('RAG', 'RAG is great. RAG works.');
    expect(r.length).toBe(2);
  });
});
