import { greet } from './foo.js';
import { describe, it, expect } from 'vitest';

describe('greet', () => {
  it('returns hello', () => {
    expect(greet()).toBe('hello');
  });
});
