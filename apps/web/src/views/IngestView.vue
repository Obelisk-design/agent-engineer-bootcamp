<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import PhaseStream from '../components/PhaseStream.vue';
import type {
  DoneEvent,
  ErrorEvent,
  NamespaceHealth,
  PhaseEvent,
} from '../../../../libs/api-schema/src/index.js';
import { subscribeSSE, type SseHandle } from '../lib/sse.js';

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
  // 重置态
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
      <label class="text-sm text-gray-600">namespace：</label>
      <select
        v-model="namespace"
        :disabled="streaming"
        class="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="notion">notion</option>
        <option value="md">md</option>
      </select>
    </div>
    <div
      v-if="currentHealth() && !currentHealth()!.ready"
      class="rounded bg-yellow-50 p-3 text-sm text-yellow-800"
    >
      当前 namespace 缺少 env：{{ currentHealth()!.missing.join(', ') }}
    </div>
    <div class="flex gap-2">
      <button
        :disabled="streaming || (currentHealth() !== undefined && !currentHealth()!.ready)"
        class="rounded bg-green-500 px-4 py-2 text-sm text-white disabled:bg-gray-300"
        @click="onIngest"
      >
        入库
      </button>
      <button
        v-if="streaming"
        class="rounded bg-gray-200 px-4 py-2 text-sm text-gray-700"
        @click="abortIngest"
      >
        中断
      </button>
    </div>
    <PhaseStream :phases="phases" :done="done" :error="error" />
  </div>
</template>