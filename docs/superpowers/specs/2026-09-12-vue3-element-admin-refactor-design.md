# Day 23 — vue3-element-admin 重构 apps/web 设计

> 日期：2026-09-12（周六补一天，今日全活）
> 状态：**老大已拍板、待 review**
> 前置：Day 22 RAG Eval Platform + vue3-element-admin（youlaitech）模板
> 范围：apps/web 整体重构（5 view 全迁 + 壳+组件+store 全量），libs/eval / examples/day22 不动

---

## 0. TL;DR

把 apps/web 从"自造壳 + Tailwind 手写"迁移到 vue3-element-admin 风格：

1. **layout 壳** —— 从 admin 源码移植 Sidebar / Navbar / TagsView / Breadcrumb / AppMain
2. **Pinia store** —— 从 admin 移植 4 个核心 store（app / permission / settings / tags）+ 新增 eval / agent 两个自有 store
3. **5 view 全迁** —— Eval 拆 5 路由 + Rag / Embed / EmbedCompare / Agent console 4 view 全部接入 admin 路由
4. **Element Plus 原生** —— 弃用 Tailwind，所有手写组件（table / card / form / tabs / progress / tag / alert / pagination / dialog）替换为 el-* 组件
5. **ECharts 集成** —— Overview / BiasAnalysis 用 echarts/core 按需引入（admin 同款写法）

---

## 1. Context

### 1.1 现有 apps/web 状态（Day 22 截止）

| 模块 | 路径 | 能力 |
|---|---|---|
| Agent Console 根 | [apps/web/src/App.vue](../../apps/web/src/App.vue) | 400 行 dispatch 巨类 + 5 个手写组件（HeaderBar/LeftMenu/ConversationPanel/RightPanel/Composer） |
| 路由 | 自写 hash route（CLAUDE.md Day 12 note）| `#/` `#/embed-demo` `#/embed-compare` `#/rag` `#/eval` |
| Eval 5 页 | [apps/web/src/views/eval/](../../apps/web/src/views/eval/) | EvalApp.vue tab 模式 + 5 子组件 |
| Rag 入口 | [apps/web/src/views/RagApp.vue](../../apps/web/src/views/RagApp.vue) | 手写 TabBar + 3 子页 |
| Embed demo | [apps/web/src/views/embed/](../../apps/web/src/views/embed/) | EmbedDemo + PanelA/B/C/D |
| Embed compare | [apps/web/src/views/embed-compare/](../../apps/web/src/views/embed-compare/) | EmbedCompare + 11 子组件 + 5 段状态机 |
| 样式 | Tailwind 4 | `tailwind.config.ts` + `@tailwindcss/vite` 插件 |
| 构建 | Vite 6 + Vue 3.5 + TypeScript 5.7 | 无 vue-router / 无 Pinia / 无 Element Plus |

### 1.2 缺口（Day 23 解决的问题）

1. **壳不一致** —— 5 个 view 各自一套样式（手写 Tailwind class + el-tabs 混用），没有统一的 layout / sidebar / navbar
2. **无 tags-view / 面包屑** —— admin 的多页签 + 当前位置指示全缺
3. **无路由系统** —— 5 view 用 hash route + if/else，扩展性差
4. **无全局状态** —— agent console 状态散在 App.vue 内 80+ ref，多 view 难共享
5. **手写组件** —— table / form / card / pagination 全手写 Tailwind，2 倍代码量

### 1.3 vue3-element-admin 能力（移植源）

