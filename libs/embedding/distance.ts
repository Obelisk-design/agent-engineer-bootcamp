/**
 * libs/embedding/distance.ts
 *
 * 纯函数：向量距离度量。无 vue / 无网络依赖。
 * cosine ∈ [-1, 1]，cosine distance = 1 - cosine ∈ [0, 2]；
 * euclidean ≥ 0。
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new RangeError(`vector dim mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) {
    throw new RangeError('zero vector has no direction');
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new RangeError(`vector dim mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}
