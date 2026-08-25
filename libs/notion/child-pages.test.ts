import { describe, it, expect } from 'vitest';
import { extractChildPageIds } from './child-pages.js';

describe('extractChildPageIds', () => {
  it('returns normalized (hyphen-stripped) ids of child_page blocks only', () => {
    const blocks = [
      { id: 'aaa-bbb-ccc', type: 'paragraph' },          // wrong type, skipped
      { id: '1111-2222-3333-4444-555555555555', type: 'child_page' },  // 32-char hyphenated
      { id: 'xynohyphens', type: 'child_page' },         // 32-char non-hyphenated (already normalized)
      { id: 'p1', type: 'heading_1' },                    // wrong type, skipped
    ];
    expect(extractChildPageIds(blocks)).toEqual([
      '1111222233334444555555555555',
      'xynohyphens',
    ]);
  });

  it('returns [] when no child_page blocks present', () => {
    const blocks = [
      { id: 'p1', type: 'paragraph' },
      { id: 'p2', type: 'heading_1' },
      { id: 'p3', type: 'bulleted_list_item' },
    ];
    expect(extractChildPageIds(blocks)).toEqual([]);
  });

  it('skips child_page blocks with missing or non-string id', () => {
    const blocks = [
      { id: 12345, type: 'child_page' },        // non-string id
      { type: 'child_page' },                    // missing id
      { id: '', type: 'child_page' },            // empty id
      { id: 'aaaa-bbbb-cccc-dddd-eeeeeeeeeeee', type: 'child_page' },  // valid
    ];
    expect(extractChildPageIds(blocks)).toEqual(['aaaabbbbccccddddeeeeeeeeeeee']);
  });

  it('handles empty input', () => {
    expect(extractChildPageIds([])).toEqual([]);
  });
});
