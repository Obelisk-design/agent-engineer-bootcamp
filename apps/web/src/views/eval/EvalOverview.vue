<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchReports, type RetrievalEvalReportView, type CorpusEvalReportView } from './api.js';

const retrieval = ref<readonly RetrievalEvalReportView[]>([]);
const corpus = ref<readonly CorpusEvalReportView[]>([]);
const err = ref<string | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  err.value = null;
  try {
    const r = await fetchReports();
    retrieval.value = r.retrieval;
    corpus.value = r.corpus;
  } catch (e) {
    err.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold">📊 评测总览</h2>
    <button class="px-3 py-1 text-sm bg-blue-500 text-white rounded" @click="load">刷新</button>
    <p v-if="err" class="text-red-600">❌ {{ err }}</p>
    <p v-if="loading" class="text-gray-500">加载中…</p>

    <section v-if="retrieval.length > 0">
      <h3 class="font-medium">检索评测 ({{ retrieval.length }} 个 run)</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-3 py-2 text-left">runId</th>
              <th class="px-3 py-2 text-left">时间</th>
              <th class="px-3 py-2 text-right">total</th>
              <th class="px-3 py-2 text-right">recall@20</th>
              <th class="px-3 py-2 text-right">final-hit</th>
              <th class="px-3 py-2 text-right">judge-avg</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in retrieval" :key="r.runId" class="border-b">
              <td class="px-3 py-2 font-mono text-xs">{{ r.runId }}</td>
              <td class="px-3 py-2">{{ r.timestamp }}</td>
              <td class="px-3 py-2 text-right">{{ r.aggregate.total }}</td>
              <td class="px-3 py-2 text-right">{{ (r.aggregate.recallAt20 * 100).toFixed(1) }}%</td>
              <td class="px-3 py-2 text-right">{{ (r.aggregate.finalHitRate * 100).toFixed(1) }}%</td>
              <td class="px-3 py-2 text-right">{{ r.aggregate.judgeAvg.toFixed(3) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="corpus.length > 0">
      <h3 class="font-medium">库构建评测 ({{ corpus.length }} 个 run)</h3>
      <ul class="text-sm space-y-1">
        <li v-for="c in corpus" :key="c.totalFiles">
          总文件 {{ c.totalFiles }} · 抽取成功率 {{ (c.overall.extractedRate * 100).toFixed(1) }}%
          · chunks {{ c.overall.totalChunks }}
        </li>
      </ul>
    </section>

    <p v-if="!loading && retrieval.length === 0 && corpus.length === 0" class="text-gray-500">
      暂无评测报告。先去「评测运行」跑一次。
    </p>
  </div>
</template>