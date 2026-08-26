import { describe, it, expect } from 'vitest';
import { createRagApp } from '../apps/api/src/rag-server.js';

const app = createRagApp();

describe('POST /api/search', () => {
  it('returns 400 on missing query', async () => {
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('bad_request');
  });

  it('returns 400 on bad namespace', async () => {
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'test', namespace: 'foo' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/health', () => {
  it('returns health object', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      namespaces?: { notion?: unknown; md?: unknown };
    };
    expect(body).toHaveProperty('namespaces');
    expect(body.namespaces).toHaveProperty('notion');
    expect(body.namespaces).toHaveProperty('md');
  });
});

describe('POST /api/ingest', () => {
  it('returns 400 on missing namespace', async () => {
    const res = await app.request('/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
