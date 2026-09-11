<!--
  apps/web/src/layout/components/TagsView/index.vue
  Day 23 Task 2 (P1) —— 已访问路由的标签条
  - watch(route.path) 立即把当前路由加进 visitedViews
  - 点 tag 跳转；点 X 删除（删到当前页跳回 overview）
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Close } from '@element-plus/icons-vue';
import { useTagsStore } from '@/store/modules/tags';

const route = useRoute();
const router = useRouter();
const tagsStore = useTagsStore();

const activePath = computed(() => route.path);

watch(
  () => route.path,
  (path) => {
    const title = (route.meta.title as string | undefined) ?? path;
    tagsStore.addView({ path, title });
  },
  { immediate: true },
);

function closeTag(path: string, ev: Event): void {
  ev.stopPropagation();
  tagsStore.removeView(path);
  if (path === route.path) {
    const next = tagsStore.visitedViews[tagsStore.visitedViews.length - 1];
    router.push(next?.path ?? '/eval/overview');
  }
}
</script>

<template>
  <div class="tags-view">
    <el-tag
      v-for="tag in tagsStore.visitedViews"
      :key="tag.path"
      :type="tag.path === activePath ? 'primary' : 'info'"
      :effect="tag.path === activePath ? 'dark' : 'plain'"
      @click="router.push(tag.path)"
    >
      {{ tag.title }}
      <el-icon style="margin-left:4px;cursor:pointer" @click="closeTag(tag.path, $event)">
        <Close />
      </el-icon>
    </el-tag>
  </div>
</template>

<style lang="scss" scoped>
.tags-view {
  height: $tags-view-height;
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  padding: 4px 8px;
  display: flex;
  gap: 4px;
  align-items: center;
  overflow-x: auto;
}
</style>
