<!--
  apps/web/src/layout/index.vue
  Day 23 Task 2 (P1) —— 外层壳：Sidebar + (Navbar + TagsView + AppMain)
  toggleSidebar 由 Navbar 触发，collapse 状态走 appStore
-->
<script setup lang="ts">
import { useAppStore } from '@/store/modules/app';
import Sidebar from '@/layout/components/Sidebar/index.vue';
import Navbar from '@/layout/components/Navbar.vue';
import TagsView from '@/layout/components/TagsView/index.vue';
import AppMain from '@/layout/components/AppMain.vue';

const appStore = useAppStore();
</script>

<template>
  <div class="app-wrapper" :class="{ 'sidebar-collapsed': appStore.sidebarCollapsed }">
    <Sidebar />
    <div class="main-container">
      <Navbar />
      <TagsView />
      <AppMain />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.app-wrapper {
  display: flex;
  height: 100vh;
  &.sidebar-collapsed .main-container { margin-left: $sidebar-collapsed-width; }
}
.main-container {
  flex: 1;
  margin-left: $sidebar-width;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
