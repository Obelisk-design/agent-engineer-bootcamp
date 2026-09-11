# vue3-element-admin 重构 apps/web 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 apps/web 从"自造壳 + Tailwind 手写"迁移到 vue3-element-admin 风格，5 view 全迁（Eval 拆 5 路由 + Rag/Embed/EmbedCompare/Agent）+ Pinia 状态管理 + Element Plus 原生 + admin layout（Sidebar/Navbar/TagsView/Breadcrumb）。

**Architecture:** 源码移植 vue3-element-admin 的 layout/router/store/utils/composables 到 apps/web 现有目录，保留 admin 同款目录分层（layout/router/store/views/plugins/styles）；Pinia 4 个 admin store + 2 个自有（eval/agent）；vite proxy 不变（3000/3100/3202/5173 端口都不动）。

**Tech Stack:** Vue 3.5 + Vite 6 + TypeScript 5.7 + Element Plus 2.9 + Pinia 3 + vue-router 4 + Axios + ECharts 5（按需）+ SCSS（无 Tailwind）。

**Spec:** [docs/superpowers/specs/2026-09-12-vue3-element-admin-refactor-design.md](../specs/2026-09-12-vue3-element-admin-refactor-design.md)

---

## Global Constraints

- **Node**: >= 22.0.0, **pnpm**: >= 9.0.0（package.json engines 字段）
- **端口**: 3000 (agent-server) / 3100 (rag-server) / 3202 (eval-server) / 5173 (web) — 全部不变
- **路由**: 使用 `createWebHashHistory`（与 Day 12 旧 hash 链接兼容）
- **样式**: 弃 Tailwind 4 / 走 SCSS + Element Plus 原生 el-* 组件
- **登录**: 不要登录页 / 无 JWT / 无 auth 守卫（permission store 简化为 no-op）
- **CLAUDE.md Day 02 §9 边界**: 组件不直接 fetch / SSE，全部委托 api/agentClient.ts（store action 内调用）
- **admin 模板不依赖本项目 libs**（避免反向耦合）
- **commit 规范**: conventional commits (feat / fix / docs / refactor / chore)
- **每 P 完成后**: `pnpm typecheck:web` 必须全绿
- **每 P 完成后**: Chrome MCP 访问相应路由截图验收

---

## 文件结构（按 P 阶段增量创建）

```
apps/web/
├── src/
│   ├── api/                                 🆕 Task P0 + P2
│   │   ├── request.ts                       (axios 实例 + interceptor)
│   │   ├── eval/index.ts                    (P2: 评测 API)
│   │   ├── rag/index.ts                     (P3: RAG API)
│   │   ├── embed/index.ts                   (P3: embed API)
│   │   └── agent/agentClient.ts             ✅ 保留（P4 迁移到 store 调用）
│   ├── components/                          ⬇ Task P4
│   │   ├── Composer.vue                     ✅ 保留（暗色覆盖）
│   │   ├── HeaderBar.vue                    ⬇ P4 (暗色 + el-page-header)
│   │   ├── RightPanel.vue                   ✅ 保留
│   │   └── ConversationPanel.vue            ✅ 保留
│   ├── composables/                         🆕 Task P2
│   │   └── useECharts.ts
│   ├── layout/                              🆕 Task P1
│   │   ├── index.vue
│   │   └── components/
│   │       ├── Sidebar/index.vue
│   │       ├── Navbar.vue
│   │       ├── TagsView/index.vue
│   │       ├── Breadcrumb.vue
│   │       ├── AppMain.vue
│   │       └── Settings/index.vue
│   ├── plugins/                             🆕 Task P0
│   │   └── index.ts                         (ElementPlus + Icons + I18n 注册)
│   ├── router/                              🆕 Task P0
│   │   ├── index.ts                         (createRouter + createWebHashHistory)
│   │   └── guard.ts                         (title + 进度条 + 旧 hash 兼容)
│   ├── store/                               🆕 Task P0
│   │   ├── index.ts                         (createPinia)
│   │   └── modules/
│   │       ├── app.ts                       (P0: sidebar 折叠 / device)
│   │       ├── settings.ts                  (P0: layout 偏好)
│   │       ├── permission.ts                (P0: no-op 简化)
│   │       ├── tags.ts                      (P1: visited views)
│   │       ├── eval.ts                      🆕 P2: 评测状态
│   │       ├── rag.ts                       🆕 P3: RAG 状态
│   │       └── agent.ts                     🆕 P4: agent console 状态
│   ├── styles/                              🆕 Task P0
│   │   ├── index.scss
│   │   ├── element-plus.scss                (主题变量)
│   │   ├── transition.scss
│   │   └── variables.scss
│   ├── types/
│   │   ├── agentEvent.ts                    ✅ 保留
│   │   └── vue3-element-admin.d.ts          🆕 P0: admin 全局类型
│   ├── utils/
│   │   ├── auth.ts                          🆕 P0: no-op token
│   │   ├── request.ts                       🆕 P0: Axios 封装（可选，admin 自带）
│   │   └── sessionUsage.ts                  ✅ 保留
│   ├── views/                               ⬇ 按 P 改写
│   │   ├── agent/
│   │   │   ├── index.vue                    🆕 P4
│   │   │   └── styles/agent-dark.scss       🆕 P4
│   │   ├── embed/EmbedDemo.vue              ⬇ P3 (el-card 包裹)
│   │   ├── embed-compare/EmbedCompare.vue   ⬇ P3 (el-steps 替换)
│   │   ├── rag/
│   │   │   ├── index.vue                    🆕 P3
│   │   │   ├── SearchView.vue               ⬇ P3 (el-table)
│   │   │   ├── IngestView.vue               ⬇ P3 (el-form)
│   │   │   └── TwoStageView.vue             ⬇ P3
│   │   └── eval/
│   │       ├── overview/index.vue           🆕 P2
│   │       ├── runner/index.vue             🆕 P2
│   │       ├── query/index.vue              🆕 P2
│   │       ├── probe/index.vue              🆕 P2
│   │       └── bias/index.vue               🆕 P2
│   ├── App.vue                              ⬇ P0 → P5 (最终 18 行)
│   └── main.ts                              ⬇ P0 (注册 Pinia/Router/ElementPlus)
├── tailwind.config.ts                       ❌ P5 删
├── vite.config.ts                           ⬇ P0 (去 tailwindcss 插件)
└── index.html
```

**示例脚本 / 后端**: 不动（`libs/eval/*`、`apps/api/*`、`examples/day22/*`）

---

## Task 切分总览

按 spec §7 Migration Phases 分 6 个 P（P0~P5），每个 P 1 个 task：

| Task | P | 标题 | 范围 | 验收 |
|---|---|---|---|---|
| 1 | P0 | 移植 admin 源码 + 注册核心三件套 | 装依赖 + plugins + store + router + main + App.vue 空壳 | typecheck ✅ + Chrome MCP 看 404 页 |
| 2 | P1 | layout 壳 + 静态路由占位 | Sidebar/Navbar/TagsView/Breadcrumb/AppMain + 8 条占位路由 | Chrome MCP 看完整 layout + sidebar 9 项 |
| 3 | P2 | Eval 5 路由 + Element Plus + useEvalStore | 5 个 view 改写 + el-* 组件 + store + ECharts | Chrome MCP 五页全活 + ex_003 跑通 |
| 4 | P3 | Rag / Embed / EmbedCompare 三 view | 4 个 view 改写 + el-tabs/row/col/steps + useRagStore | Chrome MCP 四页全活 |
| 5 | P4 | Agent console 搬 useAgentStore + 暗色覆盖 | App.vue dispatch 拆到 store + 暗色 SCSS + SSE 验证 | Chrome MCP /agent + SSE 流式跑通 |
| 6 | P5 | 收尾 + hash 兼容 + 验收 | 删 tailwind.config + 旧 api/ + App.vue dispatch + 守卫 + grep | 12 项验收清单全 ✅ |

每个 task 内分多个 2-5 分钟 step，DRY 跨 task 的代码（如 axios 配置）。

---

## Task 1: P0 · 移植 admin 源码 + 注册核心三件套

