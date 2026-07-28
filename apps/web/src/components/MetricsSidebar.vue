<!--
  apps/web/src/components/MetricsSidebar.vue

  左侧 sidebar — 每次 iteration 的 context token 占比 + 总计。
  - 数据源: context AgentEvent 列表 + run_summary
  - 点击 iteration 行 → emit scroll-to-iteration → App.vue 滚动 Timeline 到对应位置
  - Day 08: UI 纯 Tailwind utility classes

  设计决策:
  - 固定 240px 宽（与 App.vue 三栏布局 grid-cols-[240px_1fr_360px] 协调）
  - 进度条颜色同 HeaderPill (<50% 绿 / 50-80% 黄 / >80% 红)
  - 空状态显示 "waiting for iteration data"（不显示 0）
-->

<script setup lang="ts">
import { computed } from 'vue';

interface ContextRow {
  readonly iteration: number;
  readonly promptTokens: number;
  readonly limit: number;
}
interface RunSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly peakPromptTokens: number;
  readonly iterations: number;
}

const props = defineProps<{
  contexts: ReadonlyArray<ContextRow>;
  summary: RunSummary | null;
}>();

const emit = defineEmits<{
  (e: 'scroll-to-iteration', n: number): void;
}>();

const peak = computed(() => props.summary?.peakPromptTokens ?? null);
const total = computed(() =>
  props.summary === null ? null : props.summary.totalPromptTokens + props.summary.totalCompletionTokens,
);
const iterations = computed(() => props.summary?.iterations ?? null);

function barColor(tokens: number, limit: number): string {
  const p = (tokens / limit) * 100;
  if (p < 50) return 'bg-emerald-500';
  if (p <= 80) return 'bg-amber-500';
  return 'bg-red-500';
}

function pct(tokens: number, limit: number): number {
  return Math.min(100, Math.round((tokens / limit) * 100));
}

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
</script>

<template>
  <aside class="w-60 bg-zinc-900 border-r border-zinc-800 p-4 overflow-y-auto">
    <h3 class="text-xs uppercase text-zinc-500 mb-3">Context Window</h3>
    <ul v-if="contexts.length > 0" class="space-y-2">
      <li
        v-for="ctx in contexts"
        :key="ctx.iteration"
        class="cursor-pointer hover:bg-zinc-800 p-2 rounded"
        @click="emit('scroll-to-iteration', ctx.iteration)"
      >
        <div class="flex justify-between text-xs">
          <span class="text-zinc-400">Iter {{ ctx.iteration }}</span>
          <span class="text-zinc-100">{{ formatTokens(ctx.promptTokens) }}</span>
        </div>
        <div class="w-full h-1 bg-zinc-800 rounded mt-1">
          <div
            class="h-full rounded"
            :class="barColor(ctx.promptTokens, ctx.limit)"
            :style="{ width: `${pct(ctx.promptTokens, ctx.limit)}%` }"
          />
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-zinc-500 italic">waiting for iteration data</p>

    <hr class="border-zinc-800 my-4" />
    <div class="text-xs text-zinc-400 space-y-1">
      <div class="flex justify-between">
        <span>Peak</span>
        <span class="text-zinc-100">{{ formatTokens(peak) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Total</span>
        <span class="text-zinc-100">{{ formatTokens(total) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Iters</span>
        <span class="text-zinc-100">{{ iterations ?? '—' }}</span>
      </div>
    </div>
  </aside>
</template>
