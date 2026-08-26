/**
 * libs/rag/chunk.ts
 *
 * 两种 markdown chunk 策略：
 *
 *   1. chunkByHeading    — 按 # / ## / ### 切，heading 文本进 chunk 首行
 *   2. chunkByParagraph  — 按 \n\n 切，但代码块（``` 围栏）和表格行整段保留不被切碎；超长段落 200 字符 overlap
 *
 * 设计要点：
 * - 返回的 Chunk 包含 byteStart / byteEnd —— 后续若要"窗口化"或 debug 都能定位回原文
 * - heading 切不带 overlap（一个 heading 下文本是连续的语义单元，重叠会污染检索）
 * - paragraph 切保留代码块 / 表格行（防 chunk 截断导致 markdown 渲染破坏）
 *
 * 不做（YAGNI）：
 * - 不做 sentence-level tokenizer（中英文混合、缩写识别都麻烦；embed 对 100~500 字符短文本已足够鲁棒）
 * - 不做 overlap by sentence（与上面同因；按字符即可）
 * - 不做 tokenizer-aware chunking（路线表 Day 16-17 不需要）
 */

export type SourceKind =
  'daily' | 'adr' | 'spec' | 'plan' | 'fixture' | 'test-corpus' | 'notion' | 'md';

export interface Chunk {
  readonly text: string;
  readonly source: string;
  readonly sourceKind: SourceKind;
  /** 最近一级 heading（heading 切专属；paragraph 切留 undefined） */
  readonly heading?: string;
  readonly byteStart: number;
  readonly byteEnd: number;
  /** 该 source 内顺序号（0..N-1）。chunk id 用 ordinal 而非 byteStart/byteEnd，因为 Notion 等无 byte 偏移的 source 也需要稳定 id。 */
  readonly ordinal: number;
}

/**
 * 按 markdown heading 切分。每个 chunk 第一行是当前 heading（便于检索命中 heading 关键词）。
 * heading 层级：# / ## / ### 都识别；chunk 不跨层级相邻（不合并父子级）。
 *
 * 边界处理：
 * - 文档无任何 heading → 整篇一个 chunk（不带 heading 字段）
 * - heading 出现在文件末尾 → 仍产生一个 chunk（即使内容为空 — 调用方自行 filter）
 */
