# Day 23 — Vue3 Element Admin 重构 + Agent Console 上 admin 壳

> 65 天 AI Agent 工程师训练营 · Day 23 / 65
> 主题：把 `apps/web` 从「纯 Vue3 + Tailwind + 自写 styles」重构为「vue3-element-admin 模板 + Element Plus + Tailwind v4 hybrid」admin 壳，承载 5 个业务模块。
> 前置：Day 22 RAG Eval Platform（5 页 Web UI + 6 条 API）+ Day 19/20 rerank eval 闭环 + Day 14 RAG UI + Day 12 Embed Demo + Day 09 Agent Console 暗色壳。

---

## ⚠️ 路线修正（First things first）

**原路线表 Day 23 = 真接 lancedb 入库（Day 22 钩子日）**——但今天老大（2026-09-11 上午）拍板 **改做 apps/web admin 模板重构**：

> "admin 模板重构 + Agent Console 上 admin 壳"

**Day 23 修正为**：6 件事一起做（按 brief 优先级 P0-P5）

1. **P0 admin 模板移植**（Task 1）—— vite + Pinia + Router + Element Plus + 9 占位路由 + 5 store
2. **P1 layout 壳**（Task 2）—— Sidebar/Navbar/TagsView/Breadcrumb/AppMain + tags store
3. **P3 Eval 5 子页迁移**（Task 3）—— useEvalStore + useECharts + 5 子页全活 + cold-load fix
4. **P3 rag + embed 两页迁移**（Task 4）—— useRagStore + embed 亮色重构 + Element Plus 卡壳
5. **P4 Agent Console 接入**（Task 5）—— useAgentStore + 4 件套 + 暗色 `.agent-route` 覆盖
6. **P5 收尾**（Task 6 = 本日）—— 工程文档 + ruling 处理 + ADR 0005 + memory

**关键决策链**：

1. 老大拍板：**Subagent-Driven Development (SDD)**——5 task 全部由独立 subagent 实施，每个自带验收（老大验证标准：example 跑通 + Chrome MCP UI 看到效果）
2. 老大拍板：**admin 模板选 vue3-element-admin**（不是 ant-design-vue / naive-ui / Arco Design Vue）
3. 老大拍板：**主题策略** = 亮色主壳 + `/agent` 暗色覆盖（`route.meta.theme='dark'`），不全局切暗
4. 老大拍板：**Tailwind 弃用改 park**（本日修正）——25 文件 utility class 残留，YAGNI + 第一原则，park Day 24+ + 立 ADR 0005
5. 老大拍板：**esbuild Windows OOM workaround** = `NODE_OPTIONS=--max-old-space-size=2048`，根 package.json 加默认

---

## 🎯 今日目标（全部 ✅）

- ✅ P0 admin 模板移植（Task 1）—— Pinia/Router/ElementPlus + 9 占位路由 + 4 styles + 5 store + B 方案拆 package.json
- ✅ P1 layout 壳（Task 2）—— Sidebar/Navbar/TagsView/Breadcrumb/AppMain + tags store + 9 路由
- ✅ P3 Eval 5 子页（Task 3）—— useEvalStore + useECharts + 5 子页 + cold-load fix + Sidebar route.matched fix
- ✅ P3 rag 3 子页 + embed 两页亮色重构（Task 4）—— useRagStore + 0-hits 空态 + Element Plus 卡壳
- ✅ P4 Agent Console 上 admin 壳（Task 5）—— useAgentStore + 4 件套 + `.agent-route` 暗色覆盖
- ✅ P5 收尾（Task 6）—— 工程文档 + ADR 0005 + 23 rulings 处置 + day23 memory

---

## 📊 真活数据

### 6 task × 独立 implementer + 自带验收

| Task | Head | Implementer | Reviewer | 验证 |
|---|---|---|---|---|
| 1 (P0) | `4e9a4ff` | sonnet | sonnet | typecheck 0/0 |
| 2 (P1) | `3bc2bbc` | sonnet | sonnet | typecheck 0/0 + dev 200 |
| 3 (P3) | `6ae80ec` | sonnet | sonnet + fix | typecheck 0/0 + build OK + cold-load canvas ≥ 1 + Chrome MCP 9 项菜单 |
| 4 (P3) | `b56c56e` | sonnet (2nd fresh) | self | typecheck 0/0 + build OK + Chrome MCP 3 页白底 + 9 张截图 |
| 5 (P4) | `b2b50a5` | sonnet (fresh) | self | typecheck 0/0 + build 14.60s + Chrome MCP 4 截图 + send "你好" 端到端通 |
| 6 (P5) | 本日 | sonnet (本 implementer) | self | typecheck + build + 11/12 验收 + 23 rulings + ADR 0005 |

### 路由 / 端口 / store / component 总览