**Files:**
- Modify: `apps/web/package.json` (新增依赖)
- Modify: `apps/web/vite.config.ts` (去 tailwindcss)
- Create: `apps/web/src/plugins/index.ts`
- Create: `apps/web/src/store/index.ts`
- Create: `apps/web/src/store/modules/{app,settings,permission}.ts`
- Create: `apps/web/src/router/index.ts`
- Create: `apps/web/src/router/guard.ts`
- Create: `apps/web/src/styles/{index,element-plus,transition,variables}.scss`
- Create: `apps/web/src/types/vue3-element-admin.d.ts`
- Create: `apps/web/src/utils/auth.ts` (no-op)
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/App.vue` (缩到 18 行)

**Interfaces:**
- Consumes: 无（前置任务）
- Produces:
  - `main.ts` 注册 `app.use(createPinia())` + `app.use(router)` + `app.use(plugins)`
  - `router/index.ts` 导出 `router` (createWebHashHistory)
  - `store/index.ts` 导出 `pinia` (createPinia)
  - `App.vue` 只剩 `<el-config-provider><router-view /></el-config-provider>`

### Steps

- [ ] **Step 1: 安装 admin 模板依赖**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
pnpm --filter web add element-plus @element-plus/icons-vue pinia vue-router@4 axios echarts unplugin-vue-components unplugin-auto-import vue-i18n@9
```

Expected: 8 个包装上，apps/web/package.json dependencies 出现这 8 个。

- [ ] **Step 2: 装 SCSS 相关 + sass**

```bash
pnpm --filter web add -D sass
```

- [ ] **Step 3: 修改 vite.config.ts（去 tailwindcss，加 sass 支持）**

修改 [apps/web/vite.config.ts](../../apps/web/vite.config.ts)：

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000';
const RAG_API_TARGET = process.env.VITE_RAG_API_TARGET ?? 'http://localhost:3100';
const EVAL_API_TARGET = process.env.VITE_EVAL_API_TARGET ?? 'http://localhost:3202';

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/agent': { target: API_TARGET, changeOrigin: true },
      '/traces': { target: API_TARGET, changeOrigin: true },
      '/api/eval': { target: EVAL_API_TARGET, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api': { target: RAG_API_TARGET, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  css: {
    preprocessorOptions: {
      scss: { api: 'modern-compiler' },
    },
  },
});
```

- [ ] **Step 4: 创建 styles/index.scss**

创建 [apps/web/src/styles/index.scss](../../apps/web/src/styles/index.scss)：

```scss
@use './variables.scss' as *;
@use './element-plus.scss';
@use './transition.scss';

html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 5: 创建 styles/variables.scss**

创建 [apps/web/src/styles/variables.scss](../../apps/web/src/styles/variables.scss)：

```scss
$primary-color: #409eff;
$success-color: #67c23a;
$warning-color: #e6a23c;
$danger-color: #f56c6c;
$info-color: #909399;

$sidebar-width: 210px;
$sidebar-collapsed-width: 64px;
$navbar-height: 50px;
$tags-view-height: 34px;
```

- [ ] **Step 6: 创建 styles/element-plus.scss**

创建 [apps/web/src/styles/element-plus.scss](../../apps/web/src/styles/element-plus.scss)：

```scss
:root {
  --el-color-primary: #409eff;
  --el-color-success: #67c23a;
  --el-color-warning: #e6a23c;
  --el-color-danger: #f56c6c;
  --el-color-info: #909399;
}
```

- [ ] **Step 7: 创建 styles/transition.scss**

创建 [apps/web/src/styles/transition.scss](../../apps/web/src/styles/transition.scss)：

```scss
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
```

- [ ] **Step 8: 创建 plugins/index.ts**

创建 [apps/web/src/plugins/index.ts](../../apps/web/src/plugins/index.ts)：

```ts
import type { App } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import i18n from '@/locales';

export default {
  install(app: App) {
    app.use(ElementPlus, { locale: zhCn });
    app.use(i18n);
    for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(key, component as never);
    }
  },
};
```

- [ ] **Step 9: 创建 locales/index.ts（zh-CN）**

创建 [apps/web/src/locales/index.ts](../../apps/web/src/locales/index.ts)：

```ts
import { createI18n } from 'vue-i18n';

const messages = {
  'zh-CN': {
    eval: { overview: '总览', runner: '评测运行', query: '查询详情', probe: '库探针', bias: '偏差分析' },
    rag: 'RAG',
    agent: 'Agent Console',
  },
};

export default createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages,
});
```

- [ ] **Step 10: 创建 store/index.ts**

创建 [apps/web/src/store/index.ts](../../apps/web/src/store/index.ts)：

```ts
import { createPinia } from 'pinia';
const pinia = createPinia();
export default pinia;
export * from './modules/app';
export * from './modules/settings';
export * from './modules/permission';
```

- [ ] **Step 11: 创建 store/modules/app.ts**

创建 [apps/web/src/store/modules/app.ts](../../apps/web/src/store/modules/app.ts)：

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false);
  const device = ref<'desktop' | 'mobile'>('desktop');
  function toggleSidebar() { sidebarCollapsed.value = !sidebarCollapsed.value; }
  function toggleDevice(d: 'desktop' | 'mobile') { device.value = d; }
  return { sidebarCollapsed, device, toggleSidebar, toggleDevice };
});
```

- [ ] **Step 12: 创建 store/modules/settings.ts**

创建 [apps/web/src/store/modules/settings.ts](../../apps/web/src/store/modules/settings.ts)：

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  const showTagsView = ref(true);
  const showBreadcrumb = ref(true);
  const fixedHeader = ref(true);
  const sidebarLogo = ref(true);
  return { showTagsView, showBreadcrumb, fixedHeader, sidebarLogo };
});
```

- [ ] **Step 13: 创建 store/modules/permission.ts（no-op 简化）**

创建 [apps/web/src/store/modules/permission.ts](../../apps/web/src/store/modules/permission.ts)：

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePermissionStore = defineStore('permission', () => {
  const routes = ref<string[]>([]);
  const addRoute = (_r: string) => { /* no-op: dev 无鉴权 */ };
  const generateRoutes = async () => []; // dev: 直接返回空
  return { routes, addRoute, generateRoutes };
});
```

- [ ] **Step 14: 创建 utils/auth.ts（no-op）**

创建 [apps/web/src/utils/auth.ts](../../apps/web/src/utils/auth.ts)：

```ts
// dev 模式：no-op（spec 决策 5：不要登录页）
export function getToken(): string | null { return null; }
export function setToken(_t: string): void { /* no-op */ }
export function removeToken(): void { /* no-op */ }
```

- [ ] **Step 15: 创建 router/index.ts（仅占位，Task 2 替换）**

创建 [apps/web/src/router/index.ts](../../apps/web/src/router/index.ts)：

```ts
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/eval/overview' },
  { path: '/:pathMatch(.*)*', redirect: '/eval/overview' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
```

- [ ] **Step 16: 创建 router/guard.ts**

创建 [apps/web/src/router/guard.ts](../../apps/web/src/router/guard.ts)：

```ts
import type { Router } from 'vue-router';

export function setupGuards(router: Router): void {
  router.beforeEach((_to, _from, next) => {
    next();
  });
  router.afterEach((to) => {
    const title = (to.meta.title as string | undefined) ?? '';
    document.title = title ? `${title} · Agent Bootcamp` : 'Agent Bootcamp';
  });
}
```

- [ ] **Step 17: 创建 types/vue3-element-admin.d.ts**

创建 [apps/web/src/types/vue3-element-admin.d.ts](../../apps/web/src/types/vue3-element-admin.d.ts)：

```ts
import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    icon?: string;
    theme?: 'dark' | 'light';
    hidden?: boolean;
    activeMenu?: string;
  }
}
```

- [ ] **Step 18: 改写 main.ts**

修改 [apps/web/src/main.ts](../../apps/web/src/main.ts)：

```ts
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
```

- [ ] **Step 19: 改写 App.vue（缩到 18 行）**

修改 [apps/web/src/App.vue](../../apps/web/src/App.vue)：

```vue
<script setup lang="ts">
</script>

