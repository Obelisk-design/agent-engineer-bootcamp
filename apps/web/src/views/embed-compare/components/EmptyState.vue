<!--
  apps/web/src/views/embed-compare/components/EmptyState.vue

  页面未运行时显示的引导态：标题 + 4 个 example chip，点击填到 query（不自动 run）。
  Day 23 Task 4：白底亮色，用 el-button + Element Plus 文字色。
-->

<script setup lang="ts">
defineProps<{
  examples: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'pick', example: string): void;
}>();
</script>

<template>
  <el-card shadow="never">
    <div style="max-width: 42rem; margin: 0 auto; padding: 24px 0; text-align: center">
      <p style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #909399; margin: 0">
        Try one of these
      </p>
      <h2 style="margin-top: 8px; font-size: 1.125rem; font-weight: 600; color: #303133">
        输入一段文本，观察 Embedding → Vector Search → Reranker 的全过程
      </h2>
      <p style="margin-top: 8px; font-size: 0.875rem; color: #606266">
        点击下方示例填入查询框，或直接输入自己的文本，然后按
        <kbd style="border-radius: 0.25rem; border: 1px solid #dcdfe6; background: #f5f7fa; padding: 1px 6px; font-family: ui-monospace, monospace; font-size: 0.75rem; color: #303133">
          [Analyze]
        </kbd>
        。
      </p>
      <div style="margin-top: 24px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px">
        <el-button
          v-for="ex in examples"
          :key="ex"
          type="primary"
          plain
          round
          @click="emit('pick', ex)"
        >
          {{ ex }}
        </el-button>
      </div>
    </div>
  </el-card>
</template>
