<script setup lang="ts">
import { ref } from 'vue';
import QueryBox from '../components/QueryBox.vue';
import HitCard from '../components/HitCard.vue';
import type { SearchResponse } from '../../../../libs/api-schema/src/index.js';

const namespace = ref<'notion' | 'md' | 'all'>('all');
const result = ref<SearchResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const elapsed = ref<number | null>(null);

async function onSubmit(query: string) {
  loading.value = true;
  error.value = null;
  result.value = null;
  elapsed.value = null;
  const start = performance.now();
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, topK: 5, namespace: namespace.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    result.value = (await res.json()) as SearchResponse;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    elapsed.value = Math.round(performance.now() - start);
    loading.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <QueryBox
      :namespace="namespace"
      :disabled="loading"
      @submit="onSubmit"
      @namespace-change="(v) => (namespace = v)"
    />
    <div v-if="loading" class="text-sm text-gray-500">搜索中…</div>
    <div v-if="error" class="rounded bg-red-50 p-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="result" class="text-xs text-gray-500">
      {{ result.hits.length }} hits · {{ elapsed }}ms total
    </div>
    <div v-if="result" class="space-y-3">
      <HitCard v-for="(hit, i) in result.hits" :key="hit.chunkId" :hit="hit" :rank="i + 1" />
    </div>
  </div>
</template>
