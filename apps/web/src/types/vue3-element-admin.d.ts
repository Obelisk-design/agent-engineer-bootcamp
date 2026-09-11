/**
 * apps/web/src/types/vue3-element-admin.d.ts
 *
 * Day 23 Task 1 (P0) —— 扩展 vue-router RouteMeta
 * admin 模板用到的 meta 字段：title / icon / theme / hidden / activeMenu
 * Task 6 在这基础上加 roles / affix / keepAlive / breadcrumb 等
 */

import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题（document.title & breadcrumb） */
    title?: string;
    /** 侧边栏图标（Element Plus Icon 名） */
    icon?: string;
    /** 主题：影响侧边栏 / navbar 配色 */
    theme?: 'dark' | 'light';
    /** 侧边栏隐藏（仍在路由表内可访问） */
    hidden?: boolean;
    /** 高亮侧边栏某项（用于详情页指向父菜单） */
    activeMenu?: string;
  }
}
