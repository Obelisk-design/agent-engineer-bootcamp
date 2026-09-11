<!--
  apps/web/src/components/RightPanel.vue

  Day 23 Task 5 (P4) + Phase U (Task 6) —— 右侧 second panel（premium 版）

  三段式：Context Window 摘要 / Iterations 列表 / Execution Timeline
  数据流：useAgentStore() —— contexts / runSummary / timeline / scrollToIteration

  Phase U 视觉 polish：
  - 取消 .timeline-scroll 的 overflow-y: auto —— 整个 .right-panel 唯一滚动容器
  - Context / Iterations / Timeline 三块在面板内依次排列，自适应挤压
  - 颜色 / 间距 / 圆角 / 字号走 token（设计语言统一）
  - kv-row hover 走 t.$bg-hover（rgba(255,255,255,0.04)）
  - ctx-bar fill 用 cubic-bezier ease-out 300ms 平滑生长
-->
<script setup lang="ts">
import { useAgentStore } from '@/store/modules/agent';
import ExecutionTimeline from './ExecutionTimeline.vue';

const agent = useAgentStore();

function pct(tokens: number, limit: number): number {
  return Math.min(100, Math.round((tokens / limit) * 100));
}
function barColor(p: number): string {
  if (p < 50) return '#4ade80';                                  // 🆕 token t.$accent
  if (p <= 80) return '#f5b942';                                 // 🆕 token t.$warn
  return '#f87171';                                              // 🆕 token t.$danger
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
        <span class="block-icon block-icon--green">⚙</span>
        <h3 class="block-title">Context Window</h3>
      </header>

      <div class="kv-list">
        <div class="kv-row">
          <span class="label">Current</span>
          <span class="value mono">{{ formatTokens(current()) }}</span>
        </div>
        <div class="kv-row">
          <span class="label">Peak</span>
          <span class="value mono kv-emphasis">{{ formatTokens(peak()) }}</span>
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
        <span class="block-icon block-icon--muted">≡</span>
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
          <span class="block-icon block-icon--green">▶</span>
          <h3 class="block-title">Execution Timeline</h3>
        </div>
        <span class="value mono block-counter">
          {{ agent.timeline.length }} step{{ agent.timeline.length === 1 ? '' : 's' }}
        </span>
      </header>
      <!-- 🆕 Phase U：去掉嵌套 overflow-y，让 .right-panel 单滚动 -->
      <div class="timeline-content">
        <ExecutionTimeline :items="agent.timeline" />
      </div>
    </section>
  </aside>
</template>

<style lang="scss" scoped>
@use '@/views/agent/styles/tokens' as t;

.right-panel {
  width: t.$right-panel-width;
  flex-shrink: 0;
  background: t.$bg-panel;
  border-left: 1px solid t.$border;
  display: flex;
  flex-direction: column;
  overflow: hidden;                                       // 🆕 Phase U：仅此一层滚动
  overflow-y: auto;                                       // 🆕 内嵌滚动（如需）
  font-variant-numeric: tabular-nums;
}

.block {
  padding: t.$space-4;                                      // 🆕 16px
  border-bottom: 1px solid t.$border;
  flex-shrink: 0;

  &.block-flex {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;                                        // 🆕 flex 子项能收缩
    padding: 0;
  }
}

.block-header {
  display: flex;
  align-items: center;
  gap: t.$space-2;
  margin-bottom: t.$space-3;                                // 🆕 12px

  &.block-header-row {
    justify-content: space-between;
    padding: t.$space-3 t.$space-4;                           // 🆕 12/16
    border-bottom: 1px solid t.$border;
    margin-bottom: 0;
    background: t.$bg-base;                                 // 🆕 区段头与面板底色区分
  }
}

.block-header-left {
  display: flex;
  align-items: center;
  gap: t.$space-2;
}

.block-icon {
  width: 18px;
  height: 18px;
  border-radius: t.$radius-sm;
  color: t.$bg-base;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &--green {
    background: t.$accent-strong;                           // 🆕 emerald 主调
  }
  &--muted {
    background: t.$fg-faint;                                // 🆕 灰
  }
}

.block-title {
  font-size: t.$font-size-xs;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: t.$fg-muted;
  font-weight: t.$font-weight-semibold;
  margin: 0;
}

.block-counter {
  font-size: 10.5px;
  color: t.$fg-faint;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: t.$space-2;
}

.kv-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: t.$font-size-sm;
  padding: 2px 0;
  transition: background t.$dur-fast t.$ease-base;

  &.kv-row-divider {
    padding-top: t.$space-2;
    border-top: 1px solid t.$border;
    margin-top: t.$space-1;
  }
}

.kv-emphasis {
  color: t.$warn;                                            // 🆕 peak token 强调
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

.iter-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: t.$space-1;
}

.iter-item {
  border-radius: t.$radius-sm;
  padding: t.$space-2;
  cursor: pointer;
  transition: background t.$dur-fast t.$ease-base;

  &:hover {
    background: t.$bg-hover;
  }
}

.iter-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: t.$font-size-xs;
}

.ctx-bar {
  width: 100%;
  height: 4px;
  background: t.$border;
  border-radius: 2px;
  overflow: hidden;
  margin-top: t.$space-1;
}

.ctx-bar-fill {
  height: 100%;
  transition: width t.$dur-slow t.$ease-out;                  // 🆕 300ms ease-out
  transform-origin: left;
}

.timeline-content {
  flex: 1;
  min-height: 0;
  padding: t.$space-3 0;                                    // 🆕 12/0
  // 🆕 Phase U：移除 overflow-y: auto —— 让 .right-panel 单滚动
}
</style>
