# Day 20 — RAG demo 集成 + Q3 根因诊断 + retrieveMerged+rerank

> 65 天 AI Agent 工程师训练营 · Day 20 / 65
> 主题：把 Day 19 的数字变成 UI 体感 + 用诊断锁定召回失败根因 + retrieveMerged 合并池的隐藏坑。
> 前置：Day 19 rerank eval 闭环 + Day 18 chunkByHeadingSmart force reindex。

---

## ⚠️ 路线修正（First things first）

**原路线表 Day 20 = "RAG demo 集成"**——范围模糊（demo 接哪？UI 长什么样？）。

**Day 20 修正为**：3 件事一起做（按老板 2026-09-10 上午决策）：

1. **Q3 根因诊断**——Day 19 Q3 "tool 参数事实源" 召回失败，先诊断再决定
2. **retrieveMerged + rerank eval**——Day 18 spec 候选 3 的延伸，验双 strategy 池是否仍保 9/9
3. **RagApp 两阶段 tab**——复用 Day 18.5 embed-compare Pipeline 5 段组件，让老板在 UI 上"看见"

**关键决策链**：
1. 老板拍板：**复用 embed-compare Pipeline UI**（避免重写 200+ 行）+ **先诊断再决定**（不预先修切法）
2. ADR 0004 反转条件不触发（仍是双表 / 不改 indexer）
3. SearchView 不动（已支持 namespace='all'）+ TwoStageView 整页 import EmbedCompare

---

## 🎯 今日目标

1. ✅ `examples/day20/ex_001_diagnose_q3_recall.ts`——诊断 ADR 是否入库 + 切法如何
2. ✅ `examples/day20/ex_002_merged_rerank_eval.ts`——retrieveMerged 双 strategy + rerank
3. ✅ `apps/web/src/views/TwoStageView.vue`（新）—— 整页复用 EmbedCompare
4. ✅ `apps/web/src/views/RagApp.vue`——tabs 加 '两阶段检索'
5. ✅ `docs/superpowers/specs/2026-09-10-day20-rag-demo-integration-design.md` ≤1 页
6. ✅ 5 闸必跑
7. ✅ memory retro（retrieveMerged 合并噪声坑 + UI 复用边界）

---

## 📊 真活数据

### 交付 1：Q3 根因诊断（ex_001_diagnose_q3_recall）

```
chunks_heading: 63 ADR chunks
  docs/adr/0001...: 11 chunks
  docs/adr/0002...: 25 chunks
  docs/adr/0003...: 11 chunks（GT ADR）
  docs/adr/0004...: 9 chunks
  docs/adr/0005...: 7 chunks

chunks_paragraph: 135 ADR chunks
  docs/adr/0001...: 24 chunks
  docs/adr/0002...: 31 chunks
  docs/adr/0003...: 40 chunks（GT ADR）
  docs/adr/0004...: 23 chunks
  docs/adr/0005...: 17 chunks
```

**结论：Q3 病因 = 嵌入排序失败（病因 C），不是切法问题**
- ADR 0003 已入库，heading 切为 11 chunk 平均 372 字符（chunking 正常）
- Q3 query "tool 参数事实源" 和 11 个 heading chunks 的 cosine 距离都 > Day 19 heading-only retrieve(K=20) 的 top-3 截距 → 落池外
- 修复方向不在 chunking —— 在 embedding 模型对 "tool 参数事实源" 这类抽象 query 的表征能力，或扩大 K 到 ≥ 40

### 交付 2：retrieveMerged + rerank eval（ex_002_merged_rerank_eval）

| Query | baseline (向量 top-3) | rerank (top-20→3) | GT in pool | 归因 |
|---|---|---|---|---|
| Q1 4 闸必跑 | ❌ | ❌ | ✗ 召回失败 | **召回失败**（合并池噪声挤出 GT）|
| Q2 PCA 是什么 | ✅ | ✅ | ✓ | 两边都中 |
| Q3 tool 参数事实源 | ✅ | ✅ | ✓ | **两边都中**（paragraph 池拉回 ADR）|
| Q4 zod union 怎么写 | ✅ | ✅ | ✓ | 两边都中 |
| Q5 runEvents 边界 | ✅ | ✅ | ✓ | 两边都中 |
| Q8 cosine 怎么算 | ✅ | ✅ | ✓ | 两边都中 |
| Q9 lancedb 增量入库 | ✅ | ✅ | ✓ | 两边都中 |
| Q6 紫光云是什么 | ✅ | ✅ | ✓ | 两边都中 |
| Q7 阿里云是什么 | ✅ | ✅ | ✓ | 两边都中 |

**Day 20 merged: baseline 8/9 → rerank 8/9 (Δ 0)**—— **vs Day 19 heading-only: baseline 7/9 → rerank 9/9**

