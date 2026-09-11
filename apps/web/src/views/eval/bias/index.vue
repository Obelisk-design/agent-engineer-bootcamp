<!--
  apps/web/src/views/eval/bias/index.vue
  Day 23 Task 3 (P2) —— 偏差分析：多 run 三指标对比（recall@20 / final-hit / judge-avg）
  数据源：useEvalStore.loadReports() → /api/eval/reports
-->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useEvalStore } from '@/store/modules/eval';
import { useECharts } from '@/composables/useECharts';

const store = useEvalStore();
onMounted(() => store.loadReports());

const chartOption = computed(() => ({
  title: { text: '多 run 对比' },
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['recall@20', 'final-hit', 'judge-avg'] },
  xAxis: {
    type: 'category' as const,
    data: store.retrievalReports.map((r) => r.runId.slice(0, 8)),
  },
  yAxis: { type: 'value' as const },
  series: [
    {
      name: 'recall@20',
      type: 'bar' as const,
      data: store.retrievalReports.map((r) => Number(r.aggregate.recallAt20.toFixed(3))),
    },
    {
      name: 'final-hit',
      type: 'bar' as const,
      data: store.retrievalReports.map((r) => Number(r.aggregate.finalHitRate.toFixed(3))),
    },
    {
      name: 'judge-avg',
      type: 'bar' as const,
      data: store.retrievalReports.map((r) => Number(r.aggregate.judgeAvg.toFixed(3))),
    },
  ],
}));
const chartEl = useECharts(chartOption);
</script>

<template>
  <el-card>
    <template #header>⚠️ 偏差分析</template>
    <el-button @click="store.loadReports()">刷新</el-button>
    <div ref="chartEl" style="width: 100%; height: 400px; margin-top: 16px"></div>
    <el-table
      v-if="store.retrievalReports.length > 0"
      :data="store.retrievalReports"
      stripe
      style="margin-top: 16px"
    >
      <el-table-column prop="runId" label="runId" />
      <el-table-column label="recall@20">
        <template #default="{ row }">
          {{ (row.aggregate.recallAt20 * 100).toFixed(1) }}%
        </template>
      </el-table-column>
      <el-table-column label="final-hit">
        <template #default="{ row }">
          {{ (row.aggregate.finalHitRate * 100).toFixed(1) }}%
        </template>
      </el-table-column>
      <el-table-column label="judge-avg">
        <template #default="{ row }">
          {{ row.aggregate.judgeAvg.toFixed(3) }}
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
