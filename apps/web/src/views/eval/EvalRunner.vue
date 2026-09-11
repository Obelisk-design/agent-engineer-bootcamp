<script setup lang="ts">
import { ref } from 'vue';
import { runCorpusEval, runRetrievalEval } from './api.js';

type Kind = 'corpus' | 'retrieval';
const kind = ref<Kind>('retrieval');
const running = ref(false);
const log = ref<string>('');
const result = ref<unknown>(null);
const err = ref<string | null>(null);

async function go(): Promise<void> {
  running.value = true;
  log.value = '';
  err.value = null;
  result.value = null;
  try {
    if (kind.value === 'corpus') {
      log.value = '正在跑库构建评测…\n';
      result.value = await runCorpusEval();
      log.value += '✅ 完成';
    } else {
      log.value = '正在跑检索评测（GT → retrieve → rerank → judge）…\n';
      result.value = await runRetrievalEval();
      log.value += '✅ 完成';
    }
  } catch (e) {
    err.value = (e as Error).message;
    log.value += `\n❌ ${err.value}`;
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold">▶️ 评测运行</h2>
    <div class="flex items-center gap-4">
      <label class="text-sm">评测类型:</label>
      <select v-model="kind" class="border rounded px-2 py-1 text-sm">
        <option value="retrieval">端到端检索</option>
        <option value="corpus">库构建质量</option>
      </select>
      <button
        class="px-4 py-1 text-sm bg-blue-500 text-white rounded disabled:opacity-50"
        :disabled="running"
        @click="go"
      >
        {{ running ? '运行中…' : '运行' }}
      </button>
    </div>
    <pre v-if="log" class="bg-gray-50 p-3 rounded text-xs font-mono whitespace-pre-wrap">{{ log }}</pre>
    <pre v-if="result" class="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-96">{{ JSON.stringify(result, null, 2) }}</pre>
  </div>
</template>