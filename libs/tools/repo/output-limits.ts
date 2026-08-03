/**
 * libs/tools/repo/output-limits.ts
 *
 * IO Tool 的物理约束常量与截断工具（Day 11）。
 *
 * ## 为什么截断在 Tool 层，不在 Agent 层
 *
 * 调研的 4 个开源 / 半开源实现（Claude Code / Cline / Codex / Aider）一致把 cap 放在
 * executor 内部。Cline 的注释说明了原因：
 *
 *   "Executors enforce these caps; tool descriptions reference them so the model
 *    pages or narrows instead of retrying."
 *
 * Agent 层要算这些得重新读文件，浪费 IO 与延迟；只有 tool 知道文件结构和字符位置。
 *
 * 与 Day 08 的分工：
 *   - Tool 层管**物理约束**（行 / 字符，便宜、确定、跨 model 通用）
 *   - Agent 层管**预算**（countContextTokens + context 事件，决定"还能不能再读一个"）
 *
 * ## 为什么数字符不数 token
 *
 * 除 Aider 外业界一致用 char/line cap。tokenizer 调用每次数毫秒，累积在每次 Read 上
 * 不划算；char≈4:1 token 的近似对代码够用；一个 cap 对所有 model 通用，
 * 避免维护 per-model tokenizer 表。
 *
 * 数值取自 Cline 的生产实现。
 */

/** 单次读取的最大行数 */
export const MAX_READ_LINES = 2_000;

/** 单行最大字符数 —— 防 minified 单行文件把内存打爆 */
export const MAX_LINE_CHARS = 2_000;

/** 单次读取输出的总字符上限（≈12k tokens） */
export const MAX_READ_OUTPUT_CHARS = 48_000;

export const LINE_TRUNCATED_SUFFIX = ' [line truncated]';

/**
 * 截断超长的单行。
 */
export function truncateLine(line: string, maxChars = MAX_LINE_CHARS): string {
  return line.length > maxChars ? `${line.slice(0, maxChars)}${LINE_TRUNCATED_SUFFIX}` : line;
}

/**
 * 渲染成 cat -n 风格：右对齐行号 + ` | ` + 内容。
 *
 * 行号不是审美，是**结构性要求**：后续的 Edit tool 需要唯一锚点，模型说"改第 42 行"
 * 时调用方才能定位。Cline / Claude Code 都默认带行号，正是为了配对 Edit。
 */
export function renderWithLineNumbers(lines: readonly string[], startLine: number): string {
  const lastLineNo = startLine + lines.length - 1;
  const width = String(lastLineNo).length;
  return lines
    .map((line, i) => `${String(startLine + i).padStart(width, ' ')} | ${line}`)
    .join('\n');
}

/**
 * 构造尾部截断提示。
 *
 * 放尾部而非结构化字段，是因为截断提示本身必须能抗二次截断 —— Cline 的原话：
 * "keeping the notices at the edges means the recovery guidance survives that cut too."
 * 而且模型读纯文本提示比解析 JSON 字段更直接。
 */
export function truncationNotice(from: number, to: number, total: number): string {
  return `[Showing lines ${from}-${to} of ${total}. Use startLine/endLine to read other sections.]`;
}
