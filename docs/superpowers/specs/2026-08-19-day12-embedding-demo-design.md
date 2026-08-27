# Day 12 — Embedding 可视化 Demo

> Spec 写于 2026-08-19 · 路线修正：FileEditTool 顺延到 Day 13+
> 主题：把"向量空间长什么样"用 4 个对比面板可视化，让 embedding 从抽象名词变成肉眼可见的现象。

---

## Context（为什么做）

Day 11 daily 已经把 Day 12 钉成 `FileEditTool`。今天临时换路线学 embedding，依据：

1. **embedding 是 RAG / 语义检索 / Memory 的地基**，比 Edit 更基础（Edit 是工具内部细节，embedding 是 Agent 架构层概念）。
2. **用户原话（CLAUDE.md 项目层）**："embedding 是个跟 llm agent tools 平级的概念" —— 确认它是**独立一级概念**。
3. **学习顺序决定先学 embedding**：要先看到"向量空间长什么样"，才能判断未来要不要 / 怎么接 RAG。
4. **FileEditTool 不会丢**：它依赖 file_read 的 cat -n 行号（Day 11 已就绪），顺延到 Day 13+ 即可。

**不写 ADR**：路线修正是"为什么换"的决定，不是架构决策；写 daily note 就够（避免 ADR 通胀）。

---

## Goal

1. **单文本 → 向量**：看到前 N 维数字 + 模型维度（1536 / 256）。
2. **一组文本 → 距离矩阵热图**：看到"同类相聚、不同类远离"的核心现象。
3. **PCA → 2D 散点图**：直观看 3 簇聚类。
4. **同文本不同维度对比**：看维度压缩对距离的影响（1536 vs 256）。
5. **同一 query + 不同前缀 → 距离梯度**：看上下文对向量的牵引。

## Non-Goal（YAGNI 防线 · 今天不做）

- ❌ RAG / 向量数据库 / Memory
- ❌ 接入 Agent 主链路
- ❌ chunking / batching / 异步并发
- ❌ 多模型对比（只 OpenAI 一家）
- ❌ 生产部署 / CI 集成
- ❌ 移动端适配 / i18n

---

## Architecture

```
�─────────────────────────────────────────────────┐
│  apps/web/src/views/embed/                      │  ← vue 路由页（dev only）
│    EmbedDemo.vue        # 4 panel 容器           │
│    api.ts               # 前端 fetch OpenAI      │
│    PanelA/B/C/D.vue     # 4 个对比面板            │
│    styles.css           # demo 页专用样式        │
│  apps/web/src/router/index.ts    # + /embed-demo │
│  apps/web/src/components/        # + LeftMenu   │
│    LeftMenu.vue / HeaderBar.vue  #   图标 + (dev)│
└────────────────────┬────────────────────────────┘
                     │ import
                     ▼
┌─────────────────────────────────────────────────┐
│  libs/embedding/                                │  ← 纯函数库（可复用、可单测）
│    embed.ts             # OpenAI embed client   │
│    distance.ts          # cosine / euclidean    │
│    pca.ts               # 手写 PCA (power iter) │
│    visualize.ts         # 距离矩阵 / SVG 散点    │
│    fixtures/sample-corpus.ts  # 共享文本 fixture│
│    index.ts             # barrel                │
└────────────────────┬────────────────────────────┘
                     │ import
                     ▼
┌─────────────────────────────────────────────────┐
│  tests/libs/embedding/                          │  ← 纯函数反例（不测 API）
│    distance.test.ts     # 5 反例                │
│    pca.test.ts          # 3 反例                │
└─────────────────────────────────────────────────┘
```

**关键边界**：
- `libs/embedding/` 是纯函数 / 无网络 / 无 vue 依赖 → 可单测、可复用
- `EmbedDemo.vue` 只调 libs + fetch OpenAI → 零业务逻辑
- **不**改 `apps/api/`（架构正确但 demo 不需要；YAGNI）

---

## API 暴露决策

- **前端直连 OpenAI**：`VITE_OPENAI_KEY` 走 `import.meta.env`
- **理由**：demo 性质、key 仅 dev 用、不进生产
- **风险**：浏览器可见 key —— 接受（生产部署不在本任务范围）
- **降级**：缺 key 时 demo 页显示明确红 banner（沿用 Day 11 bug C 教训：不静默失败）

---

## 路由入口决策

- 新增 `/embed-demo` 路由
- LeftMenu 加 🔮 图标（"Embedding"）
- HeaderBar 标题加 `(dev)` 后缀（明示"临时页"，与 day-09 路线一致）
- **不**改 App.vue 主体结构（只加 1 个 `<router-view>` 出口和路由表 —— 视现状决定）

---

## 4 个对比面板（spec 核心）

每个面板独立可跑；fixture 在 `libs/embedding/fixtures/sample-corpus.ts` 单一事实源。

