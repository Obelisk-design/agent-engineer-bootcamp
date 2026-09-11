<!--
  apps/web/src/views/agent/index.vue

  Day 23 Task 5 (P4) —— Agent Console 完整页面

  布局（4 件套）：
  [HeaderBar — h-11, store-driven]
  [ConversationPanel — flex-col, store-driven] | [RightPanel — 320px, store-driven]
  [Composer — 自动 fixed bottom, store-driven]

  暗色主题：父级 AppMain 在路由 meta.theme === 'dark' 时套 .agent-route class，
  由 views/agent/styles/agent-dark.scss 全套接管。
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
.agent-console {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0a0a0a;
  color: #e5e5e5;
  overflow: hidden;
}

.agent-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
</style>
