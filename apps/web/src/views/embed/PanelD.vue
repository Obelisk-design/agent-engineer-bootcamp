<!--
  apps/web/src/views/embed/PanelD.vue
  Panel D: query + 4 prefix variants — visualize distance gradient.
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  QUERY_WITH_PREFIXES,
  cosineDistance,
} from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const QUERY = 'The cat is a friendly animal';

interface Row {
  name: string;
  text: string;
  distance: number;
}

const rows = ref<Row[] | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);
const maxD = computed(() => (rows.value ? Math.max(...rows.value.map((r) => r.distance)) : 1));

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  rows.value = null;
  warnDevKeyOnce();
  try {
    const all = [QUERY, ...QUERY_WITH_PREFIXES.map((p) => p.text)];
    const vectors = await embedTexts(all, 4096);
    const queryVec = vectors[0]!;
    rows.value = QUERY_WITH_PREFIXES.map((p, i) => ({
      name: p.name,
      text: p.text,
      distance: cosineDistance(queryVec, vectors[i + 1]!),
    }));
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel D · 距离梯度（query + 4 前缀变体）</h2>
    <p class="text-xs text-zinc-400 mb-2">
      query: <code class="text-zinc-200">"{{ QUERY }}"</code>
    </p>
    <button class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50" :disabled="busy" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding query + variants…</p>
    <ul v-else-if="rows" class="mt-3 space-y-2 text-xs">
      <li v-for="r in rows" :key="r.name" class="flex items-center gap-3">
        <span class="w-28 text-zinc-400">{{ r.name }}</span>
        <div class="flex-1 bg-zinc-800 rounded h-3 overflow-hidden">
          <div class="h-full bg-rose-500" :style="{ width: ((r.distance / maxD) * 100) + '%' }" />
        </div>
        <span class="w-16 text-right text-zinc-300">{{ r.distance.toFixed(3) }}</span>
      </li>
    </ul>
  </section>
</template>