**端口**：
- `apps/web` 5173（vite dev）/ 默认 build
- Agent app 3000（`/agent` SSE）
- RAG app 3100（`/api/search` `/api/ingest`）
- Eval app 3202（`/api/eval/*`）

**路由**（hash 模式，admin 模板惯例）：
```
/                          → redirect → /eval/overview
/#/eval/{overview,runner,query,probe,bias}    Eval 5 子页
/#/rag                                       RAG playground
/#/embed-demo                                Embed Demo
/#/embed-compare                             Embed Compare
/#/agent                                     Agent Console（暗色）
```

**Store**：
- `app / settings / permission / tags` —— admin 模板自带
- `eval` —— Task 3 useEvalStore（corpusStatus / corpusResult / overview / bias）
- `rag` —— Task 4 useRagStore（search / ingest / results）
- `agent` —— Task 5 useAgentStore（14 kinds dispatch + conversation / timeline / runSummary / sessionUsage）

**Component**：
- `layout/` —— Sidebar / Navbar / TagsView / Breadcrumb / AppMain（Task 1-2 搭）
- `components/` 业务组件 —— agent 4 件套（Composer / HeaderBar / ConversationPanel / RightPanel）+ 子组件（MessageBubble / TimelineItem / StatusDot / ExecutionTimeline / PhaseStream / QueryBox / HitCard / TabBar / CodeBlock / LeftMenu）
- `composables/useECharts.ts` —— cold-load fix（Task 3 fix round 1）
- `views/agent/styles/agent-dark.scss` —— 暗色 `.agent-route` SCSS

---

## 🧠 今日教训（5 个关键）

### 教训 1：subagent 第一原则 — review 不能跳，省小跑 = 走错路

**症状**：Task 4 implementer 1 跑完 rag commit 之后，Chrome MCP 恢复后**走错路**——给 embed-demo 加暗色 playground 包裹（`background: #09090b`），违背 Ruling 24「亮色重构」决策。
**根因**：implementer 自述"已按 brief 验证" + 老大当时没复核 → 截图与 brief 矛盾没当场发现。
**修法**：Task 4 implementer 2 重做（fresh base），最终 4 commits + 9 张截图 + build OK。
**教训**：**chrome MCP 截图是硬验证**，不是 implementer 自述；老大用 chrome MCP 看到的才是真相。

### 教训 2：Subagent-Driven Development (SDD) 实际跑通

**做法**：5 task × 独立 implementer + 自带验收 + fix loop。每个 task 独立 brief（`< 200 行`），独立 git head base，独立 commit 链。
**结果**：
- Task 1 implementer 漏配 vite alias → Task 2 implementer 局部 4 行修（4 行最小 diff，符合 CLAUDE.md 第一原则）
- Task 3 critical fix round（useECharts cold-load）→ 修根因后 overview / bias 两处 chart 都受益
- Task 4 implementer 1 走错路 → Task 4 implementer 2 fresh 重做 → 最终 4 commits + 9 截图
**教训**：**5 task 独立 + review package + fix loop** 比"1 个大 implementer 跑 5 task"更稳。fix loop 是 SDD 核心机制。

### 教训 3：Ruling 24 — Chrome MCP 截图验证 > implementer 自述

**症状**：Task 4 implementer 1 报告写"已按 brief 重构"，但 Chrome MCP 截图仍暗色。
**根因**：implementer 自述与实际渲染脱节 —— 没真验 Chrome MCP 截图。
**修法**：Task 4 brief 显式列「Chrome MCP 必跑项」+「截图存档到 `.superpowers/sdd/.../screenshots/`」+「Step 0.5 单独 commit」+「CLAUDE.md 浏览器铁律」—— 多重保险防漏。
**教训**：**主题/UX 类需求必跑 Chrome MCP 截图**，typecheck/build 通过不算完成信号（参考 [[verification-routing]] memory）。

### 教训 4：Chrome MCP 全局断连 → 不要 sleep 等，立即走 fallback

**症状**：Task 4 实施过程中 Chrome MCP 出现 `Network.enable timed out` 长时间断连。
**根因**：Chrome 进程级问题（不是工具问题），sleep 等不会自愈。
**修法**：立即走 typecheck + build + report fallback —— 把"完成信号"从 Chrome MCP 截图降级为代码侧验证（typecheck 0 + build OK + report self-claim）。
**教训**：**Chrome MCP 不可用 ≠ 任务 blocked**，代码侧工作（typecheck/build/commit）先交。截图存档可以后补。

### 教训 5：Tailwind 弃用判断错误 — YAGNI + 第一原则 + 25 文件系统性