参考 [deepwiki 项目结构](https://deepwiki.com/youlaitech/vue3-element-admin/1.1-project-structure)：
- 技术栈：Vue 3.5 + Vite 6 + TS 5.8 + Element Plus 2.9 + Pinia 3 + vue-router 4 + Axios + ECharts + UnoCSS + Vue I18n
- 目录分层：`layout / router / store / api / composables / directives / utils / views / plugins / styles`
- 布局：LEFT / TOP / MIX 三种（侧边栏 + 顶栏 + tags-view + breadcrumb）
- 路由：动态路由 + 权限过滤 + 路由守卫
- 鉴权：JWT + axios interceptor + 指令式按钮权限
- 组件库：CRUD / Form / Table / Dialog 等可复用组件
- 默认对接 9 套后端（Java/Node/Go/Python 等）

---

## 2. Decision（已老大拍板，7 个开关）

| # | 决策 | 拍板 | 理由 |
|---|---|---|---|
| 1 | Scope | **5 view 全迁** | 老大确认全迁 |
| 2 | Agent console | **外壳统一、暗色五件套保留在内层** | 老大确认全迁 + 暗色保留 |
| 3 | 接入方式 | **改造 apps/web 为 admin 风格**（不开 apps/admin） | 老大确认原地改 |
| 4 | CSS | **弃 Tailwind、走 Element Plus 原生 + SCSS 主题** | 老大确认原生 |
| 5 | 登录 | **不要登录页**（无 JWT / 无 auth 守卫） | YAGNI，dev 够用 |
| 6 | Eval 路由 | **拆为 5 个独立路由**（侧边栏子菜单可见） | 老大确认拆路由 |
| 7 | 迁移粒度 | **壳 + 组件 + store 全量** | 老大确认全量 |

---

## 3. Architecture

### 3.1 总览

```
                        ┌────────────────────────────────┐
                        │  vue3-element-admin 源码移植    │
                        │  (layout/router/store/utils)  │
                        └─────────────┬──────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            ▼                         ▼                         ▼
    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
    │  layout/     │         │  router/     │         │  store/      │
    │  Sidebar     │         │  静态路由    │         │  app         │
    │  Navbar      │         │  动态路由    │         │  permission  │
    │  TagsView    │         │  guard.ts    │         │  settings    │
    │  Breadcrumb  │         │              │         │  tags        │
    │  AppMain     │         │              │         │  eval 🆕     │
    └──────────────┘         │              │         │  agent 🆕    │
                             └──────┬───────┘         └──────┬───────┘
                                    │                        │
            ┌───────────────────────┴────────────────────────┘
            │
            ▼
   ┌────────────────────┐
   │  views/            │
   │  /eval/overview    │  ← el-table + ECharts
   │  /eval/runner      │  ← el-form + el-steps + el-progress
   │  /eval/query       │  ← el-descriptions + el-pagination
   │  /eval/probe       │  ← el-table + el-statistic
   │  /eval/bias        │  ← el-select + el-card + ECharts
   │  /rag              │  ← el-tabs (Search/Ingest/TwoStage)
   │  /embed-demo       │  ← el-row + el-col + 4 el-card
   │  /embed-compare    │  ← el-steps + 5 段状态机
   │  /agent            │  ← 暗色壳（el-page-header + 5 件套 SCSS 覆盖）
   └────────┬───────────┘
            │
            ▼
   ┌────────────────────┐
   │  plugins/          │
   │  - ElementPlus     │
   │  - Icons           │
   │  - I18n（zh-CN）   │
   └────────────────────┘
```

### 3.2 目标目录（apps/web/）

```
apps/web/
├── src/
│   ├── api/                         ⬇ 改写为 axios + interceptor
│   │   ├── request.ts               🆕 Axios 实例
│   │   ├── eval/                    🆕 eval API 模块（按 store 切分）
│   │   ├── rag/                     🆕 rag API
│   │   ├── agent/                   ⬇ agentClient.ts（SSE 保留）
│   │   └── embed/
│   ├── components/                  ⬇ 保留 5 件套 + 弃 Tailwind class
│   │   ├── Composer.vue             ✅ 保留
│   │   ├── HeaderBar.vue            ⬇ 暗色背景 + el-page-header
│   │   ├── RightPanel.vue           ⬇ 保留
│   │   └── ConversationPanel.vue    ✅ 保留
│   ├── composables/                 🆕 admin 同款
│   │   └── useECharts.ts
│   ├── directives/                  🆕 admin 同款（暂只注册占位）
│   ├── layout/                      🆕 从 admin 移植
│   │   ├── index.vue                根布局壳
│   │   └── components/
│   │       ├── Sidebar/
│   │       ├── Navbar/
│   │       ├── TagsView/
│   │       ├── Breadcrumb/
│   │       ├── AppMain.vue
│   │       └── Settings/
│   ├── plugins/                     🆕 admin 同款注册
│   │   └── index.ts
│   ├── router/                      🆕 从 admin 移植
│   │   ├── index.ts                 createRouter + 守卫
│   │   ├── routes/
│   │   │   ├── static.ts
│   │   │   └── async.ts
│   │   └── guard.ts                 进度条 + 标题 + 旧 hash 兼容
│   ├── store/                       🆕 Pinia
│   │   ├── index.ts
│   │   └── modules/
│   │       ├── app.ts               sidebar 折叠 / device
│   │       ├── permission.ts        路由权限（no-op 简化）
│   │       ├── settings.ts          layout 偏好
│   │       ├── tags.ts              visited views
│   │       ├── eval.ts              🆕 评测报告状态
│   │       └── agent.ts             🆕 agent console 状态（dispatch 搬入）
│   ├── styles/                      🆕 SCSS 主题
│   │   ├── index.scss
│   │   ├── element-plus.scss
│   │   ├── transition.scss
│   │   └── variables.scss
│   ├── types/
│   │   ├── agentEvent.ts            ✅ 保留
│   │   └── vue3-element-admin.d.ts  🆕 admin 全局类型
│   ├── utils/
│   │   ├── request.ts               🆕 Axios + interceptor
│   │   ├── auth.ts                  token 工具（no-op）
│   │   └── sessionUsage.ts          ✅ 保留
│   ├── views/                       ⬇ 改写
│   │   ├── agent/
│   │   │   ├── index.vue
│   │   │   └── components/
│   │   ├── embed/
│   │   │   └── EmbedDemo.vue
│   │   ├── embed-compare/
│   │   │   └── EmbedCompare.vue
│   │   ├── rag/
│   │   │   ├── index.vue            🆕 路由入口
│   │   │   └── views/{SearchView,IngestView,TwoStageView}.vue
│   │   └── eval/
│   │       ├── overview/index.vue   🆕 /eval/overview
│   │       ├── runner/index.vue     🆕 /eval/runner
│   │       ├── query/index.vue      🆕 /eval/query
│   │       ├── probe/index.vue      🆕 /eval/probe
│   │       └── bias/index.vue       🆕 /eval/bias
│   ├── App.vue                      ⬇ 18 行
│   └── main.ts                      ⬇ 注册 Pinia + Router + ElementPlus
├── tailwind.config.ts               ❌ 删
├── vite.config.ts                   ⬇ 去 tailwindcss 插件
└── index.html
```

### 3.3 路由树（最终态）

**设计原则**：admin layout 壳由根 `<router-view>` 渲染（layout/index.vue），其内 `<AppMain>` 内再用嵌套 `<router-view>` 渲染页面。所有页面都共享 layout（侧边栏/顶栏/tags-view）。

```ts
// router/index.ts —— createWebHashHistory（与 Day 12 hash 兼容，降低迁移风险）
import { createWebHashHistory, createRouter } from 'vue-router';

const Layout = () => import('@/layout/index.vue');

export const routes = [
  { path: '/', redirect: '/eval/overview' },

  // Eval Platform（侧边栏父菜单 + 5 子菜单）
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

  // 其他 4 view 都共享同一 Layout
  { path: '/rag',          component: Layout, children: [{ path: '', component: () => import('@/views/rag/index.vue'), meta: { title: 'RAG', icon: 'Reading' } }] },
  { path: '/embed-demo',   component: Layout, children: [{ path: '', component: () => import('@/views/embed/EmbedDemo.vue'), meta: { title: 'Embed Demo', icon: 'MagicStick' } }] },
  { path: '/embed-compare',component: Layout, children: [{ path: '', component: () => import('@/views/embed-compare/EmbedCompare.vue'), meta: { title: 'Embed Compare', icon: 'Files' } }] },
  { path: '/agent',        component: Layout, children: [{ path: '', component: () => import('@/views/agent/index.vue'), meta: { title: 'Agent Console', icon: 'ChatDotRound', theme: 'dark' } }] },

  { path: '/:pathMatch(.*)*', redirect: '/eval/overview' },
];
```

### 3.4 数据流

```
   ┌──────────────────┐
   │ libs/eval (后端) │ ──HTTP──> 3202/eval/*
   │ libs/rag          │ ──HTTP──> 3100/*
   │ agent-server      │ ──SSE───> 3000/agent
   └────────┬──────────┘
            │
            ▼
   ┌──────────────────┐
   │  utils/request   │  axios + interceptor
   │  api/agentClient │  SSE（保留）
   └────────┬──────────┘
            │
            ▼
   ┌─────────────────────────────────────┐
   │  store/modules/                     │
   │  - eval.ts     (reports / stats)   │
   │  - rag.ts      (query / hits)       │
   │  - agent.ts    (conversation / SSE) │
   │  - tags.ts     (visited views)      │
   │  - settings.ts (layout 偏好)        │
   │  - app.ts      (sidebar 折叠)       │
   └────────┬────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────┐
   │  views/                             │
   │  5 个 Eval view（computed + action） │
   │  Rag / Embed / Agent view           │
   └─────────────────────────────────────┘
```

### 3.5 依赖方向（硬约束）

- `apps/web` → admin 模板（layout/router/store/utils/composables）✅
- `apps/web` → `libs/eval`（仅类型 import，不嵌 eval 逻辑）✅
- `apps/web` → `apps/api`（HTTP / SSE）✅
- admin 模板 → Element Plus / Pinia / vue-router / Axios / ECharts（admin 内部依赖，不破）✅
- **admin 模板不依赖本项目 libs**（避免反向耦合）

3.4 ECharts 统一方式：`echarts/core` 按需引入 + `composables/useECharts.ts` 包装（admin 同款写法）。

---

### 4.1 Eval 5 路由 ↔ View ↔ API ↔ 组件

| 路由 | View 文件 | 主要 API | 用到的 el-* 组件 |
|---|---|---|---|
| `/eval/overview` | `views/eval/overview/index.vue` | `GET /eval/reports` | el-table, el-card, el-tag, el-button, useECharts（BarChart） |
| `/eval/runner` | `views/eval/runner/index.vue` | `POST /eval/corpus`, `POST /eval/retrieve`, `POST /eval/dataset` | el-form, el-input, el-select, el-button, el-steps, el-progress, el-alert |
| `/eval/query` | `views/eval/query/index.vue` | `GET /eval/reports/:id`, `GET /eval/dataset` | el-input, el-table, el-pagination, el-descriptions, el-tabs |
| `/eval/probe` | `views/eval/probe/index.vue` | `GET /eval/corpus-stats` | el-table, el-statistic, el-progress, el-empty |
| `/eval/bias` | `views/eval/bias/index.vue` | `GET /eval/reports`, `POST /eval/judge` | el-select, el-table, el-card, el-radio-group, useECharts（BarChart） |

### 4.2 其他 4 个 view

| 路由 | View | 关键 el-* 组件 |
|---|---|---|
| `/rag` | `views/rag/index.vue` + 3 子 | el-tabs (Search/Ingest/TwoStage) |
| `/embed-demo` | `views/embed/EmbedDemo.vue` | el-row, el-col, 4 × el-card |
| `/embed-compare` | `views/embed-compare/EmbedCompare.vue` | el-steps + 5 段状态机 + useECharts（BarChart / LineChart） |
| `/agent` | `views/agent/index.vue` | el-page-header（暗色）+ 5 件套 SCSS 覆盖 |

### 4.3 手写 → Element Plus 替换规则

| 现有手写 | 替换为 | 说明 |
|---|---|---|
| 手写 table | `<el-table>` + `<el-table-column>` | 固定列、排序、loading 全包 |
| 手写 card | `<el-card>` | header / body / shadow 统一 |
| 手写 form | `<el-form>` + `<el-form-item>` | label / rule / validate 自动 |
| 手写 progress bar | `<el-progress>` | 百分比 / 状态色 |
| 手写 status badge | `<el-tag>` type=success/warning/danger | 5 种语义色 |
| 手写 alert | `<el-alert>` | 4 种 type + closable |
| 手写 pagination | `<el-pagination>` | layout / page-size / total |
| 手写 tabs | 路由侧边栏菜单 | 老大拍板：拆 5 路由 |
| 手写 dialog | `<el-dialog>` | v-model + title + 居中 |

---

## 5. Theme Strategy

### 5.1 全局亮色（默认）

```scss
// styles/element-plus.scss
@forward 'element-plus/theme-chalk/src/common/var.scss' with (
  $colors: (
    'primary': ('base': #409eff),
  ),
);
```

### 5.2 /agent 路由暗色覆盖

```scss
// views/agent/styles/agent-dark.scss
.agent-route {
  background: #0a0a0a;
  color: #e5e5e5;
  .el-card { background: #181818; color: #e5e5e5; border-color: #2a2a2a; }
  .el-button { background: #2a2a2a; color: #e5e5e5; border-color: #3a3a3a; }
  .el-input__wrapper { background: #1e1e1e; box-shadow: 0 0 0 1px #3a3a3a inset; }
}
```

```ts
// router/index.ts
{ path: '/agent', component: () => import('@/views/agent/index.vue'),
  meta: { title: 'Agent Console', icon: 'ChatDotRound', theme: 'dark' } }

// AppMain.vue
<div :class="{ 'agent-route': route.meta.theme === 'dark' }">
  <router-view />
</div>
```

---

## 6. Pinia Stores

### 6.1 useEvalStore

```ts
// store/modules/eval.ts
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

  async function loadReports(): Promise<void> { /* GET /eval/reports */ }
  async function loadCorpusStats(): Promise<void> { /* GET /eval/corpus-stats */ }

  return { retrievalReports, corpusReports, corpusStats, loading, error,
           latestRetrieval, avgRecallAt20, loadReports, loadCorpusStats };
});
```

### 6.2 useAgentStore（dispatch 搬入）

```ts
// store/modules/agent.ts
export const useAgentStore = defineStore('agent', () => {
  const conversation = ref<ConversationItem[]>([]);
  const timeline = ref<TimelineItem[]>([]);
  const runContexts = ref<ContextRow[]>([]);
  const runSummary = ref<RunSummary | null>(null);
  const sessionUsage = ref<SessionUsage>(emptySessionUsage);
  const latestUsage = ref<LatestUsage | null>(null);
  const status = ref<'idle'|'running'|'completed'|'error'|'cancelled'>('idle');
  const isStreaming = ref(false);

  function dispatch(ev: AgentEvent): void { /* 原 App.vue 280 行逻辑 */ }
  function resetRunState(): void { /* ... */ }
  async function send(input: string): Promise<void> { /* ... */ }
  function stop(): void { /* abort controller */ }

  return { conversation, timeline, runContexts, runSummary, sessionUsage,
           latestUsage, status, isStreaming, dispatch, resetRunState, send, stop };
});
```

**约束**：SSE 流式本身不入 store（agentClient.ts 在 store action 内调用，保持 CLAUDE.md Day 02 §9 边界）。

---

## 7. Migration Phases（多 Agent 接力）

| P | 范围 | Agent | 验收 |
|---|---|---|---|
| P0 | 移植 admin 源码 + 注册 Pinia/Router/ElementPlus | Agent-A | 空壳 + typecheck ✅ |
| P1 | layout 三组件（Sidebar/Navbar/AppMain）+ 静态路由占位 | Agent-A | Chrome MCP 截图 + 侧边栏可见 |
| P2 | Eval 5 路由 + el-* 替换 + useEvalStore | Agent-B | Chrome MCP 五页 + ex_003 跑通 |
| P3 | Rag / Embed / EmbedCompare 三 view | Agent-C | Chrome MCP 三页 |
| P4 | Agent console 搬 useAgentStore + 暗色覆盖 | Agent-D | Chrome MCP /agent + SSE 跑通 |
| P5 | 收尾：删 tailwind.config / 旧 api/ / App.vue dispatch / hash 兼容 | Agent-E | 全部 12 项验收清单 ✅ |

**Why 这么分**：每个 agent 改的文件**不重叠**（避免 [[day-12-retro]] git contention），按依赖方向 P0→P5 串行。

---

## 8. Port & Proxy（端口不变）

```ts
// apps/web/vite.config.ts
server: {
  port: 5173,
  strictPort: false,
  proxy: {
    '/agent':    { target: 'http://localhost:3000', changeOrigin: true },
    '/api':      { target: 'http://localhost:3100', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
    '/api/eval': { target: 'http://localhost:3202', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
    '/traces':   { target: 'http://localhost:3000', changeOrigin: true },
  },
},
```

| 端口 | 服务 | Day |
|---|---|---|
| 3000 | agent-server | Day 09 |
| 3100 | rag-server | Day 14 |
| 3202 | eval-server | Day 22 |
| 5173 | web（本次改） | — |

---

## 9. Compat with Existing Specs

| 既有文件 | 影响 | 处理 |
|---|---|---|
| `ADR-0002` · Agent.runEvents 接受完整 messages | 无影响（后端契约） | ✅ 不动 |
| `ADR-0003` · Tool params zod single source | 无影响 | ✅ 不动 |
| `ADR-0004` · RAG table 命名 | 无影响 | ✅ 不动 |
| `2026-09-11-rag-eval-platform-design.md` | EvalApp 5 tab → 5 路由 | ⬇ 加 §11 附录 |
| `CLAUDE.md Day 02 §9` 边界 | Agent console 移到 store，仍守边界 | ✅ agentClient 在 store action 内 |
| `STATUS.md` | 多 agent 周一接力 | ⬇ 末尾加 "Day 23 重构交接" |
| `examples/day22/*` | 不动（harness + gt + reports） | ✅ |
| `libs/eval/*` | 不动（后端契约稳定） | ✅ |

---

## 10. Risks

| # | 风险 | 缓解 |
|---|---|---|
| 1 | admin 模板 bug 传染 | P0 在 feature 分支跑通；最小 patch 修，不 fork |
| 2 | SSE 流式 + Pinia 边界 | agentClient 不入 store，dispatch 搬入 store；CLAUDE.md Day 02 §9 边界守 |
| 3 | AbortController 在 store 内的清理 | 用 `onScopeDispose` 监听 store dispose |
| 4 | Tailwind class 残留 | P5 用 `grep -r 'class="[a-z-]*[0-9]' apps/web/src` 清扫 |
| 5 | 旧 hash 链接失效 | router 守卫加 `#/eval` → `/eval/overview` fallback |
| 6 | ECharts 体积 | 按需引入 `echarts/core` + 单 chart type |
| 7 | Element Plus 按需引入 | 使用 `unplugin-vue-components` 自动按需 |
| 8 | admin 模板自身 TypeScript 类型不全 | 全局 d.ts 兜底 |

---

## 11. Verification（P5 完成时跑）

1. `pnpm typecheck:web` 全绿（0 error）
2. dev 三服务同启无端口冲突（3000/3100/3202/5173）
3. Chrome MCP 打开 8 路由全活：
   - `/eval/overview` → el-table 列报告
   - `/eval/runner` → el-form 提交 → el-progress 跑完
   - `/eval/query` → 输入 query id → el-descriptions 显示
   - `/eval/probe` → corpus-stats 表格 + 进度条
   - `/eval/bias` → 选 run 对比 → ECharts 柱状图
   - `/rag` → el-tabs 切 3 子页
   - `/embed-demo` → PanelA 流式 + 4 el-card
   - `/embed-compare` → el-steps + 5 段状态机
   - `/agent` → 暗色五件套 + SSE 流式
4. Sidebar 显示 9 菜单项（5 Eval + Rag + Embed-demo + Embed-compare + Agent）
5. tags-view 显示访问过的路由 + 右键关闭
6. 面包屑显示当前位置
7. 旧 hash 链接兼容：`#/eval` → `/eval/overview`、`#/rag` → `/rag`
8. tailwind 残留 = 0：扫下面 4 类关键字应无结果
   - `class="[^"]*\b(p-|m-|w-|h-|text-|bg-|flex-|grid-|gap-|space-)[0-9]`（Tailwind 数字 utility）
   - `class="[^"]*\b(px-|py-|mx-|my-)[0-9]`（间距 utility）
   - `<div class="[^"]*flex[^"]*"`（手写 flex）
   - `tailwind` 关键字（vite.config / package.json / style 文件）
9. Pinia 状态持久化：刷新后 sidebar 折叠 / tags-view 保留
10. examples/day22/ex_003 跑通：先 `pnpm dev:eval`（3202 端口）启动后端 → `pnpm exec tsx examples/day22/ex_003_retrieval_eval.ts` 跑评测 → 跑完后 `curl http://localhost:3202/eval/reports` 返回最新报告 → 在 Chrome MCP `/eval/overview` 看到该报告（验证后端契约未被前端破坏）
11. STATUS.md 末尾加 "Day 23 重构交接" 段
12. spec §4.3 加 Day 23 附录（拆 5 路由说明）

---

## 12. 附录：与 Day 22 spec 的衔接

在 `2026-09-11-rag-eval-platform-design.md` §4.3 末尾追加：

> **Day 23 追加**：EvalApp 从 tab 模式重构为 5 个独立路由（侧边栏子菜单）：
> `/eval/overview`（原 EvalOverview.vue）/ `/eval/runner`（原 EvalRunner.vue）/ `/eval/query`（原 QueryDetail.vue）/ `/eval/probe`（原 CorpusProbe.vue）/ `/eval/bias`（原 BiasAnalysis.vue）。
> 视图文件从 `views/eval/EvalOverview.vue` 迁到 `views/eval/overview/index.vue`（每路由独立目录，便于后续加 detail 子页）。
> EvalApp.vue 整体删除（路由系统替代 tab）。
