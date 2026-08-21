<!--
  apps/web/src/views/embed/PanelA.vue
  Panel A: 距离矩阵热图 (Panel A from spec — 4 animals / 3 fruits / 3 abstracts)
  额外 toggle 展示前 40 维原始向量（直观看"大模型输出什么"）
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { SAMPLE_CORPUS, distanceMatrixHTML } from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const SHOW_DIMS = 40; // 4096 维全显示太长；展示前 40 维足够说明"大模型输出是个长数字数组"

interface VectorStats {
  label: string;
  dim: number;
  norm: number; // L2 范数 = sqrt(sum(x^2))
  head: number[]; // 前 SHOW_DIMS 维
}

const html = ref<string | null>(null);
const vectors = ref<number[][] | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);
const showRaw = ref(false);

const stats = computed<VectorStats[]>(() => {
  if (vectors.value === null) return [];
  return vectors.value.map((v, i) => {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return {
      label: SAMPLE_CORPUS[i] ?? '',
      dim: v.length,
      norm,
      head: v.slice(0, SHOW_DIMS),
    };
  });
});

function fmt(n: number): string {
  // 保留3位有效数字，避免 -0.00023456 这种噪声
  if (Math.abs(n) < 1e-4) return '0';
  return n.toFixed(4);
}

function numColor(n: number): string {
  // 正数偏亮蓝，负数偏亮红，0 浅灰
  // 数值多半落在 [-0.05, 0.05] 范围，把 alpha 曲线压扁一点让小值也能看见
  if (n > 0) {
    const a = Math.min(1, 0.45 + Math.abs(n) * 12);
    return `rgba(125, 211, 252, ${a})`;
  }
  if (n < 0) {
    const a = Math.min(1, 0.45 + Math.abs(n) * 12);
    return `rgba(251, 113, 133, ${a})`;
  }
  return 'rgba(212, 212, 216, 0.7)';
}

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  html.value = null;
  vectors.value = null;
  showRaw.value = false;
  warnDevKeyOnce();
  try {
    const v = await embedTexts(SAMPLE_CORPUS);
    vectors.value = v;
    html.value = distanceMatrixHTML(SAMPLE_CORPUS, v);
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

    <template v-else-if="html">
      <div class="mt-3 overflow-auto" v-html="html" />

      <button
        type="button"
        class="mt-4 text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        @click="showRaw = !showRaw"
      >
        {{ showRaw ? '▼' : '▶' }} 查看原始 4096 维向量（前 {{ SHOW_DIMS }} 维）
      </button>

      <div v-if="showRaw" class="mt-3 space-y-4">
        <p class="text-sm text-zinc-300">
          大模型给每个词返回 {{ stats[0]?.dim ?? 0 }} 维向量（数字数组）。
          <span class="text-sky-300">正数偏亮蓝</span>、
          <span class="text-rose-300">负数偏亮红</span> —— 这就是"语义被编码成数字"的样子。
        </p>
        <div
          v-for="s in stats"
          :key="s.label"
          class="border border-zinc-700 rounded p-3 bg-zinc-900"
        >
          <div class="flex items-baseline justify-between mb-2">
            <span class="text-zinc-100 text-base font-semibold">{{ s.label }}</span>
            <span class="text-zinc-400 text-xs font-mono">
              dim={{ s.dim }} · ‖v‖₂={{ s.norm.toFixed(3) }}
            </span>
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[12px] leading-relaxed">
            <span
              v-for="(n, i) in s.head"
              :key="i"
              :style="{ color: numColor(n) }"
              :title="`dim ${i}: ${fmt(n)}`"
              class="px-0.5"
            >
              {{ fmt(n) }}
            </span>
            <span class="text-zinc-500 px-1">… +{{ s.dim - SHOW_DIMS }} dims</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>