<!--
  apps/web/src/views/embed/EmbedDemo.vue
  Day 12 demo page: 4 visualization panels under /embed-demo.
-->
<script setup lang="ts">
import PanelA from './PanelA.vue';
import PanelB from './PanelB.vue';
import PanelC from './PanelC.vue';
import PanelD from './PanelD.vue';
import { getOpenAIConfig } from './api.js';
</script>

<template>
  <main class="embed-demo">
    <header class="flex items-baseline gap-3">
      <h1 class="text-lg font-semibold text-zinc-100">Embedding Demo</h1>
      <span class="text-xs text-zinc-500">(dev) Day 12</span>
    </header>

    <div v-if="getOpenAIConfig().apiKey === null" class="embed-error">
      请设置 <code>VITE_OPENAI_API_KEY</code> in <code>.env</code> 后重启
      <code>pnpm dev:web</code>。
    </div>

    <PanelA />
    <PanelB />
    <PanelC />
    <PanelD />
  </main>
</template>
