/**
 * libs/tools/repo/file-edit-tool.ts
 *
 * FileEditTool: 单文件精确文本替换，原子落盘 + 可审计结果。
 *
 * Day 15 补齐 L1 Repo Understanding 闭环（与 FileReadTool 配对）：
 *   repo_index → repo_search → file_read → file_edit
 *
 * ## 参数契约（ADR 0003：schema 是唯一事实源）
 *
 * - `path` 必须是绝对路径（IO 前置条件在 execute 内校验）。
 * - `oldString` 不得为空（`.min(1)` 避免无意义插入式替换）。
 * - `replaceAll` 用 `z.union([z.boolean(), z.stringbool()])`（looseBoolean）：
 *   布尔分支在前 + stringbool 兜住 LLM 常发的 "true"/"false"。
 * - `replaceAll` 默认 false，对应 JSON Schema 不进 required。
 *
 * ## 匹配语义
 *
 * - `replaceAll=false`：要求 oldString 恰好匹配 1 次；0 次或 ≥2 次都失败，
 *   且**不进入写入步骤**（原文件不被改动）。
 * - `replaceAll=true`：要求 ≥1 次匹配，替换全部。基于 indexOf 推进（不是正则）。
 *
 * ## 原子写入
 *
 * 临时文件放在原文件同目录（保证 rename 在同一文件系统内是原子的），
 * 命名包含 basename、pid、随机后缀。`wx` 标志打开，失败不覆盖既有临时文件。
 * 任意写入/rename 异常进入 finally 清理临时文件，清理失败不覆盖原始错误。
 *
 * ## 失败信息
 *
 * 全部以 `file_edit:` 前缀开头，便于上游 tool_result 解析。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Tool } from '../tool.js';

/**
 * 把 fs 层抛出的原始错误统一包成 `file_edit:` 前缀的 Error，
 * 便于上游 tool_result 解析（不依赖 Node.js errno 字符串）。
 */
function wrapFsError(stage: string, err: unknown): Error {
  const reason = err instanceof Error ? err.message : String(err);
  return new Error(`file_edit: ${stage} failed: ${reason}`);
}

/**
 * 布尔参数三写法都不对（实测，见 repo-search-tool.ts 注释）：
 *   - `z.coerce.boolean().parse("false") === true`（复现 Day 10 bug A）
 *   - `z.boolean()` 单用 → LLM 发 "false" 字符串整个 tool call 失败
 *   - `z.stringbool()` 单用 → JSON Schema 仍输出 type:"string"，且拒绝原生 boolean
 *
 * union + 布尔在前：LLM 主信号是 boolean，string 分支兜住 "true"/"false"。
 */
const looseBoolean = z.union([z.boolean(), z.stringbool()]);

const fileEditSchema = z.object({
  path: z.string().describe('Absolute path to the file to edit'),
  oldString: z.string().min(1).describe('Exact text to replace'),
  newString: z.string().describe('Replacement text'),
  replaceAll: looseBoolean
    .default(false)
    .describe('Replace every match; default false (require exactly one match)'),
});

export type FileEditArgs = z.infer<typeof fileEditSchema>;

export interface FileEditResult {
  readonly path: string;
  readonly replacements: number;
  /** 完整新文件内容（不是 cat -n 格式，避免重复送回模型） */
  readonly content: string;
  /**
   * 最小 diff 摘要：单匹配时包含 path、replacements、一条 - 旧片段、一条 + 新片段；
   * 多匹配场景只输出摘要，不复制整个文件进 tool result。
   */
  readonly diff: string;
}

/**
 * 找一个非空 oldString 在 source 中所有**非重叠**匹配位置。
 * 用 indexOf 推进，旧字符串非空 → 不会死循环。
 */
function findAllIndices(source: string, needle: string): number[] {
  const indices: number[] = [];
  let from = 0;
  while (from <= source.length) {
    const hit = source.indexOf(needle, from);
    if (hit < 0) break;
    indices.push(hit);
    from = hit + needle.length;
  }
  return indices;
}

/**
 * 用索引列表基于字符串拼接做替换（不是正则、不是全量 replace）。
 * 处理 oldString===newString 的边界（不产生额外替换成本，但仍然走完整流程）。
 */
function applyReplacements(
  source: string,
  indices: ReadonlyArray<number>,
  oldStr: string,
  newStr: string,
): string {
  if (indices.length === 0) return source;
  let out = '';
  let cursor = 0;
  for (const idx of indices) {
    out += source.slice(cursor, idx) + newStr;
    cursor = idx + oldStr.length;
  }
  out += source.slice(cursor);
  return out;
}

/**
 * 生成原子写入用的临时文件名。
 * basename + pid + 8 字节随机，避免与已有临时文件冲突。
 */
function makeTempPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const suffix = randomBytes(8).toString('hex');
  return path.join(dir, `.${base}.file-edit-${process.pid}-${suffix}.tmp`);
}

