<!--
  apps/web/src/components/ExecutionTimeline.vue

  Inline timeline — 内嵌 RightPanel，不引入独立布局。
  自身不维持滚动容器，依赖父级。
-->

<script setup lang="ts">
import type { TimelineItem as Item } from '../types/agentEvent.js';
import TimelineItemComp from './TimelineItem.vue';

defineProps<{
  items: ReadonlyArray<Item>;
}>();

function scrollInto(iter: number): void {
  queueMicrotask(() => {
    const el = document.querySelector(
      `[data-timeline-iter="${String(iter)}"]`,
    ) as HTMLElement | null;
    if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// 仅 export scrollToIteration；TimelineItem 仍自己管滚动
defineExpose({ scrollToIteration: scrollInto });
</script>

<template>
  <div v-if="items.length > 0" class="space-y-1.5" data-testid="execution-timeline">
    <TimelineItemComp
      v-for="(item, idx) in items"
      :key="item.id"
      :timeline-id="item.id"
      :title="item.title"
      :detail="item.detail"
      :status="item.status"
      :kind="item.kind"
      :meta="item.meta"
      :last="idx === items.length - 1"
    />
  </div>
  <div v-else class="text-[11px] text-zinc-500 italic">waiting for first event…</div>
</template>
