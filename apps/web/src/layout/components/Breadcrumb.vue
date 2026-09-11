<!--
  apps/web/src/layout/components/Breadcrumb.vue
  Day 23 Task 2 (P1) —— 面包屑：route.matched 中所有有 title 的层级
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const breadcrumbs = computed(() => route.matched.filter((r) => r.meta?.title));
</script>

<template>
  <el-breadcrumb separator="/">
    <el-breadcrumb-item v-for="b in breadcrumbs" :key="b.path">{{ b.meta.title }}</el-breadcrumb-item>
  </el-breadcrumb>
</template>
