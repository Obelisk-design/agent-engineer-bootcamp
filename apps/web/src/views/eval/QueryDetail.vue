<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchDataset, type EvalQueryView } from './api.js';

const queries = ref<readonly EvalQueryView[]>([]);
const selectedId = ref<string | null>(null);
const total = ref(0);
const humanReviewed = ref(0);
const err = ref<string | null>(null);

onMounted(async () => {
  try {
    const r = await fetchDataset();
    queries.value = r.queries;
    total.value = r.total;
    humanReviewed.value = r.humanReviewed;
    selectedId.value = r.queries[0]?.id ?? null;
  } catch (e) {
    err.value = (e as Error).message;
  }
});

const selected = (): EvalQueryView | undefined =>
  queries.value.find((q) => q.id === selectedId.value);
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold">🔍 查询详情</h2>
    <p v-if="err" class="text-red-600">❌ {{ err }}</p>
    <p class="text-sm text-gray-600">
      GT 集 {{ total }} 条 · humanReviewed {{ humanReviewed }}/{{ total }}
    </p>

    <div v-if="queries.length > 0" class="grid grid-cols-3 gap-4">
      <select v-model="selectedId" class="border rounded px-2 py-1 text-sm col-span-1 h-96 overflow-auto">
        <option v-for="q in queries" :key="q.id" :value="q.id">
          {{ q.id }} {{ q.query.slice(0, 30) }}
        </option>
      </select>

      <div v-if="selected()" class="col-span-2 space-y-3">
        <div class="bg-gray-50 p-3 rounded">
          <div class="text-xs text-gray-500">query</div>
          <div class="text-base">{{ selected()?.query }}</div>
        </div>
        <div class="bg-gray-50 p-3 rounded">
          <div class="text-xs text-gray-500">expectedAnswer</div>
          <div>{{ selected()?.expectedAnswer }}</div>
        </div>
        <div class="bg-gray-50 p-3 rounded">
          <div class="text-xs text-gray-500">expectedChunkIds</div>
          <div class="font-mono text-xs">{{ selected()?.expectedChunkIds }}</div>
        </div>
        <div class="bg-gray-50 p-3 rounded">
          <div class="text-xs text-gray-500">queryLabels</div>
          <pre class="text-xs">{{ JSON.stringify(selected()?.queryLabels, null, 2) }}</pre>
        </div>
        <div class="bg-gray-50 p-3 rounded">
          <div class="text-xs text-gray-500">answerLabels</div>
          <pre class="text-xs">{{ JSON.stringify(selected()?.answerLabels, null, 2) }}</pre>
        </div>
        <div class="text-xs text-gray-500">
          source: {{ selected()?.source }} · humanReviewed: {{ selected()?.humanReviewed }}
        </div>
      </div>
    </div>
  </div>
</template>