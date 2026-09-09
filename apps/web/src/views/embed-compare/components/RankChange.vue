<!--
  apps/web/src/views/embed-compare/components/RankChange.vue

  重排前后位置变化指示：⬆ N / ⬇ N / =。
  from = 重排前 index（0-based），to = 重排后 index（0-based）。
-->

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  from: number;
  to: number;
}>();

const delta = computed(() => props.to - props.from); // 负=上升（排名更前），正=下降
const label = computed(() => {
  if (delta.value === 0) return '=';
  return delta.value < 0 ? `↑ ${-delta.value}` : `↓ ${delta.value}`;
});
const tone = computed(() => {
  if (delta.value === 0) return 'border-zinc-700 bg-zinc-900 text-zinc-500';
  return delta.value < 0
    ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300'
    : 'border-red-800 bg-red-900/30 text-red-300';
});
const title = computed(() => `原 #${props.from + 1} → 现 #${props.to + 1}`);
</script>

<template>
  <span
    class="inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px]"
    :class="tone"
    :title="title"
  >
    {{ label }}
  </span>
</template>
