<script setup lang="ts">
defineProps<{ tabs: readonly string[]; modelValue: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <div class="flex gap-2 border-b border-gray-200">
    <button
      v-for="t in tabs"
      :key="t"
      :class="[
        'px-4 py-2 text-sm font-medium transition',
        modelValue === t
          ? 'border-b-2 border-blue-500 text-blue-600'
          : 'text-gray-600 hover:text-gray-900',
      ]"
      @click="$emit('update:modelValue', t)"
    >
      {{ t }}
    </button>
  </div>
</template>
