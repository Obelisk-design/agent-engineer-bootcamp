<!--
  apps/web/src/App.vue

  Agent Console 根 —— 状态分发 + 布局壳（重构后）。
  布局：
  [HeaderBar — h-11]
  [LeftMenu (64px) | Main (flex-col, Conversation + Timeline) | RightPanel (288px, 可折叠)]
  [Composer — 自动 fixed bottom]

  CLAUDE.md Day 02 §9 边界：组件不直接 fetch / 解析 SSE —— 全部委托 AgentClient。
-->

<script setup lang="ts">
import { ref } from 'vue';
import type { AgentEvent } from '../../../libs/agent/index.js';
import { defaultAgentClient } from './api/agentClient.js';
import type {
  ConversationItem,
  TimelineItem,
  ContextRow,
  RunSummary,
  LatestUsage,
} from './types/agentEvent.js';
import HeaderBar from './components/HeaderBar.vue';
import Composer from './components/Composer.vue';
import LeftMenu from './components/LeftMenu.vue';
import RightPanel from './components/RightPanel.vue';
import ConversationPanel from './components/ConversationPanel.vue';
import ExecutionTimeline from './components/ExecutionTimeline.vue';

const conversation = ref<ConversationItem[]>([]);
const timeline = ref<TimelineItem[]>([]);
const runContexts = ref<ContextRow[]>([]);
const runSummary = ref<RunSummary | null>(null);
const contextLimit = ref<number>(200_000);
const latestUsage = ref<LatestUsage | null>(null);
const isStreaming = ref(false);
const errorMessage = ref<string | null>(null);
const isCancelled = ref(false);
const rightPanelOpen = ref(true);
const modelName = ref<string>(import.meta.env.VITE_MODEL_NAME ?? 'deepseek-v4-pro');

let timelineIdCounter = 0;
let activeAbortController: AbortController | null = null;
const iterationToTimelineId = new Map<number, number>();

const conversationPanel = ref<InstanceType<typeof ConversationPanel> | null>(null);

const status = ref<'idle' | 'running' | 'completed' | 'error' | 'cancelled'>('idle');
function setStatus(s: typeof status.value): void {
  status.value = s;
}

function resetTurn(): void {
  conversation.value = [];
  timeline.value = [];
  runContexts.value = [];
  runSummary.value = null;
  latestUsage.value = null;
  errorMessage.value = null;
  isCancelled.value = false;
  iterationToTimelineId.clear();
  timelineIdCounter = 0;
  setStatus('idle');
}

function appendTimeline(seed: Omit<TimelineItem, 'id'>): number {
  timeline.value = [...timeline.value, { ...seed, id: timelineIdCounter++ }];
  return timelineIdCounter - 1;
}

function scrollTimelineToBottom(): void {
  // timeline 现在嵌在 RightPanel 里，scroll 由其内部容器管理 —— 这里 no-op
}
function scrollConversationToBottom(): void {
  conversationPanel.value?.scrollToBottom();
}

