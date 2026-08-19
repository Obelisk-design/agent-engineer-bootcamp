import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  cosineDistance,
  euclideanDistance,
} from '../../../libs/embedding/distance.js';

describe('cosineSimilarity', () => {
  it('identical vectors → 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });
  it('opposite vectors → -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });
  it('orthogonal vectors → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });
  it('asymmetric dims → throws RangeError', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(RangeError);
  });
  it('zero vector → throws RangeError', () => {
    expect(() => cosineSimilarity([0, 0, 0], [1, 2, 3])).toThrow(RangeError);
    expect(() => cosineSimilarity([1, 2, 3], [0, 0, 0])).toThrow(RangeError);
  });
});

describe('cosineDistance', () => {
  it('identical vectors → 0', () => {
    expect(cosineDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0, 10);
  });
  it('cosineDistance = 1 - cosineSimilarity', () => {
    expect(cosineDistance([1, 2], [3, 4])).toBeCloseTo(1 - cosineSimilarity([1, 2], [3, 4]), 10);
  });
});

describe('euclideanDistance', () => {
  it('identical vectors → 0', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
  it('unit apart → 1', () => {
    expect(euclideanDistance([0, 0], [1, 0])).toBeCloseTo(1, 10);
  });
  it('3-4-5 triangle → 5', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5, 10);
  });
});
