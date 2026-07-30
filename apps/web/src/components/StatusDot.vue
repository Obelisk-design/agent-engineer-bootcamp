<!--
  apps/web/src/components/StatusDot.vue

  状态小圆点 —— TimelineItem icon 用。
  - kind: 'message_start' / 'done' / 'message_end' → 绿（success / 完成）
  - kind: 'iteration' / 'request' / 'response' / 'message_delta' → 蓝（active / in-flight）
  - kind: 'tool_call' → 黄（pending 等待 tool result）
  - kind: 'tool_result' → 紫（done 来自外部）
  - kind: 'error' / 'aborted' → 红
  - 其他未知 kind → zinc 灰

  设计：
  - 不写大小（继承 font-size × 0.9）
  - 颜色硬编码 Tailwind utility class，避免新增 <style> block
-->

<script setup lang="ts">
interface Props {
  kind: string;
  status: 'done' | 'active' | 'error';
}

const props = defineProps<Props>();

function colorClass(): string {
  if (props.status === 'error') return 'bg-red-500';
  if (props.status === 'active') return 'bg-sky-400 animate-pulse';
  // status === 'done'
  if (props.kind === 'tool_call') return 'bg-amber-500'; // 已发出，等结果
  if (props.kind === 'tool_result') return 'bg-violet-500';
  if (props.kind === 'iteration' || props.kind === 'request' || props.kind === 'response') {
    return 'bg-sky-500';
  }
  if (props.kind === 'error') return 'bg-red-500';
  return 'bg-emerald-500';
}
</script>

<template>
  <span
    :class="['inline-block w-2 h-2 rounded-full shrink-0 mt-1.5', colorClass()]"
    :aria-label="`${kind} (${status})`"
  />
</template>
