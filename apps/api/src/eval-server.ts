/**
 * apps/api/src/eval-server.ts
 *
 * Day 22 — Eval Platform 6 条 API（spec §4.4）。
 * Day 24 升级：版本化（每版独立表 chunks_corporate_{version}_heading），支持
 *   body.version 选择 + 跨版本对比（v1 baseline vs 周一 v2 清洗后）。默认 v1。
 *
 * 路由：
 *   GET  /reports         —— 历史报告（retrieval + corpus）
 *   POST /corpus          —— 跑库构建评测（写到 examples/day22/reports/）
 *   POST /retrieve        —— 跑端到端检索评测（写到 examples/day22/reports/，body.version）
 *   GET  /dataset         —— GT 集 + 总数 + humanReviewed 数
 *   GET  /corpus-stats    —— 指定版本表元数据 + 20 个样本（query ?version=v1）
 *   POST /judge           —— 单条 LLM Judge
 *   GET  /versions        —— 列出可用版本（扫 lancedb 表名 chunks_corporate_v*_heading）
 *
 * 与 createAgentApp / createRagApp 完全独立 —— 各自 mount。
 *
 * 不做：
 * - 不做 reports 持久化 DB（filesystem JSON 足够）
 * - 不做 polling / SSE（手动刷新）
 */

import { Hono } from 'hono';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as lancedb from '@lancedb/lancedb';
import {
  loadGtDataset,
  runCorpusEval,
  runRetrievalEval,
  formatCorpusReport,
  formatRetrievalReport,
  judgeLLM,
  makeJudgeCallback,
  type RetrievalEvalReport,
  type CorpusEvalReport,
} from '../../../libs/eval/index.js';
import { openVectorStore } from '../../../libs/rag/store.js';

const LANCEDB_URI = '.lancedb/corporate';
const DEFAULT_VERSION = 'v1';
const TABLE_PREFIX = 'chunks_corporate'; // 完整表名 = chunks_corporate_{version}_heading
const REPORTS_DIR = 'examples/day22/reports';
const GT_PATH = 'examples/day22/gt-dataset.json';
const CORPUS_DIR = 'tests/fixtures/corporate-docs';

/** 构造指定 version 的表名。 */
function tableName(version: string): string {
  return `${TABLE_PREFIX}_${version}_heading`;
}

