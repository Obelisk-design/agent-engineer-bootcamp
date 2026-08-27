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
import { ref, onMounted, onUnmounted } from 'vue';
import type { AgentEvent } from '../../../libs/agent/index.js';
import type { Message } from '../../../libs/llm/index.js';
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
import EmbedDemo from './views/embed/EmbedDemo.vue';
import RagApp from './views/RagApp.vue';
import {
  accumulateFromResponse,
  accumulateFromRunSummary,
  emptySessionUsage,
  type SessionUsage,
} from './lib/sessionUsage.js';

// Day 12 hash route — `#/embed-demo` swaps Agent Console for EmbedDemo fullscreen.
// No vue-router: kept minimal (one route, dev-only). See CLAUDE.md Day 12 daily note.
const route = ref<string>(
  typeof window === 'undefined' ? '/' : (window.location.hash.slice(1) || '/'),
);
function syncRoute(): void {
  route.value = window.location.hash.slice(1) || '/';
}
onMounted(() => window.addEventListener('hashchange', syncRoute));
onUnmounted(() => window.removeEventListener('hashchange', syncRoute));

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

// 🆕 Day 09+: session 跨 turn 累计 token —— 跟 conversation 同生命周期
// (page refresh 时清零；resetRunState 不清)
// 累加逻辑在 lib/sessionUsage.ts,可单测
const sessionUsage = ref<SessionUsage>(emptySessionUsage);

let timelineIdCounter = 0;
let activeAbortController: AbortController | null = null;
const iterationToTimelineId = new Map<number, number>();

const conversationPanel = ref<InstanceType<typeof ConversationPanel> | null>(null);

const status = ref<'idle' | 'running' | 'completed' | 'error' | 'cancelled'>('idle');
function setStatus(s: typeof status.value): void {
  status.value = s;
}

function resetRunState(): void {
  // 🆕 Day 09: 多轮对话 —— conversation 不再每次清空，只清 per-run 状态
  // (timeline / runSummary / runContexts / errorMessage 等)
  // conversation 由 message_end 路径自然累积，多轮时 scrollback 直接看到
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
        // 🆕 Day 09+: session 跨 turn 累加 in/out
        sessionUsage.value = accumulateFromResponse(sessionUsage.value, ev.usage);
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
      // 🆕 Day 09+: session 跨 turn 取 Math.max(本 turn peak, 之前 session peak)
      // 语义:整个 session 内任意一次 LLM 调用的最大 prompt tokens
      sessionUsage.value = accumulateFromRunSummary(sessionUsage.value, ev.peakPromptTokens);
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
  resetRunState();
  conversation.value = [
    ...conversation.value,
    { role: 'user', text: input, streaming: false },
  ];
  scrollConversationToBottom();

  // 🆕 Day 09: 多轮对话 —— 把 conversation 累积的 user/assistant 翻译成 server 的 Message[]
  // system/tool 消息前端不持有（前端 ConversationItem 只 4 种 role）
  const historyMessages: Message[] = conversation.value
    .filter((c): c is { role: 'user' | 'assistant'; text: string; streaming: boolean } =>
      c.role === 'user' || c.role === 'assistant',
    )
    .filter((c) => c.text.length > 0) // 跳过 streaming 中的空 assistant
    .map((c) => ({ role: c.role, content: c.text }));

  isStreaming.value = true;
  activeAbortController = new AbortController();

  try {
    const events = defaultAgentClient.stream(input, {
      signal: activeAbortController.signal,
      messages: historyMessages,
    });
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
  <div v-if="route === '/embed-demo'" class="flex-1 min-h-0 overflow-auto">
    <EmbedDemo />
  </div>
  <div v-else-if="route === '/rag'" class="flex-1 min-h-0 overflow-auto bg-zinc-50 text-zinc-900">
    <RagApp />
  </div>
  <div v-else class="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
    <HeaderBar
      :model-name="modelName"
      :summary="runSummary"
      :latest-usage="latestUsage"
      :context-limit="contextLimit"
      :session-usage="sessionUsage"
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
