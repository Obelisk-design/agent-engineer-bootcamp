<!--
  apps/web/src/components/InputBar.vue

  输入栏 —— textarea + Send 按钮。
  支持 Ctrl/⌘ + Enter 发送。
  busy 时禁用输入（Stop 按钮由 App.vue 顶部显示）。
-->

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  busy: boolean;
}>();

const emit = defineEmits<{
  send: [input: string];
}>();

const inputText = ref('');

function submit(): void {
  const value = inputText.value.trim();
  if (value === '') return;
  emit('send', value);
  inputText.value = '';
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    submit();
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}
</script>

<template>
  <footer class="input-bar">
    <div class="input-row">
      <textarea
        id="input"
        v-model="inputText"
        placeholder="说点什么……（Ctrl/⌘+Enter 发送）"
        :disabled="busy"
        rows="1"
        @keydown="onKeydown"
      />
      <button
        class="action send"
        data-testid="send-btn"
        :disabled="busy || inputText.trim() === ''"
        @click="submit"
      >
        Send
      </button>
    </div>
  </footer>
</template>