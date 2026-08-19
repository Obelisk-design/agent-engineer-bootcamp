/**
 * libs/embedding/pca.ts
 *
 * 手写 PCA → 2D：center → covariance → top-2 eigenvectors (power iteration)。
 * 适合 n ≤ 30、d ∈ [2, 1536]。够 demo 用，不引第三方。
 */

export interface Point2D {
  x: number;
  y: number;
}

export function pca2d(points: number[][]): Point2D[] {
  if (points.length < 2) {
    throw new RangeError(`pca2d needs ≥ 2 samples, got ${points.length}`);
  }
  const n = points.length;
  const d = points[0]!.length;
  for (const p of points) {
    if (p.length !== d) throw new RangeError('inconsistent dims across samples');
  }

  // Center
  const mean = new Array<number>(d).fill(0);
  for (const p of points) for (let i = 0; i < d; i++) mean[i]! += p[i]! / n;
  const centered = points.map((p) => p.map((v, i) => v - mean[i]!));

  // Covariance (d × d)
  const cov: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += centered[k]![i]! * centered[k]![j]!;
      const v = s / (n - 1);
      cov[i]![j] = v;
      cov[j]![i] = v;
    }
  }

  const v1 = powerIterate(cov, 200);
  const lambda1 = rayleigh(cov, v1);
  const deflated: number[][] = cov.map((row) => row.slice());
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      deflated[i]![j]! -= lambda1 * v1[i]! * v1[j]!;
    }
  }
  const v2 = powerIterate(deflated, 200);

  if (rayleigh(cov, v2) > lambda1) {
    return points.map((p) => project(p, mean, v2, v1));
  }
  return points.map((p) => project(p, mean, v1, v2));
}

function project(p: number[], mean: number[], axis1: number[], axis2: number[]): Point2D {
  let x = 0;
  let y = 0;
  for (let i = 0; i < p.length; i++) {
    const c = p[i]! - mean[i]!;
    x += c * axis1[i]!;
    y += c * axis2[i]!;
  }
  return { x, y };
}

function powerIterate(M: number[][], iters: number): number[] {
  const d = M.length;
  let v = new Array<number>(d).fill(0).map((_, i) => (i === 0 ? 1 : 0));
  for (let it = 0; it < iters; it++) {
    const nv = new Array<number>(d).fill(0);
    for (let i = 0; i < d; i++) {
      let s = 0;
      for (let j = 0; j < d; j++) s += M[i]![j]! * v[j]!;
      nv[i] = s;
    }
    const norm = Math.hypot(...nv);
    if (norm === 0) throw new RangeError('zero-variance data: PCA undefined');
    v = nv.map((x) => x / norm);
  }
  return v;
}

function rayleigh(M: number[][], v: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < v.length; i++) {
    let row = 0;
    for (let j = 0; j < v.length; j++) row += M[i]![j]! * v[j]!;
    num += v[i]! * row;
    den += v[i]! * v[i]!;
  }
  return den === 0 ? 0 : num / den;
}
