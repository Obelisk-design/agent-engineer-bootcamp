/**
 * apps/web/src/utils/auth.ts
 *
 * Day 23 Task 1 (P0) —— token 工具（no-op）
 * spec 决策 5：dev 无登录页 → getToken 永远返回 null
 * Task 6 接 real JWT 时再实现 storage 读写
 */

export function getToken(): string | null {
  return null;
}

export function setToken(_t: string): void {
  /* no-op */
}

export function removeToken(): void {
  /* no-op */
}
