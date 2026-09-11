<!--
  apps/web/src/views/eval/probe/index.vue
  Day 23 Task 3 (P2) —— 库探针：当前库 chunk 总览（来自 /api/eval/corpus-stats）
  数据源：useEvalStore.loadCorpusStats() → /api/eval/corpus-stats
  后端实际 shape: { tableName, size, sample[] }（适配 eval-server 当前契约）
-->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useEvalStore } from '@/store/modules/eval';

const store = useEvalStore();
onMounted(() => store.loadCorpusStats());
</script>

<template>
  <el-card>
    <template #header>🎯 库探针</template>
    <el-button @click="store.loadCorpusStats()">刷新</el-button>
    <el-empty
      v-if="!store.corpusStats && !store.loading"
      description="暂无库统计"
    />
    <template v-else-if="store.corpusStats">
      <el-statistic :value="store.corpusStats.size" title="总 chunks" />
      <el-descriptions :column="1" border style="margin-top: 16px">
        <el-descriptions-item label="表名">{{ store.corpusStats.tableName }}</el-descriptions-item>
        <el-descriptions-item label="size">{{ store.corpusStats.size }}</el-descriptions-item>
      </el-descriptions>
      <h4 style="margin-top: 16px">样本 ({{ store.corpusStats.sample.length }})</h4>
      <el-table :data="store.corpusStats.sample" stripe style="margin-top: 8px">
        <el-table-column label="id" prop="id" min-width="240" />
        <el-table-column label="source" prop="source" min-width="200" />
        <el-table-column label="text" prop="text" min-width="300" show-overflow-tooltip />
      </el-table>
    </template>
  </el-card>
</template>
