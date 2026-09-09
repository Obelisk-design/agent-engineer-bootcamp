<!--
  apps/web/src/views/embed-compare/components/QueryComposer.vue

  顶部输入卡：textarea + namespace + topK + rerankEnabled + 主按钮 [Analyze]/[Cancel]。
  sticky 顶部，跑完后用户可以原地重跑。
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
  (e: 'update:topK', value: number): void;
  (e: 'update:rerankEnabled', value: boolean): void;
  (e: 'analyze'): void;
  (e: 'cancel'): void;
}>();
</script>

<template>
  <section class="sticky top-0 z-10 rounded-md border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur">
    <label class="block">
      <span class="text-xs uppercase tracking-wide text-zinc-400">Query</span>
      <textarea
        :value="props.query"
        rows="2"
        placeholder="如：cosine 怎么算 / 什么是 lancedb / 紫光云是什么"
        :disabled="props.busy"
        class="mt-1 block w-full resize-y rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-700 focus:outline-none disabled:opacity-50"
        @input="emit('update:query', ($event.target as HTMLTextAreaElement).value)"
        @keydown.meta.enter="emit('analyze')"
        @keydown.ctrl.enter="emit('analyze')"
      />
    </label>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-1.5 text-xs text-zinc-400">
          <span>Namespace</span>
          <select
            :value="props.namespace"
            :disabled="props.busy"
            class="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 disabled:opacity-50"
            @change="emit('update:namespace', ($event.target as HTMLSelectElement).value as 'notion' | 'md' | 'all')"
          >
            <option value="all">all (notion + md)</option>
            <option value="md">md (docs/daily + ADR)</option>
            <option value="notion">notion</option>
          </select>
        </label>

        <label class="flex items-center gap-1.5 text-xs text-zinc-400">
          <span>Top K</span>
          <input
            :value="props.topK"
            type="number"
            min="1"
            max="20"
            :disabled="props.busy"
            class="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 disabled:opacity-50"
            @input="emit('update:topK', Number(($event.target as HTMLInputElement).value))"
          />
        </label>

        <label class="flex items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            :checked="props.rerankEnabled"
            :disabled="props.busy"
            class="rounded border-zinc-700 bg-zinc-950 text-emerald-600 focus:ring-emerald-700"
            @change="emit('update:rerankEnabled', ($event.target as HTMLInputElement).checked)"
          />
          <span>启用 Reranker</span>
        </label>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="props.busy"
          type="button"
          class="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          v-else
          type="button"
          class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500"
          :disabled="props.query.trim().length === 0"
          @click="emit('analyze')"
        >
          Analyze →
        </button>
      </div>
    </div>
  </section>
</template>
