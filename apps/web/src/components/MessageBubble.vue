<!--
  apps/web/src/components/MessageBubble.vue

  单条消息 — ChatGPT / Claude 风格无气泡。
  - user: 靠右，role pill "You" + mono timestamp，文本本身无背景
  - assistant: 靠左，avatar + role pill（模型名）+ 时间，文本无背景
  - thinking: 同 assistant 但 italic + 琥珀色 dot
  - error: assistant 形态，红色边框 + 警告前缀
  - assistant streaming 时文本尾追加 ▍（用 styles.css 的 .streaming-cursor）

  设计原则：参考 ChatGPT 与 LangSmith run detail 的 run message。
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

const ROLE_DOT_CLS: Record<Props['role'], string> = {
  user: 'bg-sky-400',
  assistant: 'bg-emerald-400',
  thinking: 'bg-amber-400 animate-pulse',
  error: 'bg-red-400',
};

const isFenced = computed<boolean>(() => /```/.test(props.text));

const AURA: Record<Props['role'], string> = {
  user: '',
  assistant: '',
  thinking: '',
  error: 'border border-red-900/50 bg-red-950/20 rounded-lg p-4',
};
</script>

<template>
  <article
    :class="['group flex gap-3 px-6 py-5', props.role === 'user' ? 'flex-row-reverse' : '']"
    data-testid="message-bubble"
  >
    <!-- Avatar -->
    <div
      :class="[
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-zinc-950 font-bold',
        props.role === 'user'
          ? 'bg-sky-500'
          : props.role === 'thinking'
            ? 'bg-amber-500'
            : props.role === 'error'
              ? 'bg-red-500'
              : 'bg-emerald-500',
      ]"
    >
      <IconUser v-if="props.role === 'user'" :size="15" />
      <IconClose v-else-if="props.role === 'error'" :size="15" />
      <IconBot v-else :size="15" />
    </div>

    <!-- Body -->
    <div :class="['min-w-0 flex-1', AURA[props.role]]">
      <!-- Header: role pill + meta -->
      <header class="flex items-center gap-2 mb-1.5">
        <span
          :class="[
            'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider text-zinc-950',
            ROLE_DOT_CLS[props.role],
          ]"
        >
          {{ ROLE_LABEL[props.role] }}
        </span>
        <span v-if="props.role === 'assistant'" class="text-[11px] text-zinc-500 font-mono">
          deepseek-v4-pro
        </span>
      </header>

      <!-- Content -->
      <div
        :class="[
          'text-[13.5px] leading-relaxed text-zinc-100',
          props.streaming && props.role === 'assistant' ? 'streaming-cursor' : '',
          props.role === 'thinking' ? 'italic text-zinc-400' : '',
          props.role === 'error' ? 'text-red-300' : '',
        ]"
      >
        <CodeBlock v-if="isFenced" :text="props.text" />
        <div v-else class="whitespace-pre-wrap break-words">{{ props.text }}</div>
      </div>
    </div>
  </article>
</template>
