<!--
  apps/web/src/views/agent/components/ConversationPanel.vue   (🆕 Phase U 路径不变)
  原路径: apps/web/src/components/ConversationPanel.vue

  Day 23 Task 5 (P4) + Phase U (Task 6) —— 主区中栏，单列消息流

  数据流：useAgentStore().conversation → MessageBubble v-for
  流式 message_delta 时 scrollToBottom（nextTick + scrollTop = scrollHeight）

  Phase U 视觉 polish：
  - 唯一滚动容器：.conversation-body 是 page 内唯一垂直滚动
  - 进入动画：MessageBubble 用 <TransitionGroup> 走 fadeSlideUp 200ms
  - 颜色 / 间距 / 字号走 token（设计语言统一）
-->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useAgentStore } from '@/store/modules/agent';
import MessageBubble from './MessageBubble.vue';

const agent = useAgentStore();
const body = ref<HTMLElement | null>(null);

function scrollToBottom(): void {
  nextTick(() => {
    const el = body.value;
    if (el !== null) el.scrollTop = el.scrollHeight;
  });
}

// 监听 conversation 长度变化自动滚到底部（流式 message_delta 时）
watch(
  () => agent.conversation.length,
  () => scrollToBottom(),
);

// 监听最后一项 text 变化（流式 append message_delta 时）
watch(
  () => agent.conversation[agent.conversation.length - 1]?.text,
  () => scrollToBottom(),
);

defineExpose({ scrollToBottom });
</script>

<template>
  <section class="conversation-panel" data-testid="conversation-panel">
    <div ref="body" id="conversation-body" class="conversation-body">
      <div v-if="agent.conversation.length === 0" class="empty">
        <p class="empty-title">No messages yet</p>
        <p class="empty-sub">Send a prompt to inspect the agent run in real time.</p>
      </div>
      <TransitionGroup name="msg" tag="div" class="msg-list">
        <MessageBubble
          v-for="(item, idx) in agent.conversation"
          :key="idx"
          :role="item.role"
          :text="item.text"
          :streaming="item.streaming"
        />
      </TransitionGroup>
    </div>
  </section>
</template>

<style lang="scss" scoped>
@use '@/views/agent/styles/tokens' as t;

.conversation-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: t.$bg-base;
  overflow: hidden;
}

.conversation-body {
  flex: 1;
  min-height: 0;                                          // 🆕 Phase U：flex 子项必须 min-height: 0 才能滚
  overflow-y: auto;                                       // 🆕 唯一滚动容器
  padding: t.$space-5 0;                                     // 🆕 24px token
  scroll-behavior: smooth;
}

.msg-list {
  display: flex;
  flex-direction: column;
}

.empty {
  text-align: center;
  color: t.$fg-faint;
  padding: t.$space-8 t.$space-4;                              // 🆕 96px / 16px
  font-size: t.$font-size-md;
}

.empty-title {
  font-weight: t.$font-weight-medium;
  color: t.$fg-muted;
  font-size: t.$font-size-lg;
  margin: 0 0 t.$space-1;
  letter-spacing: 0.2px;
}

.empty-sub {
  margin: 0;
  font-size: t.$font-size-sm;
  color: t.$fg-faint;
}

// ============ 进入动画 ============
.msg-enter-active {
  animation: fadeSlideUp t.$dur-base t.$ease-out both;
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.msg-leave-active {
  transition: opacity t.$dur-fast t.$ease-in;
}
.msg-leave-to {
  opacity: 0;
}
</style>
