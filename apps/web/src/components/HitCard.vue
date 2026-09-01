<script setup lang="ts">
import { computed } from 'vue';
import type { Hit } from '../../../../libs/api-schema/src/index.js';

const props = defineProps<{ hit: Hit; rank: number }>();

const scorePct = computed(() =>
  // hit.score = cosine similarity ∈ [0,1]，越大越相似 → 直接当百分比用
  Math.max(0, Math.min(100, Math.round(props.hit.score * 100))),
);

const segments = computed(() => {
  // 把 content 按 highlight 区间切成 [text, highlight, text, ...]
  const sorted = [...props.hit.highlight].sort((a, b) => a.start - b.start);
  const out: Array<{ text: string; highlighted: boolean; term: string }> = [];
  let cursor = 0;
  for (const h of sorted) {
    if (h.start > cursor) {
      out.push({ text: props.hit.content.slice(cursor, h.start), highlighted: false, term: '' });
    }
    out.push({
      text: props.hit.content.slice(h.start, h.end),
      highlighted: true,
      term: h.term,
    });
    cursor = h.end;
  }
  if (cursor < props.hit.content.length) {
    out.push({ text: props.hit.content.slice(cursor), highlighted: false, term: '' });
  }
  return out;
});
</script>

<template>
  <div class="rounded border border-gray-200 bg-white p-4 shadow-sm">
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <span class="rounded bg-gray-100 px-2 py-0.5">#{{ rank }}</span>
        <span class="rounded bg-blue-50 px-2 py-0.5">{{ hit.chunkKind }}</span>
        <span>{{ hit.sourceKind }} / {{ hit.sourceLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="h-2 w-32 rounded bg-gray-100">
          <div class="h-2 rounded bg-blue-500" :style="{ width: `${scorePct}%` }"></div>
        </div>
        <span class="text-xs text-gray-600">{{ hit.score.toFixed(3) }}</span>
      </div>
    </div>
    <div class="whitespace-pre-wrap text-sm text-gray-800">
      <template v-for="(seg, i) in segments" :key="i">
        <mark v-if="seg.highlighted" class="bg-yellow-200">{{ seg.text }}</mark>
        <template v-else>{{ seg.text }}</template>
      </template>
    </div>
  </div>
</template>
