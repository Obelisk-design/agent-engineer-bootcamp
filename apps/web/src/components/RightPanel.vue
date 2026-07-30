<!--
  apps/web/src/components/RightPanel.vue

  右侧 second panel —— 三段式：Context Window 摘要 / Iterations 列表 / Execution Timeline。
  默认 320px 宽，可折叠（父组件控 v-if）。
-->

<script setup lang="ts">
import { IconCpu, IconLayers, IconActivity } from './icons.js';
import ExecutionTimeline from './ExecutionTimeline.vue';
import type { TimelineItem, ContextRow, RunSummary } from '../types/agentEvent.js';

interface Props {
  contexts: ReadonlyArray<ContextRow>;
  summary: RunSummary | null;
  timeline: ReadonlyArray<TimelineItem>;
}
const props = defineProps<Props>();

void props;

const emit = defineEmits<{
  (e: 'scroll-to-iteration', n: number): void;
}>();

function pct(tokens: number, limit: number): number {
  return Math.min(100, Math.round((tokens / limit) * 100));
}
function barColor(p: number): string {
  if (p < 50) return 'bg-emerald-500';
  if (p <= 80) return 'bg-amber-500';
  return 'bg-red-500';
}
function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function current(): number | null {
  const last = props.contexts[props.contexts.length - 1];
  return last === undefined ? null : last.promptTokens;
}
function peak(): number | null {
  return props.summary?.peakPromptTokens ?? null;
}
function total(): number | null {
  return props.summary === null
    ? null
    : props.summary.totalPromptTokens + props.summary.totalCompletionTokens;
}
</script>

<template>
  <aside
    class="w-80 shrink-0 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden"
    data-testid="right-panel"
  >
    <!-- ========== Context Window 摘要 ========== -->
    <section class="p-4 border-b border-zinc-800 shrink-0">
      <header class="flex items-center gap-2 mb-3">
        <IconCpu :size="13" class="text-emerald-400" />
        <h3 class="text-[10.5px] uppercase tracking-wider text-zinc-400 font-semibold">Context Window</h3>
      </header>

      <div class="space-y-2">
        <div class="flex items-baseline justify-between text-[12px]">
          <span class="text-zinc-500">Current</span>
          <span class="font-mono text-zinc-100">{{ formatTokens(current()) }}</span>
        </div>
        <div class="flex items-baseline justify-between text-[12px]">
          <span class="text-zinc-500">Peak</span>
          <span class="font-mono text-amber-300">{{ formatTokens(peak()) }}</span>
        </div>
        <div class="flex items-baseline justify-between text-[12px]">
          <span class="text-zinc-500">Total</span>
          <span class="font-mono text-zinc-100">{{ formatTokens(total()) }}</span>
        </div>
        <div class="flex items-baseline justify-between text-[12px] pt-2 border-t border-zinc-800">
          <span class="text-zinc-500">Iterations</span>
          <span class="font-mono text-zinc-100">{{ summary?.iterations ?? '—' }}</span>
        </div>
      </div>
    </section>

    <!-- ========== Iterations 详细 ========== -->
    <section v-if="contexts.length > 0" class="p-4 border-b border-zinc-800 shrink-0">
      <header class="flex items-center gap-2 mb-2">
        <IconLayers :size="13" class="text-zinc-400" />
        <h3 class="text-[10.5px] uppercase tracking-wider text-zinc-400 font-semibold">Iterations</h3>
      </header>
      <ul class="space-y-1.5">
        <li
          v-for="ctx in contexts"
          :key="ctx.iteration"
          class="rounded p-1.5 hover:bg-zinc-800/50 cursor-pointer transition-colors"
          @click="emit('scroll-to-iteration', ctx.iteration)"
        >
          <div class="flex justify-between items-baseline text-[11px]">
            <span class="text-zinc-400 font-mono">Iter {{ ctx.iteration }}</span>
            <span class="font-mono text-zinc-200">{{ formatTokens(ctx.promptTokens) }}</span>
          </div>
          <div class="w-full h-1 bg-zinc-800 rounded mt-1 overflow-hidden">
            <div
              class="h-full transition-all"
              :class="barColor(pct(ctx.promptTokens, ctx.limit))"
              :style="{ width: `${pct(ctx.promptTokens, ctx.limit)}%` }"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- ========== Execution Timeline ========== -->
    <section class="flex-1 min-h-0 flex flex-col">
      <header class="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60 shrink-0">
        <div class="flex items-center gap-2">
          <IconActivity :size="13" class="text-emerald-400" />
          <h3 class="text-[10.5px] uppercase tracking-wider text-zinc-400 font-semibold">Execution Timeline</h3>
        </div>
        <span class="font-mono text-[10.5px] text-zinc-500">
          {{ timeline.length }} step{{ timeline.length === 1 ? '' : 's' }}
        </span>
      </header>
      <div class="flex-1 overflow-y-auto py-3">
        <ExecutionTimeline :items="timeline" />
      </div>
    </section>
  </aside>
</template>
