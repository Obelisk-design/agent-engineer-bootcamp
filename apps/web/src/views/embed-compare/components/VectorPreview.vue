<!--
  apps/web/src/views/embed-compare/components/VectorPreview.vue

  Embedding 向量预览：<details> 折叠，显示首 100 维 monospace。
  完整 4096 维必须避免直铺——按规则十六"virtualized / preformatted / drawer"。
  这里用 preformatted text + 折叠，是低成本方案。
  Day 23 Task 4：白底亮色，预览容器浅灰底 + 深字。
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
  <details v-if="vector !== null" style="margin-top: 12px">
    <summary style="cursor: pointer; font-size: 0.75rem; color: #606266">
      查看输入向量（前 {{ previewCount ?? 100 }} 维 / {{ total }} 总维）
    </summary>
    <pre
      style="margin-top: 8px; overflow-x: auto; border-radius: 0.375rem; border: 1px solid #ebeef5; background: #f5f7fa; padding: 12px; font-family: ui-monospace, monospace; font-size: 10px; line-height: 1.6; color: #303133; white-space: pre-wrap; word-break: break-all"
    >{{ preview }}…</pre>
  </details>
</template>
