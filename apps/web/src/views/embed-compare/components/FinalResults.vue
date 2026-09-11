<!--
  apps/web/src/views/embed-compare/components/FinalResults.vue

  最终结果区：排名列表（rank · sourceLabel · content · Rerank Score amber 主，Vector Score blue 次）。
  - 有 reranker：按 reranked 顺序，relevanceScore 主显示。
  - reranker 失败/跳过：按 vectorHits 顺序，score 主显示（不伪造 rerank score）。
  - 0 hits：显示 el-empty。
  - 裁决阈值：reranked[0].relevanceScore < 0.3 → 显示 warning。
  Day 23 Task 4：白底亮色 + el-card + el-empty。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Hit, RerankResponse } from '@/lib/api-schema.js';
import { RELEVANCE_VERDICT_THRESHOLD } from '../analysisState.js';

const props = defineProps<{
  after: RerankResponse | null;
  vectorHits: readonly Hit[] | null;
  rerankSkipped: boolean;
}>();

const empty = computed(
  () => props.vectorHits !== null && props.vectorHits.length === 0,
);

const verdictWarn = computed(() => {
  if (props.after === null) return null;
  const top = props.after.reranked[0];
  if (top === undefined) return null;
  if (top.relevanceScore < RELEVANCE_VERDICT_THRESHOLD) {
    return `No relevant content found — top-1 rerank score ${top.relevanceScore.toFixed(3)} < 阈值 ${RELEVANCE_VERDICT_THRESHOLD}。下方为 KNN-vs-reranker 行为演示。`;
  }
  return null;
});

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px">
        <span style="font-size: 0.875rem; font-weight: 600; color: #303133">Final Results</span>
        <span v-if="after" style="font-family: ui-monospace, monospace; font-size: 10px; color: #909399">
          {{ after.reranked.length }} hits
        </span>
        <span v-else-if="vectorHits" style="font-family: ui-monospace, monospace; font-size: 10px; color: #909399">
          {{ vectorHits.length }} hits (vector order, reranker unavailable)
        </span>
      </div>
    </template>

    <el-alert
      v-if="verdictWarn"
      type="warning"
      :closable="false"
      :title="`⚠ ${verdictWarn}`"
      show-icon
    />

    <el-empty
      v-if="empty"
      description="0 hits — namespace 可能为空。换个 namespace 试试，或先跑入库脚本。"
    />

    <!-- 有 reranker → 按 reranked 顺序 -->
    <ol v-else-if="after" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px; padding: 0; list-style: none">
      <li
        v-for="(h, i) in after.reranked"
        :key="h.chunkId"
        style="border: 1px solid #ebeef5; border-radius: 0.375rem; padding: 8px 12px; background: #fafafa; font-size: 0.75rem"
      >
        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">
          <span style="font-family: ui-monospace, monospace; font-size: 1rem; font-weight: 600; color: #303133">
            #{{ i + 1 }}
          </span>
          <div style="text-align: right; font-family: ui-monospace, monospace">
            <div style="color: #e6a23c">rerank {{ h.relevanceScore.toFixed(3) }}</div>
            <div style="font-size: 10px; color: #409eff">vector {{ h.score.toFixed(3) }}</div>
          </div>
        </div>
        <div style="margin-top: 4px; font-size: 10px; color: #909399">
          <code style="font-family: ui-monospace, monospace">{{ h.chunkKind }}</code> ·
          <span style="color: #303133">{{ h.sourceLabel }}</span>
        </div>
        <div style="margin-top: 2px; word-break: break-word; color: #303133">{{ truncate(h.content, 160) }}</div>
      </li>
    </ol>

    <!-- reranker 跳过/失败 → 按 vectorHits 顺序，无伪造 rerank score -->
    <ol v-else-if="vectorHits && vectorHits.length > 0" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px; padding: 0; list-style: none">
      <li
        v-for="(h, i) in vectorHits"
        :key="h.chunkId"
        style="border: 1px solid #ebeef5; border-radius: 0.375rem; padding: 8px 12px; background: #fafafa; font-size: 0.75rem"
      >
        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">
          <span style="font-family: ui-monospace, monospace; font-size: 1rem; font-weight: 600; color: #303133">
            #{{ i + 1 }}
          </span>
          <div style="text-align: right; font-family: ui-monospace, monospace">
            <div style="color: #409eff">vector {{ h.score.toFixed(3) }}</div>
            <div v-if="rerankSkipped" style="font-size: 10px; color: #909399">rerank skipped</div>
          </div>
        </div>
        <div style="margin-top: 4px; font-size: 10px; color: #909399">
          <code style="font-family: ui-monospace, monospace">{{ h.chunkKind }}</code> ·
          <span style="color: #303133">{{ h.sourceLabel }}</span>
        </div>
        <div style="margin-top: 2px; word-break: break-word; color: #303133">{{ truncate(h.content, 160) }}</div>
      </li>
    </ol>

    <p v-else style="margin-top: 12px; font-size: 0.75rem; color: #909399">
      等待分析完成。
    </p>
  </el-card>
</template>
