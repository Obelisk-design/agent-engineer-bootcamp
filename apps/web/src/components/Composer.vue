<!--
  apps/web/src/components/Composer.vue

  底部输入栏 —— Element Plus + useAgentStore 接入。
  受控 textarea + 主按钮 + Stop 按钮（busy 时切换）。
  Enter 提交 / Shift+Enter 换行 / Ctrl/⌘+Enter 也提交。
  数据流：textarea → store.send() / store.stop()
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useAgentStore } from '@/store/modules/agent';

const agent = useAgentStore();
const inputText = ref('');

function submit(): void {
  const value = inputText.value.trim();
  if (value === '' || agent.isStreaming) return;
  agent.send(value);
  inputText.value = '';
}

function onKeydown(event: KeyboardEvent): void {
  const isSubmit = event.key === 'Enter' && !event.shiftKey;
  const isCmdEnter = (event.ctrlKey || event.metaKey) && event.key === 'Enter';
  if (isSubmit || isCmdEnter) {
    event.preventDefault();
    submit();
  }
}
</script>

<template>
  <div class="composer">
    <div class="composer-inner">
      <textarea
        v-model="inputText"
        placeholder="Ask the agent anything…  (Enter to send · Shift+Enter for newline)"
        :disabled="agent.isStreaming"
        rows="2"
        class="composer-textarea"
        data-testid="composer-input"
        @keydown="onKeydown"
      />
      <div class="composer-bar">
        <span class="composer-hint">Enter to send · Shift+Enter for newline</span>
        <el-button
          v-if="!agent.isStreaming"
          type="primary"
          size="small"
          data-testid="composer-send"
          :disabled="inputText.trim() === ''"
          @click="submit"
        >
          Send
        </el-button>
        <el-button
          v-else
          type="danger"
          size="small"
          data-testid="composer-stop"
          @click="agent.stop()"
        >
          Stop
        </el-button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/views/agent/styles/tokens' as t;

.composer {
  padding: t.$space-4 t.$space-5;                          // 🆕 16/24 token
  background: t.$bg-panel;                              // 🆕 #161a22 (vs #181818)
  border-top: 1px solid t.$border;                      // 🆕 #232830 (vs #2a2a2a)
  flex-shrink: 0;
}

.composer-inner {
  max-width: 768px;
  margin: 0 auto;
  border-radius: t.$radius-xl;                          // 🆕 12px (vs 12px 一致)
  border: 1px solid t.$border-strong;                   // 🆕 #2f3540 (vs #3a3a3a)
  background: t.$bg-input;                              // 🆕 #1a1d23
  transition:
    border-color t.$dur-base t.$ease-base,
    box-shadow t.$dur-base t.$ease-base;

  &:focus-within {
    border-color: t.$accent-strong;
    box-shadow: 0 0 0 3px t.$accent-soft;
  }
}

.composer-textarea {
  width: 100%;
  padding: t.$space-3 t.$space-4 8px;                     // 🆕 12/16 token
  background: transparent;
  color: t.$fg;
  border: none;
  outline: none;
  font-size: t.$font-size-md;                           // 🆕 13px
  line-height: t.$line-height-relaxed;                  // 🆕 1.65
  resize: none;
  font-family: inherit;
  font-variant-numeric: tabular-nums;                  // 🆕 等宽数字

  &::placeholder {
    color: t.$fg-faint;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 t.$space-3 t.$space-2;                       // 🆕 12/8
}

.composer-hint {
  font-size: t.$font-size-xs;                           // 🆕 11px
  color: t.$fg-faint;
  font-family: t.$font-mono;
}
</style>
