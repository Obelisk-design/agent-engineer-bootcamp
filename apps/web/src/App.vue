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

// ============ 状态 ============

interface ConversationItem {
  readonly role: 'user' | 'assistant' | 'thinking' | 'error';
  readonly text: string;
  readonly streaming: boolean;
}

interface TimelineItem {
  readonly id: number;
  readonly label: string;
  readonly detail: string | null;
  readonly status: 'done' | 'active' | 'error';
  readonly collapsible: boolean;
  readonly collapsibleOpen: boolean;
  readonly summaryText: string | null;
}

const conversation = ref<ConversationItem[]>([]);
const timeline = ref<TimelineItem[]>([]);
const isStreaming = ref(false);
const isThinking = ref(false);
const errorMessage = ref<string | null>(null);
let timelineIdCounter = 0;
let activeAbortController: AbortController | null = null;

/** 当前 streaming bubble 引用 —— 用来 append message_delta */
const streamingIndex = computed(() =>
  conversation.value.findIndex((c) => c.role === 'assistant' && c.streaming),
);

// ============ helpers ============

function resetTurn(): void {
  conversation.value = [];
  timeline.value = [];
  errorMessage.value = null;
}

function appendConversation(item: ConversationItem): void {
  conversation.value.push(item);
}

function appendTimeline(item: Omit<TimelineItem, 'id'>): void {
  timeline.value.push({ ...item, id: timelineIdCounter++ });
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

// ============ AgentEvent 路由（type-safe switch） ============

function dispatch(ev: AgentEvent): void {
  switch (ev.kind) {
    case 'message_start':
      isThinking.value = true;
      appendConversation({ role: 'thinking', text: 'Agent 接收任务…', streaming: false });
      appendTimeline({ label: '接收任务', detail: null, status: 'done', collapsible: false, collapsibleOpen: false, summaryText: null });
      scrollConversationToBottom();
      scrollTimelineToBottom();
      break;

    case 'iteration':
      appendTimeline({ label: `Iteration ${String(ev.n)}`, detail: null, status: 'active', collapsible: false, collapsibleOpen: false, summaryText: null });
      scrollTimelineToBottom();
      break;

    case 'request': {
      const payload = { iteration: ev.iteration, messages: ev.messages };
      appendTimeline({
        label: `request · Iteration ${String(ev.iteration)}`,
        detail: JSON.stringify(payload, null, 2),
        status: 'active',
        collapsible: true,
        collapsibleOpen: false,
        summaryText: '📨 查看 LLM 请求（messages 累计）',
      });
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
      appendTimeline({
        label: `response · Iteration ${String(ev.iteration)}`,
        detail: JSON.stringify(payload, null, 2),
        status: 'active',
        collapsible: true,
        collapsibleOpen: false,
        summaryText: '🤖 查看 LLM 响应（含 usage）',
      });
      scrollTimelineToBottom();
      break;
    }

    case 'tool_call':
      appendTimeline({
        label: `调用 ${ev.name}`,
        detail: JSON.stringify(ev.args),
        status: 'active',
        collapsible: false,
        collapsibleOpen: false,
        summaryText: null,
      });
      scrollTimelineToBottom();
      break;

    case 'tool_result':
      appendTimeline({
        label: 'Tool 返回',
        detail: ev.output,
        status: 'done',
        collapsible: false,
        collapsibleOpen: false,
        summaryText: null,
      });
      scrollTimelineToBottom();
      break;

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
      appendTimeline({
        label: '生成答案',
        detail: null,
        status: 'done',
        collapsible: false,
        collapsibleOpen: false,
        summaryText: null,
      });
      scrollConversationToBottom();
      scrollTimelineToBottom();
      break;
    }

    case 'done':
      appendTimeline({ label: '完成', detail: null, status: 'done', collapsible: false, collapsibleOpen: false, summaryText: null });
      scrollTimelineToBottom();
      break;

    case 'error':
      isThinking.value = false;
      // finalize streaming bubble (保留已写内容)
      const errIdx = streamingIndex.value;
      if (errIdx >= 0) {
        const existing = conversation.value[errIdx];
        if (existing !== undefined) {
          conversation.value[errIdx] = { ...existing, streaming: false };
        }
      }
      appendConversation({ role: 'error', text: ev.message, streaming: false });
      appendTimeline({
        label: '错误',
        detail: ev.message,
        status: 'error',
        collapsible: false,
        collapsibleOpen: false,
        summaryText: null,
      });
      errorMessage.value = ev.message;
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
    appendTimeline({
      label: '请求失败',
      detail: msg,
      status: 'error',
      collapsible: false,
      collapsibleOpen: false,
      summaryText: null,
    });
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
      <span class="badge">Day 08 · Vue + Vite 前端分离</span>
    </div>
    <div class="actions">
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

  <main class="panels">
    <Conversation :items="conversation" />
    <Timeline :items="timeline" />
  </main>

  <InputBar :busy="isStreaming" @send="send" />
</template>