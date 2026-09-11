<!--
  apps/web/src/layout/components/Sidebar/index.vue
  Day 23 Task 2 (P1) —— 侧边栏：从路由表生成菜单项 + 折叠
  菜单源：当前 route.matched（task 3 在 permission store 里再换成完整菜单树）
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '@/store/modules/app';
import SidebarItem from './SidebarItem.vue';

const route = useRoute();
const appStore = useAppStore();

const menuItems = computed(() => {
  const matched = route.matched.filter((r) => r.meta?.title && !r.meta?.hidden);
  return matched.map((r) => ({ to: r.path, icon: r.meta.icon, title: r.meta.title as string }));
});
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: appStore.sidebarCollapsed }">
    <div class="logo">Agent Bootcamp</div>
    <el-menu :default-active="route.path" :collapse="appStore.sidebarCollapsed" router>
      <SidebarItem v-for="m in menuItems" :key="m.to" v-bind="m" />
    </el-menu>
  </aside>
</template>

<style lang="scss" scoped>
.sidebar {
  width: $sidebar-width;
  background: #001529;
  color: #fff;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  overflow-y: auto;
  transition: width 0.25s;
  &.collapsed { width: $sidebar-collapsed-width; }
}
.logo {
  padding: 16px;
  font-weight: bold;
  font-size: 16px;
  text-align: center;
}
</style>
