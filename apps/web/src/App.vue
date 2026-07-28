<!--
  apps/web/src/App.vue

  Agent Console 根组件 —— 双栏布局 + 状态管理。

  职责：
  - 维护 conversation 状态（user / assistant / thinking / error）
  - 维护 timeline 状态（每条 AgentEvent 一行）
  - 持有 AbortController（Stop 按钮触发 abort）
  - 消费 AgentClient.stream() 的 AsyncIterable<AgentEvent>
  - 把 AgentEvent 分发到两个面板

  设计原则（CLAUDE.md Day 02 §9 边界）：
  - 组件不直接 fetch / 解析 SSE —— 全部委托 AgentClient
  - 组件不持有 AgentEvent 协议字段以外的额外状态
-->

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { AgentEvent } from '../../../libs/agent/index.js';
import { defaultAgentClient } from './api/agentClient.js';
import Conversation from './components/Conversation.vue';
import Timeline from './components/Timeline.vue';
import InputBar from './components/InputBar.vue';
import HeaderPill from './components/HeaderPill.vue';
import MetricsSidebar from './components/MetricsSidebar.vue';
import type { ConversationItem, TimelineItem } from './types/agentEvent.js';

// ============ 状态 ============

const conversation = ref<ConversationItem[]>([]);
const timeline = ref<TimelineItem[]>([]);
const eventLog = ref<AgentEvent[]>([]);
const isStreaming = ref(false);
const isThinking = ref(false);
const errorMessage = ref<string | null>(null);
const isCancelled = ref(false);
let timelineIdCounter = 0;
let activeAbortController: AbortController | null = null;
const iterationToTimelineId = new Map<number, number>();

interface ContextRow {
  readonly iteration: number;
  readonly promptTokens: number;
  readonly limit: number;
}
interface RunSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly peakPromptTokens: number;
  readonly iterations: number;
}
const runSummary = ref<RunSummary | null>(null);
const runContexts = ref<ContextRow[]>([]);
const contextLimit = ref<number>(200_000); // fallback, updated when context event arrives

/** 当前 streaming bubble 引用 —— 用来 append message_delta */
const streamingIndex = computed(() =>
  conversation.value.findIndex((c) => c.role === 'assistant' && c.streaming),
);

// ============ helpers ============

function resetTurn(): void {
  conversation.value = [];
  timeline.value = [];
  eventLog.value = [];
  errorMessage.value = null;
  isCancelled.value = false;
  runSummary.value = null;
  runContexts.value = [];
  iterationToTimelineId.clear();
}

function appendConversation(item: ConversationItem): void {
  conversation.value.push(item);
}

function appendTimeline(item: Omit<TimelineItem, 'id'>): void {
  timeline.value.push({ ...item, id: timelineIdCounter++ });
}

function createTimelineEntry(title: string, detail: string | null, status: TimelineItem['status'], kind: string, meta?: Record<string, unknown> | null): number {
  appendTimeline({ title, detail, status, kind, meta: meta ?? null });
  return timelineIdCounter - 1;
}

function scrollConversationToBottom(): void {
  // 触发子组件 scrollTop 更新
  nextTick(() => {
    const el = document.getElementById('conversation-body');
    if (el !== null) el.scrollTop = el.scrollHeight;
  });
}

function scrollTimelineToBottom(): void {
  nextTick(() => {
    const el = document.getElementById('timeline-body');
    if (el !== null) el.scrollTop = el.scrollHeight;
  });
}

