<script setup lang="ts">
import { computed } from 'vue';
import type { DoneEvent, ErrorEvent, PhaseEvent } from '../../../../libs/api-schema/src/index.js';

const props = defineProps<{
  phases: readonly PhaseEvent[];
  done: DoneEvent | null;
  error: ErrorEvent | null;
}>();

const PHASE_LABELS: Record<string, string> = {
  fetch: 'fetch',
  diff: 'diff',
  embed: 'embed',
  write: 'write',
};

const ordered = computed(() => {
  const order = ['fetch', 'diff', 'embed', 'write'] as const;
  return order.map((name) => ({
    name,
    event: props.phases.find((p) => p.name === name) ?? null,
  }));
});
</script>

<template>
  <div class="space-y-2 rounded border border-gray-200 bg-white p-4">
    <h3 class="text-sm font-semibold text-gray-700">入库进度</h3>
    <div class="space-y-1">
      <div v-for="row in ordered" :key="row.name" class="flex items-center gap-3 text-sm">
        <span class="w-16 text-gray-500">{{ PHASE_LABELS[row.name] }}</span>
        <span v-if="row.event" class="text-green-600">
          ✓ {{ row.event.ms }}ms · {{ JSON.stringify(row.event.payload) }}
        </span>
        <span v-else-if="error" class="text-red-600">✗ 失败</span>
        <span v-else class="animate-pulse text-blue-500">…</span>
      </div>
    </div>
    <div v-if="done" class="mt-3 border-t pt-2 text-xs text-gray-600">
      done: +{{ done.added }} added, +{{ done.modified }} modified, -{{ done.removed }} removed ({{
        done.totalMs
      }}ms)
    </div>
    <div v-if="error" class="mt-3 border-t pt-2 text-xs text-red-600">
      error: {{ error.message }}
      <pre v-if="error.stderrTail" class="mt-1 max-h-24 overflow-auto bg-gray-50 p-2">{{
        error.stderrTail
      }}</pre>
    </div>
  </div>
</template>
