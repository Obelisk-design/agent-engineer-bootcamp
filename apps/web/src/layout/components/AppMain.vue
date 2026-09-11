<!--
  apps/web/src/layout/components/AppMain.vue
  Day 23 Task 2 (P1) —— 路由出口 + 切换过渡
-->
<template>
  <div class="app-main">
    <router-view v-slot="{ Component, route }">
      <transition name="fade" mode="out-in">
        <component :is="Component" :key="route.path" />
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
</style>
