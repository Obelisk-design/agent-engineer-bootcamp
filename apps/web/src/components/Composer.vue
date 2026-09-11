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
.composer {
  padding: 16px 24px;
  background: #181818;
  border-top: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.composer-inner {
  max-width: 768px;
  margin: 0 auto;
  border-radius: 12px;
  border: 1px solid #3a3a3a;
  background: #1e1e1e;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus-within {
    border-color: #409eff;
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
  }
}

.composer-textarea {
  width: 100%;
  padding: 12px 16px 8px;
  background: transparent;
  color: #e5e5e5;
  border: none;
  outline: none;
  font-size: 13.5px;
  line-height: 1.6;
  resize: none;
  font-family: inherit;

  &::placeholder {
    color: #6a6a6a;
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
  padding: 0 12px 10px;
}

.composer-hint {
  font-size: 10.5px;
  color: #6a6a6a;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
