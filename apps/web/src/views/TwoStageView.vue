<!--
  apps/web/src/views/TwoStageView.vue

  Day 20 — 两阶段检索 demo（embedding + vector search + rerank）。

  设计：完整复用 apps/web/src/views/embed-compare/EmbedCompare.vue 整页（Pipeline 5 段状态机 + 子组件）。
  与原 embed-compare 区别：
    - 数据源：embed-compare 用 SAMPLE_CORPUS（前端固定 demo 语料）→ VectorSpace 散点= demo
      TwoStageView 用真 lancedb（/api/search + /api/rerank）→ VectorSpace 散点沿用 SAMPLE_CORPUS
      但 vectorSearch.hits 来自真库（Pipeline 其它 4 段都接真库）
    - 路由：#/rag → 两阶段检索 tab → 此 view
    - 已知 trade-off：VectorSpace 2D 散点的 SAMPLE_CORPUS 与真 lancedb 不直接对应
      （保留作为 "embedding 是什么样子"的可视化），不影响 5 段 Pipeline 状态机的语义
      改进记 TODO：把 SAMPLE_CORPUS 抽成 EmbedCompare 的可选 prop（YAGNI 推 Day 31+）

  为什么不复用 EmbedCompare 的代码块而是整页 import：
    - 200+ 行 script+template copy → 违反 DRY，且后续 EmbedCompare 改一处两份要同步
    - 让 EmbedCompare 抽 prop → 超出 Day 20 范围（违反 YAGNI："今天不用，就不抽"）
    - 整页 import 是最小代码路径，Day 20 边界干净
-->

<script setup lang="ts">
import EmbedCompare from './embed-compare/EmbedCompare.vue';
</script>

<template>
  <EmbedCompare />
</template>