import { describe, expect, it } from 'vitest';

import { countContextTokens } from '../../../../libs/llm/observability/context-counter.js';

const hasAnthropicKey =
  process.env.ANTHROPIC_API_KEY !== undefined && process.env.ANTHROPIC_API_KEY !== '';

describe('countContextTokens', () => {
  it('returns undefined for unknown model', async () => {
    const result = await countContextTokens(
      [{ role: 'user', content: 'hello' }],
      'gpt-4.1', // not in MODELS registry
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty model string', async () => {
    const result = await countContextTokens([{ role: 'user', content: 'hello' }], '');
    expect(result).toBeUndefined();
  });

  it('does not throw on API failure (best-effort)', async () => {
    const result = await countContextTokens([{ role: 'user', content: 'hello' }], 'claude-opus-5');
    expect(result === undefined || typeof result?.tokens === 'number').toBe(true);
  });

  it.runIf(hasAnthropicKey)('returns real token count for known Anthropic model', async () => {
    const result = await countContextTokens(
      [{ role: 'user', content: 'Hello, world' }],
      'claude-opus-5',
    );
    expect(result).toBeDefined();
    expect(result?.tokens).toBeGreaterThan(0);
    expect(result?.tokens).toBeLessThan(50);
  });
});
