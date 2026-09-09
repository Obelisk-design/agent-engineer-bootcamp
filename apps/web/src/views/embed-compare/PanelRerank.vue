<!--
  apps/web/src/views/embed-compare/PanelRerank.vue

  Panel C · reranker 重排 top-K + 双 score 对比
  - 输入：props.query + props.hits（来自 PanelCompare 的搜索结果）
  - 行为：调 fetch('/api/rerank') → RerankResponse.reranked[]
  - 渲染：
    - 双栏：Before（lancedb 顺序）vs After（reranker 重排后）
    - 每个 hit 卡片显示：rank + sourceLabel + content 前 100 字符 + 双 score（lance cosine similarity + reranker relevance_score）
    - 高亮位置变化的 hit（用 ⬆️⬇️ 箭头）
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { rerankHits } from './api.js';
import type { Hit, RerankResponse } from '@/lib/api-schema.js';

const props = defineProps<{
  query: string;
  hits: readonly Hit[] | null;
}>();

const rerankResult = ref<RerankResponse | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

/** 相关裁决阈值：重排后 top-1 relevance_score 低于它 → 判定"库内没有相关内容"。
 *  依据 2026-09-09 实测：相关查询（cosine 怎么算）top1=0.924，噪音查询（紫光云）top1=0.019，
 *  区分度 40 倍；取远离两端的 0.3。不用 cosine 做裁决——dev 网关 embed 分数波动 ±0.05，
 *  0.12 阈值实测会跳变；reranker 区分度是 cosine 的量级差。 */
const RELEVANCE_VERDICT_THRESHOLD = 0.3;

/** hit chunkId → 重排前 index（位置变化计算用） */
function originalIndex(chunkId: string): number {
  if (!props.hits) return -1;
  return props.hits.findIndex((h) => h.chunkId === chunkId);
}

async function run(): Promise<void> {
  if (!props.query.trim()) {
    err.value = '请先在顶部输入框填写查询文本';
    return;
  }
  if (!props.hits || props.hits.length === 0) {
    err.value = '需先在 Panel B 跑出 hits 再 rerank';
    return;
  }
  busy.value = true;
  err.value = null;
  rerankResult.value = null;
  try {
    rerankResult.value = await rerankHits(props.query, props.hits);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

watch(
  () => [props.query, props.hits],
  () => {
    // Panel B 空结果 → 清掉上一次的重排结果，避免 B 空 C 还挂旧数据
    if (!props.hits || props.hits.length === 0) {
      rerankResult.value = null;
      return;
    }
    if (props.query.trim().length > 0) {
      void run();
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="ec-panel">
    <header class="panel-head">
      <h2>Panel C · reranker 重排 top-K + 双 score 对比</h2>
      <button
        type="button"
        class="text-xs px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50"
        :disabled="busy || !props.hits || props.hits.length === 0"
        @click="run"
      >
        {{ busy ? 'Reranking…' : 'Run' }}
      </button>
    </header>

    <p v-if="err" class="ec-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="ec-loading mt-3">POST /api/rerank → qwen3-reranker-4b…</p>
    <p v-else-if="!props.hits || props.hits.length === 0" class="ec-empty mt-3">
      无可重排项 — Panel B 没有搜索结果（库为空或未索引），reranker 不启动。
    </p>

    <template v-else-if="rerankResult && props.hits">
      <!-- 相关裁决：top-1 relevance_score 低于阈值 → 判定库内没有相关内容（reranker 裁判，不用 cosine——分数波动会跳） -->
      <p v-if="rerankResult.reranked[0] && rerankResult.reranked[0].relevanceScore < RELEVANCE_VERDICT_THRESHOLD" class="ec-empty mt-3">
        ⚠️ 搜索不到相关内容 — reranker 判定本次检索结果均与「{{ props.query }}」语义不相关（top-1 relevance {{ rerankResult.reranked[0].relevanceScore.toFixed(3) }} < 阈值 {{ RELEVANCE_VERDICT_THRESHOLD }}）。下面双栏仅作 KNN vs reranker 行为演示。
      </p>
      <p class="ec-hint mt-2">
        reranked {{ rerankResult.reranked.length }} hits · rerank {{ rerankResult.phases.rerankMs }}ms
      </p>

      <div class="dual-col mt-3">
        <!-- BEFORE: lancedb 顺序 -->
        <div class="col">
          <h3 class="col-title">Before · lancedb cosine similarity</h3>
          <ol class="hits-list">
            <li v-for="(h, i) in props.hits" :key="`b-${h.chunkId}`" class="hit-row">
              <div class="hit-rank">#{{ i + 1 }}</div>
              <div class="hit-body">
                <div class="hit-source">
                  <code>{{ h.chunkKind }}</code> · <span class="text-sky-300">{{ h.sourceLabel }}</span>
                </div>
                <div class="hit-content">{{ h.content.slice(0, 100) }}{{ h.content.length > 100 ? '…' : '' }}</div>
              </div>
              <div class="hit-score">
                cosine <strong>{{ h.score.toFixed(3) }}</strong>
              </div>
            </li>
          </ol>
        </div>

        <!-- AFTER: reranker 重排 -->
        <div class="col">
          <h3 class="col-title">After · reranker relevance_score</h3>
          <ol class="hits-list">
            <li
              v-for="(h, i) in rerankResult.reranked"
              :key="`a-${h.chunkId}`"
              class="hit-row"
            >
              <div class="hit-rank">
                #{{ i + 1 }}
                <!-- 位置变化指示 -->
                <span
                  v-if="h.originalIndex !== i"
                  :class="h.originalIndex > i ? 'rank-up' : 'rank-down'"
                  :title="`原 #${h.originalIndex + 1} → 现 #${i + 1}`"
                >
                </span>
              </div>
              <div class="hit-body">
                <div class="hit-source">
                  <code>{{ h.chunkKind }}</code> · <span class="text-amber-300">{{ h.sourceLabel }}</span>
                </div>
                <div class="hit-content">{{ h.content.slice(0, 100) }}{{ h.content.length > 100 ? '…' : '' }}</div>
              </div>
              <div class="hit-score">
                rerank <strong class="text-amber-300">{{ h.relevanceScore.toFixed(3) }}</strong>
                <br />
                <span class="text-[10px] text-zinc-500">cosine {{ h.score.toFixed(3) }}</span>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.dual-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.col {
  border: 1px solid #3f3f46;
  border-radius: 6px;
  padding: 0.75rem;
}
.col-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #d4d4d8;
}
.rank-up::before { content: '⬆️'; }
.rank-down::before { content: '⬇️'; }
</style>