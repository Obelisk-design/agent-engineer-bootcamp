/**
 * apps/api/src/rag-server.ts
 *
 * RAG 专用 Hono app：search + ingest + health。
 * 与 Agent app 完全分离，零耦合（避免 day14 改动影响 day09 demo）。
 */

import { Hono } from 'hono';
import { ragSearchHandler } from './rag-search.js';
import { ragIngestHandler } from './rag-ingest.js';
import { getNamespaceHealth } from './env.js';
import { HealthResponse } from '@bootcamp/api-schema';

export function createRagApp(): Hono {
  const app = new Hono();

  app.get('/health', (c) => {
    const h = getNamespaceHealth();
    return c.json(
      HealthResponse.parse({
        ok: h.notion.ready || h.md.ready,
        namespaces: h,
      }),
    );
  });

  app.post('/search', ragSearchHandler);
  app.post('/ingest', ragIngestHandler);

  return app;
}
