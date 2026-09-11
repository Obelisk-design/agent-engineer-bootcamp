/**
 * apps/web/src/main.ts
 *
 * Day 23 Task 1 (P0) —— Vue 应用入口
 * 注册顺序（admin 模板）：
 *   1. pinia（store 必须在 router 之前，因为 router 可能用到 store）
 *   2. router
 *   3. plugins（ElementPlus + i18n + Icons）
 *   4. guards
 */

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import pinia from './store';
import plugins from './plugins';
import { setupGuards } from './router/guard';
import './styles/index.scss';

const app = createApp(App);
app.use(pinia);
app.use(router);
app.use(plugins);
setupGuards(router);
app.mount('#app');
