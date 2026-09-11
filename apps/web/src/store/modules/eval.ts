/**
 * apps/web/src/store/modules/eval.ts
 * Day 23 Task 3 (P2) —— Eval Pinia store
 *
 * 状态：
 *  - retrievalReports: 历次 retrieval 评测聚合
 *  - corpusReports:   历次库构建评测聚合
 *  - corpusStats:     当前库 chunks 总览（per-table）
 *  - loading / error: 通用 loading + 错误态
 *
 * 派生：
 *  - latestRetrieval: 最近一次 retrieval 报告（list[0]）
 *  - avgRecallAt20:   所有 retrieval 报告 recall@20 的均值
 *
 * 行为：
 *  - loadReports():       拉 /api/eval/reports → 填 retrieval + corpus
 *  - loadCorpusStats():   拉 /api/eval/corpus-stats → 填 corpusStats
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  fetchReports,
  fetchCorpusStats,
  type RetrievalEvalReportView,
  type CorpusEvalReportView,
  type CorpusStats,
} from '@/api/eval';

export const useEvalStore = defineStore('eval', () => {
  const retrievalReports = ref<RetrievalEvalReportView[]>([]);
  const corpusReports = ref<CorpusEvalReportView[]>([]);
  const corpusStats = ref<CorpusStats | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const latestRetrieval = computed(() => retrievalReports.value[0] ?? null);
  const avgRecallAt20 = computed(() =>
    retrievalReports.value.length === 0
      ? 0
      : retrievalReports.value.reduce((s, r) => s + r.aggregate.recallAt20, 0) /
        retrievalReports.value.length,
  );

  async function loadReports(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const r = await fetchReports();
      retrievalReports.value = r.retrieval;
      corpusReports.value = r.corpus;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function loadCorpusStats(): Promise<void> {
    try {
      corpusStats.value = await fetchCorpusStats();
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  return {
    retrievalReports,
    corpusReports,
    corpusStats,
    loading,
    error,
    latestRetrieval,
    avgRecallAt20,
    loadReports,
    loadCorpusStats,
  };
});
