/**
 * apps/web/src/store/modules/app.ts
 *
 * Day 23 Task 1 (P0) —— 全局 UI 状态（sidebar 折叠 / 设备类型）
 * Task 6 在这基础上加 size / language 等
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false);
  const device = ref<'desktop' | 'mobile'>('desktop');

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }
  function toggleDevice(d: 'desktop' | 'mobile'): void {
    device.value = d;
  }

  return { sidebarCollapsed, device, toggleSidebar, toggleDevice };
});
