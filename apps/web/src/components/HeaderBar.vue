<!--
  apps/web/src/components/HeaderBar.vue

  顶栏 —— IDE-style 极简 1 行
  组成：
    [Logo + 产品名]  [Tabs: Run / Traces]  [flex spacer]  [model · in/out · ctx · Σin/Σout]  [status pill]

  数据：useAgentStore() —— 直接读 reactive 状态。
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useAgentStore } from '@/store/modules/agent';

const agent = useAgentStore();

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
  const p = pct(agent.runSummary?.peakPromptTokens, agent.contextLimit);
  if (p < 50) return '#67c23a';
  if (p <= 80) return '#e6a23c';
  return '#f56c6c';
});

const STATUS: Record<typeof agent.status, { label: string; bg: string; color: string; ring: string; dotColor: string }> = {
  idle: { label: 'Idle', bg: '#2a2a2a', color: '#a0a0a0', ring: 'transparent', dotColor: '#909399' },
  running: { label: 'Running', bg: '#0d3b66', color: '#7ec8ff', ring: '#1763a6', dotColor: '#7ec8ff' },
  completed: { label: 'Completed', bg: '#0e3b27', color: '#85ce61', ring: '#1a6b3e', dotColor: '#85ce61' },
  error: { label: 'Error', bg: '#4a1a1a', color: '#fab6b6', ring: '#7a2828', dotColor: '#f56c6c' },
  cancelled: { label: 'Cancelled', bg: '#4a3a14', color: '#fcd793', ring: '#7a5e22', dotColor: '#e6a23c' },
};
</script>

<template>
  <header class="header-bar" data-testid="header-bar">
    <!-- Brand / Logo -->
    <div class="brand">
      <span class="brand-logo">AI</span>
      <span>Agent Console</span>
      <span class="brand-version">v0.8</span>
    </div>

    <span class="divider" />

    <!-- Tabs -->
    <nav class="tabs">
      <button type="button" class="tab tab-active" data-testid="header-tab-active">
        Run
      </button>
      <button type="button" class="tab tab-inactive">Traces</button>
    </nav>

    <div class="spacer" />

    <!-- Token group -->
    <div class="token-group">
      <span class="label">model</span>
      <span class="value mono">{{ agent.modelName }}</span>

      <span class="divider small" />

      <span class="kv">
        <span class="dot" style="background: #7ec8ff" />
        <span class="label">in</span>
        <span class="value mono" style="color: #7ec8ff" data-testid="header-bar-latest-prompt">
          {{ formatTokens(agent.latestUsage?.promptTokens) }}
        </span>
      </span>
      <span class="kv">
        <span class="dot" style="background: #c8a4ff" />
        <span class="label">out</span>
        <span class="value mono" style="color: #c8a4ff" data-testid="header-bar-latest-completion">
          {{ formatTokens(agent.latestUsage?.completionTokens) }}
        </span>
      </span>

      <span class="divider small" />

      <span class="kv">
        <span class="dot" style="background: #4a7ba8" />
        <span class="label">Σin</span>
        <span class="value mono" style="color: #5d9bd5" data-testid="header-bar-session-prompt">
          {{ formatTokens(agent.sessionUsage.promptTokens) }}
        </span>
      </span>
      <span class="kv">
        <span class="dot" style="background: #8a6ab2" />
        <span class="label">Σout</span>
        <span class="value mono" style="color: #a285cc" data-testid="header-bar-session-completion">
          {{ formatTokens(agent.sessionUsage.completionTokens) }}
        </span>
      </span>

      <span class="divider small" />

      <span class="label">ctx</span>
      <span class="value mono">
        {{ formatTokens(agent.runSummary?.peakPromptTokens) }}
        <span class="label">/ {{ formatTokens(agent.contextLimit) }}</span>
      </span>
      <div class="ctx-bar">
        <div
          class="ctx-bar-fill"
          :style="{
            width: `${pct(agent.runSummary?.peakPromptTokens, agent.contextLimit)}%`,
            background: barColor,
          }"
        />
      </div>
    </div>

    <span class="divider" />

    <!-- Status pill -->
    <span
      class="status-pill"
      :style="{
        background: STATUS[agent.status].bg,
        color: STATUS[agent.status].color,
        boxShadow: `inset 0 0 0 1px ${STATUS[agent.status].ring}`,
      }"
      data-testid="header-bar-status"
    >
      <span class="status-dot" :style="{ background: STATUS[agent.status].dotColor }" />
      {{ STATUS[agent.status].label }}
    </span>
  </header>
