/**
 * apps/web/src/router/guard.ts
 *
 * Day 23 Task 1 (P0) —— 路由守卫（最小版）
 * - beforeEach：spec 决策 5，dev 无鉴权 → 直接 next()
 * - afterEach：根据 route.meta.title 设置 document.title
 *
 * Task 6 在这接动态路由 + 鉴权 + 进度条
 */

import type { Router } from 'vue-router';

export function setupGuards(router: Router): void {
  router.beforeEach((_to, _from, next) => {
    next();
  });
  router.afterEach((to) => {
    const title = (to.meta.title as string | undefined) ?? '';
    document.title = title ? `${title} · Agent Bootcamp` : 'Agent Bootcamp';
  });
}