/** 扫 lancedb 列出已有版本（匹配 chunks_corporate_v\d+_heading 的表名）。 */
async function listAvailableVersions(uri: string): Promise<string[]> {
  const db = await lancedb.connect(uri);
  const names = await db.tableNames();
  const re = /^chunks_corporate_(v\d+)_heading$/;
  return names
    .map((n) => re.exec(n)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort();
}

export function createEvalApp(): Hono {
  const app = new Hono();

  // GET /reports —— 历史报告
  app.get('/eval/reports', async (c) => {
    try {
      const files = await readdir(REPORTS_DIR).catch(() => [] as string[]);
      const retrieval: RetrievalEvalReport[] = [];
      const corpus: CorpusEvalReport[] = [];
      for (const f of files) {
        const path = join(REPORTS_DIR, f);
        const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
        if (f.startsWith('retrieval-eval-')) retrieval.push(raw as RetrievalEvalReport);
        else if (f.startsWith('corpus-eval-')) corpus.push(raw as CorpusEvalReport);
      }
      // 倒序
      retrieval.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      corpus.sort((a, b) => b.totalFiles - a.totalFiles);
      return c.json({ retrieval, corpus });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // POST /corpus —— 跑库构建评测
  app.post('/eval/corpus', async (c) => {
    try {
      const report = await runCorpusEval(CORPUS_DIR);
      const out = `${REPORTS_DIR}/corpus-eval-${Date.now()}.json`;
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(REPORTS_DIR, { recursive: true });
      await writeFile(out, JSON.stringify(report, null, 2), 'utf8');
      // console 留一行方便 dev 调试
      console.log(`[eval/corpus] 报告: ${out}`);
      console.log(formatCorpusReport(report));
      return c.json(report);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // POST /retrieve —— 跑端到端检索评测
  app.post('/eval/retrieve', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        gtPath?: string;
        poolK?: number;
        finalK?: number;
        /** Day 24：指定评估版本（默认 v1）。周一 v2 入库后可 body.version=v2 对比。 */
        version?: string;
        /** Day 24：stale query（chunk_id 不在库）不 skip，照跑 judge+召回 —— v2 清洗后 chunk_id 漂移时保持 judge-avg 分母稳定。 */
        ignoreStale?: boolean;
      };
      const version = body.version ?? DEFAULT_VERSION;
      const apiKey = process.env.OPENAI_API_KEY;
      const baseUrl = process.env.OPENAI_BASE_URL;
      const embedModel = process.env.EMBEDDING_MODEL_NAME;
      const rerankModel = process.env.RERANKER_MODEL_NAME;
      if (!apiKey || !baseUrl || !embedModel || !rerankModel) {
        return c.json({ error: 'env missing (OPENAI_API_KEY/BASE_URL/EMBEDDING/RERANKER)' }, 500);
      }
      const store = await openVectorStore(LANCEDB_URI, tableName(version));
      try {
        const queries = await loadGtDataset(body.gtPath ?? GT_PATH, { stores: [store] });
        const chatModel = process.env.MODEL_NAME ?? 'ai-coding';
        const judge = makeJudgeCallback({ apiKey, baseUrl, model: chatModel });
        const report = await runRetrievalEval(queries, {
          apiKey,
          baseUrl,
          embedModel,
          rerankModel,
          store,
          judge,
          ...(body.poolK !== undefined ? { poolK: body.poolK } : {}),
          ...(body.finalK !== undefined ? { finalK: body.finalK } : {}),
          ...(body.ignoreStale === true ? { ignoreStale: true } : {}),
        });
        // Day 24：报告带 version 标签（v1 vs v2 对比关键字段）
        const versionedReport = {
          ...report,
          corpus: 'corporate',
          version,
          ...(body.ignoreStale === true ? { ignoreStale: true } : {}),
        };
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(REPORTS_DIR, { recursive: true });
        const out = `${REPORTS_DIR}/retrieval-eval-${version}-${report.runId}.json`;
        await writeFile(out, JSON.stringify(versionedReport, null, 2), 'utf8');
        console.log(`[eval/retrieve] 报告: ${out}`);
        console.log(formatRetrievalReport(report));
        return c.json(versionedReport);
      } finally {
        await store.close();
      }
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // GET /dataset —— GT 集 + 统计
  app.get('/eval/dataset', async (c) => {
    try {
      const queries = await loadGtDataset(GT_PATH);
      const humanReviewed = queries.filter((q) => q.humanReviewed).length;
      return c.json({
        version: '2026-09-11-v1',
        queries,
        total: queries.length,
        humanReviewed,
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // GET /corpus-stats —— 库探针（Day 24：?version=v1 默认）
  app.get('/eval/corpus-stats', async (c) => {
    try {
      const version = c.req.query('version') ?? DEFAULT_VERSION;
      const table = tableName(version);
      const store = await openVectorStore(LANCEDB_URI, table);
      try {
        const size = await store.size();
        // 维度必须匹配表实际（dev qwen3-embedding-8b = 4096）
        const dummy = new Array(4096).fill(0);
        const hits = await store.search(dummy, 20);
        const sample = hits.map((h) => ({
          id: h.record.id,
          source: h.record.source,
          text: h.record.text.slice(0, 300),
        }));
        return c.json({ tableName: table, corpus: 'corporate', version, size, sample });
      } finally {
        await store.close();
      }
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // GET /versions —— 列可用版本（Day 24：UI 跑评测前选版本）
  app.get('/eval/versions', async (c) => {
    try {
      const versions = await listAvailableVersions(LANCEDB_URI);
      return c.json({ corpus: 'corporate', default: DEFAULT_VERSION, versions });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // POST /judge —— 单条 LLM Judge
  app.post('/eval/judge', async (c) => {
    try {
      const body = (await c.req.json()) as {
        query?: string;
        answer?: string;
        expectedAnswer?: string;
      };
      if (
        typeof body.query !== 'string' ||
        typeof body.answer !== 'string' ||
        typeof body.expectedAnswer !== 'string'
      ) {
        return c.json({ error: 'body must have { query, answer, expectedAnswer }' }, 400);
      }
      const apiKey = process.env.OPENAI_API_KEY;
      const baseUrl = process.env.OPENAI_BASE_URL;
      if (!apiKey || !baseUrl) {
        return c.json({ error: 'env missing (OPENAI_API_KEY/BASE_URL)' }, 500);
      }
      const v = await judgeLLM(body.query, body.answer, body.expectedAnswer, {
        apiKey,
        baseUrl,
      });
      return c.json(v);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  return app;
}
