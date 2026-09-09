<!--
  apps/web/src/views/embed-compare/components/VectorSearchPanel.vue

  Vector Search 阶段展示壳：摘要 + hit 列表 + 可折叠距离热图。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Hit } from '@/lib/api-schema.js';
import type { VectorSearchPayload, PipelineStage } from '../analysisState.js';

const props = defineProps<{
  result: VectorSearchPayload | null;
  topK: number;
  namespace: 'notion' | 'md' | 'all';
  stage: PipelineStage;
}>();

const errorMsg = computed(() => (props.stage.status === 'error' ? props.stage.error : null));
const running = computed(() => props.stage.status === 'running');
const empty = computed(
  () => props.result !== null && props.result.hits.length === 0 && props.stage.status === 'success',
);

/** 1 - score ∈ [0,1]，距离 = 1 - cosine 相似度（lance 返回 score=1-cosine_distance） */
function distanceOf(h: Hit): number {
  return 1 - h.score;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
</script>

<template>
  <section class="rounded-md border border-zinc-800 bg-zinc-900 p-4">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Vector Search · Top {{ topK }}
      </h2>
      <span v-if="result" class="font-mono text-[10px] text-zinc-500">
        namespace: <span class="text-sky-300">{{ namespace }}</span> · {{ result.hits.length }} hits · {{ result.retrieveMs }}ms
      </span>
    </header>

    <p v-if="running" class="mt-3 text-sm text-amber-400">● Searching vectors in LanceDB…</p>
    <p v-else-if="errorMsg" class="mt-3 rounded border border-red-700 bg-red-900/40 px-3 py-2 text-xs text-red-200">
      ✕ Vector search failed: {{ errorMsg }}
    </p>
    <p
      v-else-if="empty"
      class="mt-3 rounded border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400"
    >
      搜索不到 — namespace <code>{{ namespace }}</code> 没有返回任何结果，该库可能未索引或为空。换个 namespace 试试，或先跑入库脚本。
    </p>

    <template v-else-if="result && result.hits.length > 0">
      <ol class="mt-3 flex flex-col gap-2">
        <li
          v-for="(h, i) in result.hits"
          :key="h.chunkId"
          class="grid grid-cols-[3rem_1fr_auto] items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
        >
          <div class="text-center font-mono text-sm font-semibold text-zinc-500">#{{ i + 1 }}</div>
          <div class="min-w-0">
            <div class="text-[10px] text-zinc-500">
              <code class="font-mono">{{ h.chunkKind }}</code> ·
              <span class="text-sky-300">{{ h.sourceLabel }}</span>
            </div>
            <div class="mt-0.5 break-words text-zinc-200">{{ truncate(h.content, 120) }}</div>
          </div>
          <div class="text-right font-mono text-xs">
            <div class="text-sky-300">vector {{ h.score.toFixed(3) }}</div>
            <div class="text-[10px] text-zinc-500">distance {{ distanceOf(h).toFixed(3) }}</div>
          </div>
        </li>
      </ol>

      <details v-if="result.heatMapHtml" class="mt-4">
        <summary class="cursor-text text-xs text-zinc-400 hover:text-zinc-200">
          查看输入 vs top-{{ topK }} cosine 距离热图
        </summary>
        <div class="mt-2 overflow-x-auto" v-html="result.heatMapHtml" />
      </details>
    </template>

    <p v-else class="mt-3 text-xs text-zinc-500">
      等待 Vector Search 完成。
    </p>
  </section>
</template>