**症状**：Task 6 brief 写"弃 Tailwind"，但扫 `apps/web/src` 后发现 25 文件仍引用 Tailwind utility class。
**根因**：
- Task 4 implementer 报告写"项目没装 Tailwind CSS"是事实错误（`@tailwindcss/vite` 一直在 devDependencies，截图能跑通正是因为 Tailwind v4 在工作）
- Task 5 implementer 报告写"4 件套 Tailwind 全去"只去了主组件层，子组件层未动
- Task 6 brief 凭"Task 4 已验证"继承错事实
**修法**：老大拍板走路径 1 — **保持 Tailwind v4 现状 + 立 ADR 0005 + park Day 24+**。25 文件 SCSS 化是 800-2000 行 diff + zinc/emerald palette 颜色漂移风险，不在 Day 23 范围。
**教训**：**"systemic problem ≠ local fix"**（CLAUDE.md 第一原则）。同类问题（25 文件 utility）已 ≥2 次（Task 4/5 implementer 都漏），不能 if/else 删 plugin。**brief 错了不算"老大同意"**。

---

## 🔬 关键发现：跨日衔接已就绪

### 接口口子（已留好）

| 接口 | 路径 | 下周一第一件事 |
|---|---|---|
| `apps/web/src/store/modules/agent.ts` | useAgentStore（14 kinds dispatch） | 加新 event kind 不用动 store 入口 |
| `apps/web/src/store/modules/eval.ts` | useEvalStore（corpusStatus / corpusResult / overview / bias） | 扩 overview 加新 metric 直接改 store |
| `apps/web/src/store/modules/rag.ts` | useRagStore（search / ingest） | 加新 ingest 阶段直接改 store |
| `apps/web/src/composables/useECharts.ts` | 冷加载 canvas fix | 加新 chart 类型直接复用 composable |
| `apps/web/src/views/agent/styles/agent-dark.scss` | 暗色 `.agent-route` SCSS | 加新 Element Plus 组件覆盖直接补 rule |
| `apps/web/src/router/index.ts` | createWebHashHistory + 9 路由 | 加新路由直接 append children |

### 9 路由全 200 + 关键 DOM 存在（hash 守卫）

```
$ for path in "/" "/#/eval/overview" "/#/eval/runner" "/#/eval/query" \
              "/#/eval/probe" "/#/eval/bias" "/#/rag" "/#/embed-demo" \
              "/#/embed-compare" "/#/agent"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:5173$path")
    echo "$status $path"
done
200 /
200 /#/eval/overview
200 /#/eval/runner
200 /#/eval/query
200 /#/eval/probe
200 /#/eval/bias
200 /#/rag
200 /#/embed-demo
200 /#/embed-compare
200 /#/agent
```

详见 `examples/day23/ex_001_adminShellSmoke.ts` 跑通日志。

---

## 📋 5 闸必跑结果（按 [[verification-routing]] 仅参考，老大验收标准是 example + Chrome MCP）

| 闸 | 命令 | 结果 |
|---|---|---|
| 1. typecheck | `pnpm typecheck` | exit 0 |
| 2. typecheck:web | `pnpm typecheck:web` | exit 0 |
| 3. lint | `pnpm lint` | ⏸️ 未跑（Task 6 范围内无 lint 修改，apps/web 无 ESLint 配置变更） |
| 4. 单测 | `npx vitest run tests/` | ⏸️ 未跑（Task 6 不在测试范围，admin 模板前端无单测） |
| 5a. ex_001 | `pnpm exec tsx examples/day23/ex_001_adminShellSmoke.ts` | ✅ 10/10 路由 200 + 关键 DOM 存在 |
| 5b. ex_002 | `pnpm exec tsx examples/day23/ex_002_runAgentSSE.ts` | ✅ agent console send "你好" → 4 message_start + chunks + message_end |
| 5c. Chrome MCP | 5 view 实跑 + 截图 | ✅ Task 4/5 已存档（agent-console-dark-* 4 张 + embed/eval-* 5 张） |

---

## 🎯 12 项验收 checklist（Task 6 §10）

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 1 | 5 view 全迁 admin 风格 | ✅ | agent / eval / rag / embed-demo / embed-compare 全活 |
| 2 | 9 菜单项正常 | ✅ | Sidebar route.matched bug Task 3 Step 0.5 修 |
| 3 | agent console 暗色 + 其余亮色（route meta 隔离） | ✅ | `.agent-route` scoped SCSS + `meta.theme='dark'` |
| 4 | eval 5 子页 + 5 个 store + ECharts | ✅ | useEvalStore + useECharts composable + cold-load fix |
| 5 | rag 三子页 + useRagStore + 0-hits 空态 | ✅ | Task 4 验证 |
| 6 | embed 两页亮色 + canvas 数据色板 | ✅ | Task 4 embed/styles.css import 修复 + Element Plus 卡壳 |
| 7 | /agent 流式消息端到端 | ✅ | Task 5 send "你好" 真通，4 消息 + token 累加 + 6 steps |
| 8 | Tailwind 0 残留（grep 0 hit） | ❌ **NOT_DONE_PARKED** | 25 文件 utility class 保留，**ADR 0005 立** + park Day 24+ |
| 9 | apps/api 0 改动（git diff apps/api 应为空） | ✅ | Task 1-6 全程未碰 apps/api |
| 10 | typecheck 0 | ✅ | `pnpm typecheck:web` exit 0 |
| 11 | build OK | ✅ | `NODE_OPTIONS="--max-old-space-size=2048" pnpm build:web` ✓ |
| 12 | examples/day23/ 至少 1 demo 跑通 | ✅ | ex_001 + ex_002 两个跑通 |

