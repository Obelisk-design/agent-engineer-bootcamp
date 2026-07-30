<!--
  apps/web/src/components/TimelineItem.vue

  一条 AgentEvent 步骤 — LangSmith / Trace 风格的纵向连接线。
  - 左 32px 列：SVG icon (蓝/绿/琥珀/紫/红) + 连贯到下一条的竖线
  - 右 main：meta 摘要（model, tokens, messages）始终可见
  - detail 默认折叠，点击 header 展开/收起

  data-timeline-iter=N 给 scrollToIteration 用
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

const ICON_COLOR: Record<string, string> = {
  message_start: 'text-emerald-400',
  iteration: 'text-zinc-400',
  request: 'text-sky-400',
  response: 'text-sky-400',
  tool_call: 'text-amber-400',
  tool_result: 'text-violet-400',
  message_end: 'text-emerald-400',
  run_summary: 'text-zinc-400',
  done: 'text-emerald-400',
  error: 'text-red-400',
  context: 'text-zinc-400',
};

function iconColor(): string {
  return ICON_COLOR[props.kind] ?? 'text-zinc-400';
}

function metaEntries(): Array<readonly [string, string]> {
  if (props.meta === undefined || props.meta === null) return [];
  return Object.entries(props.meta).map(([k, v]) => [
    k,
    typeof v === 'string' ? v : JSON.stringify(v),
  ] as const);
}

function padSeq(): string {
  return `#${String(props.timelineId).padStart(3, '0')}`;
}
</script>

<script lang="ts">
import { defineComponent } from 'vue';
</script>

<template>
  <div
    :data-timeline-id="timelineId"
    :data-timeline-iter="iterAttr"
    class="relative flex gap-3 pl-2 pr-4 py-2 group"
  >
    <!-- 左 32px 列：icon + 贯穿到下一条的连接线 -->
    <div class="relative w-6 shrink-0 flex flex-col items-center">
      <!-- 上半连接线：直到第一个圆点 -->
      <div class="flex-1 w-px bg-zinc-800" />
      <!-- icon 圆 -->
      <div
        :class="['w-6 h-6 rounded-full bg-zinc-900 border flex items-center justify-center my-1', iconColor(), props.status === 'active' ? 'border-sky-500 ring-4 ring-sky-500/15' : props.status === 'error' ? 'border-red-500' : 'border-zinc-700']"
      >
        <component :is="iconComp()" :size="12" />
      </div>
      <!-- 下半连接线 -->
      <div v-if="!props.last" class="flex-1 w-px bg-zinc-800" />
    </div>

    <!-- 右 main -->
    <div class="flex-1 min-w-0 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors border border-zinc-800/60">
      <button
        type="button"
        class="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        @click="expanded = !expanded"
      >
        <span class="font-mono text-zinc-600 text-[10.5px] shrink-0">{{ padSeq() }}</span>
        <span :class="['font-semibold text-[12.5px]', props.status === 'error' ? 'text-red-300' : props.status === 'active' ? 'text-sky-300' : 'text-zinc-100']">
          {{ title }}
        </span>
        <span class="flex-1" />
        <component
          :is="expanded ? IconChevronDown : IconChevronRight"
          :size="12"
          class="text-zinc-500 transition-transform"
        />
      </button>

      <!-- meta 摘要 -->
      <div
        v-if="metaEntries().length > 0"
        class="px-3 pb-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]"
      >
        <div
          v-for="[k, v] in metaEntries()"
          :key="k"
          class="flex gap-2 truncate"
        >
          <span class="text-zinc-500 uppercase tracking-wider shrink-0">{{ k }}</span>
          <span class="text-zinc-300 font-mono truncate">{{ v }}</span>
        </div>
      </div>

      <!-- detail 折叠 -->
      <div
        v-if="detail !== null"
        v-show="expanded"
        class="px-3 pb-3 pt-2 border-t border-zinc-800/60"
      >
        <CodeBlock :text="detail" />
      </div>
    </div>
  </div>
</template>
