/**
 * apps/web/src/store/modules/tags.ts
 *
 * Day 23 Task 2 (P1) —— TagsView 状态（visited views + add/remove）
 * Task 3 在这基础上加 affix / removeOthers / removeAll 等
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface TagView {
  path: string;
  name?: string;
  title: string;
}

export const useTagsStore = defineStore('tags', () => {
  const visitedViews = ref<TagView[]>([]);

  function addView(view: TagView): void {
    if (visitedViews.value.some((v) => v.path === view.path)) return;
    visitedViews.value.push(view);
  }

  function removeView(path: string): void {
    const idx = visitedViews.value.findIndex((v) => v.path === path);
    if (idx >= 0) visitedViews.value.splice(idx, 1);
  }

  return { visitedViews, addView, removeView };
});
