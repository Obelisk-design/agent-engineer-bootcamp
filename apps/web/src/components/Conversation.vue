<!--
  apps/web/src/components/Conversation.vue

  Conversation 面板 —— 左栏展示 user / assistant / thinking / error 消息。
  由 App.vue 通过 :items prop 传入消息数组。
-->

<script setup lang="ts">
import type { ConversationItem } from '../types/agentEvent.js';

defineProps<{
  items: ReadonlyArray<ConversationItem>;
}>();

function roleLabel(role: ConversationItem['role']): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  if (role === 'thinking') return 'Thinking';
  return 'Error';
}

function isCodeBlock(text: string): boolean {
  return /```/.test(text);
}
</script>

<template>
  <section class="panel conversation-panel">
    <div class="panel-header">Conversation</div>
    <div id="conversation-body" class="panel-body" data-testid="conversation">
      <div v-if="items.length === 0" class="empty-hint">
        Send a prompt to inspect the agent run in real time.
      </div>
      <div
        v-for="(item, idx) in items"
        :key="idx"
        :class="['message', item.role, item.streaming ? 'streaming' : '']"
      >
        <div class="role">{{ roleLabel(item.role) }}</div>
        <div v-if="isCodeBlock(item.text)" class="message-body code-block">{{ item.text }}</div>
        <div v-else class="message-body">{{ item.text }}</div>
      </div>
    </div>
  </section>
</template>