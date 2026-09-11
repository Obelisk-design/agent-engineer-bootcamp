# 0005 — Tailwind v4 保留，与 Element Plus 共存（hybrid 模式）

> **Status**: Accepted（Day 23 post-mortem）
> **Date**: 2026-09-11
> **Deciders**: 老大 + Claude

## Context

Day 23 把 `apps/web` 从「纯 Vue3 + Tailwind + 自写 styles」重构为「vue3-element-admin 模板 + Element Plus + Tailwind v4 共存」。原计划 Task 6 (P5) 末段「弃 Tailwind，迁移到纯 SCSS 主题」。

实际扫 `apps/web/src` 后发现 **25 个文件仍引用 Tailwind utility class**，分三类：

| 类别 | 数量 | 代表文件 |
|---|---|---|
| Agent Console 子组件（Task 5 实现，但子组件层仍用 Tailwind） | 9 | MessageBubble / TimelineItem / StatusDot / ExecutionTimeline / PhaseStream / QueryBox / HitCard / TabBar / CodeBlock |
| Eval / RAG 视图（Task 3/4 实现，没去 utility） | 10 | EvalRunner / EvalOverview / QueryDetail / BiasAnalysis / CorpusProbe / RagApp / rag/SearchView / rag/IngestView / SearchView / IngestView |
| Embed 视图（Task 4 实现，"亮色重构"没真删 utility，只加 el-card 包壳） | 4 | PanelA / PanelC / PanelD / EmbedCompare |
| 旧组件（Day 09-12 残留） | 2 | LeftMenu / eval/EvalApp |

若按原 Task 6 brief 直接 `rm @tailwindcss/vite` + 删 package.json + 删 `styles.css` 的 `@import 'tailwindcss'`，后果：

- vite 启动失败（plugin 找不到 import）
- 即便修好 styles.css，25 文件 utility class 全部失效
- **agent console 暗色主题全塌**（依赖 `bg-zinc-950`/`text-emerald-400` 等 zinc/emerald palette）
- eval / rag / embed 视图 layout 散架（依赖 `flex gap-3 px-6 py-5` 等 spacing）
- 12 项验收 §5（agent 暗色 + 其余亮色）、§6（embed 两页亮色）必挂

**根因**：Task 4 implementer 报告写"项目没装 Tailwind CSS"是事实错误（`@tailwindcss/vite` 一直在 devDependencies，截图能跑通正是因为 Tailwind v4 在工作）。Task 5 implementer 报告写"4 件套 Tailwind 全去"只去了主组件层（Composer/HeaderBar/ConversationPanel/RightPanel），子组件层未动。**两次报告与代码实际状态不一致**。

按 CLAUDE.md 第一原则（"同类问题已 ≥2 次禁止 if/else，必须回溯根因"），删 Tailwind plugin = 在 25 文件上加 if/else 容错，违反原则。

按 CLAUDE.md YAGNI（"今天不用，就不要设计"）：admin 模板本身就是 utility-first + 组件库，**弃 Tailwind 不带来任何业务价值**。

## Decision

**Tailwind v4 在 `apps/web` 保留，与 Element Plus 共存（hybrid 模式）。暗色 agent console 走 SCSS `.agent-route` class 与 utility class 共存。**

具体约束：

- **保留**：
  - `apps/web/vite.config.ts` 的 `import tailwindcss from '@tailwindcss/vite'` + `tailwindcss()` plugin
  - `apps/web/package.json` 的 `tailwindcss` + `@tailwindcss/vite` devDependencies
  - `apps/web/src/styles.css` 的 `@import 'tailwindcss';`
  - 25 文件现有 utility class（不强制改写）
- **组件可混用**：
  - 主组件（Task 5 Composer/HeaderBar/ConversationPanel/RightPanel）走 scoped SCSS + Element Plus（`<el-button>` 等）
  - 子组件（MessageBubble/TimelineItem/StatusDot 等）走 utility class + 局部 `<style>`（仅限需要 icon color/animation 等）
  - 业务视图（Eval/RAG/Embed）走 utility class 维持旧 layout + Element Plus 加亮色卡壳
