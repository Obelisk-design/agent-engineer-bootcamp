<!--
  apps/web/src/components/Timeline.vue

  Execution Timeline 面板 —— 右栏展示每条 AgentEvent 卡片。
  - collapsible: 折叠详情（LLM 请求 / 响应 JSON）
  - status: done / active / error 决定左侧色条 + 图标颜色
-->

<script setup lang="ts">
interface TimelineItem {
  readonly id: number;
  readonly label: string;
  readonly detail: string | null;
  readonly status: 'done' | 'active' | 'error';
  readonly collapsible: boolean;
  readonly collapsibleOpen: boolean;
  readonly summaryText: string | null;
}

defineProps<{
  items: ReadonlyArray<TimelineItem>;
}>();

function iconFor(status: TimelineItem['status']): string {
  if (status === 'error') return '✗';
  if (status === 'active') return '…';
  return '✓';
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">Execution Timeline</div>
    <div id="timeline-body" class="panel-body" data-testid="timeline">
      <div v-if="items.length === 0" class="empty-hint" style="font-size: 12px">
        等待任务
      </div>
      <div
        v-for="item in items"
        :key="item.id"
        :class="['timeline-step', item.status]"
      >
        <div class="icon">{{ iconFor(item.status) }}</div>
        <div class="body">
          <div class="step-label">{{ item.label }}</div>
          <details v-if="item.collapsible && item.detail !== null" :open="item.collapsibleOpen">
            <summary>{{ item.summaryText ?? '查看详情' }}</summary>
            <pre class="step-detail">{{ item.detail }}</pre>
          </details>
          <pre v-else-if="item.detail !== null" class="step-detail">{{ item.detail }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>