<!--
  apps/web/src/views/embed/PanelA.vue
  Panel A: 距离矩阵热图 (Panel A from spec — 4 animals / 3 fruits / 3 abstracts)
-->
<script setup lang="ts">
import { ref } from 'vue';
import { SAMPLE_CORPUS, distanceMatrixHTML } from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const html = ref<string | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  html.value = null;
  warnDevKeyOnce();
  try {
    const vectors = await embedTexts(SAMPLE_CORPUS, 4096);
    html.value = distanceMatrixHTML(SAMPLE_CORPUS, vectors);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel A · 距离矩阵热图（10 个混合词，cosine，4096 维）</h2>
    <button class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50" :disabled="busy" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding 10 texts…</p>
    <div v-else-if="html" class="mt-3 overflow-auto" v-html="html" />
  </section>
</template>
