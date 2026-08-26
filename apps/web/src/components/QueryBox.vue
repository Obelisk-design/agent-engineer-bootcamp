<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ namespace: 'notion' | 'md' | 'all'; disabled?: boolean }>();
const emit = defineEmits<{
  submit: [query: string];
  namespaceChange: [value: 'notion' | 'md' | 'all'];
}>();

const query = ref('');

function onSubmit() {
  if (query.value.trim().length === 0) return;
  emit('submit', query.value);
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <select
        :value="namespace"
        class="rounded border border-gray-300 px-2 py-1 text-sm"
        @change="emit('namespaceChange', ($event.target as HTMLSelectElement).value as 'notion' | 'md' | 'all')"
      >
        <option value="all">all</option>
        <option value="notion">notion</option>
        <option value="md">md</option>
      </select>
      <input
        v-model="query"
        type="text"
        :disabled="disabled"
        placeholder="输入 query…"
        class="flex-1 rounded border border-gray-300 px-3 py-1 text-sm"
        @keydown.enter="onSubmit"
      />
      <button
        :disabled="disabled"
        class="rounded bg-blue-500 px-4 py-1 text-sm text-white disabled:bg-gray-300"
        @click="onSubmit"
      >
        搜索
      </button>
    </div>
  </div>
</template>
