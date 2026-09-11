<script setup lang="ts">
import { ref } from 'vue';
import { runJudge } from './api.js';

const query = ref('');
const answer = ref('');
const expected = ref('');
const result = ref<{ score: number; reasoning: string } | null>(null);
const running = ref(false);
const err = ref<string | null>(null);

async function go(): Promise<void> {
  running.value = true;
  err.value = null;
  result.value = null;
  try {
    result.value = await runJudge(query.value, answer.value, expected.value);
  } catch (e) {
    err.value = (e as Error).message;
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold">⚖️ 偏差分析 / LLM Judge</h2>
    <p class="text-xs text-gray-500">
      spec §9.1 LLM 偏见风险：GT 与被测同模型（qwen3-8b）—— 单条 Judge 看 prompt 工程基线。
    </p>

    <label class="block">
      <div class="text-sm">query</div>
      <input v-model="query" class="w-full border rounded px-2 py-1 text-sm" />
    </label>
    <label class="block">
      <div class="text-sm">answer (候选)</div>
      <textarea v-model="answer" class="w-full border rounded px-2 py-1 text-sm h-24" />
    </label>
    <label class="block">
      <div class="text-sm">expectedAnswer (期望)</div>
      <textarea v-model="expected" class="w-full border rounded px-2 py-1 text-sm h-24" />
    </label>
    <button
      class="px-4 py-1 text-sm bg-blue-500 text-white rounded disabled:opacity-50"
      :disabled="running || !query || !answer || !expected"
      @click="go"
    >
      {{ running ? 'Judge 中…' : 'Judge' }}
    </button>
    <p v-if="err" class="text-red-600">❌ {{ err }}</p>
    <div v-if="result" class="bg-gray-50 p-3 rounded text-sm">
      <div>score: <b>{{ result.score }}</b></div>
      <div>reasoning: {{ result.reasoning }}</div>
    </div>
  </div>
</template>