<!--
  apps/web/src/views/embed-compare/EmbedCompare.vue

  Day 18.5 容器：3 个 panel + 顶部输入框 + namespace 选择
  - 布局：垂直堆叠（Panel A → Panel B → Panel C）
  - 顶部输入：textarea (query) + namespace select + topK slider
  - 缺 env 显示红 banner（仿 EmbedDemo）
-->
<script setup lang="ts">
import { ref } from 'vue';
import PanelEmbed from './PanelEmbed.vue';
import PanelCompare from './PanelCompare.vue';
import PanelRerank from './PanelRerank.vue';
import { warnDevKeyOnce } from './api.js';
import type { Hit, SearchResponse } from '@/lib/api-schema.js';

const query = ref('cosine 怎么算');
const namespace = ref<'notion' | 'md' | 'all'>('all');
const topK = ref(5);
const hits = ref<Hit[] | null>(null);

// PanelCompare emit hits → 透传给 PanelRerank
function onHits(emitHits: SearchResponse['hits']): void {
  hits.value = [...emitHits];
}

const apiKeyAvailable = (import.meta.env.VITE_OPENAI_API_KEY ?? '').length > 0;
const devBaseUrl = (import.meta.env.VITE_OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1');
</script>

<template>
  <div class="ec-page">
    <header class="ec-header">
      <h1>Embed-Compare · 汉字 embed + lancedb 对比 + reranker 裁判</h1>
      <p class="ec-subtitle">
        一站式综合可视化 — 一次输入，跑完整链路：embed → lancedb top-K → reranker 重排
      </p>
    </header>

    <div v-if="!apiKeyAvailable" class="ec-banner-error">
      请设置 <code>VITE_OPENAI_API_KEY</code> / <code>VITE_OPENAI_BASE_URL</code> /
      <code>VITE_OPENAI_EMBEDDING_MODEL</code> in <code>.env</code> 后重启
      <code>pnpm dev:web</code>。
    </div>

    <section class="ec-input">
      <label class="ec-label">
        <span>查询文本（汉字 / 英文 / 混合）</span>
        <textarea
          v-model="query"
          rows="2"
          class="ec-textarea"
          placeholder="如：cosine 怎么算 / 什么是 lancedB / 紫光云是什么"
        />
      </label>

      <div class="ec-controls">
        <label class="ec-label-inline">
          <span>namespace:</span>
          <select v-model="namespace" class="ec-select">
            <option value="all">all (notion + md)</option>
            <option value="md">md (docs/daily + ADR)</option>
            <option value="notion">notion</option>
          </select>
        </label>
        <label class="ec-label-inline">
          <span>topK:</span>
          <input
            v-model.number="topK"
            type="number"
            min="1"
            max="20"
            class="ec-input-number"
          />
        </label>
      </div>
    </section>

    <div class="ec-panels">
      <PanelEmbed :query="query" />
      <PanelCompare :query="query" :namespace="namespace" :topK="topK" @hits="onHits" />
      <PanelRerank :query="query" :hits="hits" />
    </div>

    <footer class="ec-footer">
      <p class="text-xs text-zinc-500">
        dev gateway: <code>{{ devBaseUrl }}</code> · reranker:
        <code>qwen3-reranker-4b</code>
      </p>
      <p class="text-xs text-zinc-600">warnDevKeyOnce() 已在浏览器 console 打印告警（一次性）</p>
    </footer>
  </div>
</template>

<style scoped>
.ec-page {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  color: #e4e4e7;
}
.ec-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.ec-subtitle {
  color: #a1a1aa;
  font-size: 0.875rem;
}
.ec-banner-error {
  margin-top: 1rem;
  background: #7f1d1d;
  border: 1px solid #f87171;
  color: #fee2e2;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
}
.ec-input {
  margin-top: 1.5rem;
  background: #18181b;
  border: 1px solid #27272a;
  padding: 1rem;
  border-radius: 6px;
}
.ec-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.ec-label > span {
  font-size: 0.875rem;
  color: #d4d4d8;
}
.ec-textarea {
  background: #09090b;
  border: 1px solid #3f3f46;
  border-radius: 4px;
  padding: 0.5rem;
  color: #e4e4e7;
  font-family: monospace;
  resize: vertical;
}
.ec-controls {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
}
.ec-label-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #d4d4d8;
}
.ec-select,
.ec-input-number {
  background: #09090b;
  border: 1px solid #3f3f46;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  color: #e4e4e7;
}
.ec-input-number {
  width: 5rem;
}
.ec-panels {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.ec-footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #27272a;
  text-align: center;
}
</style>