<!--
  apps/web/src/layout/components/Sidebar/index.vue
  Day 23 Task 3 (P2) —— 侧边栏：从 router.options.routes 派生完整菜单树
  修复：原版 route.matched 只显示当前激活路由链，访问 /agent 时只看到 Agent 一项
  现在递归展开所有 children，预期 9 项菜单（Eval Platform + 5 子页 + RAG + Embed Demo + Embed Compare + Agent Console）
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter, type RouteRecordRaw } from 'vue-router';
import { useAppStore } from '@/store/modules/app';
import SidebarItem from './SidebarItem.vue';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

/**
 * 递归展开 routes → 平铺菜单项
 * 父路由（meta.title + 有 children）= 自身加入菜单（点击跳到自身 path），子路由作为兄弟继续展开
 * 子路由（meta.title + 无 children）= 直接加入菜单
 * 跳过 hidden: true 与 path: '/' redirect
 */
const menuItems = computed(() => {
  const flat: Array<{ to: string; icon?: string | undefined; title: string }> = [];

  function walk(routes: readonly RouteRecordRaw[] | undefined, parentPath = ''): void {
    if (!routes) return;
    for (const r of routes) {
      if (r.meta?.hidden || r.path === '/') continue;
      // 子路由 path 为空时（如 /rag 的 '' child）直接继承父路径
      const isAbsoluteChild = r.path.startsWith('/');
      const fullPath =
        r.path === ''
          ? parentPath
          : isAbsoluteChild
            ? r.path
            : `${parentPath}/${r.path}`;
      if (r.children && r.children.length > 0) {
        // 父级本身不入菜单（点击它的 children 就行）；只递归展开 children
        walk(r.children, fullPath);
      } else if (r.meta?.title) {
        flat.push({ to: fullPath, icon: r.meta.icon as string | undefined, title: r.meta.title as string });
      }
    }
  }

  walk(router.options.routes);
  return flat;
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