- **暗色隔离**：`.agent-route` class 由 `AppMain.vue` 按路由 `meta.theme === 'dark'` 动态套，scoped SCSS（`apps/web/src/views/agent/styles/agent-dark.scss`）只覆盖 el-card / el-button / el-input / el-tag 等 Element Plus 组件 CSS vars，不污染亮色页
- **未来迁移**：Day 24+ 可逐步把子组件 utility class → scoped SCSS，**不在 Day 24 必修路径**（YAGNI）

## Consequences

**正面**：
- Task 6 范围收敛：跳过 A 段（删 Tailwind），按 brief 修正走 B → I，commit 链清晰
- agent console 暗色 / eval-rag-embed 亮色 隔离验证零回退（实测 hash 模式 10/10 路由 200）
- 风险 0：不动 25 文件 utility class，避免大规模 SCSS 化 diff（800-2000 行）+ zinc/emerald/amber palette 颜色漂移风险
- 暗色主题双轨：utility class 控 component 颜色 + scoped SCSS 控 Element Plus 组件覆盖，互不冲突
- Day 24+ 渐进迁移可拆：每组件独立改，不在单日大批量改

**负面**：
- 25 文件 utility class + Element Plus scoped SCSS 共存 → 阅读者要同时懂两套，认知负担 +1
- 暗色 agent console 子组件强依赖 Tailwind v4 zinc palette（`bg-zinc-900/40` 用 `rgba(zinc-900, 0.4)` 而非固定 hex）—— 升级 Tailwind 时 zinc palette 偏移 → 子组件颜色漂移风险
- apps/web 体积持续偏大：useECharts 510KB + index 1.28MB（chunk >500KB warning，Day 24+ manualChunks 优化）
- 下日 owner 可能再次起"弃 Tailwind"心思（**这就是 ADR 存在的目的**）

**反转条件**：
- 如果 Day 30+ 决定统一组件库（如全部换 Ant Design Vue 或 Element Plus only），应先做 utility class 清单审计 + 全量 SCSS 迁移计划 —— 此 ADR 反转。届时同步更新本 ADR。
- 如果 Tailwind v5/v6 出现破坏性更新且 zinc palette 重命名，应做完整 SCSS 迁移 + 删 plugin —— 此 ADR 反转。届时同步更新本 ADR。

## Enforcement

- [x] **代码层 grep guard**：以下 3 处必命中 `tailwind` 字串，缺一即报 warn（人工 review 兜底，无 CI）：
  - `apps/web/package.json` — `tailwindcss` + `@tailwindcss/vite` devDependency
  - `apps/web/vite.config.ts` — `import tailwindcss from '@tailwindcss/vite'` + `tailwindcss()` plugin
  - `apps/web/src/styles.css` — `@import 'tailwindcss';`
- [x] **spec 同步**：[apps/web/README.md](../../apps/web/README.md) §"主题策略" 段显式写「Tailwind v4 + Element Plus hybrid」+ ADR 0005 link
- [x] **Day 24+ parked**：[docs/daily/day23.md §Parked](../daily/day23.md) 「Tailwind 弃用 = 渐进迁移 + ADR 0005」
- [ ] **CI grep guard（建议 Day 24+ 补）**：禁止"删除上述 3 处"出现在 diff 里：
  ```bash
  # 应 ≥3 命中（package.json / vite.config.ts / styles.css）
  grep -rn 'tailwind' apps/web/package.json apps/web/vite.config.ts apps/web/src/styles.css
  ```

## Related

- ADR 0001 — Tool capability declaration MUST NOT be embedded into system prompt（同精神：配置 = 单一事实源，禁凭印象改）
- ADR 0003 — Tool params 单一事实源 zod schema（**真相在代码，不在 spec** — Day 23 Tailwind 报告 vs 实际 = Day 04 工具参数 spec vs SDK 实际 同款问题）
- [docs/daily/day23.md §Parked](../daily/day23.md) — Tailwind 弃用 park 理由
- [docs/daily/day22.md](../daily/day22.md) — 5 view + Element Plus 起点（hybrid 模式雏形）
- [apps/web/README.md](../../apps/web/README.md) — 主题策略段
- Task 6 report（`.superpowers/sdd/2026-09-12-vue3-element-admin-refactor/task-6-report.md`）— 决策树 + 25 文件清单
