/**
 * libs/embedding/visualize.ts
 *
 * 纯函数：距离矩阵 → HTML 热图；向量集合 → SVG 散点图。
 * 输出 self-contained 字符串（Vue 直接 v-html 即可）。
 */

import { cosineDistance } from './distance.js';
import { pca2d } from './pca.js';

function lerpColor(t: number): string {
  // t ∈ [0, 1] — 0 (close) → near-white, 1 (far) → deep red
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(255 - 215 * clamped);
  const g = Math.round(255 - 245 * clamped);
  const b = Math.round(255 - 220 * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export function distanceMatrixHTML(
  labels: readonly string[],
  vectors: readonly number[][],
): string {
  if (labels.length === 0 || vectors.length === 0) {
    throw new RangeError('distanceMatrixHTML: empty input');
  }
  if (labels.length !== vectors.length) {
    throw new RangeError('labels/vectors length mismatch');
  }
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
      const bg = lerpColor(t);
      cells.push(
        `<td style="background:${bg}" title="${escapeHtml(labels[i]!)} vs ${escapeHtml(labels[j]!)} = ${d.toFixed(3)}">${d.toFixed(2)}</td>`,
      );
    }
    cells.push('</tr>');
  }
  return `<table class="dm"><thead><tr><th></th>${labels.map((l) => `<th>${escapeHtml(l)}</th>`).join('')}</tr></thead><tbody>${cells.join('')}</tbody></table>`;
}

export function scatterSVG(
  labels: readonly string[],
  vectors: readonly number[][],
  width = 480,
  height = 360,
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

  const dots = projected
    .map((p, i) => {
      const cyNum = py(p.y);
      const cxNum = px(p.x);
      const cx = cxNum.toFixed(1);
      const cy = cyNum.toFixed(1);
      const ty = (cyNum - 8).toFixed(1);
      return `<g><circle cx="${cx}" cy="${cy}" r="5" fill="#7dd3fc" stroke="#0ea5e9" stroke-width="1" /><text x="${cx}" y="${ty}" text-anchor="middle" font-size="10" fill="#e4e4e7">${escapeHtml(labels[i]!)}</text></g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="scatter">${dots}</svg>`;
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
