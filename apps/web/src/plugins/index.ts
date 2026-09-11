/**
 * apps/web/src/plugins/index.ts
 *
 * Day 23 Task 1 (P0) —— 全局插件注册
 * - Element Plus（中文 locale）
 * - vue-i18n
 * - Element Plus Icons Vue（全部注册为全局组件）
 *
 * Task 6 在这基础上加 directives（v-permission）/ 自定义组件（CRUD 等）。
 */

import type { App } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import i18n from '@/locales';

export default {
  install(app: App): void {
    // ElementPlus 类型把 locale 设计得过严（zhCn 不匹配 Partial<ConfigProviderProps>），
    // 社区公认 workaround：as never 绕过。运行期 locale 生效，行为正确。
    app.use(ElementPlus, { locale: zhCn } as never);
    app.use(i18n);
    for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(key, component as never);
    }
  },
};
