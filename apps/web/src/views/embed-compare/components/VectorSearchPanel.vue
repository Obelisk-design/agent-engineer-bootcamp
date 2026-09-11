<!--
  apps/web/src/views/embed-compare/components/VectorSearchPanel.vue

  Vector Search 阶段展示壳：摘要 + hit 列表 + 可折叠距离热图。
  Day 23 Task 4：白底亮色，el-card + Element Plus status colors。
-->

<script setup lang="ts">
import { computed } from 'vue';
import type { Hit } from '@/lib/api-schema.js';
import type { VectorSearchPayload, PipelineStage } from '../analysisState.js';

const props = defineProps<{
  result: VectorSearchPayload | null;
  topK: number;
  namespace: 'notion' | 'md' | 'all';
  stage: PipelineStage;
}>();

const errorMsg = computed(() => (props.stage.status === 'error' ? props.stage.error : null));
const running = computed(() => props.stage.status === 'running');
const empty = computed(
  () => props.result !== null && props.result.hits.length === 0 && props.stage.status === 'success',
);

/** 1 - score ∈ [0,1]，距离 = 1 - cosine 相似度（lance 返回 score=1-cosine_distance） */
function distanceOf(h: Hit): number {
  return 1 - h.score;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px">
        <span style="font-size: 0.875rem; font-weight: 600; color: #303133">
          Vector Search · Top {{ topK }}
        </span>
        <span v-if="result" style="font-family: ui-monospace, monospace; font-size: 10px; color: #909399">
          namespace: <span style="color: #409eff">{{ namespace }}</span> · {{ result.hits.length }} hits · {{ result.retrieveMs }}ms
        </span>
      </div>
    </template>

    <el-alert
      v-if="running"
      type="warning"
      :closable="false"
      title="● Searching vectors in LanceDB…"
      show-icon
    />
    <el-alert
      v-else-if="errorMsg"
      type="error"
      :closable="false"
      :title="`✕ Vector search failed: ${errorMsg}`"
      show-icon
    />
    <el-empty
      v-else-if="empty"
      :description="`搜索不到 — namespace ${namespace} 没有返回任何结果，该库可能未索引或为空。换个 namespace 试试，或先跑入库脚本。`"
      :image-size="60"
    />

    <template v-else-if="result && result.hits.length > 0">
      <ol style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px; padding: 0; list-style: none">
        <li
          v-for="(h, i) in result.hits"
          :key="h.chunkId"
          style="display: grid; grid-template-columns: 3rem 1fr auto; align-items: center; gap: 8px; border: 1px solid #ebeef5; border-radius: 0.375rem; padding: 8px 12px; background: #fafafa; font-size: 0.75rem"
        >
          <div style="text-align: center; font-family: ui-monospace, monospace; font-size: 0.875rem; font-weight: 600; color: #909399">
            #{{ i + 1 }}
          </div>
          <div style="min-width: 0">
            <div style="font-size: 10px; color: #909399">
              <code style="font-family: ui-monospace, monospace">{{ h.chunkKind }}</code> ·
              <span style="color: #409eff">{{ h.sourceLabel }}</span>
            </div>
            <div style="margin-top: 2px; word-break: break-word; color: #303133">{{ truncate(h.content, 120) }}</div>
          </div>
          <div style="text-align: right; font-family: ui-monospace, monospace; font-size: 0.75rem">
            <div style="color: #409eff">vector {{ h.score.toFixed(3) }}</div>
            <div style="font-size: 10px; color: #909399">distance {{ distanceOf(h).toFixed(3) }}</div>
          </div>
        </li>
      </ol>

      <details v-if="result.heatMapHtml" style="margin-top: 16px">
        <summary style="cursor: pointer; font-size: 0.75rem; color: #606266">
          查看输入 vs top-{{ topK }} cosine 距离热图
        </summary>
        <div style="margin-top: 8px; overflow-x: auto" v-html="result.heatMapHtml" />
      </details>
    </template>

    <p v-else style="margin-top: 12px; font-size: 0.75rem; color: #909399">
      等待 Vector Search 完成。
    </p>
  </el-card>
</template>
