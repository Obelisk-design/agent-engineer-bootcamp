/**
 * libs/embedding/visualize.ts
 *
 * 纯函数：距离矩阵 → HTML 热图；向量集合 → SVG 散点图。
 * 输出 self-contained 字符串（Vue 直接 v-html 即可）。
 *
 * 历史：
 * - Day 18 初版：白→粉 gradient、单一圆点样式
 * - Day 19 重构：新增 ScatterOpts / DistanceMatrixTheme 可选参数（默认空对象），
 *   保持向后兼容（embed-demo PanelA/PanelB 仍用旧 4 参数 / 2 参数调用）。
 */

import { cosineDistance } from './distance.js';
import { pca2d } from './pca.js';

/** 默认颜色 —— 跟 apps/web 全局 zinc 调色板对齐 */
const DEFAULT_NEAR = 'rgb(16, 185, 129)'; // emerald-500 — close (low distance)
const DEFAULT_FAR = 'rgb(40, 10, 35)'; // deep purple — far (high distance)
const DEFAULT_CELL_TEXT = '#e4e4e7';
const DEFAULT_LABEL_TEXT = '#a1a1aa';
const DEFAULT_BORDER = 'rgba(63,63,70,0.5)';
const DEFAULT_HIGHLIGHT_FILL = '#10b981';
const DEFAULT_HIGHLIGHT_STROKE = '#34d399';
const DEFAULT_HIGHLIGHT_RADIUS = 8;
const DEFAULT_CORPUS_FILL = '#7dd3fc';
const DEFAULT_CORPUS_STROKE = '#0ea5e9';
const DEFAULT_CORPUS_RADIUS = 5;

function lerpColor(t: number, near: string, far: string): string {
  // t ∈ [0, 1] — 0 (close) → near, 1 (far) → far.
  // 输入是 rgb(r, g, b) 字符串，输出也是 rgb(r, g, b)。
  const clamp = Math.max(0, Math.min(1, t));
  const parse = (c: string): [number, number, number] => {
    const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m === null) return [0, 0, 0];
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const [nr, ng, nb] = parse(near);
  const [fr, fg, fb] = parse(far);
  const r = Math.round(nr + (fr - nr) * clamp);
  const g = Math.round(ng + (fg - ng) * clamp);
  const b = Math.round(nb + (fb - nb) * clamp);
  return `rgb(${r}, ${g}, ${b})`;
}

export interface DistanceMatrixTheme {
  /** close (low distance) — default emerald */
  near?: string;
  /** far (high distance) — default deep purple */
  far?: string;
  /** 单元格内文字颜色 */
  cellText?: string;
  /** 行/列表头颜色 */
  labelText?: string;
  /** 表格边框颜色 */
  borderColor?: string;
}

export function distanceMatrixHTML(
  labels: readonly string[],
  vectors: readonly number[][],
  theme: DistanceMatrixTheme = {},
): string {
  if (labels.length === 0 || vectors.length === 0) {
    throw new RangeError('distanceMatrixHTML: empty input');
  }
  if (labels.length !== vectors.length) {
    throw new RangeError('labels/vectors length mismatch');
  }
  const near = theme.near ?? DEFAULT_NEAR;
  const far = theme.far ?? DEFAULT_FAR;
  const cellText = theme.cellText ?? DEFAULT_CELL_TEXT;
  const labelText = theme.labelText ?? DEFAULT_LABEL_TEXT;
  const borderColor = theme.borderColor ?? DEFAULT_BORDER;
  const n = labels.length;
  let maxD = 0;
  const grid: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = cosineDistance(vectors[i]!, vectors[j]!);
      grid[i]![j] = d;
      if (d > maxD) maxD = d;
    }
  }
  const cells: string[] = [];
  for (let i = 0; i < n; i++) {
    cells.push('<tr>');
    cells.push(`<th class="lbl">${escapeHtml(labels[i]!)}</th>`);
    for (let j = 0; j < n; j++) {
      const d = grid[i]![j]!;
      const t = maxD === 0 ? 0 : d / maxD;
      const bg = lerpColor(t, near, far);
      cells.push(
        `<td style="background:${bg}" title="${escapeHtml(labels[i]!)} vs ${escapeHtml(labels[j]!)} = ${d.toFixed(3)}">${d.toFixed(2)}</td>`,
      );
    }
    cells.push('</tr>');
  }
  // 自包含 <style> —— 让函数不依赖外部 CSS 也能在 v-html 下正确呈现
  const style = `<style>.dm{border-collapse:collapse;border:1px solid ${borderColor};font-size:11px;font-family:ui-monospace,monospace;color:${cellText}}.dm th,.dm td{padding:6px 10px;text-align:center;border:1px solid ${borderColor}}.dm .lbl{color:${labelText};text-align:left;font-weight:600}.dm thead th{color:${labelText};background:rgba(255,255,255,0.02)}</style>`;
  return `${style}<table class="dm"><thead><tr><th></th>${labels.map((l) => `<th>${escapeHtml(l)}</th>`).join('')}</tr></thead><tbody>${cells.join('')}</tbody></table>`;
}

