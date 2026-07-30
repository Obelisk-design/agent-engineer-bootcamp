<!--
  apps/web/src/components/HeaderBar.vue

  顶栏 —— IDE-style 极简 1 行（参考 LangChain Docs / Cursor）。
  组成：
    [Logo + 产品名]  [Tabs: Conversation / Trace / Cost]  [flex spacer]  [model · in/out · ctx]  [status pill]

  数据：单一 props 入口，不发请求，不持本地 state。
-->

<script setup lang="ts">
import { computed } from 'vue';
import {
  IconBolt,
  IconActivity,
  IconCircleDot,
} from './icons.js';

interface RunSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly peakPromptTokens: number;
  readonly iterations: number;
}
interface LatestUsage {
  readonly iteration: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

interface Props {
  modelName: string;
  summary: RunSummary | null;
  latestUsage: LatestUsage | null;
  contextLimit: number;
  // 🆕 Day 09+: session 跨 turn 累计 token —— 跟 conversation 同生命周期
  sessionUsage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly peakPromptTokens: number;
  };
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled';
}
const props = defineProps<Props>();

const STATUS: Record<Props['status'], { label: string; cls: string; dotCls: string }> = {
  idle: { label: 'Idle', cls: 'bg-zinc-800 text-zinc-400', dotCls: 'bg-zinc-500' },
  running: { label: 'Running', cls: 'bg-sky-950 text-sky-300 ring-1 ring-sky-700/40', dotCls: 'bg-sky-400 animate-pulse' },
  completed: { label: 'Completed', cls: 'bg-emerald-950 text-emerald-300 ring-1 ring-emerald-700/40', dotCls: 'bg-emerald-400' },
  error: { label: 'Error', cls: 'bg-red-950 text-red-300 ring-1 ring-red-700/40', dotCls: 'bg-red-400' },
  cancelled: { label: 'Cancelled', cls: 'bg-amber-950 text-amber-300 ring-1 ring-amber-700/40', dotCls: 'bg-amber-400' },
};

function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function pct(peak: number | null | undefined, limit: number): number {
  if (peak === null || peak === undefined) return 0;
  return Math.min(100, Math.round((peak / limit) * 100));
}

const barColor = computed(() => {
  const p = pct(props.summary?.peakPromptTokens, props.contextLimit);
  if (p < 50) return 'bg-emerald-500';
  if (p <= 80) return 'bg-amber-500';
  return 'bg-red-500';
});
</script>

<template>
  <header
    class="flex items-center gap-4 px-4 h-11 bg-zinc-950 border-b border-zinc-800 text-[13px] text-zinc-100 shrink-0 select-none"
    data-testid="header-bar"
  >
    <!-- Brand / Logo -->
    <div class="flex items-center gap-2 font-semibold shrink-0">
      <span class="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center text-zinc-950 font-bold text-[12px]">
        AI
      </span>
      <span>Agent Console</span>
      <span class="text-zinc-500 text-[11px] font-mono">v0.8</span>
    </div>

    <span class="w-px h-5 bg-zinc-800" />

    <!-- Tabs (single source active = current view) -->
    <nav class="flex items-center gap-1 shrink-0">
      <button
        type="button"
        class="px-2.5 h-7 rounded text-[12px] flex items-center gap-1.5 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-700/30"
        data-testid="header-tab-active"
      >
        <IconBolt :size="13" /> Run
      </button>
      <button
        type="button"
        class="px-2.5 h-7 rounded text-[12px] flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
      >
        <IconActivity :size="13" /> Traces
      </button>
    </nav>

    <!-- flex spacer -->
    <div class="flex-1" />

    <!-- Token group -->
    <div class="flex items-center gap-2.5 text-[11.5px] shrink-0">
      <span class="text-zinc-500">model</span>
      <span class="text-zinc-200 font-mono">{{ modelName }}</span>

      <span class="w-px h-4 bg-zinc-800" />

      <span class="flex items-center gap-1.5" title="本轮 input tokens">
        <span class="w-1.5 h-1.5 rounded-full bg-sky-400" />
        <span class="text-zinc-500">in</span>
        <span class="font-mono text-sky-300" data-testid="header-bar-latest-prompt">
          {{ formatTokens(latestUsage?.promptTokens) }}
        </span>
      </span>
      <span class="flex items-center gap-1.5" title="本轮 output tokens">
        <span class="w-1.5 h-1.5 rounded-full bg-violet-400" />
        <span class="text-zinc-500">out</span>
        <span class="font-mono text-violet-300" data-testid="header-bar-latest-completion">
          {{ formatTokens(latestUsage?.completionTokens) }}
        </span>
      </span>

      <span class="w-px h-4 bg-zinc-800" />

      <!-- 🆕 Day 09+: session 跨 turn 累计 in/out (暗色 vs 本轮亮色) -->
      <span class="flex items-center gap-1.5" title="整个 session 累计 input tokens（跨 turn）">
        <span class="w-1.5 h-1.5 rounded-full bg-sky-700" />
        <span class="text-zinc-600">Σin</span>
        <span class="font-mono text-sky-500" data-testid="header-bar-session-prompt">
          {{ formatTokens(sessionUsage?.promptTokens) }}
        </span>
      </span>
      <span class="flex items-center gap-1.5" title="整个 session 累计 output tokens（跨 turn）">
        <span class="w-1.5 h-1.5 rounded-full bg-violet-700" />
        <span class="text-zinc-600">Σout</span>
        <span class="font-mono text-violet-500" data-testid="header-bar-session-completion">
          {{ formatTokens(sessionUsage?.completionTokens) }}
        </span>
      </span>

      <span class="w-px h-4 bg-zinc-800" />

      <span class="text-zinc-500">ctx</span>
      <span class="font-mono text-zinc-200">
        {{ formatTokens(summary?.peakPromptTokens) }}
        <span class="text-zinc-500">/ {{ formatTokens(contextLimit) }}</span>
      </span>
      <div class="w-14 h-1 bg-zinc-800 rounded overflow-hidden">
        <div
          class="h-full transition-all"
          :class="barColor"
          :style="{ width: `${pct(summary?.peakPromptTokens, contextLimit)}%` }"
        />
      </div>
    </div>

    <span class="w-px h-5 bg-zinc-800" />

    <!-- Status pill -->
    <span
      :class="['px-2 h-7 rounded inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase', STATUS[status].cls]"
      data-testid="header-bar-status"
    >
      <IconCircleDot :size="10" :class="STATUS[status].dotCls" />
      {{ STATUS[status].label }}
    </span>
  </header>
</template>
