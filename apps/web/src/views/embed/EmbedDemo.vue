<!--
  apps/web/src/views/embed/EmbedDemo.vue
  Day 23 Task 4：4 visualization panels under /embed-demo.
  对齐 apps/web 全局亮色 Element Plus 主题（AppMain #f0f2f5）。
-->
<script setup lang="ts">
import PanelA from './PanelA.vue';
import PanelB from './PanelB.vue';
import PanelC from './PanelC.vue';
import PanelD from './PanelD.vue';
import { getOpenAIConfig } from './api.js';
import './styles.css';
</script>

<template>
  <main class="embed-demo">
    <header style="grid-column: 1 / -1; display: flex; align-items: baseline; gap: 12px">
      <h1 style="font-size: 1.125rem; font-weight: 600; color: #303133; margin: 0">Embedding Demo</h1>
      <span style="font-size: 0.75rem; color: #909399">(dev) Day 12</span>
    </header>

    <div v-if="getOpenAIConfig().apiKey === null" class="embed-error" style="grid-column: 1 / -1">
      请设置 <code>VITE_OPENAI_API_KEY</code> in <code>.env</code> 后重启
      <code>pnpm dev:web</code>。
    </div>

    <PanelA />
    <PanelB />
    <PanelC />
    <PanelD />
  </main>
</template>
