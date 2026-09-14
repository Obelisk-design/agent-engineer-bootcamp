import { describe, it, expect, beforeEach } from 'vitest';
import { getNamespaceHealth } from '../apps/api/src/env.js';

describe('getNamespaceHealth', () => {
  beforeEach(() => {
    delete process.env['NOTION_TOKEN'];
    delete process.env['OPENAI_API_KEY'];
  });

  it('corpus not ready without OPENAI_API_KEY', () => {
    const h = getNamespaceHealth();
    expect(h.corpus.ready).toBe(false);
    expect(h.corpus.missing).toContain('OPENAI_API_KEY');
  });

  it('corpus ready when OPENAI_API_KEY present', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const h = getNamespaceHealth();
    expect(h.corpus.ready).toBe(true);
    expect(h.corpus.missing).toEqual([]);
  });
});