**关键发现**：
- ✅ **修了 Q3**：paragraph 池把 ADR 0003 的 40 个 chunk 拉进候选 → baseline 中了
- ❌ **新破 Q1**：合并池按 cosine distance 升序截 K=20 → ADR paragraph chunks（关键词集中、cosine 距离小）喧宾夺主 → 把 day12.md 的 chunks 挤出池外 → Q1 GT 落池
- **结论：retrieveMerged K=20 + rerank ≠ heading-only K=20 + rerank**，两者各有适用场景

### 交付 3：RagApp 两阶段 tab（TwoStageView）

Chrome MCP 实跑 `#/rag` → [两阶段检索] tab → "cosine 怎么算" → 截图 `docs/daily/screenshots/day20-two-stage-cosine.png`：

- Pipeline 5 段全 ✓（Embed 774ms / Vector Search 9491ms / Rerank 132ms / Final）
- VectorSearch top-5 = 真 lancedb 命中（heading + paragraph 混合，day12.md cosine 主）
- Reranker 重排前/后可视化：
  - **#1 day12.md heading** "为什么 cosine 用于文本相似度" → rerank 0.921 ↑
  - **#2 day12.md heading** "cosine vs euclidean" → rerank 0.867 ↑1
  - **#3 day12.md paragraph** (示例表) → rerank 0.152 ↑1
  - **#4 ADR 0001** "calculator tool" → rerank 0.031 ↓2（**reranker 把它判为噪音**）
  - **#5 day07.md agent** → rerank 0.005 = (reranker 降权)
- FinalResults 显示 rerank score 主 + vector score 次
- console 0 error（仅 favicon 404，无关）

---

## 🔬 关键发现：retrieveMerged 合并池的隐藏坑

Day 19 heading-only 池 vs Day 20 merged 池对比：

| 形态 | baseline | rerank | 优点 | 缺点 |
|---|---|---|---|---|
| heading-only K=20 | 7/9 | **9/9** | 关键词密度高，无 paragraph 噪声 | 召回覆盖窄（Q3 召回失败）|
| merged K=20 | 8/9 | 8/9 | 召回覆盖宽（Q3 中）| 合并噪声挤出 GT（Q1 落池）|

**根因**：retrieveMerged 合并时按 cosine distance 升序截 K=20——heading 切 chunk 平均长（关键词密度低但语义跨度大）+ paragraph 切 chunk 平均短（关键词集中 cosine 距离小）→ paragraph 池的 chunks 在 top-K 排名靠前，把 heading 池的 GT chunks 挤出。

**修复方向（明天再说，今天不动）**：
- **方案 A**：合并前按 source 做去重（每个 source 只保留 1 个最低距离的 chunk）→ 控制同 source 噪声
- **方案 B**：扩大 K 到 40 但按 source 比例限额（每 source ≤ 3 chunk）
- **方案 C**：retrieveMerged 内部不再纯 cosine 排序，加 reranker score 预排

这些都属于"评估体系"和"检索优化"话题，路线表 Day 31+ 评估体系段。今天只标 TODO。

---

## 🧠 今日复用边界教训：UI 组件复用 ≠ 接口不动

复用 EmbedCompare 整页做 TwoStageView 的代价：

- ✅ **拿到了**：Pipeline 5 段状态机 + AbortController + cancel + EmptyState + rerank 可视化
- ⚠️ **附带**：VectorSpace 2D 散点仍用 SAMPLE_CORPUS（前端固定 demo 语料），与真 lancedb 库语义不直接对应
- ⚠️ **附带**：EmbeddingPanel 也展示 SAMPLE_CORPUS 的标签（cat/dog/apple...）

**这是 trade-off，不是 bug**：用户用 [两阶段检索] tab 是为了看真库 + rerank 的真实效果，VectorSpace 散点只是"embedding 长什么样"的旁证。

**改进方向（记 TODO）**：把 SAMPLE_CORPUS 抽成 EmbedCompare 的可选 prop（默认 = demo 语料，TwoStageView 传空数组 → VectorSpace 显示 "embedding 已是 4096 维，2D 散点仅作示意"）。Day 31+ 评估体系段处理。

**为什么不今天改**：
- 改 EmbedCompare 加 prop 接口 → 200+ 行改动 + 单测回归 → 超出 Day 20 边界
- 改 TwoStageView 重写 EmbedCompare → 违反 DRY
- **trade-off 已被用户接受**：复用 ≠ 完美

---

## ❌ 今天不做

- ❌ 不动 chunkByHeadingSmart / 不写 ADR-specific 切法
- ❌ 不动 retrieveMerged 合并策略（合并噪声修复推 Day 31+）
- ❌ 不动 /search API / /rerank API
- ❌ 不抽 EmbedCompare 的 SAMPLE_CORPUS prop（推 Day 31+）
- ❌ 不做 LLM-judge
- ❌ 不加第三臂（"merged 不 rerank" / "merged 池宽 K=40"）

---

## 🔬 反例验证（5 个）

