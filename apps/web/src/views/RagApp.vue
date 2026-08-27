<!--
  apps/web/src/views/RagApp.vue

  RAG Playground 顶层组件 —— TabBar + SearchView/IngestView 切换。
  通过 App.vue 的 `#/rag` hash route 渲染，与 day09 Agent Console 完全隔离。

  设计依据：spec §Components "RAG 专用 Hono app 与 Agent app 完全分离，零耦合"。
  不复用 Agent Console 的 HeaderBar / Composer / RightPanel 等专属组件。
-->

<script setup lang="ts">
import { ref } from 'vue';
import TabBar from '../components/TabBar.vue';
import SearchView from './SearchView.vue';
import IngestView from './IngestView.vue';

const tabs = ['搜索', '入库'] as const;
type Tab = (typeof tabs)[number];
const active = ref<Tab>('搜索');
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4 p-6">
    <h1 class="text-2xl font-bold">Notion / MD RAG Playground</h1>
    <TabBar :tabs="tabs" v-model="active" />
    <SearchView v-if="active === '搜索'" />
    <IngestView v-else />
  </div>
</template>