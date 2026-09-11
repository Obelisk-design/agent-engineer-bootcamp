<!--
  apps/web/src/components/RightPanel.vue

  右侧 second panel —— 三段式：Context Window 摘要 / Iterations 列表 / Execution Timeline。
  数据流：useAgentStore() —— contexts / runSummary / timeline / scrollToIteration。
-->
<script setup lang="ts">
import { useAgentStore } from '@/store/modules/agent';
import ExecutionTimeline from './ExecutionTimeline.vue';

const agent = useAgentStore();

function pct(tokens: number, limit: number): number {
  return Math.min(100, Math.round((tokens / limit) * 100));
}
function barColor(p: number): string {
  if (p < 50) return '#67c23a';
  if (p <= 80) return '#e6a23c';
  return '#f56c6c';
}
function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function current(): number | null {
  const last = agent.runContexts[agent.runContexts.length - 1];
  return last === undefined ? null : last.promptTokens;
}
function peak(): number | null {
  return agent.runSummary?.peakPromptTokens ?? null;
}
function total(): number | null {
  return agent.runSummary === null
    ? null
    : agent.runSummary.totalPromptTokens + agent.runSummary.totalCompletionTokens;
}
</script>

<template>
  <aside class="right-panel" data-testid="right-panel">
    <!-- ========== Context Window 摘要 ========== -->
    <section class="block">
      <header class="block-header">
        <span class="block-icon" style="background: #67c23a">⚙</span>
        <h3 class="block-title">Context Window</h3>
      </header>

      <div class="kv-list">
        <div class="kv-row">
          <span class="label">Current</span>
          <span class="value mono">{{ formatTokens(current()) }}</span>
        </div>
        <div class="kv-row">
          <span class="label">Peak</span>
          <span class="value mono" style="color: #e6a23c">{{ formatTokens(peak()) }}</span>
        </div>
        <div class="kv-row">
          <span class="label">Total</span>
          <span class="value mono">{{ formatTokens(total()) }}</span>
        </div>
        <div class="kv-row kv-row-divider">
          <span class="label">Iterations</span>
          <span class="value mono">{{ agent.runSummary?.iterations ?? '—' }}</span>
        </div>
      </div>
    </section>

    <!-- ========== Iterations 详细 ========== -->
    <section v-if="agent.runContexts.length > 0" class="block">
      <header class="block-header">
        <span class="block-icon" style="background: #909399">≡</span>
        <h3 class="block-title">Iterations</h3>
      </header>
      <ul class="iter-list">
        <li
          v-for="ctx in agent.runContexts"
          :key="ctx.iteration"
          class="iter-item"
          @click="agent.scrollToIteration(ctx.iteration)"
        >
          <div class="iter-meta">
            <span class="label mono">Iter {{ ctx.iteration }}</span>
            <span class="value mono">{{ formatTokens(ctx.promptTokens) }}</span>
          </div>
          <div class="ctx-bar">
            <div
              class="ctx-bar-fill"
              :style="{
                width: `${pct(ctx.promptTokens, ctx.limit)}%`,
                background: barColor(pct(ctx.promptTokens, ctx.limit)),
              }"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- ========== Execution Timeline ========== -->
    <section class="block block-flex">
      <header class="block-header block-header-row">
        <div class="block-header-left">
          <span class="block-icon" style="background: #67c23a">▶</span>
          <h3 class="block-title">Execution Timeline</h3>
        </div>
        <span class="value mono" style="font-size: 10.5px; color: #808080">
          {{ agent.timeline.length }} step{{ agent.timeline.length === 1 ? '' : 's' }}
        </span>
      </header>
      <div class="timeline-scroll">
        <ExecutionTimeline :items="agent.timeline" />
      </div>
    </section>
  </aside>
</template>

<style lang="scss" scoped>
.right-panel {
  width: 320px;
  flex-shrink: 0;
  background: #181818;
  border-left: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.block {
  padding: 16px;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;

  &.block-flex {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 0;
  }
}

.block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;

  &.block-header-row {
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid #2a2a2a;
    margin-bottom: 0;
  }
}

.block-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: #181818;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.block-title {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #a0a0a0;
  font-weight: 600;
  margin: 0;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12px;

  &.kv-row-divider {
    padding-top: 8px;
    border-top: 1px solid #2a2a2a;
  }
}

.label {
  color: #808080;
}

.value {
  color: #e5e5e5;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.iter-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.iter-item {
  border-radius: 4px;
  padding: 6px;
  cursor: pointer;
  transition: background 0.12s;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }
}

.iter-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
}

.ctx-bar {
  width: 100%;
  height: 4px;
  background: #2a2a2a;
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
}

.ctx-bar-fill {
  height: 100%;
  transition: width 0.2s;
}

.timeline-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}
</style>