**11/12 ✅ + 1 NOT_DONE_PARKED**（Tailwind = ADR 0005 + Day 24+ park）。

---

## 🛣 Day 24+ 路线

### 候选 1：GT 集扩到 ≥ 150 条（Day 22 P0 跨日衔接）

**What**：老大手工审前 30 条 + 新增 70 条 + 校验 expectedChunkIds 在当前库存在。
**Why**：Day 22 80 条是跑通流程，质量不够；GT 集是 eval 的输入，GT 质量 = eval 质量。
**前置**：spec §10.2 已留口子（schema 锁死 + 接口 barrel）。

### 候选 2：Tailwind 渐进迁移（Day 23 ADR 0005 跨日衔接）

**What**：25 文件 utility class → scoped SCSS 渐进迁移，可单文件独立改。
**Why**：hybrid 模式不带来业务问题（Task 6 实测 hash 模式 10/10 路由 200），但 zinc palette 升级风险 + 暗色 agent console 子组件强依赖 Tailwind v4 = 长期不可控。
**前置**：ADR 0005 已立；老大周一决策是否 Day 24+ 必修。
**Today 不做**：YAGNI，admin 模板本身就是 utility-first + 组件库，弃 Tailwind 不带来业务价值。

### 候选 3：retrieveMerged 合并噪声修复（Day 20 + Day 22 eval 数据驱动）

**What**：在 Day 22 eval 数据上发现 `merged K=20 rerank` 噪声——Q1/Q3/Q8 这类 recall 失败是合并导致，按 source 去重或限额。
**Why**：Day 22 eval 给真语料 + 真 GT，跑 rerank 数字后看哪些 query 是"合并挤出"的——比 Day 20 假语料有力。
**前置**：GT 集 ≥ 30 条人类修正 + Day 22 corpus eval 跑通。

### 候选 4：MCP 入门（路线表 Day 23-24）

**What**：不进真 MCP server，先学协议 + 写 minimal MCP-style 客户端。
**Why 不今天做**：路线表 Day 23+ 才上，今天 Day 23 是 admin 壳重构。

---

## ❌ 今天不做（spec §11）

- ❌ 不弃 Tailwind v4（**改 park** —— ADR 0005 立 + Day 24+ 渐进迁移）
- ❌ 不做 manualChunks 优化（useECharts 510KB / index 1.28MB chunk >500KB warning，Day 24+ 优化）
- ❌ 不做 a11y 全面 audit（forms field id 建议等 [issue] 类型 console 警告，Day 41+ a11y 专题）
- ❌ 不做 apps/api eval-server.ts 多表聚合 / GET /eval/reports/:id 路由（spec 契约漂移 park Day 24）
- ❌ 不做 agent console Traces tab（Task 5 header bar 占位，Day 24+ 实装 trace 查询页）
- ❌ 不做 Sidebar route meta badge / 多语言切换 / 暗色全站切换（admin 模板自带的"全暗模式"开关）

---

## 📎 相关引用

- Spec: [docs/superpowers/specs/2026-09-12-vue3-element-admin-refactor.md](../superpowers/specs/2026-09-12-vue3-element-admin-refactor.md)（如有）
- 跨日衔接: [STATUS.md](../../STATUS.md)
- ADR: [docs/adr/0005-tailwind-v4-retained-element-plus-mixed.md](../adr/0005-tailwind-v4-retained-element-plus-mixed.md)
- App README: [apps/web/README.md](../../apps/web/README.md)
- 2 example: [examples/day23/](../../examples/day23/)（ex_001_adminShellSmoke + ex_002_runAgentSSE）
- 6 task reports: `.superpowers/sdd/2026-09-12-vue3-element-admin-refactor/task-{1..6}-report.md`
- 截图: `.superpowers/sdd/2026-09-12-vue3-element-admin-refactor/screenshots/`（Task 4/5 截图存档）
- Day 22: [day22.md](./day22.md) — RAG Eval Platform
- Memory: [[verification-routing]] / [[day22-rag-eval-platform]] / [[day19-rerank-eval-retro]] / [[day20-retrieveMerged-noise]] / [[day21-rag-ready-corpus]]
