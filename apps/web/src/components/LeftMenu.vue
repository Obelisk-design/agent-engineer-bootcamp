<!--
  apps/web/src/components/LeftMenu.vue

  左侧 64px 极简菜单 (参考 LangSmith / Cursor / Continue.dev)：
  - 主内容只放导航 icon (Chat / Activity / Layers / Settings)
  - 顶部 brand mini Logo
  - 底部可选 Settings icon
  - 支持 emit('select', key) 让 App.vue 控制 active 状态（YAGNI: 现阶段先静态）
-->

<script setup lang="ts">
import { IconChat, IconActivity, IconLayers, IconSidebar } from './icons.js';

interface Props {
  active?: string;
}
const props = defineProps<Props>();
void props;
defineEmits<{
  (e: 'toggle-right-panel'): void;
}>();

const items = [
  { key: 'run', label: 'Run', icon: 'chat' as const },
  { key: 'traces', label: 'Traces', icon: 'activity' as const },
  { key: 'logs', label: 'Logs', icon: 'layers' as const },
  { key: 'embed', label: 'Embed', icon: 'chat' as const, href: '#/embed-demo' },
];

const ICON_MAP = {
  chat: IconChat,
  activity: IconActivity,
  layers: IconLayers,
};

function go(href: string | undefined): void {
  if (href === undefined) return;
  window.location.hash = href;
}
</script>

<template>
  <nav
    class="w-14 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-3 gap-1"
    data-testid="left-menu"
  >
    <!-- Brand mark -->
    <div class="w-9 h-9 rounded-md bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center text-zinc-950 font-bold text-[13px] mb-3">
      AI
    </div>

    <!-- Nav items -->
    <component
      :is="item.href !== undefined ? 'a' : 'button'"
      v-for="item in items"
      :key="item.key"
      :href="item.href"
      :type="item.href !== undefined ? undefined : 'button'"
      :class="[
        'w-10 h-10 rounded-md flex flex-col items-center justify-center gap-0.5 transition-colors',
        item.key === 'run'
          ? 'bg-zinc-800 text-emerald-300 ring-1 ring-emerald-700/30'
          : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60',
      ]"
      :title="item.label + (item.href !== undefined ? ' (dev)' : '')"
      @click="item.href !== undefined ? go(item.href) : undefined"
    >
      <component :is="ICON_MAP[item.icon]" :size="16" />
      <span class="text-[9px] font-medium tracking-wide">{{ item.label }}</span>
    </component>

    <div class="flex-1" />

    <!-- Toggle right panel -->
    <button
      type="button"
      class="w-10 h-10 rounded-md flex items-center justify-center text-zinc-500 hover:text-emerald-300 hover:bg-zinc-800/60 transition-colors"
      title="Toggle context panel"
      @click="$emit('toggle-right-panel')"
    >
      <IconSidebar :size="16" />
    </button>
  </nav>
</template>
