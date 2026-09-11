/**
 * apps/web/src/store/modules/settings.ts
 *
 * Day 23 Task 1 (P0) —— admin 模板 settings store（tags-view / breadcrumb / fixedHeader / sidebarLogo）
 * Task 6 加 theme / 语言 / 主题色
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  const showTagsView = ref(true);
  const showBreadcrumb = ref(true);
  const fixedHeader = ref(true);
  const sidebarLogo = ref(true);

  return { showTagsView, showBreadcrumb, fixedHeader, sidebarLogo };
});