<template>
  <el-config-provider>
    <router-view />
  </el-config-provider>
</template>
```

- [ ] **Step 20: typecheck 验证**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
pnpm typecheck:web
```

Expected: 0 error（可能有 warning，无所谓）。

- [ ] **Step 21: 启动 dev 验证空壳**

```bash
pnpm dev:web
```

Expected: Vite 启动 → 打开 http://localhost:5173 → 显示空白（router-view 没有 layout，会闪一下然后 redirect 到 `/eval/overview`，但目前没有这路由，会再次跳到 `/eval/overview`，最终空白页）。

- [ ] **Step 22: Chrome MCP 截图验收**

```bash
# Chrome MCP：打开 http://localhost:5173 → 应看到空白（404/empty）
```

Expected: 空白页，浏览器 console 无 vue/runtime error。

- [ ] **Step 23: commit**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
git add apps/web/src apps/web/vite.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "refactor(web): P0 admin 模板移植 (Pinia/Router/ElementPlus 注册 + 空壳)"
```

---

## Task 2: P1 · layout 壳 + 静态路由占位

**Files:**
- Create: `apps/web/src/layout/index.vue`
- Create: `apps/web/src/layout/components/AppMain.vue`
- Create: `apps/web/src/layout/components/Sidebar/{index.vue,SidebarItem.vue}`
- Create: `apps/web/src/layout/components/Navbar.vue`
- Create: `apps/web/src/layout/components/TagsView/index.vue`
- Create: `apps/web/src/layout/components/Breadcrumb.vue`
- Create: `apps/web/src/store/modules/tags.ts`
- Create: `apps/web/src/views/eval/{overview,runner,query,probe,bias}/index.vue` (5 个占位页)
- Create: `apps/web/src/views/rag/index.vue`
- Create: `apps/web/src/views/embed/EmbedDemo.vue`
- Create: `apps/web/src/views/embed-compare/EmbedCompare.vue`
- Create: `apps/web/src/views/agent/index.vue`
- Modify: `apps/web/src/router/index.ts` (8 条路由)

**Interfaces:**
- Consumes: Task 1 产出的 `router`, `pinia`, `plugins`, `useAppStore`, `useSettingsStore`
- Produces:
  - 9 条路由（spec §3.3）
  - Sidebar 显示 9 个菜单项
  - TagsView 显示访问过的路由
  - 面包屑显示当前位置
  - 每个 view 是占位页（仅显示标题）

### Steps

- [ ] **Step 1: 创建 layout/index.vue**

创建 [apps/web/src/layout/index.vue](../../apps/web/src/layout/index.vue)：

```vue
<script setup lang="ts">
import { useAppStore } from '@/store/modules/app';
const appStore = useAppStore();
</script>

<template>
  <div class="app-wrapper" :class="{ 'sidebar-collapsed': appStore.sidebarCollapsed }">
    <Sidebar />
    <div class="main-container">
      <Navbar />
      <TagsView />
      <AppMain />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.app-wrapper {
  display: flex;
  height: 100vh;
  &.sidebar-collapsed .main-container { margin-left: $sidebar-collapsed-width; }
}
.main-container {
  flex: 1;
  margin-left: $sidebar-width;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: 创建 layout/components/AppMain.vue**

创建 [apps/web/src/layout/components/AppMain.vue](../../apps/web/src/layout/components/AppMain.vue)：

```vue
<template>
  <div class="app-main">
    <router-view v-slot="{ Component, route }">
      <transition name="fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
  </div>
</template>

<style lang="scss" scoped>
.app-main {
  flex: 1;
  overflow: auto;
  background: #f0f2f5;
  padding: 16px;
}
</style>
```

- [ ] **Step 3: 创建 layout/components/Sidebar/SidebarItem.vue**

创建 [apps/web/src/layout/components/Sidebar/SidebarItem.vue](../../apps/web/src/layout/components/Sidebar/SidebarItem.vue)：

```vue
<script setup lang="ts">
defineProps<{ to: string; icon?: string; title: string }>();
</script>

<template>
  <el-menu-item :index="to">
    <el-icon v-if="icon"><component :is="icon" /></el-icon>
    <template #title>{{ title }}</template>
  </el-menu-item>
</template>
```

- [ ] **Step 4: 创建 layout/components/Sidebar/index.vue**

创建 [apps/web/src/layout/components/Sidebar/index.vue](../../apps/web/src/layout/components/Sidebar/index.vue)：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '@/store/modules/app';

const route = useRoute();
const appStore = useAppStore();

const menuItems = computed(() => {
  const matched = route.matched.filter((r) => r.meta?.title && !r.meta?.hidden);
  return matched.map((r) => ({ to: r.path, icon: r.meta.icon, title: r.meta.title }));
});
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: appStore.sidebarCollapsed }">
    <div class="logo">Agent Bootcamp</div>
    <el-menu :default-active="route.path" :collapse="appStore.sidebarCollapsed" router>
      <SidebarItem v-for="m in menuItems" :key="m.to" v-bind="m" />
    </el-menu>
  </aside>
</template>

<style lang="scss" scoped>
.sidebar {
  width: $sidebar-width;
  background: #001529;
  color: #fff;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  overflow-y: auto;
  transition: width 0.25s;
  &.collapsed { width: $sidebar-collapsed-width; }
}
.logo { padding: 16px; font-weight: bold; font-size: 16px; text-align: center; }
</style>
```

- [ ] **Step 5: 创建 layout/components/Navbar.vue**

创建 [apps/web/src/layout/components/Navbar.vue](../../apps/web/src/layout/components/Navbar.vue)：

```vue
<script setup lang="ts">
import { useAppStore } from '@/store/modules/app';
const appStore = useAppStore();
</script>

<template>
  <header class="navbar">
    <el-button text @click="appStore.toggleSidebar()">
      <el-icon><Fold v-if="!appStore.sidebarCollapsed" /><Expand v-else /></el-icon>
    </el-button>
    <Breadcrumb />
  </header>
</template>

<style lang="scss" scoped>
.navbar {
  height: $navbar-height;
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
}
</style>
```

- [ ] **Step 6: 创建 layout/components/Breadcrumb.vue**

创建 [apps/web/src/layout/components/Breadcrumb.vue](../../apps/web/src/layout/components/Breadcrumb.vue)：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const breadcrumbs = computed(() => route.matched.filter((r) => r.meta?.title));
</script>

<template>
  <el-breadcrumb separator="/">
    <el-breadcrumb-item v-for="b in breadcrumbs" :key="b.path">{{ b.meta.title }}</el-breadcrumb-item>
  </el-breadcrumb>
</template>
```

- [ ] **Step 7: 创建 store/modules/tags.ts**

创建 [apps/web/src/store/modules/tags.ts](../../apps/web/src/store/modules/tags.ts)：

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

interface TagView { path: string; name?: string; title: string; }

export const useTagsStore = defineStore('tags', () => {
  const visitedViews = ref<TagView[]>([]);
  function addView(view: TagView) {
    if (visitedViews.value.some((v) => v.path === view.path)) return;
    visitedViews.value.push(view);
  }
  function removeView(path: string) {
    const idx = visitedViews.value.findIndex((v) => v.path === path);
    if (idx >= 0) visitedViews.value.splice(idx, 1);
  }
  return { visitedViews, addView, removeView };
});
```

- [ ] **Step 8: 创建 layout/components/TagsView/index.vue**

创建 [apps/web/src/layout/components/TagsView/index.vue](../../apps/web/src/layout/components/TagsView/index.vue)：

```vue
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

