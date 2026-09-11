<!--
  apps/web/src/views/agent/index.vue

  Day 23 Task 5 (P4) + Phase U (Task 6) —— Agent Console 完整页面（premium 版）

  布局（4 件套）：
  [HeaderBar — h=44, store-driven]
  [ConversationPanel — flex-col, store-driven] | [RightPanel — 320px, store-driven]
  [Composer — 自动 fixed bottom, store-driven]

  暗色主题：父级 AppMain 在路由 meta.theme === 'dark' 时套 .agent-route class，
  由 views/agent/styles/agent-dark.scss 全套接管。

  Phase U 视觉 polish：
  - 改用 grid template-rows 模板（44px 1fr auto），body min-height: 0 让子区自适应
  - 颜色从 #0a0a0a → #0e1117（与 token $bg-base 对齐，深炭灰 + 冷微偏移）
  - 字体 / 圆角 / 间距走 token（统一设计语言）
-->
<script setup lang="ts">
import HeaderBar from '@/components/HeaderBar.vue';
import ConversationPanel from '@/components/ConversationPanel.vue';
import RightPanel from '@/components/RightPanel.vue';
import Composer from '@/components/Composer.vue';
import { useAgentStore } from '@/store/modules/agent';

const agent = useAgentStore();
void agent;
</script>

<template>
  <div class="agent-console">
    <HeaderBar />
    <div class="agent-body">
      <ConversationPanel />
      <RightPanel />
    </div>
    <Composer />
  </div>
</template>

<style lang="scss" scoped>
@use './styles/tokens' as t;       // 🆕 Phase U：用 namespace t 避免与 variables.scss 全局变量冲突

.agent-console {
  display: grid;
  grid-template-rows: t.$navbar-height 1fr auto;
  height: calc(100vh - 100px);  // 预留顶部 + 底部空间，避免被浏览器 UI 遮挡
  background: t.$bg-base;
  color: t.$fg;
  overflow: hidden;
  font-family: t.$font-sans;
}

.agent-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
