<!--
  apps/web/src/components/TimelineItem.vue

  Day 23 Task 5 (P4) + Phase U (Task 6) —— 一条 AgentEvent 步骤（premium 版）

  - 左 32px 列：SVG icon + 连贯到下一条的竖线
  - 右 main：meta 摘要（model, tokens, messages）始终可见
  - detail 默认折叠，点击 header 展开/收起
  - data-timeline-iter=N 给 scrollToIteration 用

  Phase U 改造（视觉 + 动画，**props / emits / 业务逻辑零改动**）：
  - Tailwind utility → scoped SCSS + token
  - status 变化（active → done）：scale + 颜色 150ms 过渡
  - 颜色 / 间距 / 圆角 / 字号走 token
  - icon 颜色映射改为 SCSS 变量查询
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IconCircleDot,
  IconRefresh,
  IconArrowUp,
  IconArrowDown,
  IconWrench,
  IconCheck,
  IconClose,
  IconBolt,
  IconLayers,
  IconPlay,
  IconChevronDown,
  IconChevronRight,
} from './icons.js';
import CodeBlock from './CodeBlock.vue';

const props = defineProps<{
  timelineId: number;
  title: string;
  detail: string | null;
  status: 'done' | 'active' | 'error';
  kind: string;
  meta?: Record<string, unknown> | null | undefined;
  iteration?: number | null;
  last?: boolean;
}>();
const expanded = ref<boolean>(false);

const iterAttr = computed<string>(() => {
  if (props.iteration !== null && props.iteration !== undefined) return String(props.iteration);
  return '';
});

function iconComp() {
  if (props.status === 'error') return IconClose;
  if (props.kind === 'message_start' || props.kind === 'done') return IconPlay;
  if (props.kind === 'iteration') return IconRefresh;
  if (props.kind === 'request') return IconArrowUp;
  if (props.kind === 'response') return IconArrowDown;
  if (props.kind === 'tool_call') return IconWrench;
  if (props.kind === 'tool_result') return IconCheck;
  if (props.kind === 'message_end') return IconBolt;
  if (props.kind === 'run_summary') return IconLayers;
  if (props.kind === 'context') return IconCircleDot;
  return IconCircleDot;
}

// 🆕 Phase U：icon 颜色走 token（SCSS class）
const ICON_KIND: Record<string, string> = {
  message_start: 'kind--emerald',
  iteration: 'kind--muted',
  request: 'kind--sky',
  response: 'kind--sky',
  tool_call: 'kind--amber',
  tool_call_start: 'kind--amber',
  tool_call_end: 'kind--amber',
  tool_result: 'kind--violet',
  message_end: 'kind--emerald',
  run_summary: 'kind--muted',
  done: 'kind--emerald',
  error: 'kind--red',
  context: 'kind--muted',
};

function iconKindClass(): string {
  return ICON_KIND[props.kind] ?? 'kind--muted';
}

