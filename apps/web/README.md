# apps/web — Agent Console 前端

Vue 3 + Vite 6 + Pinia + Element Plus + Tailwind v4 hybrid admin 壳。
承载 5 个业务模块：Agent Console（暗色）+ Eval 平台（5 子页）+ RAG + Embed Demo + Embed Compare。

> 上下文：Day 23 vue3-element-admin 重构产物（Task 1-5）。详见 `docs/daily/day23.md` + `docs/adr/0005-tailwind-v4-retained-element-plus-mixed.md`。

---

## 启动命令

```bash
# 根目录
pnpm dev:web          # vite 启动，端口走 scripts/ports.ts claim（默认 5173）
pnpm typecheck:web    # vue-tsc --noEmit
pnpm build:web        # vue-tsc --noEmit && vite build

# 完整 dev（启 rag 3100 + eval 3202 + web 5173 三件套）
# 老大常用：
pnpm dev:rag          # rag server，端口 3100
pnpm dev:eval         # eval server，端口 3202
```

## 端口约定

| 服务 | 端口 | 启动 | 用途 |
|---|---|---|---|
| `apps/web` (vite) | 5173 | `pnpm dev:web` | 前端 dev server |
| Agent app (Day 09) | 3000 | `pnpm dev:rag`（alias） | `/agent` SSE 端点 |
| RAG app (Day 14) | 3100 | `pnpm dev:rag` | `/api/search` `/api/ingest` |
| Eval app (Day 22) | 3202 | `pnpm dev:eval` | `/api/eval/*` 评测 API |

## 路由结构

**hash 模式**（admin 模板惯例，Day 12 老链接兼容保留）：

```
/                          → redirect → /eval/overview
/#/eval/overview          总览（ECharts 柱状图）
/#/eval/runner            评测运行（corpus 状态 + run 触发）
/#/eval/query             查询详情（runId 前缀匹配）
/#/eval/probe             库探针（CorpusStats）
/#/eval/bias              偏差分析（LLM Judge 三件套）
/#/rag                    RAG playground（SearchView + IngestView）
/#/embed-demo             Embed Demo（Panel A/B/C/D + canvas 数据色板）
/#/embed-compare          Embed Compare（多 prompt 对比 + cosine 矩阵）
/#/agent                  Agent Console（暗色 IDE 风格，4 件套）
```

9 个顶级路由（`/eval` 5 子页 + `/rag` + `/embed-demo` + `/embed-compare` + `/agent`），全走 hash。

## 主题策略

**hybrid 模式**（详见 `docs/adr/0005-tailwind-v4-retained-element-plus-mixed.md`）：

- **亮色主壳**：除 `/agent` 外所有路由走 admin 模板默认亮色（`#f0f2f5` 背景 + 16px padding）
- **暗色覆盖**：`/agent` 路由 `meta.theme = 'dark'`，`AppMain.vue` 在 `route.meta.theme === 'dark'` 时套 `.agent-route` class
- **Tailwind v4 保留**：25 文件 utility class + scoped SCSS（`apps/web/src/views/agent/styles/agent-dark.scss`）共存
- **Element Plus**：admin 模板默认 Element Plus 主题；`.agent-route` class 下 scoped SCSS 覆盖 el-card / el-button / el-input / el-tag 等组件 CSS vars 切暗色
- **未来迁移**：Day 24+ 渐进迁移 25 文件 utility class → scoped SCSS，不在 Day 24 必修路径

## 工程结构

