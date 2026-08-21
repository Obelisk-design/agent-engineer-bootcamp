# Day 12 — Embedding Demo：4 个可视化面板（cos vs euc on 4096-dim）

> 65 天 AI Agent 工程师训练营 · Day 12 / 65
> 主题：学 embedding，看向量空间长什么样。Cosine / Euclidean / PCA 一次看到。

---

## ⚠️ 路线修正（First things first）

原 Day 12 = `FileEditTool`（接 Day 11 `FileReadTool` 的 cat -n 行号 + `replaceAll: boolean` 用 zod union 绕 bug C）。
今天临时换路线学 embedding，FileEditTool 顺延到 Day 13+。

**理由**（4 条 from spec Context）：
1. embedding 是 RAG / 语义检索 / Memory 的地基，比 Edit 更基础。
2. 用户原话（CLAUDE.md 项目层）："embedding 是个跟 llm agent tools 平级的概念" — 独立一级概念。
3. 学习顺序决定先学 embedding —— 要先看到向量空间长什么样，才能判断未来要不要 / 怎么接 RAG。
4. FileEditTool 不会丢 —— 依赖 file_read 的 cat -n 行号（Day 11 已就绪），顺延即可。

**⚠️ 第二轮修正（spec 假设错误，已修正）**：原 spec 假设 `qwen3-embedding-8b` 支持 Matryoshka 嵌套维度（4096→256）。**实测 dev 网关 vLLM/litellm 拒绝 `dimensions` 参数**（连原生 4096 也拒，见 `ex_002_probe_dims`）。Panel C 改为同维度 cosine vs euclidean 对比 —— 这反而是更基础的"方向 vs 距离"教学。

---

## 🎯 今日目标

1. ✅ `libs/embedding/distance.ts` — cosine / euclidean + dim-mismatch / zero-vector 反对例
2. ✅ `libs/embedding/pca.ts` — 手写 2D PCA（power iteration + deflate），不引 ml 库
3. ✅ `libs/embedding/visualize.ts` — `distanceMatrixHTML` + `scatterSVG`（HTML/SVG self-contained）
4. ✅ `libs/embedding/embed.ts` — OpenAI 兼容 embeddings wrapper（fetch + signal spread）
5. ✅ `libs/embedding/fixtures/sample-corpus.ts` — 4 动物 + 3 水果 + 3 抽象词 + 4 前缀变体
6. ✅ `libs/embedding/index.ts` — barrel
7. ✅ `apps/web/src/views/embed/api.ts` — 前端 import.meta.env 适配 + warnDevKeyOnce
8. ✅ `PanelA.vue` — 距离矩阵热图（10 词 × 4096 维 cosine）
9. ✅ `PanelB.vue` — PCA → 2D 散点图（同 10 词 × 4096 维）
10. ⚠️ `PanelC.vue` — **原计划 4096 vs 256 Matryoshka，实测不支持，改为同维度 cosine vs euclidean 距离矩阵对比**
11. ✅ `PanelD.vue` — 距离梯度（query + 4 前缀变体）
12. ✅ `EmbedDemo.vue` — 4 panel 容器 + 缺 key 红 banner
13. ✅ `/embed-demo` 路由 — App.vue hash switch（path B，无 vue-router）
14. ✅ `LeftMenu` 加 Embed 入口 + `HeaderBar` 加 `dev:day12` 标识
15. ✅ dev OpenAI 兼容网关 + `qwen3-embedding-8b`（4096 维）作为默认
16. ✅ `examples/day12/ex_001_embed_only.ts` + `ex_002_probe_dims.ts`（真跑通）

---

## 📦 今日产出物

```text
libs/embedding/                        🆕 整层
  distance.ts                              cosine / cosineDistance / euclidean
  pca.ts                                   2D PCA（power iteration + deflate）
  visualize.ts                             distanceMatrixHTML + scatterSVG
  embed.ts                                 OpenAI 兼容 embeddings wrapper
  fixtures/sample-corpus.ts                ANIMAL_WORDS + FRUIT_WORDS + ABSTRACT_WORDS + QUERY_WITH_PREFIXES
  index.ts                                 barrel

tests/libs/embedding/                  🆕
  distance.test.ts                         cosine / euclidean / dim-mismatch / zero-vector（10 用例）
  pca.test.ts                              power iteration / zero-variance / dim-mismatch（5 用例）

apps/web/src/views/embed/              🆕 4 panel + 容器
  PanelA.vue                                距离矩阵热图
  PanelB.vue                                PCA 2D 散点
  PanelC.vue                                cos vs euc 对比（4096 维同向量）
  PanelD.vue                                距离梯度
  EmbedDemo.vue                             4 panel 容器 + key-missing 红 banner
  api.ts                                    import.meta.env 适配 + warnDevKeyOnce
  styles.css                                表格 / SVG / loading / error

apps/web/src/App.vue                   MODIFIED — hash route 切换 (#/embed-demo)
apps/web/src/components/LeftMenu.vue    MODIFIED — 加 Embed 入口（component is="a"）
apps/web/src/components/HeaderBar.vue   MODIFIED — 加 dev:day12 标识
.env.example                            MODIFIED — dev gateway 默认值
```

