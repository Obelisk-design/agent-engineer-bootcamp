<!--
  apps/web/src/components/MessageBubble.vue

  Day 23 Task 5 (P4) + Phase U (Task 6) —— 单条消息（premium 版）

  - user: 靠右，role pill "You" + mono 时间戳，文本本身无背景
  - assistant: 靠左，avatar + role pill（模型名）+ 时间，文本无背景
  - thinking: 同 assistant 但 italic + 琥珀色 dot
  - error: assistant 形态，红色边框 + 警告前缀
  - assistant streaming 时文本尾追加 ▍（用 styles.css 的 .streaming-cursor）

  Phase U 改造（视觉 + 动画，**props / emits / 业务逻辑零改动**）：
  - Tailwind utility class → scoped SCSS + token
  - 进入动画 fadeSlideUp（与 ConversationPanel 的 msg-enter-active 配合）
  - 等宽数字 tabular-nums
  - 颜色 / 间距 / 字号走 token
-->
<script setup lang="ts">
import { computed } from 'vue';
import { IconUser, IconBot, IconClose } from './icons.js';
import CodeBlock from './CodeBlock.vue';

interface Props {
  role: 'user' | 'assistant' | 'thinking' | 'error';
  text: string;
  streaming: boolean;
}
const props = defineProps<Props>();

const ROLE_LABEL: Record<Props['role'], string> = {
  user: 'You',
  assistant: 'Assistant',
  thinking: 'Thinking…',
  error: 'Error',
};

// 🆕 Phase U：从 Tailwind 字符串类映射改为 token CSS var，
// 渲染走 inline style 或 :class 走 token 化的 class
const ROLE_PILL_CLS: Record<Props['role'], string> = {
  user: 'pill--sky',
  assistant: 'pill--emerald',
  thinking: 'pill--amber',
  error: 'pill--red',
};

const ROLE_AVATAR_CLS: Record<Props['role'], string> = {
  user: 'avatar--sky',
  assistant: 'avatar--emerald',
  thinking: 'avatar--amber',
  error: 'avatar--red',
};

const isFenced = computed<boolean>(() => /```/.test(props.text));
</script>

<template>
  <article
    class="bubble"
    :class="[`bubble--${props.role}`, props.role === 'user' ? 'bubble--right' : '']"
    data-testid="message-bubble"
  >
    <!-- Avatar -->
    <div class="avatar" :class="ROLE_AVATAR_CLS[props.role]">
      <IconUser v-if="props.role === 'user'" :size="14" />
      <IconClose v-else-if="props.role === 'error'" :size="14" />
      <IconBot v-else :size="14" />
    </div>

    <!-- Body -->
    <div class="body" :class="{ 'body--error': props.role === 'error' }">
      <!-- Header: role pill + meta -->
      <header class="bubble-header">
        <span class="pill" :class="ROLE_PILL_CLS[props.role]">{{ ROLE_LABEL[props.role] }}</span>
        <span v-if="props.role === 'assistant'" class="model mono">deepseek-v4-pro</span>
      </header>

      <!-- Content -->
      <div
        class="content"
        :class="{
          'streaming-cursor': props.streaming && props.role === 'assistant',
          italic: props.role === 'thinking',
          'text-muted': props.role === 'thinking',
          'text-error': props.role === 'error',
        }"
      >
        <CodeBlock v-if="isFenced" :text="props.text" />
        <div v-else class="text-pre">{{ props.text }}</div>
      </div>
    </div>
  </article>
</template>

<style lang="scss" scoped>
@use '@/views/agent/styles/tokens' as t;

.bubble {
  display: flex;
  gap: t.$space-3;
  padding: t.$space-4 t.$space-5;
  animation: fadeSlideUp t.$dur-base t.$ease-out both;     // 🆕 Phase U：进入动画

  &--right {
    flex-direction: row-reverse;
  }
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: t.$bg-elevated;
  color: t.$bg-base;

  &--sky      { background: t.$info; }
  &--emerald  { background: t.$accent-strong; }
  &--amber    { background: t.$warn; }
  &--red      { background: t.$danger; }
}

.body {
  min-width: 0;
  flex: 1;

  &--error {
    border-radius: t.$radius-lg;
    border: 1px solid rgba(t.$danger, 0.40);
    background: t.$danger-soft;
    padding: t.$space-3 t.$space-4;
  }
}

.bubble-header {
  display: flex;
  align-items: center;
  gap: t.$space-2;
  margin-bottom: t.$space-2;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px t.$space-2;
  border-radius: t.$radius-sm;
  font-size: 10px;
  font-weight: t.$font-weight-semibold;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: t.$bg-base;

  &--sky      { background: t.$info; }
  &--emerald  { background: t.$accent-strong; }
  &--amber    { background: t.$warn; }
  &--red      { background: t.$danger; }
}

.model {
  color: t.$fg-muted;
  font-size: 11px;
  font-family: t.$font-mono;
  font-variant-numeric: tabular-nums;
}

.content {
  font-size: t.$font-size-md;
  line-height: t.$line-height-relaxed;
  color: t.$fg;
  font-variant-numeric: tabular-nums;
}

.italic { font-style: italic; }
.text-muted { color: t.$fg-muted; }
.text-error { color: t.$danger; }

.text-pre {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
