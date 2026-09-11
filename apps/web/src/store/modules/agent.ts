/**
 * apps/web/src/store/modules/agent.ts
 *
 * Day 23 Task 5 (P4) —— Agent Console 全局状态层（useAgentStore）
 *
 * 职责（接 apps/web/src/App.vue 旧版 dispatch / send / stop）：
 * - 维护 conversation / timeline / runContexts / runSummary / sessionUsage / latestUsage
 * - 维护 isStreaming / status / errorMessage
 * - 暴露 dispatch(ev) —— 处理 14 种 AgentEvent kind（message_start / iteration /
 *   request / response / message_delta / context / tool_call / tool_call_start /
 *   tool_call_end / tool_result / run_summary / message_end / done / error）
 * - 暴露 async send(input) —— 把 conversation 历史的 user/assistant 翻译成
 *   server 的 Message[]，调 defaultAgentClient.stream()，for-await dispatch
 * - 暴露 stop() —— activeAbort?.abort()
 *
 * 边界纪律（CLAUDE.md Day 02 §9）：
 * - 组件不直接 fetch / 解析 SSE —— 全部委托 agentClient
 * - 组件不持 AgentEvent 协议字段 —— 通过 store 暴露的 reactive 状态消费
 *
 * Day 23 改造：把原 App.vue ~280 行状态机从组件层抽到 pinia store，
 * 让 4 件套 layout 组件（HeaderBar/ConversationPanel/RightPanel/Composer）
 * 全部走 useAgentStore() 解耦。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { defaultAgentClient } from '@/api/agentClient';
import type { AgentEvent } from '@/../../libs/agent/index.js';
import type { Message } from '@/../../libs/llm/index.js';
import {
  accumulateFromResponse,
  accumulateFromRunSummary,
  emptySessionUsage,
  type SessionUsage,
} from '@/lib/sessionUsage';
import type {
  ConversationItem,
  TimelineItem,
  ContextRow,
  RunSummary,
  LatestUsage,
} from '@/types/agentEvent';

export type RunStatus = 'idle' | 'running' | 'completed' | 'error' | 'cancelled';

export const useAgentStore = defineStore('agent', () => {
  // ============ 状态 ============
  const conversation = ref<ConversationItem[]>([]);
  const timeline = ref<TimelineItem[]>([]);
  const runContexts = ref<ContextRow[]>([]);
  const runSummary = ref<RunSummary | null>(null);
  const contextLimit = ref<number>(200_000);
  const latestUsage = ref<LatestUsage | null>(null);
  const isStreaming = ref(false);
  const errorMessage = ref<string | null>(null);
  const isCancelled = ref(false);
  const sessionUsage = ref<SessionUsage>(emptySessionUsage);
  const status = ref<RunStatus>('idle');
  const modelName = ref<string>(
    import.meta.env['VITE_MODEL_NAME'] !== undefined &&
      typeof import.meta.env['VITE_MODEL_NAME'] === 'string' &&
      import.meta.env['VITE_MODEL_NAME'].length > 0
      ? (import.meta.env['VITE_MODEL_NAME'] as string)
      : 'deepseek-v4-pro',
  );

  let timelineIdCounter = 0;
  let activeAbortController: AbortController | null = null;
  const iterationToTimelineId = new Map<number, number>();

  // ============ 计算属性 ============
  const streamingIndex = computed(() =>
    conversation.value.findIndex((c) => c.role === 'assistant' && c.streaming),
  );

  // ============ helpers ============
  function setStatus(s: RunStatus): void {
    status.value = s;
  }

  function resetRunState(): void {
    // Day 09+: 多轮对话 —— conversation 不再每次清空，只清 per-run 状态
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

  function scrollToIteration(n: number): void {
    queueMicrotask(() => {
      const el = document.querySelector(
        `[data-timeline-iter="${String(n)}"]`,
      ) as HTMLElement | null;
      if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // ============ AgentEvent 路由（type-safe switch） ============
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
        break;
      case 'request': {
        const tid = appendTimeline({
          title: `LLM Request · ${String(ev.iteration)}`,
          detail: JSON.stringify({ iteration: ev.iteration, messages: ev.messages }, null, 2),
          status: 'active',
          kind: 'request',
          meta: {
            model: 'model',
            messages: ev.messages.length,
            iteration: ev.iteration,
          },
        });
        iterationToTimelineId.set(ev.iteration, tid);
        break;
      }
      case 'response': {
        if (ev.usage !== undefined) {
          latestUsage.value = {
            iteration: ev.iteration,
            promptTokens: ev.usage.promptTokens,
            completionTokens: ev.usage.completionTokens,
          };
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
        break;
      case 'tool_call_start':
        appendTimeline({
          title: `Tool Start · ${ev.name}`,
          detail: JSON.stringify(
            { id: ev.id, name: ev.name, args: ev.args, startedAt: ev.startedAt },
            null,
            2,
          ),
          status: 'active',
          kind: 'tool_call_start',
          meta: { id: ev.id, name: ev.name, startedAt: ev.startedAt },
        });
        break;
      case 'tool_call_end':
        appendTimeline({
          title: `Tool End · ${ev.name}`,
          detail: JSON.stringify(
            {
              id: ev.id,
              name: ev.name,
              latencyMs: ev.latencyMs,
              ok: ev.ok,
              tokenUsage: ev.tokenUsage,
            },
            null,
            2,
          ),
          status: ev.ok ? 'done' : 'error',
          kind: 'tool_call_end',
          meta: {
            id: ev.id,
            name: ev.name,
            latencyMs: ev.latencyMs,
            ok: ev.ok,
            tokenUsage: ev.tokenUsage ?? null,
          },
        });
        break;
      case 'tool_result':
        appendTimeline({
          title: 'Tool Result',
          detail: ev.output,
          status: 'done',
          kind: 'tool_result',
        });
        break;
      case 'context': {
        const ctx: ContextRow = {
          iteration: ev.iteration,
          promptTokens: ev.promptTokens,
          limit: ev.limit,
        };
        runContexts.value = [...runContexts.value, ctx];
        contextLimit.value = ev.limit;
        break;
      }
      case 'run_summary':
        runSummary.value = {
          totalPromptTokens: ev.totalPromptTokens,
          totalCompletionTokens: ev.totalCompletionTokens,
          peakPromptTokens: ev.peakPromptTokens,
          iterations: ev.iterations,
        };
        sessionUsage.value = accumulateFromRunSummary(sessionUsage.value, ev.peakPromptTokens);
        break;
      case 'message_delta': {
        const idx = streamingIndex.value;
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
        break;
      }
      case 'message_end': {
        const idx = streamingIndex.value;
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
        break;
      }
      case 'done':
        appendTimeline({ title: 'Done', detail: null, status: 'done', kind: 'done' });
        setStatus('completed');
        break;
      case 'error': {
        const friendly = ev.message === 'aborted by signal' ? '已取消当前执行' : ev.message;
        if (ev.message === 'aborted by signal') isCancelled.value = true;
        const idx = streamingIndex.value;
        if (idx >= 0) {
          const existing = conversation.value[idx];
          if (existing !== undefined) {
            const updated = [...conversation.value];
            updated[idx] = { ...existing, streaming: false };
            conversation.value = updated;
          }
        }
        conversation.value = [
          ...conversation.value,
          { role: 'error', text: friendly, streaming: false },
        ];
        appendTimeline({
          title: 'Error',
          detail: friendly,
          status: 'error',
          kind: 'error',
        });
        errorMessage.value = friendly;
        setStatus(ev.message === 'aborted by signal' ? 'cancelled' : 'error');
        break;
      }
    }
  }

  // ============ send / stop ============
  async function send(input: string): Promise<void> {
    if (input.trim() === '' || isStreaming.value) return;
    resetRunState();
    conversation.value = [...conversation.value, { role: 'user', text: input, streaming: false }];

    // Day 09: 多轮对话 —— 把 conversation 累积的 user/assistant 翻译成 server 的 Message[]
    // system/tool 消息前端不持有（前端 ConversationItem 只 4 种 role）
    const historyMessages: Message[] = conversation.value
      .filter(
        (c): c is { role: 'user' | 'assistant'; text: string; streaming: boolean } =>
          c.role === 'user' || c.role === 'assistant',
      )
      .filter((c) => c.text.length > 0)
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
      conversation.value = [...conversation.value, { role: 'error', text: msg, streaming: false }];
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

  return {
    // 状态
    conversation,
    timeline,
    runContexts,
    runSummary,
    contextLimit,
    latestUsage,
    isStreaming,
    errorMessage,
    isCancelled,
    sessionUsage,
    status,
    modelName,
    // 方法
    dispatch,
    send,
    stop,
    resetRunState,
    scrollToIteration,
  };
});
