<!--
  apps/web/src/views/embed/PanelB.vue
  Panel B: PCA → 2D scatter
-->
<script setup lang="ts">
import { ref } from 'vue';
import { SAMPLE_CORPUS, scatterSVG } from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const svg = ref<string | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  svg.value = null;
  warnDevKeyOnce();
  try {
    const vectors = await embedTexts(SAMPLE_CORPUS, 4096);
    svg.value = scatterSVG(SAMPLE_CORPUS, vectors);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel B · PCA → 2D 散点图（同 10 词）</h2>
    <button class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50" :disabled="busy" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding + PCA…</p>
    <div v-else-if="svg" class="mt-3" v-html="svg" />
  </section>
</template>