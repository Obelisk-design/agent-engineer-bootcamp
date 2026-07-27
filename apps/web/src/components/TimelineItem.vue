<script setup lang="ts">
interface Props {
  title: string;
  detail: string | null;
  status: 'done' | 'active' | 'error';
  kind: string;
  meta?: Record<string, unknown> | null;
}

const props = defineProps<Props>();

function iconFor(status: Props['status']): string {
  if (status === 'error') return '✕';
  if (status === 'active') return '↳';
  return '✓';
}

function formatMeta(meta: Record<string, unknown> | null | undefined): string[] {
  if (meta === undefined || meta === null) return [];
  return Object.entries(meta).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}
</script>

<template>
  <div :class="['timeline-item', props.status]">
    <div class="timeline-icon">{{ iconFor(props.status) }}</div>
    <div class="timeline-body">
      <div class="timeline-title">{{ props.title }}</div>
      <div v-if="props.kind === 'request' && props.meta" class="timeline-meta">
        <div v-for="(entry, idx) in formatMeta(props.meta)" :key="idx">{{ entry }}</div>
      </div>
      <div v-if="props.kind === 'response' && props.meta" class="timeline-meta">
        <div v-for="(entry, idx) in formatMeta(props.meta)" :key="idx">{{ entry }}</div>
      </div>
      <pre v-if="props.detail !== null" class="timeline-detail">{{ props.detail }}</pre>
    </div>
  </div>
</template>
