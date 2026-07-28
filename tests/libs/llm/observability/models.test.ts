import { describe, expect, it } from 'vitest';
import { MODELS, getModelMeta } from '../../../../libs/llm/observability/models.js';

describe('MODELS registry', () => {
  it('returns ModelMeta for known models', () => {
    expect(getModelMeta('claude-opus-5')).toEqual({ contextLimit: 1_000_000 });
    expect(getModelMeta('claude-sonnet-5')).toEqual({ contextLimit: 1_000_000 });
    expect(getModelMeta('claude-haiku-4-5')).toEqual({ contextLimit: 200_000 });
    expect(getModelMeta('gpt-4o')).toEqual({ contextLimit: 128_000 });
    expect(getModelMeta('gpt-4o-mini')).toEqual({ contextLimit: 128_000 });
    expect(getModelMeta('gpt-4-turbo')).toEqual({ contextLimit: 128_000 });
  });

  it('returns undefined for unknown model', () => {
    expect(getModelMeta('gpt-4.1')).toBeUndefined();
    expect(getModelMeta('claude-unknown')).toBeUndefined();
    expect(getModelMeta('')).toBeUndefined();
  });

  it('exposes MODELS as a frozen registry', () => {
    expect(Object.keys(MODELS).sort()).toEqual(
      [
        'claude-haiku-4-5',
        'claude-opus-5',
        'claude-sonnet-5',
        'gpt-4-turbo',
        'gpt-4o',
        'gpt-4o-mini',
      ].sort(),
    );
  });
});