```
apps/web/
├── vite.config.ts              # vite 6 + tailwind + AutoImport/Components + scss modern-compiler
├── package.json                # vue 3.5 / pinia / element-plus / echarts / vue-router
├── tsconfig.json               # paths: @/* → src/*, exactOptionalPropertyTypes: true
├── tailwind.config.ts          # content scanning paths
├── src/
│   ├── main.ts                 # createApp + pinia + router + ElementPlus + zhCn locale
│   ├── App.vue                 # 仅 el-config-provider + router-view（9 行）
│   ├── styles.css              # @import 'tailwindcss' + agent console 全局 token
│   ├── styles/variables.scss   # admin 模板 SCSS 主题变量（$sidebar-width 等）
│   ├── router/index.ts         # createWebHashHistory + 9 路由 + Layout 壳
│   ├── layout/                 # Sidebar / Navbar / TagsView / Breadcrumb / AppMain
│   ├── views/                  # 9 路由对应 view（agent / eval/5 / rag / embed/2）
│   ├── components/             # 业务组件（agent 4 件套 + 子组件 + 旧组件）
│   ├── store/modules/          # pinia: app / settings / permission / tags / agent / eval / rag
│   ├── api/                    # 后端 API 客户端（agentClient / eval / rag）
│   ├── composables/            # useECharts（cold-load canvas fix）
│   ├── lib/                    # sessionUsage（跨 store 共享）
│   ├── locales/                # i18n（zhCn）
│   └── icons/                  # SVG icon 集合
└── auto-imports.d.ts / components.d.ts   # unplugin 自动生成，已入 git（CI 必须）
```

## 已知 esbuild Windows OOM workaround（重要）

**Ruling 25**：Windows + Node 22 + esbuild 在 `pnpm build:web` 时偶发 native OOM crash（`The service was stopped` / `0xC0000005` access violation）。

**解决**：跑 build/dev 前加 `NODE_OPTIONS=--max-old-space-size=2048` 限制父进程堆，让 esbuild 走更稳的 GC 路径。

```bash
# 临时（每次）
NODE_OPTIONS="--max-old-space-size=2048" pnpm dev:web
NODE_OPTIONS="--max-old-space-size=2048" pnpm build:web

# 永久（推荐）—— 根 package.json 已加 cross-env 包装，老大周一 review 通过
# 见根 package.json scripts.dev:web / scripts.build:web
```

**为什么用 NODE_OPTIONS 而不是 cross-env**：cross-env 是 ESM 下传递 env 的妥协方案；Node 22 原生支持 `NODE_OPTIONS` + `--max-old-space-size`，无需跨平台包，根 package.json 已加默认。

## 与 apps/api 的契约

`apps/web` 是纯前端，不依赖 `apps/api` 源码（仅靠 HTTP 协议）：

- `/agent` SSE → 3000 (Agent app Day 09)
- `/api/search` `/api/ingest` → 3100 (RAG app Day 14)
- `/api/eval/*` → 3202 (Eval app Day 22)

详见 `apps/web/vite.config.ts` §server.proxy。

## Day 23 重构遗留（parked）

详见 `docs/daily/day23.md §Parked` + Task 6 report。核心 parked：

- **Ruling 12**：CorpusStats 契约漂移（spec `{totalChunks, byTable}` vs eval-server 实际 `{tableName, size, sample[]}`）→ Day 24 multi-agent 决策
- **Ruling 13**：Query 单条路由缺失（spec 期望 `GET /eval/reports/{id}` vs 实际 list-only）→ Day 24
- **Ruling 25**：esbuild Windows OOM → 本 README 已加 NODE_OPTIONS workaround
- **Tailwind 弃用**：25 文件 utility class 渐进迁移 → Day 24+（不在必修路径）
- **Ruling 15-21**：Task 3 的 7 个 minor/important 细节（queryId 命名、runner 绕 store、types 重复、Sidebar 注释、ResizeObserver、watchPostEffect、v-if 往返）→ Task 6 范围内能改的改，不能改的 park

## 验证 checklist

完整 12 项验收见 Task 6 report（`.superpowers/sdd/2026-09-12-vue3-element-admin-refactor/task-6-report.md`）。

**Owner 自查 4 闸**（任一失败则视为未完成）：

1. `pnpm typecheck:web` → 0 error
2. `NODE_OPTIONS="--max-old-space-size=2048" pnpm build:web` → ✓ built in <30s
3. `curl http://127.0.0.1:5173/` → 200 OK（10/10 路由 200，含 hash 守卫）
4. Chrome MCP 截图：5 view 全活 + agent console 暗色 + eval/rag/embed 亮色（参考 Task 4/5 截图存档）
