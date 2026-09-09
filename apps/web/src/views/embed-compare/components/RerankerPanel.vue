<!--
  apps/web/src/views/embed-compare/components/RerankerPanel.vue

  Reranker 阶段展示壳：摘要 + 双栏 Before (vector order, sky) vs After (reranker order, amber)。
  After 每行带 <RankChange> chip。
  rerank 失败：显示 amber warning 头部，但 Before 列照常。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Hit, RerankResponse } from '@/lib/api-schema.js';
import type { PipelineStage } from '../analysisState.js';
import RankChange from './RankChange.vue';

const props = defineProps<{
  before: readonly Hit[] | null;
  after: RerankResponse | null;
  stage: PipelineStage;
}>();

const errorMsg = computed(() => (props.stage.status === 'error' ? props.stage.error : null));
const running = computed(() => props.stage.status === 'running');
const skipped = computed(() => props.stage.status === 'skipped');

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
</script>

<template>
  <section class="rounded-md border border-zinc-800 bg-zinc-900 p-4">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400">Reranker</h2>
      <span v-if="after" class="font-mono text-[10px] text-zinc-500">
        model <span class="text-amber-300">qwen3-reranker-4b</span> · {{ after.reranked.length }} hits · {{ after.phases.rerankMs ?? 0 }}ms
      </span>
    </header>

    <!-- reranker 失败：amber warning 头部，不破坏 before 数据 -->
    <p
      v-if="errorMsg"
      class="mt-3 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-xs text-amber-200"
    >
      ⚠ Reranker failed — showing Vector Search results only. ({{ stage.ms ?? 0 }}ms, error: {{ errorMsg }})
    </p>
    <p v-else-if="running" class="mt-3 text-sm text-amber-400">● Re-ranking with qwen3-reranker-4b…</p>
    <p
      v-else-if="skipped"
      class="mt-3 rounded border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400"
    >
      Reranker skipped — Vector Search returned 0 hits or user disabled reranker.
    </p>

    <div v-if="before && before.length > 0" class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <!-- BEFORE: vector order -->
      <div class="rounded-md border border-zinc-800 p-3">
        <h3 class="mb-2 text-xs font-semibold text-sky-400">Before · vector search order</h3>
        <ol class="flex flex-col gap-2">
          <li
            v-for="(h, i) in before"
            :key="`b-${h.chunkId}`"
            class="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-mono text-zinc-500">#{{ i + 1 }}</span>
              <span class="font-mono text-sky-300">vector {{ h.score.toFixed(3) }}</span>
            </div>
            <div class="mt-1 text-[10px] text-zinc-500">
              <code class="font-mono">{{ h.chunkKind }}</code> ·
              <span class="text-sky-300">{{ h.sourceLabel }}</span>
            </div>
            <div class="mt-0.5 break-words text-zinc-200">{{ truncate(h.content, 100) }}</div>
          </li>
        </ol>
      </div>

      <!-- AFTER: reranker order -->
      <div class="rounded-md border border-zinc-800 p-3">
        <h3 class="mb-2 text-xs font-semibold text-amber-400">After · reranker order</h3>
        <ol v-if="after" class="flex flex-col gap-2">
          <li
            v-for="(h, i) in after.reranked"
            :key="`a-${h.chunkId}`"
            class="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
          >
            <div class="flex items-baseline justify-between gap-2">
              <div class="flex items-baseline gap-1.5">
                <span class="font-mono text-zinc-500">#{{ i + 1 }}</span>
                <RankChange :from="h.originalIndex" :to="i" />
              </div>
              <div class="text-right font-mono">
                <div class="text-amber-300">rerank {{ h.relevanceScore.toFixed(3) }}</div>
                <div class="text-[10px] text-zinc-500">vector {{ h.score.toFixed(3) }}</div>
              </div>
            </div>
            <div class="mt-1 text-[10px] text-zinc-500">
              <code class="font-mono">{{ h.chunkKind }}</code> ·
              <span class="text-amber-300">{{ h.sourceLabel }}</span>
            </div>
            <div class="mt-0.5 break-words text-zinc-200">{{ truncate(h.content, 100) }}</div>
          </li>
        </ol>
        <p v-else class="text-xs text-zinc-500">等待 reranker 完成。</p>
      </div>
    </div>

    <p v-else-if="!running && !errorMsg && !skipped" class="mt-3 text-xs text-zinc-500">
      等待 Vector Search 返回 hits 后开始 reranker。
    </p>
  </section>
</template>
