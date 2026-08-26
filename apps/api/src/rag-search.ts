/**
 * apps/api/src/rag-search.ts
 *
 * POST /api/search handler。
 *
 * 流程：
 *   1. zod parse body（SearchRequest）
 *   2. namespace → tablePrefix：
 *      - 'notion' → openVectorStore('chunks_notion')
 *      - 'md'     → openVectorStore('chunks_md')
 *      - 'all'    → 并行两路，merge topK by score
 *   3. retrieve 是黑盒（内部 embed + store.search），不接外部 vec / embed
 *   4. 给每个 hit 算 highlight（后端计算）
 *   5. 返回 { hits, phases }
 *
 * 字段映射（per ledger R6.2）：
 *   chunkId     = record.id
 *   content     = record.text
 *   sourceKind  = record.sourceKind
 *   sourceLabel = record.source
 *   chunkKind   = 'heading'（hard-code，YAGNI）
 *   meta        = { source, sourceKind }
 *   score       = hit.score（lance cosine distance，UI 端 1-score 展示）
 *
 * 阶段耗时（per ledger R6.1）：
 *   embedMs     = 0（retrieve 黑盒不暴露内部 embed 耗时；UI 端不展示 embed 柱）
 *   retrieveMs  = retrieve 返回的 elapsedMs
 */

import type { Context } from 'hono';
import { SearchRequest, SearchResponse, ApiError, type Hit } from '@bootcamp/api-schema';
import { retrieve, openVectorStore } from '../../../libs/rag/index.js';
import { computeHighlight } from './highlight.js';

const STORE_URI = '.lancedb/rag';

/** namespace → lancedb table 名的映射。 */
const TABLE_BY_NAMESPACE = {
  notion: 'chunks_notion',
  md: 'chunks_md',
} as const;

type Namespace = keyof typeof TABLE_BY_NAMESPACE;

export async function ragSearchHandler(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = SearchRequest.safeParse(body);
  if (!parsed.success) {
    return c.json(
      ApiError.parse({
        error: parsed.error.message,
        code: 'bad_request',
        details: { issues: parsed.error.issues },
      }),
      400,
    );
  }
  const { query, topK, namespace } = parsed.data;

  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    return c.json(ApiError.parse({ error: 'OPENAI_API_KEY not set', code: 'env_missing' }), 500);
  }

  const totalStart = Date.now();

  // namespace → 要扫的表列表。'all' 并行两路，其余单一。
  const namespaces: readonly Namespace[] =
    namespace === 'all' ? (['notion', 'md'] as const) : [namespace];

  // Phase: retrieve（并行查各 namespace，按 score 合并 topK）
  const retrieveStart = Date.now();
  const perNamespaceHits = await Promise.all(
    namespaces.map(async (ns) => {
      const tableName = TABLE_BY_NAMESPACE[ns];
      const store = await openVectorStore(STORE_URI, tableName);
      const r = await retrieve(query, {
        k: topK,
        chunkStrategy: 'heading',
        store,
        apiKey,
      });
      return r.hits.map((h) => ({ hit: h, ns }));
    }),
  );

  const merged = perNamespaceHits
    .flat()
    .sort((a, b) => b.hit.score - a.hit.score)
    .slice(0, topK);
  const retrieveMs = Date.now() - retrieveStart;

  // Phase: highlight + 字段映射
  const hits: Hit[] = merged.map(({ hit, ns }) => {
    const rec = hit.record;
    return {
      chunkId: rec.id,
      sourceKind: ns,
      sourceLabel: rec.source,
      content: rec.text,
      score: hit.score,
      chunkKind: 'heading',
      highlight: computeHighlight(query, rec.text),
      meta: { source: rec.source, sourceKind: rec.sourceKind },
    };
  });

  const totalMs = Date.now() - totalStart;

  return c.json(
    SearchResponse.parse({
      hits,
      phases: { embedMs: 0, retrieveMs, totalMs },
    }),
  );
}
