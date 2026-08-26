import { describe, it, expect, beforeEach } from 'vitest';
import { getNamespaceHealth } from '../apps/api/src/env.js';

describe('getNamespaceHealth', () => {
  beforeEach(() => {
    delete process.env['NOTION_TOKEN'];
    delete process.env['OPENAI_API_KEY'];
  });

  it('notion not ready without NOTION_TOKEN', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const h = getNamespaceHealth();
    expect(h.notion.ready).toBe(false);
    expect(h.notion.missing).toContain('NOTION_TOKEN');
  });

  it('notion ready when both keys present', () => {
    process.env['NOTION_TOKEN'] = 'secret_test';
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const h = getNamespaceHealth();
    expect(h.notion.ready).toBe(true);
    expect(h.notion.missing).toEqual([]);
  });

  it('md not ready without OPENAI_API_KEY', () => {
    const h = getNamespaceHealth();
    expect(h.md.ready).toBe(false);
    expect(h.md.missing).toContain('OPENAI_API_KEY');
  });

  it('md ready when OPENAI_API_KEY present', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const h = getNamespaceHealth();
    expect(h.md.ready).toBe(true);
    expect(h.md.missing).toEqual([]);
  });
});
