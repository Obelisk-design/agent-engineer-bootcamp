import { describe, it, expect } from 'vitest';
import { pageToMarkdown } from './to-markdown.js';

// Minimal Notion block factory kept inline; do NOT depend on @notionhq/client
// test helpers because they pull the SDK into the test graph early.
function block<T extends Record<string, unknown>>(type: string, data: T, extra: Record<string, unknown> = {}) {
  return {
    id: `b-${Math.random()}`,
    type,
    object: 'block' as const,
    has_children: false,
    archived: false,
    created_time: '2026-01-01T00:00:00.000Z',
    last_edited_time: '2026-01-01T00:00:00.000Z',
    created_by: { id: 'u', object: 'user' } as never,
    last_edited_by: { id: 'u', object: 'user' } as never,
    parent: { id: 'p', type: 'page_id', page_id: 'p' } as never,
    in_trash: false,
    [type]: data,
    ...extra,
  } as never;
}

describe('pageToMarkdown', () => {
  it('prepends the page title as a H1', () => {
    const page = { id: 'p1', properties: { title: { type: 'title', title: [{ plain_text: 'Hello' }] } } } as never;
    const out = pageToMarkdown(page, []);
    expect(out.markdown.startsWith('# Hello\n')).toBe(true);
    expect(out.title).toBe('Hello');
  });

  it('converts heading_1/2/3 to # / ## / ###', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('heading_1', { rich_text: [{ plain_text: 'H1' }] }),
      block('heading_2', { rich_text: [{ plain_text: 'H2' }] }),
      block('heading_3', { rich_text: [{ plain_text: 'H3' }] }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('# H1');
    expect(out.markdown).toContain('## H2');
    expect(out.markdown).toContain('### H3');
  });

  it('converts paragraph preserving inline bold/italic/code', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('paragraph', {
        rich_text: [
          { plain_text: 'plain ', annotations: { bold: false } },
          { plain_text: 'BOLD', annotations: { bold: true } },
          { plain_text: ' code', annotations: { code: true } },
        ],
      }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('plain **BOLD** `code`');
  });

  it('converts bulleted_list_item and numbered_list_item', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('bulleted_list_item', { rich_text: [{ plain_text: 'a' }] }),
      block('numbered_list_item', { rich_text: [{ plain_text: 'b' }] }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toMatch(/^- a$/m);
    expect(out.markdown).toMatch(/^1\. b$/m);
  });

  it('fences code blocks with language tag', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('code', { language: 'typescript', rich_text: [{ plain_text: 'const x = 1;' }] }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('```typescript\nconst x = 1;\n```');
  });

  it('prefixes quote and callout blocks', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('quote', { rich_text: [{ plain_text: 'note' }] }),
      block('callout', {
        rich_text: [{ plain_text: 'heads up' }],
        icon: { type: 'emoji', emoji: '💡' },
      }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toMatch(/^> note$/m);
    expect(out.markdown).toMatch(/^> 💡 heads up$/m);
  });

  it('inserts placeholder text for image / file / video', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('image', { caption: [{ plain_text: 'photo' }], type: 'external', external: { url: 'x' } }),
      block('file', { caption: [], type: 'external', external: { url: 'x' } }),
      block('video', { caption: [], type: 'external', external: { url: 'x' } }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('[image: photo]');
    expect(out.markdown).toContain('[file]');
    expect(out.markdown).toContain('[video]');
  });

  it('drops child_page blocks from page body (recursion lives at orchestrator level)', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [block('child_page', { title: 'Nested' })];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).not.toContain('Nested');
  });

  it('inserts [unsupported: type] for unknown block types', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [block('synced_block', {})];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('[unsupported: synced_block]');
  });

  it('marks empty content (no title, no blocks) explicitly', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const out = pageToMarkdown(page, []);
    expect(out.title).toBe('');
    expect(out.markdown).toBe('');
  });
});