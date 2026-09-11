/**
 * apps/web/src/router/index.ts
 *
 * Day 23 Task 2 (P1) —— 9 条业务路由 + 2 条 redirect
 * - createWebHashHistory：admin 模板惯例（spec 决策 4）
 * - 9 路由：5 个 eval 子页 + RAG + EmbedDemo + EmbedCompare + Agent Console
 * - /embed-demo / /embed-compare 直接复用 Day 12 / Day 19 的业务 view（不是占位）
 *   —— Task 5 才在这两个 view 上接 layout
 * - Task 3 把这些 children 都换成从 permission store 动态生成
 */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import Layout from '@/layout/index.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/eval/overview' },
  {
    path: '/eval',
    component: Layout,
    redirect: '/eval/overview',
    meta: { title: 'Eval Platform', icon: 'DataAnalysis' },
    children: [
      {
        path: 'overview',
        component: () => import('@/views/eval/overview/index.vue'),
        meta: { title: '总览', icon: 'PieChart' },
      },
      {
        path: 'runner',
        component: () => import('@/views/eval/runner/index.vue'),
        meta: { title: '评测运行', icon: 'VideoPlay' },
      },
      {
        path: 'query',
        component: () => import('@/views/eval/query/index.vue'),
        meta: { title: '查询详情', icon: 'Search' },
      },
      {
        path: 'probe',
        component: () => import('@/views/eval/probe/index.vue'),
        meta: { title: '库探针', icon: 'Aim' },
      },
      {
        path: 'bias',
        component: () => import('@/views/eval/bias/index.vue'),
        meta: { title: '偏差分析', icon: 'Warning' },
      },
    ],
  },
  {
    path: '/rag',
    component: Layout,
    children: [
      {
        path: '',
        component: () => import('@/views/rag/index.vue'),
        meta: { title: 'RAG', icon: 'Reading' },
      },
    ],
  },
  {
    path: '/embed-demo',
    component: Layout,
    children: [
      {
        path: '',
        component: () => import('@/views/embed/EmbedDemo.vue'),
        meta: { title: 'Embed Demo', icon: 'MagicStick' },
      },
    ],
  },
  {
    path: '/embed-compare',
    component: Layout,
    children: [
      {
        path: '',
        component: () => import('@/views/embed-compare/EmbedCompare.vue'),
        meta: { title: 'Embed Compare', icon: 'Files' },
      },
    ],
  },
  {
    path: '/agent',
    component: Layout,
    children: [
      {
        path: '',
        component: () => import('@/views/agent/index.vue'),
        meta: { title: 'Agent Console', icon: 'ChatDotRound', theme: 'dark' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/eval/overview' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
