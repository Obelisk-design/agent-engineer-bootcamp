/**
 * apps/web/src/locales/index.ts
 *
 * Day 23 Task 1 (P0) —— vue-i18n 实例（占位，仅 zh-CN）
 * Task 6 加 en-US / 主题切换联动
 */

import { createI18n } from 'vue-i18n';

const messages = {
  'zh-CN': {
    eval: {
      overview: '总览',
      runner: '评测运行',
      query: '查询详情',
      probe: '库探针',
      bias: '偏差分析',
    },
    rag: 'RAG',
    agent: 'Agent Console',
  },
};

export default createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages,
});
