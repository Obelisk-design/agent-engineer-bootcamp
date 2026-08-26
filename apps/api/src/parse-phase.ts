/**
 * apps/api/src/parse-phase.ts
 *
 * 把 examples/notion_import/main.ts 的 stdout 行 parse 成结构化 PhaseEvent。
 * "日志即协议"：不改 main.ts，API 层用正则匹配固定 marker。
 *
 * 4 种 marker（与 notion_import/main.ts 的 `>>>` 行一一对应）：
 *   - `>>> Notion import: seedPages=8, childPages=42, total=50 pages in 12345ms`
 *   - `>>> Diff: +5 added, +3 modified, -1 removed, 12 unchanged`
 *   - `>>> Embed: heading=8 paragraph=15 (fallback: {...})`
 *   - `>>> Write: 23 chunks in 1500ms`
 */

import type { PhaseEvent, PhaseName } from '../../../libs/api-schema/src/index.js';

const PHASE_MARKER = /^>>>\s+(Notion import|Diff|Embed|Write):\s+(.+)$/;

function extractNumber(input: string, key: string): number | undefined {
  const m = input.match(new RegExp(`${key}=([0-9]+)`));
  return m ? Number(m[1]) : undefined;
}

// stdout 形如 `+5 added, -1 removed` —— 符号贴在数字前，word 在数字后。
// payload 记的是「数量」，所以取绝对值（+ 号只是 stdout 装饰）。
function extractSigned(input: string, key: string): number | undefined {
  const m = input.match(new RegExp(`([+-])([0-9]+)\\s+${key}`));
  return m ? Number(m[2]) : undefined;
}

// stdout 形如 `23 chunks in 1500ms` —— 数字在 word 前。
function extractNumberBefore(input: string, key: string): number | undefined {
  const m = input.match(new RegExp(`([0-9]+)\\s+${key}`));
  return m ? Number(m[1]) : undefined;
}

/**
 * Parse 单行 stdout，返回 PhaseEvent 或 null（非 phase 行）。
 */
export function parsePhaseLine(line: string): PhaseEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  const m = trimmed.match(PHASE_MARKER);
  if (!m) return null;

  const marker = m[1]!;
  const body = m[2]!;

  switch (marker) {
    case 'Notion import': {
      const ms = Number(body.match(/in\s+([0-9]+)ms/)?.[1] ?? '0');
      const seedPages = extractNumber(body, 'seedPages') ?? 0;
      const childPages = extractNumber(body, 'childPages') ?? 0;
      const total = extractNumber(body, 'total') ?? 0;
      return {
        name: 'fetch',
        ms,
        payload: { seedPages, childPages, total },
      };
    }
    case 'Diff': {
      const added = extractSigned(body, 'added') ?? 0;
      const modified = extractSigned(body, 'modified') ?? 0;
      const removed = extractSigned(body, 'removed') ?? 0;
      const unchanged = extractNumberBefore(body, 'unchanged') ?? 0;
      return {
        name: 'diff',
        ms: 0,
        payload: { added, modified, removed, unchanged },
      };
    }
    case 'Embed': {
      const heading = extractNumber(body, 'heading') ?? 0;
      const paragraph = extractNumber(body, 'paragraph') ?? 0;
      const fbMatch = body.match(/fallback:\s*(\{[^}]*\})/);
      const fallback = fbMatch ? safeParseJson(fbMatch[1]!) : {};
      return {
        name: 'embed',
        ms: 0,
        payload: { heading, paragraph, fallback },
      };
    }
    case 'Write': {
      const ms = Number(body.match(/in\s+([0-9]+)ms/)?.[1] ?? '0');
      const chunksWritten = extractNumberBefore(body, 'chunks') ?? 0;
      return {
        name: 'write',
        ms,
        payload: { chunksWritten },
      };
    }
    default:
      return null;
  }
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const _PHASE_NAMES: readonly PhaseName[] = ['fetch', 'diff', 'embed', 'write'];
