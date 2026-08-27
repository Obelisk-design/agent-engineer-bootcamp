/**
 * apps/api/src/rag-search.ts
 *
 * POST /api/search handler。
 *
 * 流程：
 *   1. zod parse body（SearchRequest）
 *   2. namespace → tableName：
 *      - 'notion' → openVectorStore('chunks_notion_heading')（ADR 0004 双表对齐 indexer 实际写）
 *      - 'md'     → openVectorStore('chunks_md_heading')（ADR 0004 双表对齐 indexer 实际写）
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

/** namespace → lancedb table 名的映射。
 *
 * 实际表名是 `${prefix}_heading` + `${prefix}_paragraph`（Day 13 indexer 双表设计）。
 * Day 14 spec 写 `${prefix}` 单表与实现不对称（ADR 0004）。
 *
 * Day 14 后段扩展：search 扩到 paragraph 策略。heading chunk 覆盖标题层
 * 关键词，paragraph chunk 覆盖内容层细节（blockquote / 表格 / 列表项）。
 * query 跟哪一类 cosine 更近看场景，merge by score 后取 topK。
 */
const TABLE_BY_NAMESPACE = {
  notion: ['chunks_notion_heading', 'chunks_notion_paragraph'],
  md: ['chunks_md_heading', 'chunks_md_paragraph'],
} as const;

type Namespace = keyof typeof TABLE_BY_NAMESPACE;
type Strategy = 'heading' | 'paragraph';

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

  // 透传给 retrieve —— libs 层不读 env（apps/api 层负责注入 baseUrl / model）
  const embedBaseUrl = process.env['OPENAI_BASE_URL'];
  const embedModel = process.env['EMBEDDING_MODEL_NAME'];

  const totalStart = Date.now();

  // namespace → 要扫的表列表。'all' 并行两路，其余单一。
  const namespaces: readonly Namespace[] =
    namespace === 'all' ? (['notion', 'md'] as const) : [namespace];

  // Phase: retrieve（并行查 heading + paragraph 两 strategy，按 score 合并 topK）
  const retrieveStart = Date.now();
  const perNamespaceHits = await Promise.all(
    namespaces
      .flatMap((ns) => TABLE_BY_NAMESPACE[ns].map((tableName) => ({ ns, tableName })))
      .map(async ({ ns, tableName }) => {
        const strategy: Strategy = tableName.endsWith('_paragraph') ? 'paragraph' : 'heading';
        const store = await openVectorStore(STORE_URI, tableName);
        const r = await retrieve(query, {
          k: topK,
          chunkStrategy: strategy,
          store,
          apiKey,
          ...(embedBaseUrl !== undefined ? { baseUrl: embedBaseUrl } : {}),
          ...(embedModel !== undefined ? { model: embedModel } : {}),
        });
        return r.hits.map((hit) => ({ hit, strategy, ns }));
      }),
  );

  const merged = perNamespaceHits
    .flat()
    .sort((a, b) => a.hit.score - b.hit.score) // score = cosine distance，越小越相似
    .slice(0, topK);
  const retrieveMs = Date.now() - retrieveStart;

  // Phase: highlight + 字段映射
  const hits: Hit[] = merged.map(({ hit, strategy, ns }) => {
    const rec = hit.record;
    return {
      chunkId: rec.id,
      sourceKind: ns,
      sourceLabel: rec.source,
      content: rec.text,
      score: hit.score,
      chunkKind: strategy,
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
