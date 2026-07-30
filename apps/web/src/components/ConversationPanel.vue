<!--
  apps/web/src/components/ConversationPanel.vue

  主区中栏 —— 单列消息流（不分气泡）。
  对应 ChatGPT / Claude 的中央消息流布局。
-->

<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { ConversationItem } from '../types/agentEvent.js';
import MessageBubble from './MessageBubble.vue';

defineProps<{
  items: ReadonlyArray<ConversationItem>;
}>();

const body = ref<HTMLElement | null>(null);
function scrollToBottom(): void {
  nextTick(() => {
    const el = body.value;
    if (el !== null) el.scrollTop = el.scrollHeight;
  });
}
defineExpose({ scrollToBottom });
</script>

<template>
  <section
    class="flex-1 min-w-0 flex flex-col bg-zinc-950 overflow-hidden"
    data-testid="conversation-panel"
  >
    <div
      ref="body"
      id="conversation-body"
      class="flex-1 overflow-y-auto divide-y divide-zinc-900"
    >
      <div
        v-if="items.length === 0"
        class="text-center text-zinc-500 py-24 text-[13px]"
      >
        <p class="font-medium text-zinc-400 text-[14px] mb-1">No messages yet</p>
        <p>Send a prompt to inspect the agent run in real time.</p>
      </div>
      <MessageBubble
        v-for="(item, idx) in items"
        :key="idx"
        :role="item.role"
        :text="item.text"
        :streaming="item.streaming"
      />
    </div>
  </section>
</template>
