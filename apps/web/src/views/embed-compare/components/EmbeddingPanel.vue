<!--
  apps/web/src/views/embed-compare/components/EmbeddingPanel.vue

  Embedding 阶段展示壳：摘要（dim / norm / model / latency）+ VectorSpace + VectorPreview。
  VectorSpace 接受完整的 (labels, vectors)，由编排器对齐好（labels[0] = 'query'），
  本组件只负责摘要 + 错误态 + 折叠向量预览。
  Day 23 Task 4：白底亮色，el-card 包装 + el-empty/ElMessage 错误。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { EmbeddingPayload, PipelineStage } from '../analysisState.js';
import VectorSpace from './VectorSpace.vue';
import VectorPreview from './VectorPreview.vue';

const props = defineProps<{
  embedding: EmbeddingPayload | null;
  /** 完整 (labels, vectors)，第一项必须是 query。供 VectorSpace 用。 */
  labels: readonly string[];
  vectors: readonly number[][];
  stage: PipelineStage;
}>();

const stats = computed(() => {
  const v = props.embedding?.vector ?? null;
  if (v === null || v.length === 0) return null;
  let min = v[0]!;
  let max = v[0]!;
  let sum = 0;
  let sqSum = 0;
  for (const x of v) {
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x;
    sqSum += x * x;
  }
  const mean = sum / v.length;
  const norm = Math.sqrt(sqSum);
  return { min, max, mean, norm };
});

const errorMsg = computed(() => (props.stage.status === 'error' ? props.stage.error : null));
const running = computed(() => props.stage.status === 'running');
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px">
        <span style="font-size: 0.875rem; font-weight: 600; color: #303133">Embedding</span>
        <span v-if="embedding" style="font-family: ui-monospace, monospace; font-size: 10px; color: #909399">
          dim {{ embedding.dimension }} · L2 norm {{ stats?.norm.toFixed(3) ?? '—' }} · model {{ embedding.model }} · {{ embedding.embedMs }}ms
        </span>
      </div>
    </template>

    <el-alert
      v-if="running"
      type="warning"
      :closable="false"
      title="● Generating embedding…"
      show-icon
    />
    <el-alert
      v-else-if="errorMsg"
      type="error"
      :closable="false"
      :title="`✕ Embedding failed: ${errorMsg}`"
      show-icon
    />

    <template v-else-if="embedding && vectors.length === labels.length && vectors.length >= 2">
      <VectorSpace
        :labels="labels"
        :vectors="vectors"
        :highlight-index="0"
      />
      <p v-if="stats" style="margin-top: 8px; font-family: ui-monospace, monospace; font-size: 10px; color: #909399">
        min {{ stats.min.toFixed(4) }} · max {{ stats.max.toFixed(4) }} · mean {{ stats.mean.toFixed(4) }} · norm {{ stats.norm.toFixed(3) }}
      </p>
      <VectorPreview :vector="embedding.vector" />
    </template>

    <p v-else style="margin-top: 12px; font-size: 0.75rem; color: #909399">
      等待 Embedding 完成。
    </p>
  </el-card>
</template>
