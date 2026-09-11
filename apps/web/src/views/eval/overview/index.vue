<!--
  apps/web/src/views/eval/overview/index.vue
  Day 23 Task 3 (P2) —— 评测总览：报告表 + Recall@20 柱状图
  数据源：useEvalStore.loadReports() → /api/eval/reports
-->
<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useEvalStore } from '@/store/modules/eval';
import { useECharts } from '@/composables/useECharts';

const store = useEvalStore();
onMounted(() => store.loadReports());

const chartOption = computed(() => ({
  title: { text: 'Recall@20 趋势' },
  tooltip: { trigger: 'axis' as const },
  xAxis: {
    type: 'category' as const,
    data: store.retrievalReports.map((r) => r.runId.slice(0, 8)),
  },
  yAxis: { type: 'value' as const, max: 1 },
  series: [
    {
      type: 'bar' as const,
      data: store.retrievalReports.map((r) => Number(r.aggregate.recallAt20.toFixed(3))),
      itemStyle: { color: '#409eff' },
    },
  ],
}));
const chartEl = useECharts(chartOption);
</script>

<template>
  <el-space direction="vertical" fill style="width: 100%">
    <el-card>
      <template #header>📊 评测总览</template>
      <el-button @click="store.loadReports()">刷新</el-button>
      <el-alert v-if="store.error" type="error" :title="store.error" :closable="false" />
      <p v-if="store.loading">加载中…</p>
      <p v-if="store.retrievalReports.length === 0 && !store.loading">
        暂无评测报告。先去「评测运行」跑一次。
      </p>
    </el-card>
    <el-card v-if="store.retrievalReports.length > 0">
      <el-table :data="store.retrievalReports" stripe>
        <el-table-column prop="runId" label="runId" width="160" />
        <el-table-column prop="timestamp" label="时间" width="200" />
        <el-table-column prop="aggregate.total" label="total" width="80" align="right" />
        <el-table-column label="recall@20" width="100" align="right">
          <template #default="{ row }">
            {{ (row.aggregate.recallAt20 * 100).toFixed(1) }}%
          </template>
        </el-table-column>
        <el-table-column label="final-hit" width="100" align="right">
          <template #default="{ row }">
            {{ (row.aggregate.finalHitRate * 100).toFixed(1) }}%
          </template>
        </el-table-column>
        <el-table-column label="judge-avg" width="100" align="right">
          <template #default="{ row }">
            {{ row.aggregate.judgeAvg.toFixed(3) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    <el-card v-if="store.retrievalReports.length > 0">
      <div ref="chartEl" style="width: 100%; height: 300px"></div>
    </el-card>
  </el-space>
</template>