function dispatch(ev: AgentEvent): void {
  switch (ev.kind) {
    case 'message_start': {
      setStatus('running');
      conversation.value = [
        ...conversation.value,
        { role: 'thinking', text: 'Agent 接收任务…', streaming: false },
      ];
      appendTimeline({
        title: 'Agent Start',
        detail: null,
        status: 'done',
        kind: 'message_start',
      });
      scrollConversationToBottom();
      scrollTimelineToBottom();
      break;
    }
    case 'iteration':
      appendTimeline({
        title: `Iteration ${String(ev.n)}`,
        detail: null,
        status: 'active',
        kind: 'iteration',
        meta: { iteration: ev.n },
      });
      scrollTimelineToBottom();
      break;
    case 'request': {
      const tid = appendTimeline({
        title: `LLM Request · ${String(ev.iteration)}`,
        detail: JSON.stringify({ iteration: ev.iteration, messages: ev.messages }, null, 2),
        status: 'active',
        kind: 'request',
        meta: { model: 'model', messages: ev.messages.length, iteration: ev.iteration },
      });
      iterationToTimelineId.set(ev.iteration, tid);
      scrollTimelineToBottom();
      break;
    }
    case 'response': {
      if (ev.usage !== undefined) {
        latestUsage.value = {
          iteration: ev.iteration,
          promptTokens: ev.usage.promptTokens,
          completionTokens: ev.usage.completionTokens,
        };
      }
      appendTimeline({
        title: `LLM Response · ${String(ev.iteration)}`,
        detail: JSON.stringify(
          {
            iteration: ev.iteration,
            content: ev.content,
            toolCalls: ev.toolCalls,
            usage: ev.usage,
          },
          null,
          2,
        ),
        status: 'done',
        kind: 'response',
        meta: {
          content: ev.content ?? null,
          toolCalls: ev.toolCalls?.length ?? 0,
          usage: ev.usage ?? null,
          iteration: ev.iteration,
        },
      });
      scrollTimelineToBottom();
      break;
    }
    case 'tool_call':
      appendTimeline({
        title: `Tool Call · ${ev.name}`,
        detail: JSON.stringify(ev.args, null, 2),
        status: 'active',
        kind: 'tool_call',
        meta: { name: ev.name },
      });
      scrollTimelineToBottom();
      break;
    case 'tool_result':
      appendTimeline({
        title: 'Tool Result',
        detail: ev.output,
        status: 'done',
        kind: 'tool_result',
      });
      scrollTimelineToBottom();
      break;
    case 'context': {
      const ctx: ContextRow = {
        iteration: ev.iteration,
        promptTokens: ev.promptTokens,
        limit: ev.limit,
      };
      runContexts.value = [...runContexts.value, ctx];
      contextLimit.value = ev.limit;
      scrollTimelineToBottom();
      break;
    }
    case 'run_summary':
      runSummary.value = {
        totalPromptTokens: ev.totalPromptTokens,
        totalCompletionTokens: ev.totalCompletionTokens,
        peakPromptTokens: ev.peakPromptTokens,
        iterations: ev.iterations,
      };
      break;
    case 'message_delta': {
      const idx = conversation.value.findIndex((c) => c.role === 'assistant' && c.streaming);
      if (idx >= 0) {
        const existing = conversation.value[idx];
        if (existing !== undefined) {
          const updated = [...conversation.value];
          updated[idx] = { ...existing, text: existing.text + ev.content };
          conversation.value = updated;
        }
      } else {
        conversation.value = [
          ...conversation.value.filter((c) => c.role !== 'thinking'),
          { role: 'assistant', text: ev.content, streaming: true },
        ];
      }
      scrollConversationToBottom();
      break;
    }
    case 'message_end': {
      const idx = conversation.value.findIndex((c) => c.role === 'assistant' && c.streaming);
      if (idx >= 0) {
        const existing = conversation.value[idx];
        if (existing !== undefined) {
          const updated = [...conversation.value];
          updated[idx] = { ...existing, text: ev.content, streaming: false };
          conversation.value = updated;
        }
      } else {
        conversation.value = [
          ...conversation.value.filter((c) => c.role !== 'thinking'),
          { role: 'assistant', text: ev.content, streaming: false },
        ];
      }
      appendTimeline({
        title: 'Final Answer',
        detail: ev.content,
        status: 'done',
        kind: 'message_end',
      });
      scrollConversationToBottom();
      scrollTimelineToBottom();
      break;
    }
    case 'done':
      appendTimeline({ title: 'Done', detail: null, status: 'done', kind: 'done' });
      setStatus('completed');
      scrollTimelineToBottom();
      break;
    case 'error': {
      const friendly = ev.message === 'aborted by signal' ? '已取消当前执行' : ev.message;
      if (ev.message === 'aborted by signal') isCancelled.value = true;
      const idx = conversation.value.findIndex((c) => c.role === 'assistant' && c.streaming);
      if (idx >= 0) {
        const existing = conversation.value[idx];
        if (existing !== undefined) {
          const updated = [...conversation.value];
          updated[idx] = { ...existing, streaming: false };
          conversation.value = updated;
        }
      }
      conversation.value = [...conversation.value, { role: 'error', text: friendly, streaming: false }];
      appendTimeline({
        title: 'Error',
        detail: friendly,
        status: 'error',
        kind: 'error',
      });
      errorMessage.value = friendly;
      setStatus(ev.message === 'aborted by signal' ? 'cancelled' : 'error');
      scrollConversationToBottom();
      scrollTimelineToBottom();
      break;
    }
  }
}

async function send(input: string): Promise<void> {
  if (input.trim() === '' || isStreaming.value) return;
  resetTurn();
  conversation.value = [
    ...conversation.value,
    { role: 'user', text: input, streaming: false },
  ];
  scrollConversationToBottom();

  isStreaming.value = true;
  activeAbortController = new AbortController();

  try {
    const events = defaultAgentClient.stream(input, { signal: activeAbortController.signal });
    for await (const ev of events) {
      dispatch(ev);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    conversation.value = [
      ...conversation.value,
      { role: 'error', text: msg, streaming: false },
    ];
    appendTimeline({
      title: 'Request Failed',
      detail: msg,
      status: 'error',
      kind: 'error',
    });
    errorMessage.value = msg;
    setStatus('error');
  } finally {
    isStreaming.value = false;
    activeAbortController = null;
  }
}

function stop(): void {
  if (activeAbortController !== null) activeAbortController.abort();
}

function scrollToIteration(n: number): void {
  // timeline 在 RightPanel 内 —— 通过 querySelector 滚动
  queueMicrotask(() => {
    const el = document.querySelector(
      `[data-timeline-iter="${String(n)}"]`,
    ) as HTMLElement | null;
    if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function toggleRightPanel(): void {
  rightPanelOpen.value = !rightPanelOpen.value;
}
</script>

<template>
  <div class="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
    <HeaderBar
      :model-name="modelName"
      :summary="runSummary"
      :latest-usage="latestUsage"
      :context-limit="contextLimit"
      :status="status"
    />

    <div class="flex flex-1 min-h-0">
      <LeftMenu @toggle-right-panel="toggleRightPanel" />
      <ConversationPanel
        ref="conversationPanel"
        :items="conversation"
        class="flex-1 min-w-0"
      />
      <RightPanel
        v-if="rightPanelOpen"
        :contexts="runContexts"
        :summary="runSummary"
        :timeline="timeline"
        @scroll-to-iteration="scrollToIteration"
      />
    </div>

    <Composer :busy="isStreaming" @send="send" @stop="stop" />
  </div>
</template>