function metaEntries(): Array<readonly [string, string]> {
  if (props.meta === undefined || props.meta === null) return [];
  return Object.entries(props.meta).map(
    ([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as const,
  );
}

function padSeq(): string {
  return `#${String(props.timelineId).padStart(3, '0')}`;
}
</script>

<template>
  <div
    :data-timeline-id="timelineId"
    :data-timeline-iter="iterAttr"
    class="item"
    :class="[`status--${props.status}`]"
  >
    <!-- 左 32px 列：icon + 贯穿到下一条的连接线 -->
    <div class="left">
      <div class="line line--top" />
      <div class="dot" :class="[`dot--${props.status}`, iconKindClass()]">
        <component :is="iconComp()" :size="12" />
      </div>
      <div v-if="!props.last" class="line line--bottom" />
    </div>

    <!-- 右 main -->
    <div class="card">
      <button
        type="button"
        class="head"
        :class="{ 'head--error': props.status === 'error', 'head--active': props.status === 'active' }"
        @click="expanded = !expanded"
      >
        <span class="seq mono">{{ padSeq() }}</span>
        <span
          class="title"
          :class="{
            'title--error': props.status === 'error',
            'title--active': props.status === 'active',
          }"
        >
          {{ title }}
        </span>
        <span class="spacer" />
        <component
          :is="expanded ? IconChevronDown : IconChevronRight"
          :size="12"
          class="chevron"
        />
      </button>

      <!-- meta 摘要 -->
      <div
        v-if="metaEntries().length > 0"
        class="meta"
      >
        <div v-for="[k, v] in metaEntries()" :key="k" class="meta-row">
          <span class="meta-key">{{ k }}</span>
          <span class="meta-val mono">{{ v }}</span>
        </div>
      </div>

      <!-- detail 折叠 -->
      <div
        v-if="detail !== null"
        v-show="expanded"
        class="detail"
      >
        <CodeBlock :text="detail" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/views/agent/styles/tokens' as t;

.item {
  display: flex;
  gap: t.$space-3;
  padding: t.$space-1 t.$space-1;             // 4px token
  transition: transform t.$dur-fast t.$ease-base;  // 🆕 status scale 过渡
}

.left {
  position: relative;
  width: 24px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.line {
  width: 1px;
  background: t.$border;
  flex: 1;

  &--top { min-height: 4px; }
  &--bottom { min-height: 4px; }
}

.dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: t.$bg-elevated;
  border: 1px solid t.$border-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 2px 0;
  transition:
    border-color t.$dur-fast t.$ease-base,
    box-shadow t.$dur-fast t.$ease-base,
    transform t.$dur-fast t.$ease-base;       // 🆕 status 变化 scale 过渡

  // 🆕 状态变化（active → done）颜色 + scale 平滑过渡
  &--active {
    border-color: t.$info;
    box-shadow: 0 0 0 4px t.$info-soft;
  }
  &--error {
    border-color: t.$danger;
    box-shadow: 0 0 0 3px t.$danger-soft;
  }
}

// 🆕 Phase U：kind 颜色映射走 token
.kind--emerald { color: t.$accent-strong; }
.kind--sky     { color: t.$info; }
.kind--amber   { color: t.$warn; }
.kind--violet  { color: #a78bfa; }
.kind--red     { color: t.$danger; }
.kind--muted   { color: t.$fg-muted; }

.card {
  flex: 1;
  min-width: 0;
  border-radius: t.$radius-md;
  background: rgba(t.$bg-elevated, 0.50);
  border: 1px solid rgba(t.$border, 0.60);
  transition:
    background t.$dur-fast t.$ease-base,
    border-color t.$dur-fast t.$ease-base;

  &:hover {
    background: rgba(t.$bg-elevated, 0.85);
    border-color: t.$border;
  }
}

.head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: t.$space-2;
  padding: t.$space-2 t.$space-3;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  color: t.$fg;
  border-radius: t.$radius-md;

  &--error {
    color: t.$danger;
  }
  &--active {
    color: t.$info;
  }
}

.seq {
  font-family: t.$font-mono;
  color: t.$fg-faint;
  font-size: 10.5px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.title {
  font-weight: t.$font-weight-semibold;
  font-size: 12.5px;
  color: t.$fg-strong;

  &--error {
    color: t.$danger;
  }
  &--active {
    color: t.$info;
  }
}

.spacer { flex: 1; }

.chevron {
  color: t.$fg-muted;
  transition: transform t.$dur-fast t.$ease-base;
}

.meta {
  padding: 0 t.$space-3 t.$space-2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: t.$space-4;
  row-gap: 2px;
  font-size: t.$font-size-xs;
}

.meta-row {
  display: flex;
  gap: t.$space-2;
  min-width: 0;
}

.meta-key {
  color: t.$fg-muted;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
  font-size: 10px;
}

.meta-val {
  color: t.$fg;
  font-family: t.$font-mono;
  font-size: 10.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.detail {
  padding: 0 t.$space-3 t.$space-3;
  border-top: 1px solid t.$border;
  margin-top: t.$space-1;
  padding-top: t.$space-2;
}

// 🆕 Phase U：active 状态下 dot scale 微微放大
.status--active .dot {
  transform: scale(1.08);
}
</style>
