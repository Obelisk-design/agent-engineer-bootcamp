import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  chunkByHeading,
  chunkByHeadingSmart,
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

describe('chunkByHeadingSmart (Day 18)', () => {
  it('短 heading 段 < maxChars → 不二次切，行为 = chunkByHeading', () => {
    const md = '# A\n\nfirst\n\n# B\n\nsecond\n';
    const smart = chunkByHeadingSmart(md, 'doc.md', 'daily', 800);
    const basic = chunkByHeading(md, 'doc.md', 'daily');
    // 同结构（smart 二次切没触发）
    expect(smart.length).toBe(basic.length);
    expect(smart.map((c) => c.text)).toEqual(basic.map((c) => c.text));
    expect(smart.map((c) => c.ordinal)).toEqual(basic.map((c) => c.ordinal));
  });

  it('长 heading 段 > maxChars 且有 ### 子结构 → 验证设计意图（不二次切）', () => {
    // 设计说明：chunkByHeading 第一轮就把 ### 切成独立 chunk（heading 字段="### Sub 1"），
    // 所以 splitLongHeadingChunk 拿到的 chunk.text 不含 ### → "按子 heading 切"路径不触发。
    // 验证：短 ### chunks 保持独立，长 ## 段（如有）走 \n\n 切。
    // 构造：## Long 段内 intro 超过 maxChars（1000 字符），且段下含 ### Sub 1（独立切）
    const longIntro = 'x'.repeat(1000);
    const subBody = 'lorem ipsum '.repeat(10); // ~120 chars
    const md = `## Long\n\n${longIntro}\n\n### Sub 1\n\n${subBody}\n`;
    const chunks = chunkByHeadingSmart(md, 'doc.md', 'daily', 600);
    // 短 ### chunk 保持独立（不被 ## Long 吞掉）
    const sub1 = chunks.find((c) => c.heading === '### Sub 1');
    expect(sub1).toBeDefined();
    // 长 ## Long 段被切碎成多段（走 \n\n 切，因为子 heading 已经被 chunkByHeading 切走）
    const longChunks = chunks.filter((c) => c.heading === '## Long');
    expect(longChunks.length).toBeGreaterThanOrEqual(2);
  });

  it('长 heading 段 > maxChars 且无子结构 → 按 \\n\\n 切', () => {
    // 构造超长 ## 段（约 1100 字符），无 ### 子结构，多段用 \n\n 分隔
    const md = `## Long\n\n${'p1\n\n'.repeat(150)}p2\n`;
    const chunks = chunkByHeadingSmart(md, 'doc.md', 'daily', 300);
    // 至少切出 3 个子 chunk
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    chunks.forEach((c) => {
      expect(c.text.length).toBeLessThanOrEqual(300);
    });
  });

  it('长 heading 段 > 2× maxChars → 多段切，ordinal 仍连续 0..N-1', () => {
    const md = `## Mega\n\n${'lorem ipsum '.repeat(300)}\n`; // 3600+ chars
    const chunks = chunkByHeadingSmart(md, 'doc.md', 'daily', 200);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it('文档无 heading → 整篇 1 个 chunk', () => {
    const md = `just some text\n\nmore text\n\nfinal\n`;
    const chunks = chunkByHeadingSmart(md, 'doc.md', 'daily', 800);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.heading).toBeUndefined();
  });

  it('startOrdinal 接受外部编号（per source 连续）', () => {
    const md = `# A\n\nbody\n\n# B\n\nbody\n`;
    const chunks = chunkByHeadingSmart(md, 'doc.md', 'daily', 800, 10);
    expect(chunks[0]!.ordinal).toBe(10);
    expect(chunks[1]!.ordinal).toBe(11);
  });

  it('day12.md 真跑：长 heading 段全部 ≤ maxChars（density 目标已实现）', () => {
    const md = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'docs', 'daily', 'day12.md'),
      'utf-8',
    );
    const headingChunks = chunkByHeadingSmart(md, 'docs/daily/day12.md', 'daily', 800);
    // 验证 1：所有 chunk 都在 maxChars 以内（density 提升的根因）
    const oversize = headingChunks.filter((c) => c.text.length > 800);
    expect(oversize.length).toBe(0);
    // 验证 2：chunk 总数比调前多（35 → ~40，因为长段被切碎）
    expect(headingChunks.length).toBeGreaterThan(35);
    // 验证 3：cosine 命中数 ≥ 调前（9）；day12 cosine 集中分布，命中数不会暴增
    const cosineHits = headingChunks.filter((c) => c.text.includes('cosine')).length;
    expect(cosineHits).toBeGreaterThanOrEqual(9);
  });
});

describe('chunkByParagraph overlap default (Day 18)', () => {
  it('默认 overlap 翻倍：每 chunk 的 carry 后缀变长（语义保留更好）', () => {
    // 用 5000 字符长段触发多次滑窗切
    const md = 'a'.repeat(5000);
    const chunks200 = chunkByParagraph(md, 'doc.md', 'daily', 200);
    const chunks400 = chunkByParagraph(md, 'doc.md', 'daily', 400);
    // 中间 chunks（[1]）的 carry 后缀长度 = overlap
    expect(chunks400[1]!.text.length).toBeGreaterThan(chunks200[1]!.text.length);
    // 差值 = 200（overlap 200→400）
    expect(chunks400[1]!.text.length - chunks200[1]!.text.length).toBe(200);
  });

  it('默认调用（不传 overlapChars）= 显式 400', () => {
    const md = 'a'.repeat(5000);
    const def = chunkByParagraph(md, 'doc.md', 'daily');
    const exp400 = chunkByParagraph(md, 'doc.md', 'daily', 400);
    expect(def.length).toBe(exp400.length);
    expect(def[1]!.text.length).toBe(exp400[1]!.text.length);
  });
});
