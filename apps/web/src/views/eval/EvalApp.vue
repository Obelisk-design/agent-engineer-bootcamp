<!--
  apps/web/src/views/eval/EvalApp.vue

  Day 22 — Eval Platform 顶层组件（5 个 tab）。
  通过 App.vue 的 `#/eval` hash route 渲染，与 RagApp 完全隔离。

  设计依据：spec 2026-09-11 §4.3
-->

<script setup lang="ts">
import { ref } from 'vue';
import TabBar from '../../components/TabBar.vue';
import EvalOverview from './EvalOverview.vue';
import EvalRunner from './EvalRunner.vue';
import QueryDetail from './QueryDetail.vue';
import CorpusProbe from './CorpusProbe.vue';
import BiasAnalysis from './BiasAnalysis.vue';

const tabs = ['总览', '评测运行', '查询详情', '库探针', '偏差分析'] as const;
type Tab = (typeof tabs)[number];
const active = ref<Tab>('总览');
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4 p-6">
    <h1 class="text-2xl font-bold">RAG Eval Platform</h1>
    <TabBar :tabs="tabs" v-model="active" />
    <EvalOverview v-if="active === '总览'" />
    <EvalRunner v-else-if="active === '评测运行'" />
    <QueryDetail v-else-if="active === '查询详情'" />
    <CorpusProbe v-else-if="active === '库探针'" />
    <BiasAnalysis v-else />
  </div>
</template>