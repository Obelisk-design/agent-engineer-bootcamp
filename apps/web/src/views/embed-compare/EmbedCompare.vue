<!--
  apps/web/src/views/embed-compare/EmbedCompare.vue

  Day 19 重构版：AI Retrieval Playground。
  - 单一 analysisState ref + 5 段 pipeline 状态机
  - 单 [Analyze] 按钮驱动完整 pipeline（Query → Embed → Vector Search → Rerank → Final）
  - 所有 section 从 analysisState 读数据，零独立 panel
  - AbortController 支持 [Cancel]
  - Day 23 Task 4：视觉对齐 apps/web 全局亮色 Element Plus 主题（AppMain #f0f2f5）
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import { embedTexts } from '../embed/api.js';
import { SAMPLE_CORPUS, distanceMatrixHTML } from '../../../../../libs/embedding/index.js';
import { searchHits, rerankHits, warnDevKeyOnce } from './api.js';
import {
  defaultAnalysisState,
  emptyPipelineStages,
  type AnalysisState,
} from './analysisState.js';

import QueryComposer from './components/QueryComposer.vue';
import EmptyState from './components/EmptyState.vue';
import PipelineStatus from './components/PipelineStatus.vue';
import EmbeddingPanel from './components/EmbeddingPanel.vue';
import VectorSearchPanel from './components/VectorSearchPanel.vue';
import RerankerPanel from './components/RerankerPanel.vue';
import FinalResults from './components/FinalResults.vue';