function scrollToIteration(n: number): void {
  const tid = iterationToTimelineId.get(n);
  if (tid === undefined) return;
  nextTick(() => {
    const el = document.querySelector(`[data-timeline-id="${tid}"]`);
    if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ============ AgentEvent 路由（type-safe switch） ============

function dispatch(ev: AgentEvent): void {
  eventLog.value = [...eventLog.value, ev];

  switch (ev.kind) {
    case 'message_start':
      isThinking.value = true;
      appendConversation({ role: 'thinking', text: 'Agent 接收任务…', streaming: false });
      createTimelineEntry('Agent Start', 'Execution started', 'done', 'message_start');
      scrollConversationToBottom();
      scrollTimelineToBottom();
      break;

    case 'iteration':
      createTimelineEntry(`Iteration ${String(ev.n)}`, null, 'active', 'iteration');
      scrollTimelineToBottom();
      break;

    case 'request': {
      const payload = { iteration: ev.iteration, messages: ev.messages };
      const tid = createTimelineEntry(
        `LLM Request · ${String(ev.iteration)}`,
        JSON.stringify(payload, null, 2),
        'active',
        'request',
        { model: 'model', messages: ev.messages.length },
      );
      iterationToTimelineId.set(ev.iteration, tid);
      scrollTimelineToBottom();
      break;
    }

    case 'response': {
      const payload = {
        iteration: ev.iteration,
        content: ev.content,
        toolCalls: ev.toolCalls,
        usage: ev.usage,
      };
      createTimelineEntry(
        `LLM Response · ${String(ev.iteration)}`,
        JSON.stringify(payload, null, 2),
        'active',
        'response',
        {
          content: ev.content ?? null,
          toolCalls: ev.toolCalls?.length ?? 0,
          usage: ev.usage ?? null,
        },
      );
      scrollTimelineToBottom();
      break;
    }

    case 'tool_call':
      createTimelineEntry(`Tool Call · ${ev.name}`, JSON.stringify(ev.args, null, 2), 'active', 'tool_call');
      scrollTimelineToBottom();
      break;

    case 'tool_result':
      createTimelineEntry('Tool Result', ev.output, 'done', 'tool_result');
      scrollTimelineToBottom();
      break;

    case 'context': {
      runContexts.value = [...runContexts.value, {
        iteration: ev.iteration,
        promptTokens: ev.promptTokens,
        limit: ev.limit,
      }];
      scrollTimelineToBottom();
      break;
    }

    case 'run_summary': {
      runSummary.value = {
        totalPromptTokens: ev.totalPromptTokens,
        totalCompletionTokens: ev.totalCompletionTokens,
        peakPromptTokens: ev.peakPromptTokens,
        iterations: ev.iterations,
      };
      if (runContexts.value.length > 0) {
        const lastCtx = runContexts.value[runContexts.value.length - 1];
        if (lastCtx !== undefined) contextLimit.value = lastCtx.limit;
      }
      scrollTimelineToBottom();
      break;
    }

    case 'message_delta': {
      // 打字机：append 到当前 streaming bubble（如果有），否则创建新的
      const idx = streamingIndex.value;
      if (idx >= 0) {
        const existing = conversation.value[idx];
        if (existing !== undefined) {
          conversation.value[idx] = { ...existing, text: existing.text + ev.content };
        }
      } else {
        // 移除 thinking bubble，创建 streaming bubble
        conversation.value = conversation.value.filter((c) => c.role !== 'thinking');
        isThinking.value = false;
        appendConversation({ role: 'assistant', text: ev.content, streaming: true });
      }
      scrollConversationToBottom();
      break;
    }

    case 'message_end': {
      // finalize streaming bubble
      const idx = streamingIndex.value;
      if (idx >= 0) {
        const existing = conversation.value[idx];
        if (existing !== undefined) {
          conversation.value[idx] = { ...existing, text: ev.content, streaming: false };
        }
      } else {
        // 没有 streaming bubble，直接整段显示
        conversation.value = conversation.value.filter((c) => c.role !== 'thinking');
        isThinking.value = false;
        appendConversation({ role: 'assistant', text: ev.content, streaming: false });
      }
      createTimelineEntry('Final Answer', ev.content, 'done', 'message_end');
      scrollConversationToBottom();
      scrollTimelineToBottom();
      break;
    }

    case 'done':
      createTimelineEntry('Done', null, 'done', 'done');
      scrollTimelineToBottom();
      break;

    case 'error':
      isThinking.value = false;
      const friendlyError = ev.message === 'aborted by signal' ? '已取消当前执行' : ev.message;
      if (ev.message === 'aborted by signal') {
        isCancelled.value = true;
      }
      // finalize streaming bubble (保留已写内容)
      const errIdx = streamingIndex.value;
      if (errIdx >= 0) {
        const existing = conversation.value[errIdx];
        if (existing !== undefined) {
          conversation.value[errIdx] = { ...existing, streaming: false };
        }
      }
      appendConversation({ role: 'error', text: friendlyError, streaming: false });
      createTimelineEntry('Error', friendlyError, 'error', 'error');
      errorMessage.value = friendlyError;
      scrollConversationToBottom();
      scrollTimelineToBottom();
      break;
  }
}

// ============ 主流程 ============

async function send(input: string): Promise<void> {
  if (input.trim() === '' || isStreaming.value) return;
  resetTurn();
  appendConversation({ role: 'user', text: input, streaming: false });
  scrollConversationToBottom();

  isStreaming.value = true;
  activeAbortController = new AbortController();

  try {
    const events = defaultAgentClient.stream(input, { signal: activeAbortController.signal });
    for await (const ev of events) {
      dispatch(ev);
    }
  } catch (err) {
    // 协议层错误（HTTP 400 / 网络断开 / fetch reject）
    isThinking.value = false;
    const msg = err instanceof Error ? err.message : String(err);
    appendConversation({ role: 'error', text: msg, streaming: false });
    createTimelineEntry('Request Failed', msg, 'error', 'error');
    errorMessage.value = msg;
    scrollConversationToBottom();
    scrollTimelineToBottom();
  } finally {
    isStreaming.value = false;
    activeAbortController = null;
  }
}

// ============ Stop 按钮（Day 08 Step 6） ============

function stop(): void {
  if (activeAbortController !== null) {
    activeAbortController.abort();
  }
}

function clear(): void {
  resetTurn();
}
</script>

<template>
  <header class="app-header">
    <div class="title">
      Agent Console
      <span class="badge">Day 08 · Context Window + Tailwind</span>
    </div>
    <div class="flex items-center gap-3">
      <HeaderPill :summary="runSummary" :context-limit="contextLimit" />
      <span v-if="isCancelled" class="status-pill">Execution cancelled</span>
      <button
        v-if="isStreaming"
        class="stop"
        data-testid="stop-btn"
        @click="stop"
      >
        Stop
      </button>
      <button data-testid="clear-btn" @click="clear">Clear</button>
    </div>
  </header>

  <main class="panels grid grid-cols-[240px_1fr_360px]">
    <MetricsSidebar
      :contexts="runContexts"
      :summary="runSummary"
      @scroll-to-iteration="scrollToIteration"
    />
    <Conversation :items="conversation" />
    <Timeline :items="timeline" />
  </main>

  <InputBar :busy="isStreaming" @send="send" />
</template>