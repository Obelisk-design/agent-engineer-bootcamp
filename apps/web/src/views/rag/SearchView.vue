<!--
  apps/web/src/views/rag/SearchView.vue
  Day 23 Task 4 (P3) —— 从 Day 21 SearchView.vue 迁入 views/rag/，
  接 useRagStore + Element Plus（el-select / el-input / el-button）。
  渲染：HitCard 保持原样（Day 21 子组件，不在 Task 4 范围）。
-->
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRagStore } from '@/store/modules/rag';
import HitCard from '../../components/HitCard.vue';

const store = useRagStore();
const { query, hits, loading, error, elapsed, namespace } = storeToRefs(store);

function onSubmit() {
  void store.runSearch();
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-2">
      <el-select v-model="namespace" :disabled="loading" placeholder="namespace" style="width: 140px">
        <el-option label="all" value="all" />
        <el-option label="notion" value="notion" />
        <el-option label="md" value="md" />
      </el-select>
      <el-input
        v-model="query"
        :disabled="loading"
        placeholder="输入 query…"
        clearable
        @keydown.enter="onSubmit"
      />
      <el-button type="primary" :disabled="loading" @click="onSubmit">搜索</el-button>
    </div>
    <div v-if="loading" class="text-sm text-gray-500">搜索中…</div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert
      v-if="!loading && !error && elapsed !== null && hits.length === 0"
      title="0 hits — 该 namespace 可能为空或未索引。换个 namespace 试试，或先跑入库。"
      type="info"
      :closable="false"
      show-icon
    />
    <div v-if="hits.length > 0" class="text-xs text-gray-500">
      {{ hits.length }} hits · {{ elapsed }}ms total
    </div>
    <div v-if="hits.length > 0" class="space-y-3">
      <HitCard v-for="(hit, i) in hits" :key="hit.chunkId" :hit="hit" :rank="i + 1" />
    </div>
  </div>
</template>