// ─── env 检查 ──────────────────────────────────────────────────────────────
// 保留自 Day 18.5：env 缺位时显示红 banner 并禁用下方输入
const apiKeyAvailable = (import.meta.env.VITE_OPENAI_API_KEY ?? '').length > 0;
const devBaseUrl =
  (import.meta.env.VITE_OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1') as string;
const embeddingModel = (import.meta.env.VITE_OPENAI_EMBEDDING_MODEL ?? 'qwen3-embedding-8b') as string;

// ─── 状态 ──────────────────────────────────────────────────────────────────
const analysisState = ref<AnalysisState>(defaultAnalysisState());
let abortController: AbortController | null = null;

const busy = computed(
  () =>
    analysisState.value.pipeline.embed.status === 'running' ||
    analysisState.value.pipeline.vectorSearch.status === 'running' ||
    analysisState.value.pipeline.reranker.status === 'running',
);

/** 跑过至少一次后 pipeline 才显示（之前显示 EmptyState） */
const hasRun = computed(() => analysisState.value.pipeline.final.status !== 'idle');

/** corpus 向量 —— 独立于 query，懒加载一次后缓存 */
const corpusVectors = ref<number[][] | null>(null);
async function ensureCorpusVectors(): Promise<number[][]> {
  if (corpusVectors.value !== null) return corpusVectors.value;
  const v = await embedTexts(SAMPLE_CORPUS);
  corpusVectors.value = v;
  return v;
}

/** VectorSpace 用 (query, SAMPLE_CORPUS) 拼接向量 —— 仅在 embed 成功后计算 */
const allEmbedVectors = computed<readonly number[][]>(() => {
  const q = analysisState.value.embedding?.vector ?? null;
  const c = corpusVectors.value;
  if (q === null || c === null) return [];
  return [...c, q];
});

/** VectorSpace 用 labels —— 最后一项是 query，跟 allEmbedVectors 顺序对齐 */
const allEmbedLabels = computed<readonly string[]>(() => {
  const q = analysisState.value.query;
  return [...SAMPLE_CORPUS, q];
});

// ─── empty state 示例 ──────────────────────────────────────────────────────
const EXAMPLE_QUERIES = [
  'cosine 怎么算',
  '什么是 lancedb',
  '紫光云是什么',
  'agent loop 是什么',
] as const;

// ─── PipelineStatus entries ────────────────────────────────────────────────
const pipelineEntries = computed(() => [
  { key: 'query' as const, label: 'Query', stage: analysisState.value.pipeline.query },
  { key: 'embed' as const, label: 'Embed', stage: analysisState.value.pipeline.embed },
  { key: 'vectorSearch' as const, label: 'Vector Search', stage: analysisState.value.pipeline.vectorSearch },
  { key: 'reranker' as const, label: 'Rerank', stage: analysisState.value.pipeline.reranker },
  { key: 'final' as const, label: 'Final', stage: analysisState.value.pipeline.final },
]);

// ─── live log 行（Loading 状态专用） ────────────────────────────────────────
const liveLog = computed(() => {
  const p = analysisState.value.pipeline;
  const ns = analysisState.value.namespace;
  const k = analysisState.value.topK;
  return [
    {
      key: 'embed',
      status: p.embed.status,
      text: `Embedding generated (${p.embed.ms ?? 0}ms, dim=${analysisState.value.embedding?.dimension ?? '—'})`,
    },
    {
      key: 'search',
      status: p.vectorSearch.status,
      text: `Searching top-${k} in namespace=${ns}`,
    },
    {
      key: 'rerank',
      status: p.reranker.status,
      text: p.reranker.status === 'skipped'
        ? 'Reranker skipped'
        : `Re-ranking with qwen3-reranker-4b`,
    },
    { key: 'final', status: p.final.status, text: `Finalizing` },
  ];
});

function liveColor(status: string): string {
  switch (status) {
    case 'success': return 'color: #67c23a'; // Element Plus success
    case 'running': return 'color: #e6a23c'; // Element Plus warning
    case 'error': return 'color: #f56c6c'; // Element Plus danger
    case 'skipped': return 'color: #909399'; // Element Plus info
    default: return 'color: #c0c4cc'; // Element Plus placeholder
  }
}

// ─── 编排器 ────────────────────────────────────────────────────────────────
async function run(): Promise<void> {
  const q = analysisState.value.query.trim();
  if (q.length === 0) {
    analysisState.value.lastError = '请先输入查询文本';
    return;
  }
  analysisState.value.lastError = null;
  analysisState.value.pipeline = emptyPipelineStages();
  analysisState.value.pipeline.query = { status: 'success' }; // query is local
  analysisState.value.pipeline.embed = { status: 'running' };
  analysisState.value.pipeline.vectorSearch = { status: 'running' };
  analysisState.value.pipeline.reranker = { status: 'running' };
  analysisState.value.pipeline.final = { status: 'running' };

  abortController = new AbortController();
  const { signal } = abortController;
  warnDevKeyOnce();

  // 重置旧结果（但保留 lastError / pipeline 状态）
  analysisState.value.embedding = null;
  analysisState.value.vectorSearch = null;
  analysisState.value.reranker = null;

  try {
    // Stage 1 — Embedding（同时保证 corpus 向量已缓存，供 VectorSpace 用）
    const t0 = performance.now();
    const [vecs] = await Promise.all([
      embedTexts([q], undefined, signal),
      ensureCorpusVectors(),
    ]);
    const queryVec = vecs[0] ?? null;
    if (queryVec === null) throw new Error('embedding returned empty vector');
    const embedMs = Math.round(performance.now() - t0);
    analysisState.value.embedding = {
      vector: queryVec,
      embedMs,
      dimension: queryVec.length,
      model: embeddingModel,
    };
    analysisState.value.pipeline.embed = { status: 'success', ms: embedMs };

    // Stage 2 — Vector Search
    const t1 = performance.now();
    const searchRes = await searchHits(q, {
      topK: analysisState.value.topK,
      namespace: analysisState.value.namespace,
      signal,
    });
    const retrieveMs = searchRes.phases.retrieveMs;
    analysisState.value.vectorSearch = {
      hits: searchRes.hits,
      retrieveMs,
      heatMapHtml: null,
    };
    analysisState.value.pipeline.vectorSearch = { status: 'success', ms: Math.round(performance.now() - t1) };

    if (searchRes.hits.length === 0) {
      // 0 hits → 跳过 reranker / heatmap，final 标 success
      analysisState.value.pipeline.reranker = { status: 'skipped' };
      analysisState.value.pipeline.final = { status: 'success' };
      return;
    }

    // Stage 2b — heatmap (re-embed hit contents；失败不破流程)
    try {
      const hitVecs = await embedTexts(searchRes.hits.map((h) => h.content), undefined, signal);
      const labels = [q, ...searchRes.hits.map((h) => h.sourceLabel)];
      const allVecs = [queryVec, ...hitVecs];
      if (allVecs.length === labels.length) {
        const html = distanceMatrixHTML(labels, allVecs, {
          near: 'rgb(16, 185, 129)', // emerald — close
          far: 'rgb(40, 10, 35)', // deep purple — far
        });
        analysisState.value.vectorSearch.heatMapHtml = html;
      }
    } catch {
      // heatmap 失败不破流程
    }

    // Stage 3 — Reranker
    if (analysisState.value.rerankEnabled) {
      try {
        const t2 = performance.now();
        const rerankRes = await rerankHits(q, searchRes.hits, { signal });
        analysisState.value.reranker = { response: rerankRes };
        analysisState.value.pipeline.reranker = {
          status: 'success',
          ms: Math.round(performance.now() - t2),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        analysisState.value.pipeline.reranker = { status: 'error', error: msg };
      }
    } else {
      analysisState.value.pipeline.reranker = { status: 'skipped' };
    }

    analysisState.value.pipeline.final = { status: 'success' };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      // 用户取消 —— reset
      analysisState.value.pipeline = emptyPipelineStages();
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    // 把当前 running 的阶段标 error，保留之前成功的（vector search 等）
    for (const key of ['embed', 'vectorSearch', 'reranker'] as const) {
      if (analysisState.value.pipeline[key].status === 'running') {
        analysisState.value.pipeline[key] = { status: 'error', error: msg };
      }
    }
    analysisState.value.lastError = msg;
  } finally {
    abortController = null;
  }
}

function cancel(): void {
  abortController?.abort();
}

// ─── example chip → query 填充（不自动 run） ──────────────────────────────
function pickExample(ex: string): void {
  analysisState.value.query = ex;
}
</script>

<template>
  <div class="mx-auto" style="max-width: 1400px; padding: 16px 24px; color: #303133">
    <el-space direction="vertical" fill size="default" style="width: 100%">
      <!-- Header -->
      <el-card shadow="never">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 style="font-size: 1.125rem; font-weight: 600; color: #303133; margin: 0">
              AI Retrieval Playground
            </h1>
            <p style="margin-top: 4px; font-size: 0.75rem; color: #606266">
              Query → Embed → Vector Search → Rerank → Final. One click runs the whole pipeline.
            </p>
          </div>
          <div style="font-family: ui-monospace, monospace; font-size: 10px; color: #909399">
            <div>embedding: <span style="color: #303133">{{ embeddingModel }}</span></div>
            <div>reranker: <span style="color: #e6a23c">qwen3-reranker-4b</span></div>
          </div>
        </div>
      </el-card>

      <!-- Env-missing 红 banner -->
      <el-alert
        v-if="!apiKeyAvailable"
        type="error"
        :closable="false"
        title="环境变量缺失"
        description="请设置 VITE_OPENAI_API_KEY / VITE_OPENAI_BASE_URL / VITE_OPENAI_EMBEDDING_MODEL in .env 后重启 pnpm dev:web。"
        show-icon
      />

      <!-- Query Composer -->
      <QueryComposer
        v-if="apiKeyAvailable"
        :query="analysisState.query"
        :namespace="analysisState.namespace"
        :top-k="analysisState.topK"
        :rerank-enabled="analysisState.rerankEnabled"
        :busy="busy"
        @update:query="(v: string) => (analysisState.query = v)"
        @update:namespace="(v: 'notion' | 'md' | 'all') => (analysisState.namespace = v)"
        @update:top-k="(v: number) => (analysisState.topK = v)"
        @update:rerank-enabled="(v: boolean) => (analysisState.rerankEnabled = v)"
        @analyze="run"
        @cancel="cancel"
      />

      <!-- Empty state -->
      <EmptyState v-if="apiKeyAvailable && !hasRun" :examples="EXAMPLE_QUERIES" @pick="pickExample" />

      <!-- Pipeline + live log + sections -->
      <template v-if="apiKeyAvailable && hasRun">
        <el-card shadow="never">
          <PipelineStatus :entries="pipelineEntries" />
          <ol style="margin-top: 12px; font-family: ui-monospace, monospace; font-size: 11px; list-style: none; padding: 0">
            <li
              v-for="line in liveLog"
              :key="line.key"
              style="display: flex; align-items: baseline; gap: 8px"
              :style="liveColor(line.status)"
            >
              <span style="width: 1rem; user-select: none; color: #c0c4cc">·</span>
              <span>{{ line.text }}</span>
            </li>
          </ol>
        </el-card>

        <EmbeddingPanel
          :embedding="analysisState.embedding"
          :labels="allEmbedLabels"
          :vectors="allEmbedVectors"
          :highlight-index="allEmbedVectors.length - 1"
          :stage="analysisState.pipeline.embed"
        />

        <VectorSearchPanel
          :result="analysisState.vectorSearch"
          :top-k="analysisState.topK"
          :namespace="analysisState.namespace"
          :stage="analysisState.pipeline.vectorSearch"
        />

        <RerankerPanel
          :before="analysisState.vectorSearch?.hits ?? null"
          :after="analysisState.reranker?.response ?? null"
          :stage="analysisState.pipeline.reranker"
        />

        <FinalResults
          :after="analysisState.reranker?.response ?? null"
          :vector-hits="analysisState.vectorSearch?.hits ?? null"
          :rerank-skipped="
            analysisState.pipeline.reranker.status === 'skipped' ||
            analysisState.pipeline.reranker.status === 'error'
          "
        />
      </template>
    </el-space>

    <!-- Page-level fatal error -->
    <el-alert
      v-if="analysisState.lastError"
      type="error"
      :title="analysisState.lastError"
      :closable="false"
      show-icon
      style="margin-top: 12px"
    />

    <!-- Footer -->
    <footer style="border-top: 1px solid #ebeef5; padding-top: 12px; text-align: center; font-family: ui-monospace, monospace; font-size: 10px; color: #909399; margin-top: 16px">
      dev gateway: <code>{{ devBaseUrl }}</code> · reranker: <code>qwen3-reranker-4b</code>
    </footer>
  </div>
</template>