</template>

<style lang="scss" scoped>
@use '@/views/agent/styles/tokens' as t;

.header-bar {
  display: flex;
  align-items: center;
  gap: t.$space-4;
  padding: 0 t.$space-4;
  height: t.$navbar-height;
  background: t.$bg-panel;                                 // 🆕 #161a22
  border-bottom: 1px solid t.$border;                      // 🆕 #232830
  color: t.$fg;
  font-size: t.$font-size-md;
  flex-shrink: 0;
  user-select: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: t.$space-2;
  font-weight: t.$font-weight-semibold;
  flex-shrink: 0;
}

.brand-logo {
  width: 24px;
  height: 24px;
  border-radius: t.$radius-sm;                             // 🆕 4px
  background: linear-gradient(135deg, t.$accent-strong, t.$info);  // 🆕 emerald → blue (克制)
  display: flex;
  align-items: center;
  justify-content: center;
  color: t.$bg-base;                                       // 🆕 #0e1117
  font-weight: t.$font-weight-bold;
  font-size: 11px;
}

.brand-version {
  color: t.$fg-faint;
  font-size: t.$font-size-xs;
  font-family: t.$font-mono;
}

.divider {
  width: 1px;
  height: 20px;
  background: t.$border;
  flex-shrink: 0;

  &.small {
    height: 16px;
  }
}

.tabs {
  display: flex;
  align-items: center;
  gap: t.$space-1;
  flex-shrink: 0;
}

.tab {
  padding: 0 10px;
  height: 28px;
  border-radius: t.$radius-md;                             // 🆕 6px
  font-size: t.$font-size-sm;
  display: inline-flex;
  align-items: center;
  gap: t.$space-2;
  border: none;
  background: transparent;
  cursor: pointer;
  transition:
    background t.$dur-fast t.$ease-base,
    color t.$dur-fast t.$ease-base;
  font-family: inherit;
}

.tab-active {
  background: t.$accent-soft;
  color: t.$accent;
  box-shadow: inset 0 0 0 1px rgba(t.$accent, 0.30);       // 🆕 emerald soft
}

.tab-inactive {
  color: t.$fg-muted;

  &:hover {
    background: t.$bg-hover;                              // 🆕 rgba(255,255,255,0.04)
    color: t.$fg;
  }
}

.spacer {
  flex: 1;
}

.token-group {
  display: flex;
  align-items: center;
  gap: t.$space-3;                                         // 🆕 12px
  font-size: 11.5px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;                    // 🆕 等宽数字
}

.label {
  color: t.$fg-muted;
}

.value {
  color: t.$fg;
}

.mono {
  font-family: t.$font-mono;
}

.kv {
  display: flex;
  align-items: center;
  gap: t.$space-2;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.ctx-bar {
  width: 56px;
  height: 4px;
  background: t.$border;
  border-radius: 2px;
  overflow: hidden;
}

.ctx-bar-fill {
  height: 100%;
  transition: width t.$dur-slow t.$ease-out;                 // 🆕 300ms ease-out
  transform-origin: left;
}

.status-pill {
  padding: 0 t.$space-2;
  height: 26px;
  border-radius: t.$radius-md;                             // 🆕 6px
  display: inline-flex;
  align-items: center;
  gap: t.$space-2;
  font-size: t.$font-size-xs;
  font-weight: t.$font-weight-medium;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  transition:
    background t.$dur-base t.$ease-base,
    color t.$dur-base t.$ease-base;                          // 🆕 状态切换平滑过渡
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background t.$dur-base t.$ease-base;
}
</style>
