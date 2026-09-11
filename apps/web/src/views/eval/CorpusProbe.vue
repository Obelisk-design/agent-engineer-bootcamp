<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchCorpusStats } from './api.js';

const stats = ref<{
  tableName: string;
  size: number;
  sample: readonly { id: string; source: string; text: string }[];
} | null>(null);
const err = ref<string | null>(null);

onMounted(async () => {
  try {
    stats.value = await fetchCorpusStats();
  } catch (e) {
    err.value = (e as Error).message;
  }
});
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold">📚 库探针</h2>
    <p v-if="err" class="text-red-600">❌ {{ err }}</p>
    <div v-if="stats" class="space-y-3">
      <div class="bg-gray-50 p-3 rounded text-sm">
        <div><b>表名:</b> {{ stats.tableName }}</div>
        <div><b>size:</b> {{ stats.size }} chunks</div>
      </div>
      <h3 class="font-medium">样本（前 {{ stats.sample.length }}）</h3>
      <div class="space-y-2">
        <div v-for="s in stats.sample.slice(0, 20)" :key="s.id" class="bg-gray-50 p-3 rounded text-xs">
          <div class="font-mono text-gray-500">{{ s.id }}</div>
          <div class="text-gray-700 mt-1">{{ s.text.slice(0, 200) }}…</div>
        </div>
      </div>
    </div>
  </div>
</template>