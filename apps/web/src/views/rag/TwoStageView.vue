<!--
  apps/web/src/views/rag/TwoStageView.vue

  Day 20 — 两阶段检索 demo（embedding + vector search + rerank）。
  Day 23 Task 4 (P3)：搬到 views/rag/ 下，原 EmbedCompare 仍由 Task 4 Step 6
  改写为 Element Plus 版（el-steps / el-card / useECharts）。
-->
<script setup lang="ts">
import EmbedCompare from '../embed-compare/EmbedCompare.vue';
</script>

<template>
  <EmbedCompare />
</template>