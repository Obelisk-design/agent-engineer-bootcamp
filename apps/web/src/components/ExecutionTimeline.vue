<!--
  apps/web/src/components/ExecutionTimeline.vue

  Day 23 Task 5 (P4) + Phase U (Task 6) —— Inline timeline（premium 版）

  - 内嵌 RightPanel，不引入独立布局
  - 自身不维持滚动容器，依赖父级 .timeline-content
  - TimelineItem v-for + status 变化驱动视觉

  Phase U 改造：
  - <TransitionGroup> name="step" 让新事件 enter 走 fadeSlideUp
  - 颜色 / 间距走 token
  - 业务逻辑零改动（仍只 export scrollToIteration）
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
  <div
    v-if="items.length > 0"
    class="timeline-list"
    data-testid="execution-timeline"
  >
    <TransitionGroup name="step">
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
    </TransitionGroup>
  </div>
  <div v-else class="empty">
    <span class="empty-dot" />
    waiting for first event…
  </div>
</template>

<style lang="scss" scoped>
@use '@/views/agent/styles/tokens' as t;

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: t.$space-2;
  padding: 0 t.$space-3;                  // 🆕 12px token
}

.empty {
  font-size: t.$font-size-xs;
  color: t.$fg-faint;
  font-style: italic;
  padding: t.$space-5 t.$space-4;
  display: flex;
  align-items: center;
  gap: t.$space-2;
}

.empty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: t.$fg-faint;
  animation: pulseSoft 1.6s ease-in-out infinite;
}

// 进入动画：fadeSlideUp + 微缩放
.step-enter-active {
  animation: fadeSlideUp t.$dur-base t.$ease-out both;
}
.step-leave-active {
  transition: opacity t.$dur-fast t.$ease-in;
}
.step-leave-to {
  opacity: 0;
}
</style>
