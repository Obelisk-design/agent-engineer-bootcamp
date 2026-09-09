<!--
  apps/web/src/views/embed-compare/components/EmptyState.vue

  页面未运行时显示的引导态：标题 + 4 个 example chip，点击填到 query（不自动 run）。
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
  <div class="mx-auto max-w-2xl py-12 text-center">
    <p class="text-xs uppercase tracking-wider text-zinc-500">Try one of these</p>
    <h2 class="mt-2 text-lg font-semibold text-zinc-200">
      输入一段文本，观察 Embedding → Vector Search → Reranker 的全过程
    </h2>
    <p class="mt-2 text-sm text-zinc-400">
      点击下方示例填入查询框，或直接输入自己的文本，然后按 <kbd class="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-zinc-300">[Analyze]</kbd>。
    </p>
    <div class="mt-6 flex flex-wrap justify-center gap-2">
      <button
        v-for="ex in examples"
        :key="ex"
        type="button"
        class="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 hover:border-emerald-700 hover:bg-zinc-800"
        @click="emit('pick', ex)"
      >
        {{ ex }}
      </button>
    </div>
  </div>
</template>
