/**
 * Chunk 切分器：按 ## 标题切 + token 上限双约束。
 *
 * 输入：纯文本（已由 extractors 抽出）
 * 输出：Chunk[] —— { chunk_id, source_file, section_idx, heading, text, token_count }
 *
 * 策略：
 *   1. 先按 ## 标题切（保留 section 语义）
 *   2. 段内如果超 token 上限，再按句子（。/；/\n）切
 *   3. 切完后小段累积到 token 上限的 ~80% 才出 chunk（避免太碎）
 *
 * 明天想换粒度：调 CHUNK_MAX_TOKENS / CHUNK_OVERLAP_TOKENS 即可。
 */
import { estimateTokens } from './extractors.js';

export type Chunk = {
  chunk_id: string;
  source_file: string;
  category: string;
  section_idx: number; // 第几个 ## 段（0=开篇之前）
  heading: string;
  text: string;
  token_count: number;
  is_continuation: boolean; // 是否因超长被二次切分
};

const CHUNK_MAX_TOKENS = 512;
const CHUNK_OVERLAP_TOKENS = 64;
const CHUNK_MIN_TOKENS = Math.floor(CHUNK_MAX_TOKENS * 0.4); // 段太小就并到上一段

// 简单按句号/分号/换行分句
function splitByDelim(text: string): string[] {
  return text
    .split(/(?<=[。！？；\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 按 ## 段切，每段保持 heading
function splitByH2(text: string): { heading: string; body: string }[] {
  const lines = text.split('\n');
  const sections: { heading: string; body: string[] }[] = [];
  let current = { heading: '__preamble__', body: [] as string[] };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current.body.length) sections.push(current);
      current = { heading: line.replace(/^##\s+/, '').trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.length || current.heading !== '__preamble__') sections.push(current);

  return sections.map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }));
}

// 段内按 token 上限切（保持连续）
function packByTokens(text: string, max: number, overlap: number, _min: number): string[] {
  if (estimateTokens(text) <= max) return [text];

  const sentences = splitByDelim(text);
  const chunks: string[] = [];
  let buf: string[] = [];
  let bufTokens = 0;

  for (const sent of sentences) {
    const t = estimateTokens(sent);
    // 句本身就超过 max → 整段当一个 chunk（不再硬切，保留语义）
    if (t > max) {
      if (buf.length) {
        chunks.push(buf.join(''));
        // overlap
        const tail: string[] = [];
        let tailTokens = 0;
        for (let i = buf.length - 1; i >= 0 && tailTokens < overlap; i--) {
          tail.unshift(buf[i]!);
          tailTokens += estimateTokens(buf[i]!);
        }
        buf = tail;
        bufTokens = tailTokens;
      }
      chunks.push(sent);
      continue;
    }
    if (bufTokens + t > max && buf.length) {
      chunks.push(buf.join(''));
      // overlap：把末尾几句带过去
      const tail: string[] = [];
      let tailTokens = 0;
      for (let i = buf.length - 1; i >= 0 && tailTokens < overlap; i--) {
        tail.unshift(buf[i]!);
        tailTokens += estimateTokens(buf[i]!);
      }
      buf = tail;
      bufTokens = tailTokens;
    }
    buf.push(sent);
    bufTokens += t;
  }
  if (buf.length) chunks.push(buf.join(''));
  return chunks.length ? chunks : [text];
}

export function chunkText(sourceFile: string, category: string, text: string): Chunk[] {
  const sections = splitByH2(text);
  const chunks: Chunk[] = [];
  let chunkSeq = 0;

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx]!;
    const pieces = packByTokens(sec.body, CHUNK_MAX_TOKENS, CHUNK_OVERLAP_TOKENS, CHUNK_MIN_TOKENS);

    // 太小的段（< MIN_TOKENS）尝试并到上一个 chunk
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]!;
      const tokens = estimateTokens(piece);
      const isContinuation = pieces.length > 1;

      if (tokens < CHUNK_MIN_TOKENS && chunks.length > 0 && !isContinuation) {
        // 并到上一个 chunk
        const last = chunks[chunks.length - 1]!;
        last.text += '\n' + piece;
        last.token_count = estimateTokens(last.text);
      } else {
        chunkSeq++;
        chunks.push({
          chunk_id: `${sourceFile}#${String(chunkSeq).padStart(3, '0')}`,
          source_file: sourceFile,
          category,
          section_idx: sIdx,
          heading: sec.heading,
          text: piece,
          token_count: tokens,
          is_continuation: isContinuation,
        });
      }
    }
  }
  return chunks;
}
