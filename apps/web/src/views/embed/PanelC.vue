<!--
  apps/web/src/views/embed/PanelC.vue
  Panel C: 4096 vs 256 dim (Matryoshka) — same texts, side-by-side distance matrices.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { SAMPLE_CORPUS, distanceMatrixHTML } from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const html4096 = ref<string | null>(null);
const html256 = ref<string | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  html4096.value = null;
  html256.value = null;
  warnDevKeyOnce();
  try {
    const [v4096, v256] = await Promise.all([
      embedTexts(SAMPLE_CORPUS, 4096),
      embedTexts(SAMPLE_CORPUS, 256),
    ]);
    html4096.value = distanceMatrixHTML(SAMPLE_CORPUS, v4096);
    html256.value = distanceMatrixHTML(SAMPLE_CORPUS, v256);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel C · 维度对比（4096 vs 256，Matryoshka 降维）</h2>
    <button class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50" :disabled="busy" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding both dimensions…</p>
    <div v-else-if="html4096 && html256" class="mt-3 grid grid-cols-2 gap-4">
      <div>
        <h3 class="text-xs text-zinc-400 mb-2">@4096</h3>
        <div class="overflow-auto" v-html="html4096" />
      </div>
      <div>
        <h3 class="text-xs text-zinc-400 mb-2">@256</h3>
        <div class="overflow-auto" v-html="html256" />
      </div>
    </div>
  </section>
</template>