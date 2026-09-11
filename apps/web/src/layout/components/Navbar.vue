<!--
  apps/web/src/layout/components/Navbar.vue
  Day 23 Task 2 (P1) —— 顶栏：折叠按钮 + 面包屑
  折叠图标：展开=Fold, 折叠=Expand
-->
<script setup lang="ts">
import { useAppStore } from '@/store/modules/app';
import Breadcrumb from '@/layout/components/Breadcrumb.vue';

const appStore = useAppStore();
</script>

<template>
  <header class="navbar">
    <el-button text @click="appStore.toggleSidebar()">
      <el-icon>
        <component :is="appStore.sidebarCollapsed ? 'Expand' : 'Fold'" />
      </el-icon>
    </el-button>
    <Breadcrumb />
  </header>
</template>

<style lang="scss" scoped>
.navbar {
  height: $navbar-height;
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
}
</style>
