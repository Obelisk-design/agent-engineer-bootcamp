<!--
  apps/web/src/components/HeaderPill.vue

  Header 区域右侧的实时 token 指标 pill。
  - 数据源: run_summary AgentEvent（App.vue 路由后写 ref）
  - 颜色: 绿 (<50%) / 黄 (50-80%) / 红 (>80%) 基于 peakPromptTokens / contextLimit
  - Day 08: UI 纯 Tailwind utility classes，无 scoped CSS

  设计决策:
  - 进度条颜色阈值硬编码（不引入 token-based design，YAGNI）
  - 格式化: 1K / 1.2K / 1.5M 等（精确到 1 位小数）
  - null summary 时显示 "—"（不报 0，避免误导）
-->

<script setup lang="ts">
import { computed } from 'vue';

interface RunSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly peakPromptTokens: number;
  readonly iterations: number;
}

const props = defineProps<{
  summary: RunSummary | null;
  contextLimit: number;
}>();

const peak = computed(() => props.summary?.peakPromptTokens ?? null);
const total = computed(() =>
  props.summary === null ? null : props.summary.totalPromptTokens + props.summary.totalCompletionTokens,
);
const iterations = computed(() => props.summary?.iterations ?? null);

const pct = computed(() => {
  if (peak.value === null) return 0;
  return Math.min(100, Math.round((peak.value / props.contextLimit) * 100));
});

const barColor = computed(() => {
  if (pct.value < 50) return 'bg-emerald-500';
  if (pct.value < 80) return 'bg-amber-500';
  return 'bg-red-500';
});

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
</script>

<template>
  <div class="flex items-center gap-3 px-4 py-2 bg-zinc-900 text-zinc-100 text-sm rounded-md">
    <span>{{ iterations ?? '—' }} iter</span>
    <span class="text-zinc-500">·</span>
    <span>{{ formatTokens(peak) }} / {{ formatTokens(contextLimit) }} tok</span>
    <div class="w-24 h-1.5 bg-zinc-800 rounded">
      <div class="h-full rounded" :class="barColor" :style="{ width: `${pct}%` }" />
    </div>
    <span class="text-zinc-500">·</span>
    <span>{{ formatTokens(total) }} total</span>
  </div>
</template>
