<!--
  apps/web/src/layout/components/Sidebar/SidebarItem.vue
  Day 23 Task 2 (P1) —— 单菜单项（el-menu-item + icon 组件）
  icon 是 Element Plus Icon 名字符串，动态 component 渲染
-->
<script setup lang="ts">
// icon?: string 兼容 route.meta.icon 可能 undefined；exactOptional 下必须显式
defineProps<{ to: string; icon?: string | undefined; title: string }>();
</script>

<template>
  <el-menu-item :index="to">
    <el-icon v-if="icon"><component :is="icon" /></el-icon>
    <template #title>{{ title }}</template>
  </el-menu-item>
</template>
