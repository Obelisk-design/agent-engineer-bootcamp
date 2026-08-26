import { describe, it, expect } from 'vitest';
import { parsePhaseLine } from '../apps/api/src/parse-phase.js';

describe('parsePhaseLine', () => {
  it('matches notion_import fetch marker', () => {
    const r = parsePhaseLine(
      '>>> Notion import: seedPages=8, childPages=42, total=50 pages in 12345ms (~2.1 req/s)',
    );
    expect(r).not.toBeNull();
    expect(r!.name).toBe('fetch');
    expect(r!.ms).toBe(12345);
    expect(r!.payload['seedPages']).toBe(8);
    expect(r!.payload['childPages']).toBe(42);
    expect(r!.payload['total']).toBe(50);
  });

  it('matches diff marker', () => {
    const r = parsePhaseLine('>>> Diff: +5 added, +3 modified, -1 removed, 12 unchanged');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('diff');
    expect(r!.payload['added']).toBe(5);
    expect(r!.payload['modified']).toBe(3);
    expect(r!.payload['removed']).toBe(1);
    expect(r!.payload['unchanged']).toBe(12);
  });

  it('matches embed marker', () => {
    const r = parsePhaseLine('>>> Embed: heading=8 paragraph=15 (fallback: {"short":3})');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('embed');
    expect(r!.payload['heading']).toBe(8);
    expect(r!.payload['paragraph']).toBe(15);
    expect(r!.payload['fallback']).toEqual({ short: 3 });
  });

  it('matches write marker', () => {
    const r = parsePhaseLine('>>> Write: 23 chunks in 1500ms');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('write');
    expect(r!.ms).toBe(1500);
    expect(r!.payload['chunksWritten']).toBe(23);
  });

  it('returns null for non-phase line', () => {
    expect(parsePhaseLine('fatal: something broke')).toBeNull();
    expect(parsePhaseLine('WARN: failed source')).toBeNull();
  });

  it('returns null for empty line', () => {
    expect(parsePhaseLine('')).toBeNull();
    expect(parsePhaseLine('   ')).toBeNull();
  });
});
