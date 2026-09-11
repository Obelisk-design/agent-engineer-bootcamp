/**
 * apps/web/src/store/modules/rag.ts
 * Day 23 Task 4 (P3) —— RAG 状态层
 *
 * 暴露：query / hits / loading / error / runSearch
 * 与 brief 接口契约一致；namespace 参数由 SearchView 内部管理（不污染 store 边界）。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { search, type Hit } from '@/api/rag';

export const useRagStore = defineStore('rag', () => {
  const query = ref('');
  const hits = ref<Hit[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** 最近一次搜索耗时（ms）—— 用于 hits 上方展示 */
  const elapsed = ref<number | null>(null);
  /** 当前 namespace —— SearchView 用 */
  const namespace = ref<'notion' | 'md' | 'all'>('all');

  async function runSearch(): Promise<void> {
    if (!query.value.trim()) return;
    loading.value = true;
    error.value = null;
    const start = performance.now();
    try {
      const res = await search(query.value, 5, namespace.value);
      hits.value = res.hits;
    } catch (e) {
      error.value = (e as Error).message;
      hits.value = [];
    } finally {
      elapsed.value = Math.round(performance.now() - start);
      loading.value = false;
    }
  }

  return { query, hits, loading, error, elapsed, namespace, runSearch };
});
