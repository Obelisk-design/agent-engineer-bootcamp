<!--
  apps/web/src/components/Composer.vue

  底部输入栏 —— Claude Code 风格：圆角多行 + 主操作按钮靠右下。
  - 受控 textarea，行数 1-8 自适应
  - Enter 提交 / Shift+Enter 换行 / Ctrl/⌘+Enter 也提交
  - busy=true 时 Send 替换为 Stop

  设计：与主区留 24px 上下 padding，按钮 hover 高亮。
-->

<script setup lang="ts">
import { ref } from 'vue';
import { IconSend, IconStop } from './icons.js';

defineProps<{ busy: boolean }>();
const emit = defineEmits<{
  send: [input: string];
  stop: [];
}>();

const inputText = ref('');

function submit(): void {
  const value = inputText.value.trim();
  if (value === '') return;
  emit('send', value);
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
  <div class="px-6 py-4 bg-zinc-950 border-t border-zinc-800 shrink-0">
    <div class="max-w-3xl mx-auto">
      <div
        class="rounded-xl border border-zinc-700 bg-zinc-900 focus-within:border-emerald-600/60 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all"
      >
        <textarea
          v-model="inputText"
          placeholder="Ask the agent anything…  (Enter to send · Shift+Enter for newline)"
          :disabled="busy"
          rows="2"
          class="w-full px-4 pt-3 pb-2 bg-transparent text-zinc-100 placeholder-zinc-500 text-[13.5px] leading-relaxed resize-none outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="composer-input"
          @keydown="onKeydown"
        />
        <div class="flex items-center justify-between px-3 pb-2.5">
          <span class="text-[10.5px] text-zinc-600 font-mono">
            Enter to send · Shift+Enter for newline
          </span>
          <button
            v-if="!busy"
            type="button"
            class="px-3.5 h-8 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 inline-flex items-center gap-1.5 font-semibold text-[12.5px] disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
            data-testid="composer-send"
            :disabled="inputText.trim() === ''"
            @click="submit"
          >
            <span>Send</span>
            <IconSend :size="13" />
          </button>
          <button
            v-else
            type="button"
            class="px-3.5 h-8 rounded-lg bg-red-500 hover:bg-red-400 text-zinc-50 inline-flex items-center gap-1.5 font-semibold text-[12.5px] transition-colors"
            data-testid="composer-stop"
            @click="emit('stop')"
          >
            <IconStop :size="12" />
            <span>Stop</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