function closeTag(path: string, ev: Event) {
  ev.stopPropagation();
  tagsStore.removeView(path);
  if (path === route.path) router.push('/eval/overview');
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
      <el-icon style="margin-left:4px;cursor:pointer" @click="closeTag(tag.path, $event)"><Close /></el-icon>
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
```

- [ ] **Step 9: 创建 9 个占位 view（Eval 5 + Rag + Embed 2 + Agent 1）**

创建 9 个文件，每个都是：

`apps/web/src/views/eval/overview/index.vue`:
```vue
<template>
  <el-card><h2>📊 总览</h2><p>占位页（P2 实装）</p></el-card>
</template>
```

类比创建：
- `apps/web/src/views/eval/runner/index.vue` → "▶️ 评测运行"
- `apps/web/src/views/eval/query/index.vue` → "🔍 查询详情"
- `apps/web/src/views/eval/probe/index.vue` → "🎯 库探针"
- `apps/web/src/views/eval/bias/index.vue` → "⚠️ 偏差分析"
- `apps/web/src/views/rag/index.vue` → "📚 RAG"
- `apps/web/src/views/embed/EmbedDemo.vue` → "✨ Embed Demo"
- `apps/web/src/views/embed-compare/EmbedCompare.vue` → "📁 Embed Compare"
- `apps/web/src/views/agent/index.vue` → "🤖 Agent Console"

- [ ] **Step 10: 改写 router/index.ts（8 条路由）**

修改 [apps/web/src/router/index.ts](../../apps/web/src/router/index.ts)：

```ts
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import Layout from '@/layout/index.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/eval/overview' },
  {
    path: '/eval',
    component: Layout,
    redirect: '/eval/overview',
    meta: { title: 'Eval Platform', icon: 'DataAnalysis' },
    children: [
      { path: 'overview', component: () => import('@/views/eval/overview/index.vue'), meta: { title: '总览', icon: 'PieChart' } },
      { path: 'runner',   component: () => import('@/views/eval/runner/index.vue'),   meta: { title: '评测运行', icon: 'VideoPlay' } },
      { path: 'query',    component: () => import('@/views/eval/query/index.vue'),    meta: { title: '查询详情', icon: 'Search' } },
      { path: 'probe',    component: () => import('@/views/eval/probe/index.vue'),    meta: { title: '库探针', icon: 'Aim' } },
      { path: 'bias',     component: () => import('@/views/eval/bias/index.vue'),     meta: { title: '偏差分析', icon: 'Warning' } },
    ],
  },
  { path: '/rag',           component: Layout, children: [{ path: '', component: () => import('@/views/rag/index.vue'), meta: { title: 'RAG', icon: 'Reading' } }] },
  { path: '/embed-demo',    component: Layout, children: [{ path: '', component: () => import('@/views/embed/EmbedDemo.vue'), meta: { title: 'Embed Demo', icon: 'MagicStick' } }] },
  { path: '/embed-compare', component: Layout, children: [{ path: '', component: () => import('@/views/embed-compare/EmbedCompare.vue'), meta: { title: 'Embed Compare', icon: 'Files' } }] },
  { path: '/agent',         component: Layout, children: [{ path: '', component: () => import('@/views/agent/index.vue'), meta: { title: 'Agent Console', icon: 'ChatDotRound', theme: 'dark' } }] },
  { path: '/:pathMatch(.*)*', redirect: '/eval/overview' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
```

- [ ] **Step 11: typecheck**

```bash
pnpm typecheck:web
```

Expected: 0 error。

- [ ] **Step 12: 启动 dev + Chrome MCP**

```bash
pnpm dev:web
```

打开 http://localhost:5173 → 看到 layout 壳 + Sidebar 9 菜单 + 面包屑 + TagsView（空，因 route 还没访问）+ main 显示占位页。

- [ ] **Step 13: 点 Sidebar 9 个菜单，验证路由跳转**

Expected:
- /eval/overview → 显示"📊 总览"
- /eval/runner → "▶️ 评测运行"
- /rag → "📚 RAG"
- /embed-demo → "✨ Embed Demo"
- /agent → "🤖 Agent Console"

- [ ] **Step 14: commit**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
git add apps/web/src
git commit -m "refactor(web): P1 layout 壳 + 9 静态路由占位"
```

---

## Task 3: P2 · Eval 5 路由 + Element Plus + useEvalStore

**Files:**
- Create: `apps/web/src/api/eval/index.ts`
- Create: `apps/web/src/composables/useECharts.ts`
- Create: `apps/web/src/store/modules/eval.ts`
- Modify: `apps/web/src/views/eval/overview/index.vue` (从 Day22 EvalOverview.vue 改写)
- Modify: `apps/web/src/views/eval/runner/index.vue`
- Modify: `apps/web/src/views/eval/query/index.vue`
- Modify: `apps/web/src/views/eval/probe/index.vue`
- Modify: `apps/web/src/views/eval/bias/index.vue`

**Interfaces:**
- Consumes: Task 1-2 产出
- Produces:
  - `useEvalStore()`: `retrievalReports`, `corpusReports`, `corpusStats`, `loading`, `error`, `latestRetrieval`, `avgRecallAt20`, `loadReports()`, `loadCorpusStats()`
  - `useECharts(refEl, optionFn)`: 绑定图表

### Steps

- [ ] **Step 1: 创建 api/eval/index.ts（axios）**

创建 [apps/web/src/api/eval/index.ts](../../apps/web/src/api/eval/index.ts)：

```ts
import axios from 'axios';

const http = axios.create({ baseURL: '/api/eval', timeout: 60_000 });

export interface RetrievalEvalReportView {
  runId: string;
  timestamp: string;
  aggregate: {
    total: number;
    recallAt20: number;
    finalHitRate: number;
    judgeAvg: number;
  };
}

export interface CorpusEvalReportView {
  totalFiles: number;
  overall: { extractedRate: number; totalChunks: number };
}

export interface CorpusStats {
  totalChunks: number;
  byTable: Record<string, number>;
}

export async function fetchReports(): Promise<{ retrieval: RetrievalEvalReportView[]; corpus: CorpusEvalReportView[] }> {
  const { data } = await http.get('/reports');
  return data;
}

export async function fetchCorpusStats(): Promise<CorpusStats> {
  const { data } = await http.get('/corpus-stats');
  return data;
}
```

- [ ] **Step 2: 创建 composables/useECharts.ts**

创建 [apps/web/src/composables/useECharts.ts](../../apps/web/src/composables/useECharts.ts)：

```ts
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { onMounted, onBeforeUnmount, ref, watch, type Ref } from 'vue';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

export function useECharts(optionRef: Ref<unknown>) {
  const el = ref<HTMLDivElement | null>(null);
  let chart: echarts.ECharts | null = null;

  onMounted(() => {
    if (el.value) chart = echarts.init(el.value);
    chart?.setOption(optionRef.value as echarts.EChartsCoreOption);
  });

  watch(optionRef, (opt) => {
    chart?.setOption(opt as echarts.EChartsCoreOption, true);
  }, { deep: true });

  onBeforeUnmount(() => { chart?.dispose(); chart = null; });

  return el;
}
```

- [ ] **Step 3: 创建 store/modules/eval.ts**

创建 [apps/web/src/store/modules/eval.ts](../../apps/web/src/store/modules/eval.ts)：

```ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { fetchReports, fetchCorpusStats, type RetrievalEvalReportView, type CorpusEvalReportView, type CorpusStats } from '@/api/eval';

export const useEvalStore = defineStore('eval', () => {
  const retrievalReports = ref<RetrievalEvalReportView[]>([]);
  const corpusReports = ref<CorpusEvalReportView[]>([]);
  const corpusStats = ref<CorpusStats | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const latestRetrieval = computed(() => retrievalReports.value[0] ?? null);
  const avgRecallAt20 = computed(() =>
    retrievalReports.value.length === 0 ? 0 :
    retrievalReports.value.reduce((s, r) => s + r.aggregate.recallAt20, 0) / retrievalReports.value.length
  );

  async function loadReports(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const r = await fetchReports();
      retrievalReports.value = r.retrieval;
      corpusReports.value = r.corpus;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function loadCorpusStats(): Promise<void> {
    try {
      corpusStats.value = await fetchCorpusStats();
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  return { retrievalReports, corpusReports, corpusStats, loading, error,
           latestRetrieval, avgRecallAt20, loadReports, loadCorpusStats };
});
```

- [ ] **Step 4: 改写 views/eval/overview/index.vue**

参考 [apps/web/src/views/eval/EvalOverview.vue](../../apps/web/src/views/eval/EvalOverview.vue) 改写为：

```vue
<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useEvalStore } from '@/store/modules/eval';
import { useECharts } from '@/composables/useECharts';

const store = useEvalStore();
onMounted(() => store.loadReports());

const chartOption = computed(() => ({
  title: { text: 'Recall@20 趋势' },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: store.retrievalReports.map((r) => r.runId.slice(0, 8)) },
  yAxis: { type: 'value', max: 1 },
  series: [{
    type: 'bar',
    data: store.retrievalReports.map((r) => Number(r.aggregate.recallAt20.toFixed(3))),
    itemStyle: { color: '#409eff' },
  }],
}));
const chartEl = useECharts(chartOption);
</script>

<template>
  <el-space direction="vertical" fill style="width: 100%">
    <el-card>
      <template #header>📊 评测总览</template>
      <el-button @click="store.loadReports()">刷新</el-button>
      <el-alert v-if="store.error" type="error" :title="store.error" :closable="false" />
      <p v-if="store.loading">加载中…</p>
      <p v-if="store.retrievalReports.length === 0 && !store.loading">暂无评测报告。先去「评测运行」跑一次。</p>
    </el-card>
    <el-card v-if="store.retrievalReports.length > 0">
      <el-table :data="store.retrievalReports" stripe>
        <el-table-column prop="runId" label="runId" width="160" />
        <el-table-column prop="timestamp" label="时间" width="200" />
        <el-table-column prop="aggregate.total" label="total" width="80" align="right" />
        <el-table-column label="recall@20" width="100" align="right">
          <template #default="{ row }">{{ (row.aggregate.recallAt20 * 100).toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column label="final-hit" width="100" align="right">
          <template #default="{ row }">{{ (row.aggregate.finalHitRate * 100).toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column label="judge-avg" width="100" align="right">
          <template #default="{ row }">{{ row.aggregate.judgeAvg.toFixed(3) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
    <el-card v-if="store.retrievalReports.length > 0">
      <div ref="chartEl" style="width: 100%; height: 300px"></div>
    </el-card>
  </el-space>
</template>
```

- [ ] **Step 5: 改写 views/eval/runner/index.vue**

参考 [apps/web/src/views/eval/EvalRunner.vue](../../apps/web/src/views/eval/EvalRunner.vue)：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

const corpusStatus = ref<'idle' | 'running' | 'done' | 'error'>('idle');
const corpusResult = ref<unknown>(null);
const corpusError = ref<string | null>(null);

async function runCorpusEval(): Promise<void> {
  corpusStatus.value = 'running';
  corpusError.value = null;
  try {
    const { data } = await axios.post('/api/eval/corpus');
    corpusResult.value = data;
    corpusStatus.value = 'done';
  } catch (e) {
    corpusError.value = (e as Error).message;
    corpusStatus.value = 'error';
  }
}
</script>

<template>
  <el-card>
    <template #header>▶️ 评测运行</template>
    <el-steps :active="corpusStatus === 'done' ? 1 : 0" finish-status="success">
      <el-step title="库构建评测" />
      <el-step title="检索评测" />
      <el-step title="LLM Judge" />
    </el-steps>
    <el-divider />
    <el-button type="primary" :loading="corpusStatus === 'running'" @click="runCorpusEval">跑库构建评测</el-button>
    <el-alert v-if="corpusError" type="error" :title="corpusError" :closable="false" style="margin-top:12px" />
    <el-progress v-if="corpusStatus === 'running'" :percentage="50" style="margin-top:12px" />
    <pre v-if="corpusResult" style="margin-top:12px">{{ JSON.stringify(corpusResult, null, 2) }}</pre>
  </el-card>
</template>
```

- [ ] **Step 6: 改写 views/eval/query/index.vue**

参考 [apps/web/src/views/eval/QueryDetail.vue](../../apps/web/src/views/eval/QueryDetail.vue)：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

const queryId = ref('');
const detail = ref<unknown>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await axios.get(`/api/eval/reports/${queryId.value}`);
    detail.value = data;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-card>
    <template #header>🔍 查询详情</template>
    <el-input v-model="queryId" placeholder="输入 query id" style="width:300px;margin-right:8px" />
    <el-button type="primary" @click="load" :loading="loading">加载</el-button>
    <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-top:12px" />
    <pre v-if="detail" style="margin-top:12px">{{ JSON.stringify(detail, null, 2) }}</pre>
  </el-card>
</template>
```

- [ ] **Step 7: 改写 views/eval/probe/index.vue**

参考 [apps/web/src/views/eval/CorpusProbe.vue](../../apps/web/src/views/eval/CorpusProbe.vue)：

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useEvalStore } from '@/store/modules/eval';

