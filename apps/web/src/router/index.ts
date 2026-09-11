/**
 * apps/web/src/router/index.ts
 *
 * Day 23 Task 1 (P0) —— vue-router 占位壳
 * - createWebHashHistory：admin 模板惯例（spec 决策 4）
 * - 仅 2 个 redirect：根 → /eval/overview；404 → /eval/overview
 *
 * Task 2 在这基础上接入 5 个 eval 路由 + agent / rag / embed-compare；
 * Task 3 加 layout（侧边栏 + navbar + tags-view 包裹）。
 */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/eval/overview' },
  { path: '/:pathMatch(.*)*', redirect: '/eval/overview' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
