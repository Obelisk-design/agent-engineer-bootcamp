<!--
  apps/web/src/views/embed/PanelD.vue
  Panel D: query + 4 prefix variants — visualize distance gradient.
  Day 23 Task 4：白底亮色。
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { QUERY_WITH_PREFIXES, cosineDistance } from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const QUERY = 'The cat is a friendly animal';

interface Row {
  name: string;
  text: string;
  distance: number;
}

const rows = ref<Row[] | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);
const maxD = computed(() => (rows.value ? Math.max(...rows.value.map((r) => r.distance)) : 1));

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  rows.value = null;
  warnDevKeyOnce();
  try {
    const all = [QUERY, ...QUERY_WITH_PREFIXES.map((p) => p.text)];
    const vectors = await embedTexts(all);
    const queryVec = vectors[0]!;
    rows.value = QUERY_WITH_PREFIXES.map((p, i) => ({
      name: p.name,
      text: p.text,
      distance: cosineDistance(queryVec, vectors[i + 1]!),
    }));
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel D · 距离梯度（query + 4 前缀变体）</h2>
    <p style="font-size: 0.75rem; color: #909399; margin-bottom: 0.5rem">
      query: <code style="color: #303133">"{{ QUERY }}"</code>
    </p>
    <el-button :loading="busy" type="primary" size="small" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </el-button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding query + variants…</p>
    <ul v-else-if="rows" class="mt-3 space-y-2" style="font-size: 0.75rem">
      <li v-for="r in rows" :key="r.name" class="flex items-center gap-3">
        <span style="width: 7rem; color: #606266">{{ r.name }}</span>
        <div style="flex: 1; background: #f5f7fa; border-radius: 0.375rem; height: 0.75rem; overflow: hidden">
          <div
            style="height: 100%; background: #f56c6c"
            :style="{ width: (r.distance / maxD) * 100 + '%' }"
          />
        </div>
        <span style="width: 4rem; text-align: right; color: #303133; font-family: ui-monospace, monospace">
          {{ r.distance.toFixed(3) }}
        </span>
      </li>
    </ul>
  </section>
</template>
