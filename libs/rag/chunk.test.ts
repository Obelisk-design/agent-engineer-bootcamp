/**
 * libs/rag/chunk.test.ts
 *
 * Task 1 of Notion-import plan: ordinal continuity invariant for chunkers.
 *  - chunk ordinals must be 0..N-1 sequential per source
 *  - Notion pages have no byte offsets, so chunk id needs to be stable without byteStart/byteEnd
 *
 * TDD contract: before Step 2 the ordinal-field assertion MUST fail because
 * Chunk doesn't carry ordinal yet. The map-of-index assertions are kept from
 * the brief verbatim as a smoke check.
 */

import { describe, it, expect } from 'vitest';
import { chunkByHeading, chunkByParagraph } from './chunk.js';

describe('chunkOrdinal', () => {
  it('chunkByHeading assigns ordinals 0..N-1 in order', () => {
    const md = `# A\n\nfirst chunk body\n\n# B\n\nsecond chunk body\n`;
    const chunks = chunkByHeading(md, 'doc.md');
    expect(chunks.map((_, i) => i)).toEqual([0, 1]);
    // 真断言：每个 chunk 的 ordinal 字段等于数组下标
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1]);
  });

  it('chunkByParagraph assigns ordinals 0..N-1 in order', () => {
    const md = `para one\n\npara two\n\npara three\n`;
    const chunks = chunkByParagraph(md, 'doc.md');
    expect(chunks.map((_, i) => i)).toEqual([0, 1, 2]);
    // 真断言：每个 chunk 的 ordinal 字段等于数组下标
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2]);
  });
});