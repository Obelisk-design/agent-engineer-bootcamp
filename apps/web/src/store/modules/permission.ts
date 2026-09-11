/**
 * apps/web/src/store/modules/permission.ts
 *
 * Day 23 Task 1 (P0) —— 权限/路由 store（no-op 简化）
 * spec 决策 5：dev 无鉴权、无登录页 → generateRoutes 直接返回空
 * Task 6 接 real JWT/角色前保持空壳
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePermissionStore = defineStore('permission', () => {
  const routes = ref<string[]>([]);

  // dev 模式 no-op —— 不做动态路由注入

  function addRoute(_r: string): void {
    /* no-op: dev 无鉴权 */
  }

  // dev 模式：直接返回空 → 路由守卫无须拦截
  async function generateRoutes(): Promise<string[]> {
    return [];
  }

  return { routes, addRoute, generateRoutes };
});