| Panel | 输入 | 输出 | 验证期望 |
|---|---|---|---|
| **A. 距离矩阵热图** | 8-10 个手工挑选文本（4 动物 / 3 水果 / 3 抽象词） | n×n cosine 距离矩阵 HTML 热图 | 同类相聚（颜色浅）、不同类远离（颜色深） |
| **B. PCA 2D 散点** | 同上 | PCA → 2D scatter SVG | 肉眼能看出 3 簇 |
| **C. 维度对比** | 同 4-6 文本，分别跑 `embedding@4096` 和 `@256`（Matryoshka 降维） | 两个距离矩阵并排 | 维度降低后同类仍聚、不同类仍远 |
| **D. 距离梯度** | 1 个 query + 4 个变体（短前缀 / 中前缀 / 长前缀 / 不相关） | query ↔ 4 变体的距离梯度条 | 相关前缀距离递增，不相关突变 |

---

## 错误处理（沿用 Day 11 教训）

| 场景 | 处理 |
|---|---|
| 缺 `OPENAI_API_KEY`（dev 用 OpenAI gateway） | demo 页顶部红 banner："请设置 OPENAI_API_KEY in .env" |
| OpenAI 401 / 429 / 5xx | 显示原始 status + message（不包装），按钮可重试 |
| API key 泄露警告 | console.warn 一次（dev mode） |
| PCA 输入样本 < 2 | 抛 `RangeError`（不静默回落） |
| fixture 文本为空 | libs 层抛 `RangeError`，前端显 0 |

---

## 验证策略

- **libs 单测**：`pnpm test` 全绿
  - `distance.ts` 5 反例：cos(同向量)=1、euclidean(同向量)=0、单调性、对称性、零向量报错
  - `pca.ts` 3 反例：方差最大方向、n≥2 维度恢复、零方差数据报错
- **typecheck / lint**：`pnpm typecheck && pnpm lint` 零错
- **手跑 demo**：`pnpm dev:web`，浏览器开 `/embed-demo`，4 个面板全部跑通
- **回归测试**：libs 改一处 → distance/pca 测试红绿循环验证
- **API 不测**（网络依赖）—— 用 fixture + 手动验证

---

## 文件清单

### 新增

```
libs/embedding/
  embed.ts                    # OpenAI client wrapper
  distance.ts                 # cosine / euclidean
  pca.ts                      # 手写 PCA
  visualize.ts                # 距离矩阵 HTML / 散点 SVG
  fixtures/sample-corpus.ts   # 共享文本 fixture
  index.ts                    # barrel

tests/libs/embedding/
  distance.test.ts            # 5 反例
  pca.test.ts                 # 3 反例

apps/web/src/views/embed/
  EmbedDemo.vue               # 4 panel 容器
  api.ts                      # 前端 fetch OpenAI
  PanelA.vue                  # 距离矩阵热图
  PanelB.vue                  # 2D scatter
  PanelC.vue                  # 维度对比
  PanelD.vue                  # 距离梯度
  styles.css                  # demo 页专用样式

docs/superpowers/specs/
  2026-08-19-day12-embedding-demo-design.md   ← 本文件

docs/daily/
  day12.md                                   # 含路线修正说明
```

### 修改

```
apps/web/src/router/index.ts          # + /embed-demo 路由
apps/web/src/components/LeftMenu.vue  # + Embedding 图标
apps/web/src/components/HeaderBar.vue # + (dev) 标识
apps/web/src/App.vue                  # + <router-view> 出口（视现状）
package.json                          # + dev:day12 脚本（如需）
.env.example                          # + VITE_OPENAI_KEY 注释
```

### 删除

无。

---

## Acceptance Criteria（验收清单）

- [ ] `pnpm test` 全绿（新增 8 个反例 + 全量回归不退化）
- [ ] `pnpm typecheck` / `pnpm lint` 零错
- [ ] `pnpm dev:web` 起得来，`/embed-demo` 能打开
- [ ] 4 个面板全部能跑通，至少 Panel A 验证"同类相聚"
- [ ] **不**改 `apps/api/`（架构边界守住）
- [ ] **不**改 Agent 主链路（不污染 day-08/09）
- [ ] daily note 明写路线修正 + FileEditTool 顺延原因
- [ ] 缺 `VITE_OPENAI_KEY` 时显示明确红 banner（不静默失败）

---

## Risks

| 风险 | 缓解 |
|---|---|
| API key 浏览器暴露 | demo 性质接受；console.warn 一次；生产部署不在本任务 |
| PCA 手写出 bug | 8 个单测覆盖（含方差最大方向验证） |
| vue 工程侵入 | 只加 1 路由 + 1 图标 + 1 标识；不改 App.vue 主体 |
| 4 面板视觉风格不一致 | 集中在 `views/embed/styles.css`，避免散落 |
| 真实模型跑慢 | demo 加 loading 态 + 取消按钮 |
| OpenAI rate limit | 错误处理透传 status，可重试 |

---

## Out of Scope

RAG / 向量数据库 / Agent 主链路接入 / 多模型对比 / chunking / batching / 并发 / 生产部署 / CI 集成 / 移动端适配 / i18n。

---

## Open Questions

无（5 个关键决策已全部对齐：A1 前端直连 / B3 dev 路由 / C1+C2+C3+C4 四面板 / D1 抽 libs 复用层 / 标准 spec 路径）。