export interface ScatterOpts {
  /** 哪个点要 highlight（0-based index）。省略 = 全部统一色。 */
  highlightIndex?: number;
  highlightFill?: string;
  highlightStroke?: string;
  highlightRadius?: number;
  /** 是否在右下角渲染 query / corpus 图例 */
  showLegend?: boolean;
}

export function scatterSVG(
  labels: readonly string[],
  vectors: readonly number[][],
  width = 480,
  height = 360,
  opts: ScatterOpts = {},
): string {
  if (labels.length !== vectors.length) {
    throw new RangeError('labels/vectors length mismatch');
  }
  if (vectors.length < 2) {
    throw new RangeError('scatterSVG needs ≥ 2 points');
  }
  const projected = pca2d(vectors.map((v) => [...v]));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const pad = 24;
  const px = (x: number) => pad + ((x - xMin) / xSpan) * (width - 2 * pad);
  const py = (y: number) => height - pad - ((y - yMin) / ySpan) * (height - 2 * pad);

  const hi = opts.highlightIndex;
  const hiFill = opts.highlightFill ?? DEFAULT_HIGHLIGHT_FILL;
  const hiStroke = opts.highlightStroke ?? DEFAULT_HIGHLIGHT_STROKE;
  const hiR = opts.highlightRadius ?? DEFAULT_HIGHLIGHT_RADIUS;
  const coR = DEFAULT_CORPUS_RADIUS;

  const dots = projected
    .map((p, i) => {
      const cx = px(p.x).toFixed(1);
      const cy = py(p.y).toFixed(1);
      const ty = (py(p.y) - 8).toFixed(1);
      const isHi = hi !== undefined && i === hi;
      const fill = isHi ? hiFill : DEFAULT_CORPUS_FILL;
      const stroke = isHi ? hiStroke : DEFAULT_CORPUS_STROKE;
      const r = isHi ? hiR : coR;
      const cls = isHi ? ' class="hi"' : '';
      return `<g${cls}><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" /><text x="${cx}" y="${ty}" text-anchor="middle" font-size="10" fill="#e4e4e7">${escapeHtml(labels[i]!)}</text></g>`;
    })
    .join('');

  const legend =
    opts.showLegend === true
      ? `<g transform="translate(${width - 110}, ${height - 30})">
        <circle cx="6" cy="0" r="${hiR}" fill="${hiFill}" stroke="${hiStroke}" stroke-width="1.2" />
        <text x="20" y="3" font-size="10" fill="#a1a1aa">query</text>
        <circle cx="56" cy="0" r="${coR}" fill="${DEFAULT_CORPUS_FILL}" stroke="${DEFAULT_CORPUS_STROKE}" stroke-width="1" />
        <text x="68" y="3" font-size="10" fill="#a1a1aa">corpus</text>
      </g>`
      : '';

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="scatter">${dots}${legend}</svg>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]!,
  );
}
