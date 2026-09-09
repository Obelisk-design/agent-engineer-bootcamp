<!--
  apps/web/src/views/embed-compare/components/FinalResults.vue

  最终结果区：排名列表（rank · sourceLabel · content · Rerank Score amber 主，Vector Score sky 次）。
  - 有 reranker：按 reranked 顺序，relevanceScore 主显示。
  - reranker 失败/跳过：按 vectorHits 顺序，score 主显示（不伪造 rerank score）。
  - 0 hits：显示 dashed empty。
  - 裁决阈值：reranked[0].relevanceScore < 0.3 → 显示 "无相关内容" 提示。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Hit, RerankResponse } from '@/lib/api-schema.js';
import { RELEVANCE_VERDICT_THRESHOLD } from '../analysisState.js';

const props = defineProps<{
  after: RerankResponse | null;
  vectorHits: readonly Hit[] | null;
  rerankSkipped: boolean;
}>();

const empty = computed(
  () => props.vectorHits !== null && props.vectorHits.length === 0,
);

const verdictWarn = computed(() => {
  if (props.after === null) return null;
  const top = props.after.reranked[0];
  if (top === undefined) return null;
  if (top.relevanceScore < RELEVANCE_VERDICT_THRESHOLD) {
    return `No relevant content found — top-1 rerank score ${top.relevanceScore.toFixed(3)} < 阈值 ${RELEVANCE_VERDICT_THRESHOLD}。下方为 KNN-vs-reranker 行为演示。`;
  }
  return null;
});

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
</script>

<template>
  <section class="rounded-md border border-zinc-800 bg-zinc-900 p-4">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400">Final Results</h2>
      <span v-if="after" class="font-mono text-[10px] text-zinc-500">
        {{ after.reranked.length }} hits
      </span>
      <span v-else-if="vectorHits" class="font-mono text-[10px] text-zinc-500">
        {{ vectorHits.length }} hits (vector order, reranker unavailable)
      </span>
    </header>

    <p
      v-if="verdictWarn"
      class="mt-3 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-xs text-amber-200"
    >
      ⚠ {{ verdictWarn }}
    </p>

    <p
      v-if="empty"
      class="mt-3 rounded border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400"
    >
      0 hits — namespace 可能为空。换个 namespace 试试，或先跑入库脚本。
    </p>

    <!-- 有 reranker → 按 reranked 顺序 -->
    <ol v-else-if="after" class="mt-3 flex flex-col gap-2">
      <li
        v-for="(h, i) in after.reranked"
        :key="h.chunkId"
        class="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-mono text-base font-semibold text-zinc-300">#{{ i + 1 }}</span>
          <div class="text-right font-mono">
            <div class="text-amber-300">rerank {{ h.relevanceScore.toFixed(3) }}</div>
            <div class="text-[10px] text-sky-300/70">vector {{ h.score.toFixed(3) }}</div>
          </div>
        </div>
        <div class="mt-1 text-[10px] text-zinc-500">
          <code class="font-mono">{{ h.chunkKind }}</code> ·
          <span class="text-zinc-300">{{ h.sourceLabel }}</span>
        </div>
        <div class="mt-0.5 break-words text-zinc-200">{{ truncate(h.content, 160) }}</div>
      </li>
    </ol>

    <!-- reranker 跳过/失败 → 按 vectorHits 顺序，无伪造 rerank score -->
    <ol v-else-if="vectorHits && vectorHits.length > 0" class="mt-3 flex flex-col gap-2">
      <li
        v-for="(h, i) in vectorHits"
        :key="h.chunkId"
        class="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-mono text-base font-semibold text-zinc-300">#{{ i + 1 }}</span>
          <div class="text-right font-mono">
            <div class="text-sky-300">vector {{ h.score.toFixed(3) }}</div>
            <div v-if="rerankSkipped" class="text-[10px] text-zinc-500">rerank skipped</div>
          </div>
        </div>
        <div class="mt-1 text-[10px] text-zinc-500">
          <code class="font-mono">{{ h.chunkKind }}</code> ·
          <span class="text-zinc-300">{{ h.sourceLabel }}</span>
        </div>
        <div class="mt-0.5 break-words text-zinc-200">{{ truncate(h.content, 160) }}</div>
      </li>
    </ol>

    <p v-else class="mt-3 text-xs text-zinc-500">
      等待分析完成。
    </p>
  </section>
</template>
