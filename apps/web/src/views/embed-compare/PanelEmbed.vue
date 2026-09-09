<!--
  apps/web/src/views/embed-compare/PanelEmbed.vue

  Panel A · 汉字 embed 过程 + 2D 散点
  - 输入：props.query + props.namespace
  - 行为：
    - 调 embedTexts([query, ...SAMPLE_CORPUS]) 拿所有 vector
    - 用 libs/embedding/visualize.scatterSVG 渲染 2D
  - 渲染：
    - 顶部："输入: 'cosine 怎么算'" 文本
    - 2D 散点（输入点标红 + SAMPLE_CORPUS 9 个库内点）
    - 提示："输入点距离哪个库内点最近 → 语义最接近"
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { SAMPLE_CORPUS, scatterSVG } from '../../../../../libs/embedding/index.js';
import { embedTexts } from '../embed/api.js';
import { warnDevKeyOnce } from './api.js';

const props = defineProps<{
  query: string;
}>();

const svg = ref<string | null>(null);
const inputVector = ref<number[] | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

async function run(): Promise<void> {
  if (!props.query.trim()) {
    err.value = '请先在顶部输入框填写查询文本';
    return;
  }
  busy.value = true;
  err.value = null;
  svg.value = null;
  inputVector.value = null;
  warnDevKeyOnce();
  try {
    // 一次性 embed 输入 + SAMPLE_CORPUS（10 个库内词）= 11 个 vector
    const vectors = await embedTexts([props.query, ...SAMPLE_CORPUS]);
    if (vectors.length !== SAMPLE_CORPUS.length + 1) {
      throw new Error(`expected ${SAMPLE_CORPUS.length + 1} vectors, got ${vectors.length}`);
    }
    inputVector.value = vectors[0] ?? null;
    const allLabels = ['📌 ' + props.query, ...SAMPLE_CORPUS];
    svg.value = scatterSVG(allLabels, vectors, 640, 480);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

// 当 query 变时自动 run（（便于父组件一键触发）
watch(
  () => props.query,
  (q) => {
    if (q.trim().length > 0) void run();
  },
);
</script>

<template>
  <section class="ec-panel">
    <header class="panel-head">
      <h2>Panel A · 汉字 embedding 过程 + 2D 散点</h2>
      <button
        type="button"
        class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50"
        :disabled="busy"
        @click="run"
      >
        {{ busy ? 'Running…' : 'Run' }}
      </button>
    </header>

    <p v-if="err" class="ec-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="ec-loading mt-3">embedding {{ SAMPLE_CORPUS.length + 1 }} texts (输入 + 9 个 fixture)…</p>

    <template v-else-if="svg">
      <p class="ec-hint mt-2">输入点标 📌 —— 距离哪个库内点最近 = 语义最接近</p>
      <div class="mt-3" v-html="svg" />
      <details class="mt-3">
        <summary class="text-sm cursor-text">查看输入向量（前 100 维 / 4096 总维）</summary>
        <pre v-if="inputVector" class="mt-2 text-[11px] font-mono whitespace-pre-wrap break-all">{{ inputVector.slice(0, 100).map(n => n.toFixed(4)).join(', ') }}…</pre>
      </details>
    </template>
  </section>
</template>