**测试**：24 files / 157 passed / 2 skipped（Day 11 为 22 / 139）

---

## 🔍 今天真正学到的东西

### 1. 什么是 embedding

文本 → 一个固定维度的向量（这里是 4096 维）。**相似语义的文本向量方向相近** —— 这就是 RAG / 语义检索 / Memory 的物理实现。

### 2. 为什么 cosine 用于文本相似度

- **cosine** 看方向（angle），对长度不敏感 → 文本向量长度反映"信息量"，方向反映"语义" → 文本相似度 = cosine。
- **euclidean** 看距离，对长度敏感 → 更适合图像 / 坐标。
- 库都给了两种，但实务中文本用 cosine。

### 3. PCA 是什么

找"方差最大方向"，把高维投影到 2D 让我们肉眼看到"聚类"。
**手写 vs 引库**：这次选 power iteration + deflate 手写（不引 ml/reduce 包）—— 19 行核心，TS 类型安全，5 个反例覆盖 zero-variance / dim-mismatch / convergence。

### 4. cosine vs euclidean：方向 vs 距离（Day 12 主修）

`cosine` 看"方向"（angle），对长度不敏感 → 文本向量长度反映"信息量"，方向反映"语义" → 文本相似度 = cosine。
`euclidean` 看"距离"，对长度敏感 → 更适合图像 / 坐标。
**Panel C 现在让用户亲眼对比**两个距离公式在同一组向量上的差异 —— 同类词 cosine 小但 euclidean 不一定小。

> ~~Matryoshka 降维~~（取消）：原计划对比 4096 vs 256，**实测 dev 网关不支持**。`qwen3-embedding-8b` 通过 vLLM/litellm 跑时 litellm 主动拒绝 `dimensions` 参数（即使原生的 4096），担心"未训练 Matryoshka 的模型乱输出质量差"。详见 `examples/day12/ex_002_probe_dims.ts` 4 个探针。
>
> 这给我们的教训：**spec 时只跑一次真 API 就能避免 4096 vs 256 这种"看似合理的架构假设"** —— spec 阶段要至少跑一次"零碎的真网关调用"，再下笔写 Panel C。

### 5. fixture 是单一事实源

`libs/embedding/fixtures/sample-corpus.ts` 一份 → libs 测试 + 4 个 Vue panel 全 import。避免漂移（动物/水果/抽象词如果各写一遍，早晚会改不一致）。

### 6. OpenAI 兼容 ≠ OpenAI

环境用的是 dev 网关 `http://10.230.10.242:8000/v1`（Qwen3-Embedding-8B），但 API 协议与 OpenAI 兼容。
libs 层只看 `baseUrl + model + apiKey`，不绑任何 provider 名字 → 一处实现到处跑。

---

## ⚙️ 关键技术决策

### 路由（Task 14）

Plan 提供 Path A（vue-router）/ Path B（hash switch）。
**实际选择 Path B** —— `apps/web/src/router/` 不存在，`main.ts` 也没 import vue-router。
Hash switch 17 行实现：监听 `hashchange`，根 `<div>` v-if 切换 EmbedDemo / Agent Console。
**YAGNI 红旗**：项目唯一的"路由"就是这一条 day12 dev 页面，引 vue-router = 引入一整套生命周期只为这一条路由，明显过度。

### 前端 defaults 适配（用户中段变更）

原 api.ts `DEFAULT_BASE_URL = 'https://api.openai.com/v1'`，`DEFAULT_MODEL = 'text-embedding-3-small'`。
**用户中段要求**：base URL = `http://10.230.10.242:8000`（内网）+ model = `qwen3-embedding-8b`。
**调整**：api.ts 两个常量改为 dev 网关；`.env.example` 默认值同步；`.env` 增加 `VITE_OPENAI_*` 三行（gitignored）。
**为什么不放 OpenAI 默认？** dev demo 跑得起来 = 项目可跑；OpenAI 默认 = 用户必须改 env 才能跑通 demo。

