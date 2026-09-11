<!--
  apps/web/src/views/embed-compare/components/RerankerPanel.vue

  Reranker 阶段展示壳：摘要 + 双栏 Before (vector order, primary blue) vs After (reranker order, warning amber)。
  After 每行带 <RankChange> chip。
  rerank 失败：显示 warning 头部，但 Before 列照常。
  Day 23 Task 4：白底亮色 + el-card + el-row/el-col 双栏。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Hit, RerankResponse } from '@/lib/api-schema.js';
import type { PipelineStage } from '../analysisState.js';
import RankChange from './RankChange.vue';

const props = defineProps<{
  before: readonly Hit[] | null;
  after: RerankResponse | null;
  stage: PipelineStage;
}>();

const errorMsg = computed(() => (props.stage.status === 'error' ? props.stage.error : null));
const running = computed(() => props.stage.status === 'running');
const skipped = computed(() => props.stage.status === 'skipped');

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px">
        <span style="font-size: 0.875rem; font-weight: 600; color: #303133">Reranker</span>
        <span v-if="after" style="font-family: ui-monospace, monospace; font-size: 10px; color: #909399">
          model <span style="color: #e6a23c">qwen3-reranker-4b</span> · {{ after.reranked.length }} hits · {{ after.phases.rerankMs ?? 0 }}ms
        </span>
      </div>
    </template>

    <!-- reranker 失败：warning 头部，不破坏 before 数据 -->
    <el-alert
      v-if="errorMsg"
      type="warning"
      :closable="false"
      :title="`⚠ Reranker failed — showing Vector Search results only. (${stage.ms ?? 0}ms, error: ${errorMsg})`"
      show-icon
    />
    <el-alert
      v-else-if="running"
      type="warning"
      :closable="false"
      title="● Re-ranking with qwen3-reranker-4b…"
      show-icon
    />
    <el-alert
      v-else-if="skipped"
      type="info"
      :closable="false"
      title="Reranker skipped — Vector Search returned 0 hits or user disabled reranker."
      show-icon
    />

    <el-row v-if="before && before.length > 0" :gutter="12" style="margin-top: 12px">
      <!-- BEFORE: vector order -->
      <el-col :xs="24" :lg="12">
        <div style="border: 1px solid #ebeef5; border-radius: 0.375rem; padding: 12px">
          <h3 style="margin: 0 0 8px 0; font-size: 0.75rem; font-weight: 600; color: #409eff">
            Before · vector search order
          </h3>
          <ol style="display: flex; flex-direction: column; gap: 8px; padding: 0; list-style: none; margin: 0">
            <li
              v-for="(h, i) in before"
              :key="`b-${h.chunkId}`"
              style="border: 1px solid #ebeef5; border-radius: 0.375rem; padding: 8px 12px; background: #fafafa; font-size: 0.75rem"
            >
              <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">
                <span style="font-family: ui-monospace, monospace; color: #909399">#{{ i + 1 }}</span>
                <span style="font-family: ui-monospace, monospace; color: #409eff">vector {{ h.score.toFixed(3) }}</span>
              </div>
              <div style="margin-top: 4px; font-size: 10px; color: #909399">
                <code style="font-family: ui-monospace, monospace">{{ h.chunkKind }}</code> ·
                <span style="color: #409eff">{{ h.sourceLabel }}</span>
              </div>
              <div style="margin-top: 2px; word-break: break-word; color: #303133">{{ truncate(h.content, 100) }}</div>
            </li>
          </ol>
        </div>
      </el-col>

      <!-- AFTER: reranker order -->
      <el-col :xs="24" :lg="12">
        <div style="border: 1px solid #ebeef5; border-radius: 0.375rem; padding: 12px">
          <h3 style="margin: 0 0 8px 0; font-size: 0.75rem; font-weight: 600; color: #e6a23c">
            After · reranker order
          </h3>
          <ol v-if="after" style="display: flex; flex-direction: column; gap: 8px; padding: 0; list-style: none; margin: 0">
            <li
              v-for="(h, i) in after.reranked"
              :key="`a-${h.chunkId}`"
              style="border: 1px solid #ebeef5; border-radius: 0.375rem; padding: 8px 12px; background: #fafafa; font-size: 0.75rem"
            >
              <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">
                <div style="display: flex; align-items: baseline; gap: 6px">
                  <span style="font-family: ui-monospace, monospace; color: #909399">#{{ i + 1 }}</span>
                  <RankChange :from="h.originalIndex" :to="i" />
                </div>
                <div style="text-align: right; font-family: ui-monospace, monospace">
                  <div style="color: #e6a23c">rerank {{ h.relevanceScore.toFixed(3) }}</div>
                  <div style="font-size: 10px; color: #909399">vector {{ h.score.toFixed(3) }}</div>
                </div>
              </div>
              <div style="margin-top: 4px; font-size: 10px; color: #909399">
                <code style="font-family: ui-monospace, monospace">{{ h.chunkKind }}</code> ·
                <span style="color: #e6a23c">{{ h.sourceLabel }}</span>
              </div>
              <div style="margin-top: 2px; word-break: break-word; color: #303133">{{ truncate(h.content, 100) }}</div>
            </li>
          </ol>
          <p v-else style="font-size: 0.75rem; color: #909399; margin: 0">等待 reranker 完成。</p>
        </div>
      </el-col>
    </el-row>

    <p v-else-if="!running && !errorMsg && !skipped" style="margin-top: 12px; font-size: 0.75rem; color: #909399">
      等待 Vector Search 返回 hits 后开始 reranker。
    </p>
  </el-card>
</template>