const store = useEvalStore();
onMounted(() => store.loadCorpusStats());
</script>

<template>
  <el-card>
    <template #header>🎯 库探针</template>
    <el-button @click="store.loadCorpusStats()">刷新</el-button>
    <el-empty v-if="!store.corpusStats && !store.loading" description="暂无库统计" />
    <template v-else-if="store.corpusStats">
      <el-statistic :value="store.corpusStats.totalChunks" title="总 chunks" />
      <el-table :data="Object.entries(store.corpusStats.byTable)" stripe style="margin-top:16px">
        <el-table-column label="表名" prop="0" />
        <el-table-column label="chunks" prop="1" align="right" />
      </el-table>
    </template>
  </el-card>
</template>
```

- [ ] **Step 8: 改写 views/eval/bias/index.vue**

参考 [apps/web/src/views/eval/BiasAnalysis.vue](../../apps/web/src/views/eval/BiasAnalysis.vue)：

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useEvalStore } from '@/store/modules/eval';
import { useECharts } from '@/composables/useECharts';

const store = useEvalStore();
onMounted(() => store.loadReports());

const chartOption = computed(() => ({
  title: { text: '多 run 对比' },
  tooltip: { trigger: 'axis' },
  legend: { data: ['recall@20', 'final-hit', 'judge-avg'] },
  xAxis: { type: 'category', data: store.retrievalReports.map((r) => r.runId.slice(0, 8)) },
  yAxis: { type: 'value' },
  series: [
    { name: 'recall@20', type: 'bar', data: store.retrievalReports.map((r) => Number(r.aggregate.recallAt20.toFixed(3))) },
    { name: 'final-hit', type: 'bar', data: store.retrievalReports.map((r) => Number(r.aggregate.finalHitRate.toFixed(3))) },
    { name: 'judge-avg', type: 'bar', data: store.retrievalReports.map((r) => Number(r.aggregate.judgeAvg.toFixed(3))) },
  ],
}));
const chartEl = useECharts(chartOption);
</script>

<template>
  <el-card>
    <template #header>⚠️ 偏差分析</template>
    <el-button @click="store.loadReports()">刷新</el-button>
    <div ref="chartEl" style="width: 100%; height: 400px; margin-top: 16px"></div>
    <el-table v-if="store.retrievalReports.length > 0" :data="store.retrievalReports" stripe style="margin-top:16px">
      <el-table-column prop="runId" label="runId" />
      <el-table-column label="recall@20">
        <template #default="{ row }">{{ (row.aggregate.recallAt20 * 100).toFixed(1) }}%</template>
      </el-table-column>
      <el-table-column label="final-hit">
        <template #default="{ row }">{{ (row.aggregate.finalHitRate * 100).toFixed(1) }}%</template>
      </el-table-column>
      <el-table-column label="judge-avg">
        <template #default="{ row }">{{ row.aggregate.judgeAvg.toFixed(3) }}</template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
```

- [ ] **Step 9: typecheck**

```bash
pnpm typecheck:web
```

Expected: 0 error。

- [ ] **Step 10: 启动 eval 后端 + dev web**

```bash
pnpm dev:eval
pnpm dev:web
```

- [ ] **Step 11: 跑 ex_003 生成一份报告**

```bash
pnpm exec tsx examples/day22/ex_003_retrieval_eval.ts
```

- [ ] **Step 12: Chrome MCP 五页全验**

打开 http://localhost:5173/#/eval/overview → el-table 列报告 + ECharts 柱状图
打开 http://localhost:5173/#/eval/runner → el-steps + 表单
打开 http://localhost:5173/#/eval/query → 输入 query id → el-descriptions 详情
打开 http://localhost:5173/#/eval/probe → corpus-stats 表格
打开 http://localhost:5173/#/eval/bias → ECharts 多 run 对比

