import { describe, expect, it } from 'vitest';

import { calculatorTool, evaluate } from '../../../libs/tools/calculator-tool.js';

describe('evaluate', () => {
  it('computes basic arithmetic', () => {
    expect(evaluate('1+2*3')).toBe(7);
    expect(evaluate('10-4/2')).toBe(8);
  });

  it('respects parentheses', () => {
    expect(evaluate('(1+2)*3')).toBe(9);
    expect(evaluate('((2.5+2.5)*2)')).toBe(10);
  });

  it('handles decimals', () => {
    expect(evaluate('0.1+0.2')).toBeCloseTo(0.3);
    expect(evaluate('3.5*2')).toBe(7);
  });

  it('throws on invalid characters', () => {
    expect(() => evaluate('1+a')).toThrow('unexpected char');
  });

  it('throws on malformed expressions', () => {
    expect(() => evaluate('1+')).toThrow('malformed expression');
  });

  it('throws on division by zero', () => {
    expect(() => evaluate('1/0')).toThrow('division by zero');
  });
});

describe('calculatorTool', () => {
  it('executes a valid expression', async () => {
    const result = await calculatorTool.execute({ expression: '2+3*4' });
    expect(result).toEqual({ result: 14 });
  });

  it('throws on non-string expression', async () => {
    await expect(calculatorTool.execute({ expression: 123 as unknown as string })).rejects.toThrow(
      'expression must be string',
    );
  });
});
