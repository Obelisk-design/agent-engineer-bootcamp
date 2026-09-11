<!--
  apps/web/src/views/eval/query/index.vue
  Day 23 Task 3 (P2) —— 查询详情：输入 query id → 从 /api/eval/reports 过滤出该 query 的 row
  说明：eval-server 暂无 /eval/reports/{id} 单 query 路由，先走 list + 前端过滤（兜底）
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useEvalStore } from '@/store/modules/eval';

const store = useEvalStore();
const queryId = ref('');
const detail = ref<unknown>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  detail.value = null;
  try {
    if (store.retrievalReports.length === 0) await store.loadReports();
    const matched = store.retrievalReports.find((r) =>
      r.runId === queryId.value || r.runId.includes(queryId.value),
    );
    if (!matched) {
      error.value = `未找到 runId 匹配 "${queryId.value}" 的报告`;
      return;
    }
    detail.value = matched;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-card>
    <template #header>🔍 查询详情</template>
    <el-input
      v-model="queryId"
      placeholder="输入 runId 或前缀（如 1789099417120）"
      style="width: 320px; margin-right: 8px"
    />
    <el-button type="primary" :loading="loading" @click="load">加载</el-button>
    <el-alert
      v-if="error"
      type="error"
      :title="error"
      :closable="false"
      style="margin-top: 12px"
    />
    <pre v-if="detail" style="margin-top: 12px">{{ JSON.stringify(detail, null, 2) }}</pre>
  </el-card>
</template>
