<!--
  apps/web/src/views/embed-compare/components/PipelineStatus.vue

  横向 5 节点条：Query → Embed → Vector Search → Rerank → Final。
  每个节点根据 stage.status 渲染对应圆点（○ / ● / ✓ / ! / ⊘）。
  Day 23 Task 4：白底亮色，用 Element Plus 状态色。
-->

<script setup lang="ts">
import type { PipelineStage } from '../analysisState.js';

export interface PipelineStatusEntry {
  key: 'query' | 'embed' | 'vectorSearch' | 'reranker' | 'final';
  label: string;
  stage: PipelineStage;
}

defineProps<{
  entries: readonly PipelineStatusEntry[];
}>();

function dot(stage: PipelineStage): { glyph: string; color: string } {
  switch (stage.status) {
    case 'running':
      return { glyph: '●', color: '#e6a23c' }; // Element Plus warning
    case 'success':
      return { glyph: '✓', color: '#67c23a' }; // Element Plus success
    case 'error':
      return { glyph: '!', color: '#f56c6c' }; // Element Plus danger
    case 'skipped':
      return { glyph: '⊘', color: '#909399' }; // Element Plus info
    case 'idle':
    default:
      return { glyph: '○', color: '#c0c4cc' }; // Element Plus placeholder
  }
}
</script>

<template>
  <div style="display: flex; align-items: center; gap: 4px; overflow-x: auto; padding: 4px 0">
    <template v-for="(entry, idx) in entries" :key="entry.key">
      <div style="display: flex; min-width: 0; align-items: center; gap: 6px">
        <span style="font-family: ui-monospace, monospace; font-size: 1rem; line-height: 1" :style="{ color: dot(entry.stage).color }">
          {{ dot(entry.stage).glyph }}
        </span>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: #606266">
          {{ entry.label }}
        </span>
        <span
          v-if="entry.stage.ms !== undefined && entry.stage.status !== 'idle'"
          style="font-family: ui-monospace, monospace; font-size: 10px; color: #909399"
        >
          {{ entry.stage.ms }}ms
        </span>
      </div>
      <span
        v-if="idx < entries.length - 1"
        style="user-select: none; padding: 0 4px; color: #c0c4cc"
        aria-hidden="true"
      >→</span>
    </template>
  </div>
</template>
