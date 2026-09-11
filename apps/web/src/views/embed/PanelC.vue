<!--
  apps/web/src/views/embed/PanelC.vue
  Panel C: 同维度 (4096) 下 cosine vs euclidean 距离矩阵对比。
  —— 原来想比 4096 vs 256 Matryoshka，实测 dev 网关 vLLM/litellm 不支持 dimensions 参数（ex_002_probe_dims 验证），
     改用 cos vs euc 让用户看到"方向"vs"距离"在文本相似度上的差异。
  Day 23 Task 4：白底亮色，cell 字色 #303133，行/列 label 浅灰底。
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  SAMPLE_CORPUS,
  cosineDistance,
  euclideanDistance,
} from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const N = SAMPLE_CORPUS.length;
const cosMat = ref<number[][] | null>(null);
const eucMat = ref<number[][] | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

function buildMatrix(vectors: number[][], fn: (a: number[], b: number[]) => number): number[][] {
  const m: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) row.push(fn(vectors[i]!, vectors[j]!));
    m.push(row);
  }
  return m;
}

function toHTML(mat: number[][]): string {
  // 数据色板保留：cosine ∈ [0,1]，euclidean ∈ [0, ~1.4]（normalized）
  // 用各自最大值归一化，让两张图颜色可比"密度"
  // 白底可读：t=0 (自己 vs 自己 = 0) → 全白；t=1 → r=0,g=178,b=229（亮蓝）；cell 字色 #303133
  let max = 0;
  for (const row of mat) for (const v of row) if (v > max) max = v;
  const norm = max > 0 ? max : 1;
  const head = `<tr><th></th>${SAMPLE_CORPUS.map((w) => `<th>${w}</th>`).join('')}</tr>`;
  const body = mat
    .map((row, i) => {
      const cells = row
        .map((v) => {
          const t = v / norm;
          const r = Math.round(255 * (1 - t));
          const g = Math.round(255 * (1 - t * 0.3));
          const b = Math.round(255 * (1 - t * 0.1));
          const bg = `rgb(${r},${g},${b})`;
          const fg = t > 0.6 ? '#ffffff' : '#303133'; // 远距离深底用白字
          return `<td style="background:${bg};color:${fg};padding:2px 4px;font-size:10px;text-align:center">${v.toFixed(2)}</td>`;
        })
        .join('');
      return `<tr><th style="background:#f5f7fa;color:#606266">${SAMPLE_CORPUS[i]}</th>${cells}</tr>`;
    })
    .join('');
  return `<table class="dm" style="border-collapse:collapse"><thead style="background:#f5f7fa">${head}</thead><tbody>${body}</tbody></table>`;
}

const cosHTML = computed(() => (cosMat.value ? toHTML(cosMat.value) : null));
const eucHTML = computed(() => (eucMat.value ? toHTML(eucMat.value) : null));

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  cosMat.value = null;
  eucMat.value = null;
  warnDevKeyOnce();
  try {
    const vectors = await embedTexts(SAMPLE_CORPUS);
    cosMat.value = buildMatrix(vectors, cosineDistance);
    eucMat.value = buildMatrix(vectors, euclideanDistance);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel C · 同维度 cosine vs euclidean（4096 维）</h2>
    <p style="font-size: 0.75rem; color: #909399; margin-bottom: 0.5rem">
      原计划 4096 vs 256 Matryoshka，实测 dev 网关不支持 <code>dimensions</code> 参数（见
      <code>ex_002_probe_dims</code>）。 改为同向量两种距离公式对比：cosine 看"方向"，euclidean
      看"距离"。
    </p>
    <el-button :loading="busy" type="primary" size="small" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </el-button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding 10 texts (4096d)…</p>
    <div v-else-if="cosHTML && eucHTML" class="mt-3 grid grid-cols-2 gap-4">
      <div>
        <h3 style="font-size: 0.75rem; color: #606266; margin-bottom: 0.5rem">cosine (方向)</h3>
        <div class="overflow-auto" v-html="cosHTML" />
      </div>
      <div>
        <h3 style="font-size: 0.75rem; color: #606266; margin-bottom: 0.5rem">euclidean (距离)</h3>
        <div class="overflow-auto" v-html="eucHTML" />
      </div>
    </div>
  </section>
</template>