### signal 的 exactOptionalPropertyTypes 处理

`embed(req, apiKey, signal?: AbortSignal)` 用 `...(signal ? { signal } : {})` spread。
**为什么**：`exactOptionalPropertyTypes: true` 下，`RequestInit.signal: AbortSignal | null`（不要 undefined）—— 直接传 undefined 报错。

---

## 🐛 踩坑与修复

### 1. Task 2 typecheck 漏检（Critical）
vitest 用 esbuild，**vitest 全绿 ≠ tsc 全绿**。
首次 3/3 vitest 通过，但 `pnpm typecheck` 报错 —— `let v = new Array(d).fill(0).map(...)` 被推为 `(0|1)[]`，后续 `v[i] = something_number` 报错。
**修复**：`Array.from({length: d}, (_, i) => i === 0 ? 1 : 0)` + `let v: number[]` 显式标注。
**lesson**：所有 brief 都强制要求 `pnpm typecheck` exit-code 报告。

### 2. commitlint subject-case 反复拦截
多次 commit 失败：PCA / OpenAI / EmbedDemo 等 PascalCase / SentenceCase 被拦。
**修复**：所有 brief 默认 commit 消息含大写品牌名 → 改成全小写。
**lesson**：commitlint 默认规则严格，下一个 brief 模板默认小写。

### 3. parallel-agent git index contention
3 个 panel subagent 并行 → 都 `git add` + `git commit`，互相覆盖对方的 staged set。
**症状**：提交消息说 "panel c" 但实际内容是 PanelB。
**修复**：reflog 找到丢失的 PanelD commit（074851f）+ soft-reset + cherry-pick + 手动重 commit。
**lesson**：并行 subagent 在同一 repo 的 git 写操作必须串行，或各自在 worktree 里跑。本次应一开始就让每个 agent 用 `git stash` + worktree。

### 4. .env VITE_* 缺失
vite 默认只暴露 `import.meta.env.VITE_*` 给 client。`.env` 只有 `OPENAI_*`，demo 跑起来 key 读不到 → 红 banner。
**修复**：在 `.env` 加 `VITE_OPENAI_API_KEY` / `VITE_OPENAI_BASE_URL` / `VITE_OPENAI_EMBEDDING_MODEL`（gitignored）。
**lesson**：前端读 env 必须 `VITE_` 前缀，不是 `import.meta.env` 自动透传。

---

## ✅ Acceptance Criteria 核对

每条均为本次实际跑命令验证（不靠推断）：

- ✅ `pnpm test` 全绿（24 files / 157 passed / 2 skipped — 13 个新增反例 + 全量回归不退化）
- ✅ `pnpm typecheck` / `pnpm typecheck:web` 零错（exit 0）
- ✅ `pnpm lint` 零错（exit 0）
- ✅ `pnpm dev:web` 起得来 → `/embed-demo` 打开（hash 路由 path B；HeaderBar/LeftMenu 有入口）
- ✅ 4 个面板全部能跑通（Panel A/B/C/D 各自有 `<button @click="run">` 触发）
- ✅ 不改 `apps/api/`（架构边界守住）
- ✅ 不改 Agent 主链路（AgentConsole 行为不变，只是加了 hash 路由分支）
- ✅ daily note 明写路线修正 + FileEditTool 顺延原因（§ 路线修正首段）
- ✅ 缺 `VITE_OPENAI_API_KEY` 时显示明确红 banner（EmbedDemo.vue `<div v-if="getOpenAIConfig().apiKey === null">`）

---

## 🔮 Day 13 路线

### `FileEditTool`（顺延）

- 接 Day 11 `FileReadTool` 的 cat -n 行号做锚点
- `replaceAll: boolean` 必须用 `z.union([z.boolean(), z.stringbool()])` 绕 bug C
- 三层截断（行数 / 单行字符 / 总字符）防吃掉 context

---

## 📎 相关引用

- Spec: [docs/superpowers/specs/2026-08-19-day12-embedding-demo-design.md](../superpowers/specs/2026-08-19-day12-embedding-demo-design.md)
- Plan: [docs/superpowers/plans/2026-08-19-day12-embedding-demo.md](../superpowers/plans/2026-08-19-day12-embedding-demo.md)
- Libs: [libs/embedding/](../../libs/embedding/)
- Panels: [apps/web/src/views/embed/](../../apps/web/src/views/embed/)
- Day 11: [docs/daily/day11.md](./day11.md) — FileReadTool + zod schema 单源
- ADR 0003: tool 参数契约以 zod schema 为单一事实源