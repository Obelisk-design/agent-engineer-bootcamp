<!--
  apps/web/src/views/rag/IngestView.vue
  Day 23 Task 4 (P3) —— 从 Day 21 IngestView.vue 迁入 views/rag/，
  原生 <select>/<button> 改 Element Plus；SSE 入库流保持原 subscribeSSE 逻辑。
-->
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import PhaseStream from '../../components/PhaseStream.vue';
import type {
  DoneEvent,
  ErrorEvent,
  NamespaceHealth,
  PhaseEvent,
} from '../../../../../libs/api-schema/src/index.js';
import { subscribeSSE, type SseHandle } from '../../lib/sse.js';

const namespace = ref<'notion' | 'md'>('notion');
const phases = ref<PhaseEvent[]>([]);
const done = ref<DoneEvent | null>(null);
const error = ref<ErrorEvent | null>(null);
const streaming = ref(false);
const health = ref<Record<'notion' | 'md', NamespaceHealth> | null>(null);

let sseHandle: SseHandle | null = null;

async function loadHealth(): Promise<void> {
  const res = await fetch('/api/health');
  if (res.ok) {
    const body = (await res.json()) as { namespaces?: Record<'notion' | 'md', NamespaceHealth> };
    health.value = body.namespaces ?? null;
  }
}
void loadHealth();

function onIngest(): void {
  phases.value = [];
  done.value = null;
  error.value = null;
  streaming.value = true;

  sseHandle = subscribeSSE<PhaseEvent | DoneEvent | ErrorEvent>({
    url: '/api/ingest',
    method: 'POST',
    body: { namespace: namespace.value, dryRun: false },
    handlers: {
      onEvent: (name, data) => {
        if (name === 'phase') {
          phases.value.push(data as PhaseEvent);
        } else if (name === 'done') {
          done.value = data as DoneEvent;
          streaming.value = false;
        } else if (name === 'error') {
          error.value = data as ErrorEvent;
          streaming.value = false;
        }
      },
      onError: (err) => {
        error.value = { message: err.message };
        streaming.value = false;
      },
    },
  });
}

function abortIngest(): void {
  sseHandle?.close();
  streaming.value = false;
}

onBeforeUnmount(() => {
  sseHandle?.close();
});

const currentHealth = (): NamespaceHealth | undefined => health.value?.[namespace.value];
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-600">namespace：</span>
      <el-select v-model="namespace" :disabled="streaming" style="width: 160px">
        <el-option label="notion" value="notion" />
        <el-option label="md" value="md" />
      </el-select>
    </div>
    <el-alert
      v-if="currentHealth() && !currentHealth()!.ready"
      type="warning"
      :title="`当前 namespace 缺少 env：${currentHealth()!.missing.join(', ')}`"
      :closable="false"
      show-icon
    />
    <div class="flex gap-2">
      <el-button
        type="success"
        :disabled="streaming || (currentHealth() !== undefined && !currentHealth()!.ready)"
        @click="onIngest"
      >
        入库
      </el-button>
      <el-button v-if="streaming" @click="abortIngest">中断</el-button>
    </div>
    <PhaseStream :phases="phases" :done="done" :error="error" />
  </div>
</template>