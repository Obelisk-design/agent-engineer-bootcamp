/**
 * apps/api/src/rag-search.ts
 *
 * POST /api/search handler（Day 24 改造：统一库 + 版本化 + Notion 降级）。
 *
 * 流程：
 *   1. zod parse body（SearchRequest）
 *   2. namespace → 表集合：
 *      - 'corporate' / 'docs' → 单一 corpus 当前版本 heading 表
 *      - 'all'                → 并行两 corpus heading 表，按 score 合并 topK
 *      - 'notion' / 'md'      → 保留 enum（向后兼容），但实际不查（表已无数据 + Notion 无数据）
 *   3. 启动 / 首查 fail-fast：db.tableNames() 校验目标表存在；RAG_ACTIVE_VERSION 填错
 *      或未入库时直接报错，避免静默 0 命中
 *   4. retrieve 是黑盒（内部 embed + store.search），不接外部 vec / embed
 *   5. 给每个 hit 算 highlight（后端计算）
 *   6. 返回 { hits, phases }
 *
 * 字段映射：
 *   chunkId     = record.id
 *   content     = record.text
 *   sourceKind  = ns（corporate / docs / notion / md；enum 在 api-schema 扩展）
 *   sourceLabel = record.source
 *   chunkKind   = 'heading'（Day 24 单 strategy；corporate/docs 只建 heading 表）
 *   meta        = { source, sourceKind }
 *   score       = 1 - hit.score（lance 返回 cosine distance → cosine similarity ∈ [0,1]）
 *
 * 阶段耗时：
 *   embedMs     = 0（retrieve 黑盒不暴露内部 embed 耗时；UI 端不展示 embed 柱）
 *   retrieveMs  = retrieve 返回的 elapsedMs
 */

import type { Context } from 'hono';
import * as lancedb from '@lancedb/lancedb';
import { SearchRequest, SearchResponse, ApiError, type Hit } from '@bootcamp/api-schema';
import { retrieve, openVectorStore } from '../../../libs/rag/index.js';
import { computeHighlight } from './highlight.js';

/** 当前激活版本（env 覆盖，默认 v1）。周一入 v2 后改 RAG_ACTIVE_VERSION=v2 即可。 */
const ACTIVE_VERSION = process.env['RAG_ACTIVE_VERSION'] ?? 'v1';

/** corpus → lancedb uri（决策：统一一个库改成按 corpus 各 uri，与 day24 入库对齐）。 */
const URI_BY_CORPUS: Record<'corporate' | 'docs', string> = {
  corporate: '.lancedb/corporate',
  docs: '.lancedb/docs',
};

/** namespace → 要查的 (corpus, table) 列表。表名带版本，单 strategy heading。 */
interface QueryTarget {
  readonly ns: 'corporate' | 'docs'; // hit.sourceKind 用此
  readonly corpus: 'corporate' | 'docs';
  readonly tableName: string;
}

function targetsForNamespace(namespace: string, version: string): readonly QueryTarget[] {
  const table = (corpus: 'corporate' | 'docs'): string =>
    `chunks_${corpus}_${version}_heading`;
  switch (namespace) {
    case 'corporate':
      return [{ ns: 'corporate', corpus: 'corporate', tableName: table('corporate') }];
    case 'docs':
      return [{ ns: 'docs', corpus: 'docs', tableName: table('docs') }];
    case 'all':
      return [
        { ns: 'corporate', corpus: 'corporate', tableName: table('corporate') },
        { ns: 'docs', corpus: 'docs', tableName: table('docs') },
      ];
    // notion/md：enum 保留兼容，但 Notion 数据已删 / .lancedb/rag 是空库，
    // 后端降级：直接返回空 hits（不报错，不污染 active 版本表）。
    case 'notion':
    case 'md':
      return [];
    default:
      return [];
  }
}

/** fail-fast：检查 (uri, tableName) 是否存在。env 填错或未入库时静默 0 命中的排查很痛苦。 */
async function assertTableExists(uri: string, tableName: string): Promise<void> {
  const db = await lancedb.connect(uri);
  const existing = await db.tableNames();
  if (!existing.includes(tableName)) {
    throw new Error(
      `lancedb 表不存在: ${uri}/${tableName}。检查：①RAG_ACTIVE_VERSION=${ACTIVE_VERSION} 是否对应该表；②是否跑了 examples/day24/index-corpus.ts 入库`,
    );
  }
}

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

  const embedBaseUrl = process.env['OPENAI_BASE_URL'];
  const embedModel = process.env['EMBEDDING_MODEL_NAME'];

  const totalStart = Date.now();
  const targets = targetsForNamespace(namespace, ACTIVE_VERSION);

  // fail-fast：目标表必须存在（notion/md 直接空 targets，不查表）
  for (const t of targets) {
    try {
      await assertTableExists(URI_BY_CORPUS[t.corpus], t.tableName);
    } catch (e) {
      return c.json(
        ApiError.parse({ error: (e as Error).message, code: 'lance_error' }),
        500,
      );
    }
  }

  // Phase: retrieve（并行查目标表，按 score 合并 topK）
  const retrieveStart = Date.now();
  const perTargetHits = await Promise.all(
    targets.map(async (t) => {
      const store = await openVectorStore(URI_BY_CORPUS[t.corpus], t.tableName);
      const r = await retrieve(query, {
        k: topK,
        chunkStrategy: 'heading',
        store,
        apiKey,
        ...(embedBaseUrl !== undefined ? { baseUrl: embedBaseUrl } : {}),
        ...(embedModel !== undefined ? { model: embedModel } : {}),
      });
      return r.hits.map((hit) => ({ hit, target: t }));
    }),
  );

  const merged = perTargetHits
    .flat()
    .sort((a, b) => a.hit.score - b.hit.score) // hit.score = lance cosine distance，升序
    .slice(0, topK);
  const retrieveMs = Date.now() - retrieveStart;

  // Phase: highlight + 字段映射
  const hits: Hit[] = merged.map(({ hit, target }) => {
    const rec = hit.record;
    return {
      chunkId: rec.id,
      sourceKind: target.ns,
      sourceLabel: rec.source,
      content: rec.text,
      score: 1 - hit.score,
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
