<!--
  apps/web/src/components/Conversation.vue

  Conversation 面板 —— 左栏展示 user / assistant / thinking / error 消息。
  由 App.vue 通过 :items prop 传入消息数组。
-->

<script setup lang="ts">
interface ConversationItem {
  readonly role: 'user' | 'assistant' | 'thinking' | 'error';
  readonly text: string;
  readonly streaming: boolean;
}

defineProps<{
  items: ReadonlyArray<ConversationItem>;
}>();

function roleLabel(role: ConversationItem['role']): string {
  if (role === 'user') return 'You';
  if (role === 'assistant') return 'AI';
  if (role === 'thinking') return '…';
  return 'Error';
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">Conversation</div>
    <div id="conversation-body" class="panel-body" data-testid="conversation">
      <div v-if="items.length === 0" class="empty-hint">
        发条消息试试，比如"用 calculator 计算 10+20"
      </div>
      <div
        v-for="(item, idx) in items"
        :key="idx"
        :class="['message', item.role, item.streaming ? 'streaming' : '']"
      >
        <div class="role">{{ roleLabel(item.role) }}</div>
        <div :class="item.streaming ? 'streaming-body' : ''">{{ item.text }}</div>
      </div>
    </div>
  </section>
</template>