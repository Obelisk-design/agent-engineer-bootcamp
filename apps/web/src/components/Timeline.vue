<script setup lang="ts">
import TimelineItemVue from './TimelineItem.vue';
import type { TimelineItem } from '../types/agentEvent.js';

defineProps<{
  items: ReadonlyArray<TimelineItem>;
}>();
</script>

<template>
  <section class="panel timeline-panel">
    <div class="panel-header">Execution Timeline</div>
    <div id="timeline-body" class="panel-body" data-testid="timeline">
      <div v-if="items.length === 0" class="empty-hint">Waiting for execution…</div>
      <TimelineItemVue
        v-for="item in items"
        :key="item.id"
        :timeline-id="item.id"
        :title="item.title"
        :detail="item.detail"
        :status="item.status"
        :kind="item.kind"
        :meta="item.meta"
      />
    </div>
  </section>
</template>