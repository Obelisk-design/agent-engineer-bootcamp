/**
 * apps/web/src/main.ts
 *
 * Vue 应用入口。
 * 把根组件挂到 #app。
 */

import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

createApp(App).mount('#app');
