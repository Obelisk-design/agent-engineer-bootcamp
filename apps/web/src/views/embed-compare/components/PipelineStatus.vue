<!--
  apps/web/src/views/embed-compare/components/PipelineStatus.vue

  横向 5 节点条：Query → Embed → Vector Search → Rerank → Final。
  每个节点根据 stage.status 渲染对应圆点（○ / ● / ✓ / ! / ⊘）。
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
      return { glyph: '●', color: 'text-amber-400' };
    case 'success':
      return { glyph: '✓', color: 'text-emerald-400' };
    case 'error':
      return { glyph: '!', color: 'text-red-400' };
    case 'skipped':
      return { glyph: '⊘', color: 'text-zinc-500' };
    case 'idle':
    default:
      return { glyph: '○', color: 'text-zinc-500' };
  }
}
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto py-1">
    <template v-for="(entry, idx) in entries" :key="entry.key">
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="font-mono text-base leading-none" :class="dot(entry.stage).color">
          {{ dot(entry.stage).glyph }}
        </span>
        <span class="truncate text-xs text-zinc-400">{{ entry.label }}</span>
        <span
          v-if="entry.stage.ms !== undefined && entry.stage.status !== 'idle'"
          class="font-mono text-[10px] text-zinc-500"
        >
          {{ entry.stage.ms }}ms
        </span>
      </div>
      <span
        v-if="idx < entries.length - 1"
        class="select-none px-1 text-zinc-700"
        aria-hidden="true"
      >→</span>
    </template>
  </div>
</template>
