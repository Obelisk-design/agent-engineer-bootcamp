<!--
  apps/web/src/views/embed-compare/components/RankChange.vue

  重排前后位置变化指示：⬆ N / ⬇ N / =。
  from = 重排前 index（0-based），to = 重排后 index（0-based）。
  Day 23 Task 4：白底亮色 + Element Plus 状态色 (success/danger/info)。
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
  if (delta.value === 0) return 'border: 1px solid #dcdfe6; background: #f5f7fa; color: #909399';
  return delta.value < 0
    ? 'border: 1px solid #b3e19d; background: #f0f9eb; color: #67c23a'
    : 'border: 1px solid #fab6b6; background: #fef0f0; color: #f56c6c';
});
const title = computed(() => `原 #${props.from + 1} → 现 #${props.to + 1}`);
</script>

<template>
  <span
    style="display: inline-flex; align-items: center; border-radius: 0.25rem; padding: 1px 6px; font-family: ui-monospace, monospace; font-size: 10px"
    :style="tone"
    :title="title"
  >
    {{ label }}
  </span>
</template>
