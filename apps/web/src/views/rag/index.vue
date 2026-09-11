<!--
  apps/web/src/views/rag/index.vue
  Day 23 Task 4 (P3) —— RAG 顶层组件：el-tabs 3 子页
  （搜索 / 入库 / 两阶段检索），子组件为本目录的 SearchView / IngestView / TwoStageView。
-->
<script setup lang="ts">
import { ref } from 'vue';
import SearchView from './SearchView.vue';
import IngestView from './IngestView.vue';
import TwoStageView from './TwoStageView.vue';

const activeTab = ref('search');
</script>

<template>
  <div class="rag-root">
    <h2 style="margin: 0 0 16px 0">RAG Playground</h2>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="搜索" name="search">
        <SearchView />
      </el-tab-pane>
      <el-tab-pane label="入库" name="ingest">
        <IngestView />
      </el-tab-pane>
      <el-tab-pane label="两阶段检索" name="two-stage">
        <TwoStageView />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>