export function chunkByHeading(
  md: string,
  source: string,
  sourceKind: SourceKind = 'daily',
  startOrdinal = 0,
): Chunk[] {
  const lines = md.split(/\r?\n/);
  const chunks: Chunk[] = [];
  const headingRe = /^(#{1,3})\s+(.+?)\s*#*\s*$/;

  let currentHeading: string | undefined;
  let currentBuf: string[] = [];
  let currentStartByte = 0;
  let cursorByte = 0;
  let ordinalCounter = startOrdinal;

  const flush = (endByte: number): void => {
    const text = currentBuf.join('\n').trimEnd();
    if (text.length === 0) return;
    const prefix = currentHeading !== undefined ? `${currentHeading}\n\n` : '';
    chunks.push({
      text: prefix + text,
      source,
      sourceKind,
      ...(currentHeading !== undefined ? { heading: currentHeading } : {}),
      byteStart: currentStartByte,
      byteEnd: endByte,
      ordinal: ordinalCounter++,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = headingRe.exec(line);
    if (m) {
      // 旧的先 flush
      if (currentBuf.length > 0 || currentHeading !== undefined) {
        flush(cursorByte);
      }
      currentHeading = line;
      currentBuf = [];
      currentStartByte = cursorByte;
    } else {
      currentBuf.push(line);
    }
    cursorByte += Buffer.byteLength(line, 'utf-8') + 1; // +1 是 \n
  }
  // 收尾
  if (currentBuf.length > 0 || currentHeading !== undefined) {
    flush(cursorByte);
  }
  return chunks;
}

/**
 * 按段落切分（按 \n\n）。代码块（``` 围栏）和表格段（连续以 | 开头的行）整体保留不被切碎。
 * 超长段落按字符硬切 + 200 字符 overlap（默认），overlap 部分追加到下一个 chunk 头部。
 */
export function chunkByParagraph(
  md: string,
  source: string,
  sourceKind: SourceKind = 'daily',
  overlapChars = 200,
  startOrdinal = 0,
): Chunk[] {
  if (overlapChars < 0) {
    throw new RangeError(`chunkByParagraph: overlapChars must be >= 0, got ${overlapChars}`);
  }
  const lines = md.split(/\r?\n/);
  const segments: Array<{ text: string; startByte: number; endByte: number }> = [];

  let i = 0;
  let cursorByte = 0;
  while (i < lines.length) {
    const lineStartByte = cursorByte;
    // 1. 代码块 ``` 围栏 —— 整段吞下
    if (/^```/.test(lines[i]!)) {
      const block: string[] = [lines[i]!];
      cursorByte += Buffer.byteLength(lines[i]!, 'utf-8') + 1;
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) {
        block.push(lines[i]!);
        cursorByte += Buffer.byteLength(lines[i]!, 'utf-8') + 1;
        i++;
      }
      if (i < lines.length) {
        block.push(lines[i]!);
        cursorByte += Buffer.byteLength(lines[i]!, 'utf-8') + 1;
        i++;
      }
      segments.push({
        text: block.join('\n'),
        startByte: lineStartByte,
        endByte: cursorByte,
      });
      continue;
    }

    // 2. 表格段 —— 连续以 | 开头的行整段吞下
    if (/^\s*\|/.test(lines[i]!)) {
      const block: string[] = [lines[i]!];
      cursorByte += Buffer.byteLength(lines[i]!, 'utf-8') + 1;
      i++;
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) {
        block.push(lines[i]!);
        cursorByte += Buffer.byteLength(lines[i]!, 'utf-8') + 1;
        i++;
      }
      segments.push({
        text: block.join('\n'),
        startByte: lineStartByte,
        endByte: cursorByte,
      });
      continue;
    }

    // 3. 普通段落 —— 按 \n\n 边界收集（段内允许单 \n）
    const block: string[] = [lines[i]!];
    cursorByte += Buffer.byteLength(lines[i]!, 'utf-8') + 1;
    i++;
    while (
      i < lines.length &&
      lines[i] !== '' &&
      !/^```/.test(lines[i]!) &&
      !/^\s*\|/.test(lines[i]!)
    ) {
      block.push(lines[i]!);
      cursorByte += Buffer.byteLength(lines[i]!, 'utf-8') + 1;
      i++;
    }
    // 跳过分隔空行
    while (i < lines.length && lines[i] === '') {
      cursorByte += Buffer.byteLength(lines[i]!, 'utf-8') + 1;
      i++;
    }
    const segText = block.join('\n').trimEnd();
    if (segText.length > 0) {
      segments.push({ text: segText, startByte: lineStartByte, endByte: cursorByte });
    }
  }

  // 长段落硬切 + overlap
  const chunks: Chunk[] = [];
  let carry = '';
  let ordinalCounter = startOrdinal;
  for (const seg of segments) {
    let text = seg.text;
    if (carry.length > 0) {
      text = carry + '\n' + text;
    }
    if (text.length <= 1500) {
      // 短段落直接成 chunk
      chunks.push({
        text,
        source,
        sourceKind,
        byteStart: seg.startByte,
        byteEnd: seg.endByte,
        ordinal: ordinalCounter++,
      });
      carry = text.length > overlapChars ? text.slice(-overlapChars) : '';
    } else {
      // 长段落：滑窗 1500 步长，overlap 后缀带到下一窗
      let pos = 0;
      let firstWindow = true;
      while (pos < text.length) {
        const slice = text.slice(pos, pos + 1500);
        // 跳过 overlap 阶段切出的空 slice（防 embed NaN）
        if (slice.trim().length === 0) {
          break;
        }
        chunks.push({
          text: firstWindow ? slice : carry + '\n' + slice,
          source,
          sourceKind,
          byteStart: firstWindow ? seg.startByte : seg.startByte + pos,
          byteEnd: seg.startByte + Math.min(text.length, pos + 1500),
          ordinal: ordinalCounter++,
        });
        firstWindow = false;
        if (pos + 1500 >= text.length) break;
        carry = slice.slice(-overlapChars);
        pos += 1500 - overlapChars;
      }
      carry = chunks[chunks.length - 1]!.text.slice(-overlapChars);
    }
  }

  return chunks;
}

/**
 * 过滤掉空 chunk（text.trim() === 0）和极短 chunk（长度 < MIN_CHUNK_CHARS）。
 * heading 切和 paragraph 切都可能产出空 chunk（如 heading 切里 heading 紧跟 EOF、paragraph 切里只有空行）；
 * 极短 chunk（< 10 字符）喂 embed 易退化输出 NaN vector（dev 网关 vLLM 拒绝 NaN）。
 */
export const MIN_CHUNK_CHARS = 10;

export function dropEmptyChunks(chunks: readonly Chunk[]): Chunk[] {
  return chunks.filter((c) => c.text.trim().length >= MIN_CHUNK_CHARS);
}
