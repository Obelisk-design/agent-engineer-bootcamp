<!--
  apps/web/src/layout/components/AppMain.vue

  Day 23 Task 5 (P4) —— 路由出口 + 切换过渡 + 暗色路由切换

  行为：
  - 默认：白底 (#f0f2f5) + 16px padding（admin 模板惯例，eval/rag/embed 走这条）
  - 路由 meta.theme === 'dark'（当前只有 /agent）：去掉 padding + 暗色
    (.agent-route class 在 views/agent/styles/agent-dark.scss 全套暗色规则)
  - 切换走 fade transition + :key="route.path" 强制重渲染
-->
<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="app-main" :class="{ 'agent-route': route.meta.theme === 'dark' }">
    <router-view v-slot="{ Component, route: r }">
      <transition name="fade" mode="out-in">
        <component :is="Component" :key="r.path" />
      </transition>
    </router-view>
  </div>
</template>

<style lang="scss" scoped>
.app-main {
  flex: 1;
  overflow: auto;
  background: #f0f2f5;
  padding: 16px;
}

/*
 * 暗色路由（/agent）—— 去掉 padding 让 Agent Console 占满，
  背景由 .agent-route class 在 agent-dark.scss 全套接管。
 */
.app-main.agent-route {
  padding: 0;
  background: #0a0a0a;
}
</style>
