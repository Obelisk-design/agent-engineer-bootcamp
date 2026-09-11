/**
 * apps/web/src/store/index.ts
 *
 * Day 23 Task 1 (P0) —— Pinia 入口 + 三个核心 store 重导出
 * Task 6 加 tags store + eval/agent 自有 store
 */

import { createPinia } from 'pinia';

const pinia = createPinia();

export default pinia;
export * from './modules/app';
export * from './modules/settings';
export * from './modules/permission';
