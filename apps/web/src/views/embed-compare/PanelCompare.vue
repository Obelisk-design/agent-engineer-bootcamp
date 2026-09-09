<!--
  apps/web/src/views/embed-compare/PanelCompare.vue

  Panel B · lancedb top-K + cosine 距离热图
  - 输入：props.query + props.namespace + props.topK
  - 行为：调 fetch('/api/search') → SearchResponse.hits[]
  - 渲染：
    - 距离热图（输入 query + topK hits 之间）
    - 每个 hit 的 chunkId + sourceLabel + score（cosine similarity ∈ [0,1]）
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { distanceMatrixHTML } from '../../../../../libs/embedding/index.js';
import { embedTexts } from '../embed/api.js';
import { searchHits } from './api.js';
import { warnDevKeyOnce } from './api.js';
import type { SearchResponse } from '@/lib/api-schema.js';

const props = defineProps<{
  query: string;
  namespace: 'notion' | 'md' | 'all';
  topK: number;
}>();

const emit = defineEmits<{
  (e: 'hits', hits: SearchResponse['hits']): void;
}>();

const result = ref<SearchResponse | null>(null);
const html = ref<string | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

async function run(): Promise<void> {
  if (!props.query.trim()) {
    err.value = '请先在顶部输入框填写查询文本';
    return;
  }
  busy.value = true;
  err.value = null;
  result.value = null;
  html.value = null;
  warnDevKeyOnce();
  try {
    // 并行：embedTexts 给输入 + searchHits 拿 hits
    const [vecs, searchRes] = await Promise.all([
      embedTexts([props.query]),
      searchHits(props.query, { topK: props.topK, namespace: props.namespace }),
    ]);
    result.value = searchRes;
    emit('hits', searchRes.hits);

    // 空态：0 hits（KNN 语义表为空否则必有返回）→ 提前返回，不再调第二次 embed
    // （embedTexts([]) 行为未知，且 1 个点的热图无意义）
    if (searchRes.hits.length === 0) return;

    // 渲染距离热图需要"输入 vector + 5 个 hit text"——但 hit 没有 vector，只有 text
    // 简单做法：labels 仅有文本，热图用 input vs hit 字符串
    // 真正准确需要再 embed hit 一次，但 vllm 限流成本高
    // 改：跑一次 embed 拿 topK hit vector（hits.content 全是 chunk 文本）+ input vector → 共 6 个
    const hitVecs = await embedTexts(searchRes.hits.map((h) => h.content));
    const allLabels = ['📌 ' + props.query, ...searchRes.hits.map((h) => h.sourceLabel)];
    const allVecs = [...vecs, ...hitVecs];
    if (allVecs.length === allLabels.length) {
      html.value = distanceMatrixHTML(allLabels, allVecs);
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

watch(
  () => [props.query, props.namespace, props.topK],
  () => {
    if (props.query.trim().length > 0) void run();
  },
);
</script>

<template>
  <section class="ec-panel">
    <header class="panel-head">
      <h2>Panel B · lancedb top-{{ props.topK }} cosine 距离热图</h2>
      <button
        type="button"
        class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50"
        :disabled="busy"
        @click="run"
      >
        {{ busy ? 'Searching…' : 'Run' }}
      </button>
    </header>

    <p v-if="err" class="ec-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="ec-loading mt-3">embedding + lancedb search + 距离矩阵…</p>
    <p v-else-if="result && result.hits.length === 0" class="ec-empty mt-3">
      搜索不到 — 当前 namespace（<code>{{ props.namespace }}</code>）没有返回任何结果，该库可能未索引或为空。换个 namespace 试试，或先跑入库脚本。
    </p>

    <template v-else-if="result">
      <p class="ec-hint mt-2">namespace: <code>{{ props.namespace }}</code> · 返回 {{ result.hits.length }} 个 hit · {{ result.phases.retrieveMs ?? 0 }}ms</p>
      <ol class="hits-list mt-3">
        <li v-for="(h, i) in result.hits" :key="h.chunkId" class="hit-row">
          <div class="hit-rank">#{{ i + 1 }}</div>
          <div class="hit-body">
            <div class="hit-source">
              <code>{{ h.chunkKind }}</code> · <span class="text-sky-300">{{ h.sourceLabel }}</span>
            </div>
            <div class="hit-content">{{ h.content.slice(0, 120) }}{{ h.content.length > 120 ? '…' : '' }}</div>
          </div>
          <div class="hit-score">cosine sim = <strong>{{ h.score.toFixed(3) }}</strong></div>
        </li>
      </ol>

      <details v-if="html" class="mt-4">
        <summary class="text-sm cursor-text">查看输入 vs top-{{ props.topK }} cosine 距离热图（再 embed 一次）</summary>
        <div class="mt-2" v-html="html" />
      </details>
    </template>
  </section>
</template>