import { describe, expect, it } from 'vitest';
import {
  chunkByHeading,
  chunkByParagraph,
  dropEmptyChunks,
  type Chunk,
} from '../../../libs/rag/chunk.js';

describe('chunkByHeading', () => {
  it('heading 文本进 chunk 首行', () => {
    const md = '# 第一章\n内容 A\n## 第二章\n内容 B';
    const chunks = chunkByHeading(md, 'a.md');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.heading).toBe('# 第一章');
    expect(chunks[0]!.text.startsWith('# 第一章')).toBe(true);
    expect(chunks[1]!.heading).toBe('## 第二章');
  });

  it('无 heading 整篇 1 个 chunk', () => {
    const md = 'hello world\nplain text';
    const chunks = chunkByHeading(md, 'a.md');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.heading).toBeUndefined();
  });

  it('空文档返回空数组', () => {
    expect(chunkByHeading('', 'a.md')).toHaveLength(0);
  });

  it('byteStart/byteEnd 反映原文位置', () => {
    const md = '# T\n\nABCD';
    const chunks = chunkByHeading(md, 'a.md');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.byteStart).toBe(0);
    expect(chunks[0]!.byteEnd).toBeGreaterThan(0);
  });
});

describe('chunkByParagraph', () => {
  it('代码块不被 \\n\\n 切碎', () => {
    const md = '前文\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\n后文';
    const chunks = chunkByParagraph(md, 'a.md');
    const code = chunks.find((c) => c.text.includes('const a = 1'));
    expect(code).toBeDefined();
    expect(code!.text).toContain('const b = 2');
    expect(code!.text).toContain('```ts');
  });

  it('表格行整段保留（连续 | 起头）', () => {
    const md = '上文\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n下文';
    const chunks = chunkByParagraph(md, 'a.md');
    const table = chunks.find((c) => c.text.includes('| a | b |'));
    expect(table).toBeDefined();
    expect(table!.text).toContain('| 1 | 2 |');
  });

  it('空文档 → []', () => {
    expect(chunkByParagraph('', 'a.md')).toHaveLength(0);
  });

  it('overlapChars < 0 抛 RangeError', () => {
    expect(() => chunkByParagraph('hello', 'a.md', 'daily', -1)).toThrow(RangeError);
  });
});

describe('dropEmptyChunks', () => {
  it('极短 chunk（<10 chars）被过滤', () => {
    const chunks: Chunk[] = [
      {
        text: 'hello world',
        source: 'a',
        sourceKind: 'daily',
        byteStart: 0,
        byteEnd: 11,
        ordinal: 0,
      },
      { text: 'ab', source: 'a', sourceKind: 'daily', byteStart: 11, byteEnd: 13, ordinal: 1 },
    ];
    expect(dropEmptyChunks(chunks)).toHaveLength(1);
  });
});
