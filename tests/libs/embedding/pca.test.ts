import { describe, expect, it } from 'vitest';
import { pca2d } from '../../../libs/embedding/pca.js';

describe('pca2d', () => {
  it('returns one (x,y) per input sample', () => {
    const pts = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ];
    expect(pca2d(pts)).toHaveLength(4);
  });
  it('preserves monotonic variance on a clear linear trend', () => {
    const pts = Array.from({ length: 20 }, (_, i) => [i, 2 * i, 0.01 * i]);
    const out = pca2d(pts);
    const xs = out.map((p) => p.x);
    const ys = out.map((p) => p.y);
    const spread = (arr: number[]) => Math.max(...arr) - Math.min(...arr);
    expect(spread(xs)).toBeGreaterThan(spread(ys));
  });
  it('throws RangeError on < 2 samples', () => {
    expect(() => pca2d([[1, 2, 3]])).toThrow(RangeError);
  });
});
