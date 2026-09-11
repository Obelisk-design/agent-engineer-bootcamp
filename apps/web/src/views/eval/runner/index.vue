<!--
  apps/web/src/views/eval/runner/index.vue
  Day 23 Task 3 (P2) —— 评测运行：触发库构建评测（POST /api/eval/corpus）
-->
<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

type RunStatus = 'idle' | 'running' | 'done' | 'error';

const corpusStatus = ref<RunStatus>('idle');
const corpusResult = ref<unknown>(null);
const corpusError = ref<string | null>(null);

async function runCorpusEval(): Promise<void> {
  corpusStatus.value = 'running';
  corpusError.value = null;
  try {
    const { data } = await axios.post('/api/eval/corpus');
    corpusResult.value = data;
    corpusStatus.value = 'done';
  } catch (e) {
    corpusError.value = (e as Error).message;
    corpusStatus.value = 'error';
  }
}
</script>

<template>
  <el-card>
    <template #header>▶️ 评测运行</template>
    <el-steps
      :active="corpusStatus === 'done' ? 1 : 0"
      finish-status="success"
    >
      <el-step title="库构建评测" />
      <el-step title="检索评测" />
      <el-step title="LLM Judge" />
    </el-steps>
    <el-divider />
    <el-button
      type="primary"
      :loading="corpusStatus === 'running'"
      @click="runCorpusEval"
    >
      跑库构建评测
    </el-button>
    <el-alert
      v-if="corpusError"
      type="error"
      :title="corpusError"
      :closable="false"
      style="margin-top: 12px"
    />
    <el-progress
      v-if="corpusStatus === 'running'"
      :percentage="50"
      style="margin-top: 12px"
    />
    <pre v-if="corpusResult" style="margin-top: 12px">{{ JSON.stringify(corpusResult, null, 2) }}</pre>
  </el-card>
</template>