Expected: 5 页全活，无 console error。

- [ ] **Step 13: commit**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
git add apps/web/src
git commit -m "feat(web): P2 Eval 5 路由 + Element Plus + useEvalStore + ECharts"
```

---

## Task 4: P3 · Rag / Embed / EmbedCompare 三 view

**Files:**
- Create: `apps/web/src/api/rag/index.ts`
- Create: `apps/web/src/api/embed/index.ts`
- Create: `apps/web/src/store/modules/rag.ts`
- Modify: `apps/web/src/views/rag/index.vue` (从 RagApp.vue 改写)
- Modify: `apps/web/src/views/rag/SearchView.vue` (从 views/SearchView.vue 迁)
- Modify: `apps/web/src/views/rag/IngestView.vue` (从 views/IngestView.vue 迁)
- Modify: `apps/web/src/views/rag/TwoStageView.vue` (从 views/TwoStageView.vue 迁)
- Modify: `apps/web/src/views/embed/EmbedDemo.vue` (从 views/embed/EmbedDemo.vue 改写)
- Modify: `apps/web/src/views/embed-compare/EmbedCompare.vue`

**Interfaces:**
- Consumes: Task 1-3 产出
- Produces:
  - `useRagStore()`: `query`, `hits`, `loading`, `runSearch()`
  - 4 个 view 用 el-tabs/row/col/steps 替代手写组件

### Steps

- [ ] **Step 1: 创建 api/rag/index.ts**

参考 [apps/web/src/views/RagApp.vue](../../apps/web/src/views/RagApp.vue) 的 fetch 调用，封装到：

```ts
// apps/web/src/api/rag/index.ts
import axios from 'axios';
const http = axios.create({ baseURL: '/api', timeout: 60_000 });
export interface Hit { chunkId: string; score: number; content: string; }
export async function search(query: string, topK = 5): Promise<Hit[]> {
  const { data } = await http.post('/search', { query, topK });
  return data.hits;
}
```

- [ ] **Step 2: 创建 store/modules/rag.ts**

```ts
// apps/web/src/store/modules/rag.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { search, type Hit } from '@/api/rag';

