<!--
  apps/web/src/components/ConversationPanel.vue

  主区中栏 —— 单列消息流（不分气泡）。
  对应 ChatGPT / Claude 的中央消息流布局。
  数据流：useAgentStore().conversation → MessageBubble v-for。
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
      <MessageBubble
        v-for="(item, idx) in agent.conversation"
        :key="idx"
        :role="item.role"
        :text="item.text"
        :streaming="item.streaming"
      />
    </div>
  </section>
</template>

<style lang="scss" scoped>
.conversation-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #0a0a0a;
  overflow: hidden;
}

.conversation-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0;
}

.empty {
  text-align: center;
  color: #6a6a6a;
  padding: 96px 16px;
  font-size: 13px;
}

.empty-title {
  font-weight: 500;
  color: #a0a0a0;
  font-size: 14px;
  margin: 0 0 4px;
}

.empty-sub {
  margin: 0;
}
</style>
