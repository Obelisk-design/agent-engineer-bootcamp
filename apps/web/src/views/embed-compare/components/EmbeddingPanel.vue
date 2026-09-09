<!--
  apps/web/src/views/embed-compare/components/EmbeddingPanel.vue

  Embedding 阶段展示壳：摘要（dim / norm / model / latency）+ VectorSpace + VectorPreview。
  VectorSpace 接受完整的 (labels, vectors)，由编排器对齐好（labels[0] = 'query'），
  本组件只负责摘要 + 错误态 + 折叠向量预览。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { EmbeddingPayload, PipelineStage } from '../analysisState.js';
import VectorSpace from './VectorSpace.vue';
import VectorPreview from './VectorPreview.vue';

const props = defineProps<{
  embedding: EmbeddingPayload | null;
  /** 完整 (labels, vectors)，第一项必须是 query。供 VectorSpace 用。 */
  labels: readonly string[];
  vectors: readonly number[][];
  stage: PipelineStage;
}>();

const stats = computed(() => {
  const v = props.embedding?.vector ?? null;
  if (v === null || v.length === 0) return null;
  let min = v[0]!;
  let max = v[0]!;
  let sum = 0;
  let sqSum = 0;
  for (const x of v) {
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x;
    sqSum += x * x;
  }
  const mean = sum / v.length;
  const norm = Math.sqrt(sqSum);
  return { min, max, mean, norm };
});

const errorMsg = computed(() => (props.stage.status === 'error' ? props.stage.error : null));
const running = computed(() => props.stage.status === 'running');
</script>

<template>
  <section class="rounded-md border border-zinc-800 bg-zinc-900 p-4">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400">Embedding</h2>
      <span v-if="embedding" class="font-mono text-[10px] text-zinc-500">
        dim {{ embedding.dimension }} · L2 norm {{ stats?.norm.toFixed(3) ?? '—' }} · model {{ embedding.model }} · {{ embedding.embedMs }}ms
      </span>
    </header>

    <p v-if="running" class="mt-3 text-sm text-amber-400">● Generating embedding…</p>
    <p v-else-if="errorMsg" class="mt-3 rounded border border-red-700 bg-red-900/40 px-3 py-2 text-xs text-red-200">
      ✕ Embedding failed: {{ errorMsg }}
    </p>

    <template v-else-if="embedding && vectors.length === labels.length && vectors.length >= 2">
      <VectorSpace
        :labels="labels"
        :vectors="vectors"
        :highlight-index="0"
      />
      <p v-if="stats" class="mt-2 font-mono text-[10px] text-zinc-500">
        min {{ stats.min.toFixed(4) }} · max {{ stats.max.toFixed(4) }} · mean {{ stats.mean.toFixed(4) }} · norm {{ stats.norm.toFixed(3) }}
      </p>
      <VectorPreview :vector="embedding.vector" />
    </template>

    <p v-else class="mt-3 text-xs text-zinc-500">
      等待 Embedding 完成。
    </p>
  </section>
</template>
