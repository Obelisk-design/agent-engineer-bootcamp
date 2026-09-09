<!--
  apps/web/src/views/embed-compare/components/VectorPreview.vue

  Embedding 向量预览：<details> 折叠，显示首 100 维 monospace。
  完整 4096 维必须避免直铺——按规则十六"virtualized / preformatted / drawer"。
  这里用 preformatted text + 折叠，是低成本方案。
-->

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  vector: number[] | null;
  /** 默认展示前 N 维 */
  previewCount?: number;
}>();

const preview = computed(() => {
  if (props.vector === null) return '';
  const n = props.previewCount ?? 100;
  return props.vector
    .slice(0, n)
    .map((v) => v.toFixed(4))
    .join(', ');
});

const total = computed(() => props.vector?.length ?? 0);
</script>

<template>
  <details v-if="vector !== null" class="mt-3">
    <summary class="cursor-text text-xs text-zinc-400 hover:text-zinc-200">
      查看输入向量（前 {{ previewCount ?? 100 }} 维 / {{ total }} 总维）
    </summary>
    <pre
      class="mt-2 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-all"
    >{{ preview }}…</pre>
  </details>
</template>
