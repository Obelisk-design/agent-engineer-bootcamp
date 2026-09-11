<!--
  apps/web/src/views/embed-compare/components/QueryComposer.vue

  顶部输入卡：textarea + namespace + topK + rerankEnabled + 主按钮 [Analyze]/[Cancel]。
  sticky 顶部，跑完后用户可以原地重跑。
  Day 23 Task 4：白底亮色，对齐 Element Plus 默认样式。
-->

<script setup lang="ts">
const props = defineProps<{
  query: string;
  namespace: 'notion' | 'md' | 'all';
  topK: number;
  rerankEnabled: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'update:namespace', value: 'notion' | 'md' | 'all'): void;
  (e: 'update:top-k', value: number): void;
  (e: 'update:rerank-enabled', value: boolean): void;
  (e: 'analyze'): void;
  (e: 'cancel'): void;
}>();
</script>

<template>
  <el-card shadow="never" style="position: sticky; top: 0; z-index: 10">
    <el-input
      :model-value="props.query"
      type="textarea"
      :rows="2"
      placeholder="如：cosine 怎么算 / 什么是 lancedb / 紫光云是什么"
      :disabled="props.busy"
      @update:model-value="emit('update:query', $event)"
      @keydown.meta.enter="emit('analyze')"
      @keydown.ctrl.enter="emit('analyze')"
    />

    <div style="margin-top: 12px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px">
      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px">
        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #606266">
          <span>Namespace</span>
          <el-select
            :model-value="props.namespace"
            :disabled="props.busy"
            size="small"
            style="width: 160px"
            @update:model-value="emit('update:namespace', $event as 'notion' | 'md' | 'all')"
          >
            <el-option label="all (notion + md)" value="all" />
            <el-option label="md (docs/daily + ADR)" value="md" />
            <el-option label="notion" value="notion" />
          </el-select>
        </label>

        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #606266">
          <span>Top K</span>
          <el-input-number
            :model-value="props.topK"
            :min="1"
            :max="20"
            :disabled="props.busy"
            size="small"
            style="width: 90px"
            @update:model-value="emit('update:top-k', Number($event))"
          />
        </label>

        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #606266">
          <el-switch
            :model-value="props.rerankEnabled"
            :disabled="props.busy"
            inline-prompt
            active-text="Reranker On"
            inactive-text="Off"
            @update:model-value="emit('update:rerank-enabled', $event)"
          />
        </label>
      </div>

      <div style="display: flex; align-items: center; gap: 8px">
        <el-button v-if="props.busy" type="info" @click="emit('cancel')">Cancel</el-button>
        <el-button
          v-else
          type="primary"
          :disabled="props.query.trim().length === 0"
          @click="emit('analyze')"
        >
          Analyze →
        </el-button>
      </div>
    </div>
  </el-card>
</template>
