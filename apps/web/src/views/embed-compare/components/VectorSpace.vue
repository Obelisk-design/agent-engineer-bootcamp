<!--
  apps/web/src/views/embed-compare/components/VectorSpace.vue

  2D PCA 散点图（v-html scatterSVG）。query 点 emerald + 较大；corpus 点 sky。
  底部 disclaimer 强调二维只是投影，原始向量高维。
-->

<script setup lang="ts">
import { computed } from 'vue';
import { scatterSVG } from '../../../../../../libs/embedding/index.js';

const props = defineProps<{
  labels: readonly string[];
  vectors: readonly number[][];
  /** 哪个 index 要 highlight（通常是 query，0） */
  highlightIndex?: number;
  width?: number;
  height?: number;
}>();

const svg = computed(() => {
  if (props.vectors.length < 2) return '';
  return scatterSVG(
    props.labels,
    props.vectors,
    props.width ?? 640,
    props.height ?? 360,
    {
      ...(props.highlightIndex !== undefined ? { highlightIndex: props.highlightIndex } : {}),
      showLegend: true,
    },
  );
});
</script>

<template>
  <div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
    <div v-html="svg" class="overflow-x-auto" />
    <p class="mt-2 text-[10px] text-zinc-500">
      2D projection for visualization only — original vectors remain high-dimensional.
      PCA over (n={{ vectors.length }}, d={{ vectors[0]?.length ?? 0 }}).
    </p>
  </div>
</template>