export const fileEditTool: Tool<typeof fileEditSchema, FileEditResult> = {
  name: 'file_edit',
  description:
    'Replace an exact substring inside a file with atomic write semantics. ' +
    'Use after file_read / repo_search to apply a precise text patch. ' +
    'By default (replaceAll=false) the oldString must match exactly once; ' +
    'pass replaceAll=true to replace every occurrence. ' +
    'Writes via a temp file + rename in the same directory so the file is never truncated before the new contents are flushed. ' +
    'Returns the new file content and a small diff summary so you can verify the change.',
  schema: fileEditSchema,
  execute: async ({ path: filePath, oldString, newString, replaceAll }) => {
    // 类型/默认值已由框架层填充。这里只做 zod 管不了的 IO 前置条件。
    if (!path.isAbsolute(filePath)) {
      throw new Error(`file_edit: path must be absolute, got: ${filePath}`);
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new Error(`file_edit: path does not exist: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`file_edit: path is not a file: ${filePath}`);
    }

    const original = await fs.readFile(filePath, 'utf8');
    const indices = findAllIndices(original, oldString);

    if (replaceAll) {
      if (indices.length === 0) {
        throw new Error(`file_edit: oldString not found in file: ${filePath}`);
      }
    } else {
      if (indices.length === 0) {
        throw new Error(`file_edit: oldString not found in file: ${filePath}`);
      }
      if (indices.length > 1) {
        throw new Error(
          `file_edit: oldString matched ${indices.length} times in ${filePath}; ` +
            'require exactly once when replaceAll=false (pass replaceAll=true to replace all)',
        );
      }
    }

    const originalMode = stat.mode & 0o777;

    const updated = applyReplacements(original, indices, oldString, newString);

    // 原子写入：临时文件 → rename。原文件在 rename 成功前不会被截断。
    const tempPath = makeTempPath(filePath);
    let tempCreated = false;
    try {
      try {
        await fs.writeFile(tempPath, updated, { encoding: 'utf8', flag: 'wx' });
        tempCreated = true;
      } catch (err) {
        throw wrapFsError('write temp file', err);
      }
      try {
        await fs.rename(tempPath, filePath);
      } catch (err) {
        throw wrapFsError('rename into place', err);
      }
      // 还原原文件 mode（writeFile 用 umask 默认值，rename 继承临时文件的 mode）
      try {
        const newMode = (await fs.stat(filePath)).mode & 0o777;
        if (newMode !== originalMode) {
          await fs.chmod(filePath, originalMode);
        }
      } catch (err) {
        throw wrapFsError('restore file mode', err);
      }
    } finally {
      // 任何路径下都要清理临时文件（rename 成功后 tempPath 已不存在，rm 会抛 ENOENT）
      if (tempCreated) {
        try {
          await fs.rm(tempPath, { force: true });
        } catch {
          // 清理失败不覆盖原始错误（吞掉 ENOENT / 权限抖动的副作用）
        }
      }
    }

    const diff = buildDiffSummary({
      path: filePath,
      replacements: indices.length,
      oldString,
      newString,
    });

    return {
      path: filePath,
      replacements: indices.length,
      content: updated,
      diff,
    };
  },
};

interface DiffSummaryInput {
  readonly path: string;
  readonly replacements: number;
  readonly oldString: string;
  readonly newString: string;
}

/**
 * 最小 diff 摘要：
 *   - 单匹配且 old/new 均不超过 200 字符：展示 path、replacements、一条 - 旧片段、一条 + 新片段（每行首字符标 -/+）。
 *   - 多匹配或任一侧超过 200 字符：避免把整段 oldString/newString 复制进 tool result，只输出字符数与文件路径，
 *     提示调用方通过 file_read 复查。
 *
 * 故意走最朴素格式（不是 unified diff），保持实现轻、给模型看的信号简单。
 * 单匹配时也按字节量截断（而不是只看匹配次数），避免「N 次小匹配」之外
 * 还有「1 次巨大匹配」造成的 tool result 膨胀。
 */
const MAX_DIFF_OLD_BYTES = 200;
const MAX_DIFF_NEW_BYTES = 200;

function buildDiffSummary(input: DiffSummaryInput): string {
  const { path: filePath, replacements, oldString, newString } = input;
  const head = `file_edit: ${filePath} (${replacements} replacement${replacements === 1 ? '' : 's'})`;
  if (replacements > 1) {
    return `${head}\n- <${oldString.length} chars>\n+ <${newString.length} chars>\n(multiple matches; read the file to verify)`;
  }
  if (oldString.length > MAX_DIFF_OLD_BYTES || newString.length > MAX_DIFF_NEW_BYTES) {
    return `${head}\n- <${oldString.length} chars>\n+ <${newString.length} chars>\n(large match; read the file to verify)`;
  }
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const oldBlock = oldLines.map((l) => `-${l}`).join('\n');
  const newBlock = newLines.map((l) => `+${l}`).join('\n');
  return `${head}\n${oldBlock}\n${newBlock}`;
}