export const useRagStore = defineStore('rag', () => {
  const query = ref('');
  const hits = ref<Hit[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function runSearch(): Promise<void> {
    if (!query.value.trim()) return;
    loading.value = true;
    error.value = null;
    try {
      hits.value = await search(query.value, 5);
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  return { query, hits, loading, error, runSearch };
});
```

- [ ] **Step 3: 迁移 3 个 RagApp 子组件**

从 [apps/web/src/views/SearchView.vue](../../apps/web/src/views/SearchView.vue) 复制到 `apps/web/src/views/rag/SearchView.vue`，手写 table → `<el-table>`：
- 找到 `<table>` 替换为 `<el-table :data="hits" stripe>`
- `<thead><tr><th>` → `<el-table-column prop="..." label="...">`
- 保留事件处理 / fetch 逻辑

类比改写 IngestView.vue（el-form 替换）、TwoStageView.vue（el-table 替换）。

- [ ] **Step 4: 改写 views/rag/index.vue**

```vue
<script setup lang="ts">
import SearchView from './SearchView.vue';
import IngestView from './IngestView.vue';
import TwoStageView from './TwoStageView.vue';
import { ref } from 'vue';
const activeTab = ref('search');
</script>

<template>
  <el-tabs v-model="activeTab">
    <el-tab-pane label="搜索" name="search"><SearchView /></el-tab-pane>
    <el-tab-pane label="入库" name="ingest"><IngestView /></el-tab-pane>
    <el-tab-pane label="两阶段检索" name="two-stage"><TwoStageView /></el-tab-pane>
  </el-tabs>
</template>
```

- [ ] **Step 5: 改写 views/embed/EmbedDemo.vue**

参考 [apps/web/src/views/embed/EmbedDemo.vue](../../apps/web/src/views/embed/EmbedDemo.vue)：
- 外层 `<div class="grid grid-cols-4">` → `<el-row :gutter="16"><el-col :span="6">`
- 4 个 Panel `<div class="card">` → `<el-card>`

- [ ] **Step 6: 改写 views/embed-compare/EmbedCompare.vue**

参考 [apps/web/src/views/embed-compare/EmbedCompare.vue](../../apps/web/src/views/embed-compare/EmbedCompare.vue)：
- 外层 PipelineStatus 手写步骤条 → `<el-steps>`
- 子组件用 `<el-card>` 包裹（不改内部逻辑）
- ECharts 集成 useECharts（参考 Task 3 Step 2）

- [ ] **Step 7: typecheck + dev + Chrome MCP**

```bash
pnpm typecheck:web
pnpm dev:rag  # 3100
pnpm dev:web
```

Chrome MCP：
- /#/rag → el-tabs 3 子页
- /#/embed-demo → 4 el-card
- /#/embed-compare → el-steps + ECharts

- [ ] **Step 8: commit**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
git add apps/web/src
git commit -m "feat(web): P3 Rag/Embed/EmbedCompare 三 view + useRagStore + Element Plus"
```

---

## Task 5: P4 · Agent console 搬 useAgentStore + 暗色覆盖

**Files:**
- Create: `apps/web/src/store/modules/agent.ts`
- Create: `apps/web/src/views/agent/styles/agent-dark.scss`
- Modify: `apps/web/src/components/{Composer,HeaderBar,RightPanel,ConversationPanel}.vue` (暗色 SCSS 覆盖)
- Modify: `apps/web/src/views/agent/index.vue` (从原 App.vue dispatch 拆出)
- Modify: `apps/web/src/layout/components/AppMain.vue` (theme=dark 路由应用暗色 class)

**Interfaces:**
- Consumes: Task 1-4 产出
- Produces:
  - `useAgentStore()`: `conversation`, `timeline`, `runSummary`, `sessionUsage`, `dispatch()`, `send()`, `stop()`
  - /agent 路由 AppMain 应用 `.agent-route` 暗色样式

### Steps

- [ ] **Step 1: 创建 store/modules/agent.ts**

```ts
// apps/web/src/store/modules/agent.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { defaultAgentClient } from '@/api/agent/agentClient';
import type { AgentEvent } from '@/types/agentEvent';
import type { Message } from '@/../../libs/llm/index.js';
import { accumulateFromResponse, accumulateFromRunSummary, emptySessionUsage, type SessionUsage } from '@/utils/sessionUsage';

interface ConversationItem { role: 'user' | 'assistant' | 'thinking' | 'error'; text: string; streaming: boolean; }
interface TimelineItem { id: number; title: string; status: 'active' | 'done' | 'error'; kind: string; }
interface ContextRow { iteration: number; promptTokens: number; limit: number; }
interface RunSummary { totalPromptTokens: number; totalCompletionTokens: number; peakPromptTokens: number; iterations: number; }
interface LatestUsage { iteration: number; promptTokens: number; completionTokens: number; }

export const useAgentStore = defineStore('agent', () => {
  const conversation = ref<ConversationItem[]>([]);
  const timeline = ref<TimelineItem[]>([]);
  const runContexts = ref<ContextRow[]>([]);
  const runSummary = ref<RunSummary | null>(null);
  const sessionUsage = ref<SessionUsage>(emptySessionUsage);
  const latestUsage = ref<LatestUsage | null>(null);
  const isStreaming = ref(false);
  const status = ref<'idle' | 'running' | 'completed' | 'error' | 'cancelled'>('idle');
  const errorMessage = ref<string | null>(null);

  let idCounter = 0;
  let activeAbort: AbortController | null = null;

  function dispatch(ev: AgentEvent): void {
    // 原 App.vue 280 行 dispatch 逻辑搬入（完整保留）
    // ...（详见 apps/web/src/App.vue 原 § 4 dispatch case）
    // 这里简化为只示例 message_start
    if (ev.kind === 'message_start') {
      status.value = 'running';
      conversation.value = [...conversation.value, { role: 'thinking', text: 'Agent 接收任务…', streaming: false }];
      timeline.value = [...timeline.value, { id: idCounter++, title: 'Agent Start', status: 'done', kind: 'message_start' }];
    }
    // ... 其他 case 类似搬入
  }

  async function send(input: string): Promise<void> {
    if (!input.trim() || isStreaming.value) return;
    conversation.value = [...conversation.value, { role: 'user', text: input, streaming: false }];
    isStreaming.value = true;
    activeAbort = new AbortController();
    try {
      const history: Message[] = conversation.value
        .filter((c): c is { role: 'user' | 'assistant'; text: string; streaming: boolean } => c.role === 'user' || c.role === 'assistant')
        .filter((c) => c.text.length > 0)
        .map((c) => ({ role: c.role, content: c.text }));
      const events = defaultAgentClient.stream(input, { signal: activeAbort.signal, messages: history });
      for await (const ev of events) dispatch(ev);
    } finally {
      isStreaming.value = false;
      activeAbort = null;
    }
  }

  function stop(): void { activeAbort?.abort(); }

  return { conversation, timeline, runContexts, runSummary, sessionUsage, latestUsage,
           isStreaming, status, errorMessage, dispatch, send, stop };
});
```

**注意**：上面 dispatch 只示例一个 case，完整版必须从 [apps/web/src/App.vue](../../apps/web/src/App.vue) 第 108-300 行原样搬入。

- [ ] **Step 2: 创建 views/agent/styles/agent-dark.scss**

```scss
// apps/web/src/views/agent/styles/agent-dark.scss
.agent-route {
  background: #0a0a0a;
  color: #e5e5e5;
  height: 100%;
  .el-card { background: #181818; color: #e5e5e5; border-color: #2a2a2a; }
  .el-button { background: #2a2a2a; color: #e5e5e5; border-color: #3a3a3a; }
  .el-input__wrapper { background: #1e1e1e; box-shadow: 0 0 0 1px #3a3a3a inset; }
}
```

- [ ] **Step 3: 改写 layout/components/AppMain.vue（应用 theme=dark）**

修改 [apps/web/src/layout/components/AppMain.vue](../../apps/web/src/layout/components/AppMain.vue)：

```vue
<script setup lang="ts">
import { useRoute } from 'vue-router';
const route = useRoute();
</script>

<template>
  <div class="app-main" :class="{ 'agent-route': route.meta.theme === 'dark' }">
    <router-view v-slot="{ Component, route: r }">
      <transition name="fade" mode="out-in">
        <component :is="Component" :key="r.path" />
      </transition>
    </router-view>
  </div>
</template>

<style lang="scss" scoped>
.app-main { flex: 1; overflow: auto; background: #f0f2f5; padding: 16px; }
.agent-route { background: #0a0a0a; color: #e5e5e5; }
</style>
```

- [ ] **Step 4: 改写 views/agent/index.vue（从 store 读状态）**

```vue
<script setup lang="ts">
import { useAgentStore } from '@/store/modules/agent';
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
const store = useAgentStore();
const { conversation, status, isStreaming } = storeToRefs(store);
const input = ref('');
</script>

<template>
  <el-card>
    <template #header>🤖 Agent Console（暗色）</template>
    <div v-for="(c, i) in conversation" :key="i">
      <strong>{{ c.role }}:</strong> {{ c.text }}
    </div>
    <el-input v-model="input" placeholder="输入消息" @keyup.enter="store.send(input); input = ''" />
    <el-button :loading="isStreaming" @click="store.send(input); input = ''">发送</el-button>
    <el-button v-if="isStreaming" @click="store.stop()">停止</el-button>
    <p>状态: {{ status }}</p>
  </el-card>
</template>

<style lang="scss">
@import './styles/agent-dark.scss';
</style>
```

- [ ] **Step 5: 移动原 App.vue 内的 5 个手写组件到 components/（若未存在）**

从 [apps/web/src/App.vue](../../apps/web/src/App.vue) 第 25-31 行的 import 看，已经在 components/ 下。Composer.vue / HeaderBar.vue / RightPanel.vue / ConversationPanel.vue 已存在，**不动它们的内容**，仅确保它们被 agent/index.vue 引用（如需要）。

- [ ] **Step 6: typecheck + dev + Chrome MCP**

```bash
pnpm typecheck:web
pnpm dev:web
# 后端：pnpm dev 起 agent-server (3000)
```

打开 /#/agent → 看到暗色 el-card → 输入消息 → SSE 流式输出 conversation → /agent 标签切回浅色 view 时恢复

- [ ] **Step 7: commit**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
git add apps/web/src
git commit -m "feat(web): P4 Agent console 搬 useAgentStore + 暗色覆盖"
```

---

## Task 6: P5 · 收尾 + hash 兼容 + 验收

**Files:**
- Delete: `apps/web/tailwind.config.ts`
- Modify: `apps/web/package.json` (移除 tailwindcss 依赖)
- Delete: `apps/web/src/api/agentClient.ts` (旧) → 移到 api/agent/agentClient.ts
- Modify: `apps/web/src/router/guard.ts` (旧 hash 兼容)
- Modify: `apps/web/src/App.vue` (已是 18 行，确认无残留)
- Create: `docs/daily/day23.md` (今日 day doc)
- Modify: `STATUS.md` (末尾加 Day 23 重构交接段)
- Modify: `docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md` (§4.3 加 Day 23 附录)

**Interfaces:**
- Consumes: Task 1-5 产出
- Produces:
  - 旧 hash 链接兼容 (`#/eval` → `/eval/overview`)
  - tailwind 残留 = 0
  - 12 项验收清单全 ✅

### Steps

- [ ] **Step 1: 删 tailwind.config.ts**

```bash
rm "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp/apps/web/tailwind.config.ts"
```

- [ ] **Step 2: 从 package.json 移除 tailwind**

```bash
pnpm --filter web remove tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: 移动 agentClient.ts 到 api/agent/**

```bash
mkdir -p "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp/apps/web/src/api/agent"
mv "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp/apps/web/src/api/agentClient.ts" \
   "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp/apps/web/src/api/agent/agentClient.ts"
```

更新 import（grep 找出所有引用点）：
```bash
grep -r "from.*['\"].*api/agentClient" apps/web/src --include="*.ts" --include="*.vue" -l
```
把 `import { defaultAgentClient } from '@/api/agentClient'` 替换为 `from '@/api/agent/agentClient'`。

- [ ] **Step 4: 改写 router/guard.ts（hash 兼容）**

修改 [apps/web/src/router/guard.ts](../../apps/web/src/router/guard.ts)：

```ts
import type { Router } from 'vue-router';

const HASH_MAP: Record<string, string> = {
  '/eval': '/eval/overview',
  '/rag': '/rag',
  '/embed-demo': '/embed-demo',
  '/embed-compare': '/embed-compare',
  '/agent': '/agent',
};

export function setupGuards(router: Router): void {
  router.beforeEach((to, _from, next) => {
    // 兼容旧 hash 链接
    if (window.location.hash) {
      const hash = window.location.hash.slice(1);
      const mapped = HASH_MAP[hash];
      if (mapped && to.path !== mapped) {
        next(mapped);
        return;
      }
    }
    next();
  });
  router.afterEach((to) => {
    const title = (to.meta.title as string | undefined) ?? '';
    document.title = title ? `${title} · Agent Bootcamp` : 'Agent Bootcamp';
  });
}
```

- [ ] **Step 5: 确认 App.vue 已缩到 18 行**

读取 `apps/web/src/App.vue`，确认内容如下（无残留）：

```vue
<script setup lang="ts">
</script>

<template>
  <el-config-provider>
    <router-view />
  </el-config-provider>
</template>
```

如有 dispatch / agent / eval 旧代码，删除。

- [ ] **Step 6: tailwind 残留扫描**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
grep -r 'class="[^"]*\b(p-\|m-\|w-\|h-\|text-\|bg-\|flex-\|grid-\|gap-\|space-\)[0-9]' apps/web/src --include="*.vue" --include="*.ts" || echo "✅ 无 Tailwind 数字 utility"
grep -r 'class="[^"]*\b(px-\|py-\|mx-\|my-)[0-9]' apps/web/src --include="*.vue" || echo "✅ 无 px-/py- utility"
grep -r 'tailwind' apps/web/package.json apps/web/vite.config.ts apps/web/src/styles 2>/dev/null || echo "✅ 无 tailwind 关键字"
```

Expected: 3 个 echo，无任何 grep 输出。

- [ ] **Step 7: typecheck**

```bash
pnpm typecheck:web
```

Expected: 0 error。

- [ ] **Step 8: dev 三服务 + Chrome MCP 完整验收（12 项）**

```bash
pnpm dev:eval  # 3202
pnpm dev:rag   # 3100
pnpm dev       # agent-server 3000
pnpm dev:web   # 5173
```

Chrome MCP 12 项验收（spec §11）：
1. Chrome MCP `/eval/overview` → el-table + ECharts
2. Chrome MCP `/eval/runner` → el-form + el-progress
3. Chrome MCP `/eval/query` → el-descriptions
4. Chrome MCP `/eval/probe` → el-table + el-statistic
5. Chrome MCP `/eval/bias` → ECharts 多 run 对比
6. Chrome MCP `/rag` → el-tabs 3 子页
7. Chrome MCP `/embed-demo` → 4 el-card
8. Chrome MCP `/embed-compare` → el-steps + ECharts
9. Chrome MCP `/agent` → 暗色 + SSE 流式
10. Sidebar 9 菜单项 + TagsView + 面包屑
11. 访问 `#/eval` → 自动跳 `/eval/overview`
12. ex_003 跑通 + Chrome MCP `/eval/overview` 看到新报告

- [ ] **Step 9: 写 docs/daily/day23.md**

创建 [docs/daily/day23.md](../../docs/daily/day23.md)，按 Day 22 day doc 模板：
- 今日完成（P0~P5）
- 文件清单（新增 + 删除）
- 截图链接（Chrome MCP 12 项）
- 教训（admin bug / SSE+Pinia / tailwind 残留 / hash 兼容）

- [ ] **Step 10: 更新 STATUS.md**

在 [STATUS.md](../../STATUS.md) 末尾追加：

```markdown
---

## 🔄 Day 23 重构交接（apps/web 全量 admin 化）

**变更**：apps/web 从自造壳 + Tailwind 手写 → vue3-element-admin 风格（layout/router/store/utils 全量移植）。
**文件影响**：apps/web/src 下 ~40 个文件（P0~P5 分阶段 commit）。
**后端契约不变**：libs/eval / examples/day22 不动。
**验收**：spec §11 12 项全 ✅。
**多 Agent 文件分工**：P0→P5 各 1 个 Agent，文件不重叠（避免 git contention）。

周一接力建议：
- Agent-A: 复用 admin layout 模板做新 view（如检索历史 / 任务队列）
- Agent-B: useEvalStore 加 run diff 缓存 + ECharts 多 run 对比
- Agent-C: useRagStore 加 ingest 进度追踪
- Agent-D: 接入真鉴权（替换 no-op permission store）
- Agent-E: 用 ui-ux-pro-max skill 抛光五页 UI（CLAUDE.md [[day-22-rag-eval-platform]] "UI 简陋" 教训）
```

- [ ] **Step 11: 在 Day 22 spec §4.3 加附录**

修改 [docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md](../../docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md) §4.3 末尾追加：

```markdown
> **Day 23 重构追加**：EvalApp 从 tab 模式重构为 5 个独立路由：
> `/eval/overview`（原 EvalOverview.vue）/ `/eval/runner` / `/eval/query` / `/eval/probe` / `/eval/bias`。
> 视图文件迁到 `views/eval/{overview,runner,query,probe,bias}/index.vue`（每路由独立目录）。
> EvalApp.vue 整体删除（路由系统替代 tab）。
> 详见 [Day 23 spec](../specs/2026-09-12-vue3-element-admin-refactor-design.md)。
```

- [ ] **Step 12: 写 memory**

创建 `C:\Users\zihai\.claude\projects\d--spaceObelish-spaceCode-playgroud-agent-agent-engineer-bootcamp\memory\day23-vue3-element-admin-refactor.md`：

```markdown
---
name: day23-vue3-element-admin-refactor
description: Day 23 apps/web 重构到 vue3-element-admin 风格 — 5 view 全迁 + Pinia + Element Plus
metadata:
  type: project
---

Day 23（2026-09-12）：apps/web 从自造壳 + Tailwind 手写迁移到 vue3-element-admin 风格。
6 个 P 阶段（P0~P5），按 spec 2026-09-12-vue3-element-admin-refactor-design.md 执行。

**Why**：5 个 view 各自一套样式，无 tags-view/面包屑/侧边栏/Pinia；与 [[day-22-rag-eval-platform]] 五页 UI 简陋教训对齐，引入企业级 layout 模板。

**How to apply**：
- 后续 view 增删改走 vue-router 4 + Pinia + Element Plus（不再写 hash route）
- admin 模板能力（permission/CRUD/CRUD 组件库）YAGNI 不接，需要时再拉
- /agent 路由暗色通过 `route.meta.theme='dark'` + AppMain 应用 class 实现
- 旧 hash 链接兼容走 router.beforeEach 守卫
```

并更新 [MEMORY.md](../../MEMORY.md) 索引加一行：
`- [Day 23 admin refactor](day23-vue3-element-admin-refactor.md) — apps/web 全量 vue3-element-admin 化（layout/router/Pinia/Element Plus + 5 view 拆路由）`

- [ ] **Step 13: commit**

```bash
cd "d:/spaceObelish/spaceCode/playgroud/agent/agent-engineer-bootcamp"
git add apps/web docs STATUS.md memory/
git commit -m "chore(web): P5 收尾 + hash 兼容 + day23 docs + memory"
```

---

## Spec 覆盖检查

| Spec 章节 | 覆盖 Task | 状态 |
|---|---|---|
| §1 Context | 已写入 plan 头部 + Task 1 Step 1-3 | ✅ |
| §2 Decision 7 个开关 | 已写入 Global Constraints + 各 Task 文件约束 | ✅ |
| §3 Architecture | Task 1-2 + §3.3 路由树已在 Task 2 Step 10 完整实现 | ✅ |
| §4 Component Mapping | Task 3 Step 4-8（Eval 5）+ Task 4（Rag/Embed）+ Task 5（Agent） | ✅ |
| §5 Theme Strategy | Task 5 Step 2-3（agent-dark.scss + AppMain 暗色 class） | ✅ |
| §6 Pinia Stores | Task 1 Step 10-13（app/settings/permission）+ Task 1 Step 7（tags）+ Task 3 Step 3（eval）+ Task 4 Step 2（rag）+ Task 5 Step 1（agent） | ✅ |
| §7 Migration Phases | 已映射 Task 1-6 | ✅ |
| §8 Port & Proxy | Task 1 Step 3（vite.config.ts 已写端口 + proxy） | ✅ |
| §9 Compat with Existing Specs | Task 6 Step 11（Day 22 spec §4.3 附录）+ Step 10（STATUS.md） | ✅ |
| §10 Risks | Plan 头部 + 每 Task 步骤内有具体缓解动作 | ✅ |
| §11 Verification 12 项 | Task 6 Step 8 完整覆盖 | ✅ |
| §12 附录 Day 23 | Task 6 Step 11 已写追加内容 | ✅ |

**无遗漏**。

## Plan self-review

| 检查 | 结果 |
|---|---|
| Placeholder scan | ✅ 无 TBD/TODO/"implement later" |
| 类型一致性 | ✅ `useEvalStore.retrievalReports` 在 Task 3 Step 3 定义，Task 3 Step 4-8 引用一致 |
| 函数签名一致性 | ✅ `useECharts(optionRef)` 在 Task 3 Step 2 定义，Task 3 Step 4/Step 8 引用一致 |
| 接口契约 | ✅ Task 之间通过 Pinia + components 互相消费，无隐藏依赖 |
| 每个 Task 独立可验收 | ✅ 每个 Task 末尾有 Chrome MCP 截图 + commit |
| 全局约束已写入头部 | ✅（CLAUDE.md Day 02 §9 / 端口 / SCSS / 无登录 / commit 规范） |

**Plan 自审通过**。