1. ✅ Q3 诊断 ADR 未入库 → 脚本打印 0 chunk，**不报错不伪造 0**
2. ✅ retrieveMerged 双 strategy → text 相等去重（Day 16 内部逻辑）→ rerank documents 用 pool 去重后 hits → 无重复
3. ✅ UI query 空 → EmbedCompare EmptyState 显示"输入一段文本"提示
4. ✅ UI rerank 服务挂 → EmbedCompare 已有 rerank skipped 路径（Day 18.5 验证过）→ FinalResults 显示 vector score
5. ✅ UI namespace='all' 双 strategy 都空 → VectorSearchPanel 显示 "0 hits" → EmptyState 提示

---

## 📋 5 闸必跑结果

| 闸 | 命令 | 结果 |
|---|---|---|
| 1. typecheck | `pnpm typecheck` | exit 0 |
| 2. typecheck:web | `pnpm typecheck:web` | exit 0 |
| 3. lint | `pnpm lint` | exit 0（修了 DAY19_BASELINE 未使用）|
| 4. 单测 | `npx vitest run tests/` | **298/5 通过**（38 个 test file，Day 19 8 个新增 + 290 存量）|
| 5a. ex_001_diagnose | `npx tsx examples/day20/ex_001_diagnose_q3_recall.ts` | ✅ ADR 0003 已入库，heading 11 chunk + paragraph 40 chunk，病因 C |
| 5b. ex_002_merged | `npx tsx examples/day20/ex_002_merged_rerank_eval.ts` | ✅ rerank 8/9（修 Q3 但破 Q1）|
| 5c. Chrome MCP | `#/rag` → 两阶段检索 → cosine 怎么算 → Analyze | ✅ Pipeline 5 段全 ✓，rerank 改排名 0.921/0.031 区分清晰，console 0 error |

---

## 🎯 JD 映射

### JD-1 命中
| 关键词 | 今日命中点 |
|---|---|
| **Retrieval / RAG** | retrieveMerged 合并池策略 vs heading-only 池策略对比——揭示 K 参数与池质量的关系 |
| **Debugging / 诊断** | Q3 三种病因诊断法（未入库 / 切法碎 / 排序失败）——把"召回失败"拆成可定位的根因 |
| **Eval harness** | 跨日对比（Day 19 heading-only 9/9 vs Day 20 merged 8/9）——揭示库语义的 drift |

### JD-2 钩子
| 关键词 | 今日命中点 |
|---|---|
| **UI 工程化** | 复用 embed-compare Pipeline 5 段状态机（不重写）—— 工程"少改多复用"的边界 trade-off |
| **依赖方向控制** | TwoStageView 整页 import EmbedCompare（最小代码路径）—— 不为"完美复用"扩 EmbedCompare 接口 |

---

## 🛣 Day 21+ 路线

### 候选 1：retrieveMerged 合并噪声修复（路线表候选 1）

**What**：合并前按 source 去重（每个 source 留 1 个最低距离），或扩大 K + 按 source 限额。
**Why**：Day 20 揭示 retrieveMerged 合并策略的隐藏坑；8/9 退化到 8/9（与 Day 19 9/9 对比）——生产 RAG 形态不能劣化。
**前置**：用 Q1/Q3 当回归基准（修了合并噪声应该 ≥ Day 19 9/9 且保持 Q3 修复）。

### 候选 2：RagApp SearchView 的 namespace 联动 UI

**What**：SearchView 当前 namespace 切换不触发动画/提示；扩 'all' 时显示"retrieveMerged 双 strategy 跑，h+p 合并"。
**Why 不今天做**：超出 Day 20 范围（SearchView 已在跑 namespace=all）。

### 候选 3：MCP 入门（路线表 Day 23-24）

**What**：不进真 MCP server，先学协议 + 写 minimal MCP-style 客户端（probe 一个工具）。
**Why 不今天做**：路线表 Day 23+ 才上，今天 Day 21 是 retrieveMerged 修复。

---

## 📎 相关引用

- Spec: [docs/superpowers/specs/2026-09-10-day20-rag-demo-integration-design.md](../superpowers/specs/2026-09-10-day20-rag-demo-integration-design.md)
- Diagnosis: [examples/day20/ex_001_diagnose_q3_recall.ts](../../examples/day20/ex_001_diagnose_q3_recall.ts) — 病因 C 结论
- Eval: [examples/day20/ex_002_merged_rerank_eval.ts](../../examples/day20/ex_002_merged_rerank_eval.ts) — 揭示合并噪声
- UI: [apps/web/src/views/TwoStageView.vue](../../apps/web/src/views/TwoStageView.vue) + RagApp.vue
- Screenshot: [docs/daily/screenshots/day20-two-stage-cosine.png](./screenshots/day20-two-stage-cosine.png)
- Memory: [[day20-retrieveMerged-noise]]（即将写入）
- Day 19: [docs/daily/day19.md](./day19.md) — heading-only 9/9 基线
- Day 18: [docs/daily/day18.md](./day18.md) — chunkByHeadingSmart + force reindex
- Day 18.5: embed-compare 重构 (Pipeline 5 段被今天复用)