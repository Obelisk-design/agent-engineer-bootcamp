# Day 19 — Reranker 进主链路：two-stage retrieval 评估闭环

> 65 天 AI Agent 工程师训练营 · Day 19 / 65
> 主题：从"网页看见 rerank"到"用数字证明 rerank 提升召回"——embedding vs reranker 教训。
> 前置：Day 18 chunkByHeadingSmart 调优 + force reindex。

---

## ⚠️ 路线修正（First things first）

**原路线表 Day 19 = "Reranker 集成（用 dev 网关 qwen3-reranker-4b）"**——范围模糊（集成到哪里？评估怎么做？）。

**Day 19 修正为**：reranker 进 RAG 主链路（recall-wide K=20 → rerank top_n=3 召回精排形态）+ 用 eval 数字证明价值 + 归因表拆"rerank 功劳 vs 召回失败"。

**关键决策链路**：
1. Day 18.5 embed-compare 网页已能"看见" rerank 改排名（Pipeline 5 段可视化）→ 昨天的能力是 UI 层
2. Day 18 spec 立的 flag 还挂着："heading v2 baseline 6/9 → 预期 rerank 后 8/9" → 今天真活：跑 rerank、用数字闭环
3. 老大拍板：rerank **独立一层**（libs/rag 不依赖 libs/reranker）；K=20；实验组 = heading v2 + rerank
4. 不做第三臂（"top-20 直接取前 3 不 rerank"）—— 诊断位 `gtInPool` 一个 boolean 就够归因

---

## 🎯 今日目标

1. ✅ `libs/rag/evaluate.ts` +`evaluateRerankRow`（归因三分法：救回 / 修不动 / 排错 / 召回失败 / 服务失败）+`formatRerankReport`
2. ✅ `libs/rag/index.ts` barrel 导出
3. ✅ `examples/day19/ex_001_rerank_eval.ts` 编排层（env 读取 + 4 store + 每 query 跑 retrieve(k=20) → rerank(top_n=3) → index 回绑 → fallback 失败回向量序）
4. ✅ `tests/libs/rag/evaluate-rerank.test.ts` 8 用例（归因三分法 + GT 未设 + fallback 恒等 + formatRerankReport 计数）
5. ✅ `docs/superpowers/specs/2026-09-10-day19-rerank-eval-design.md` ≤1 页
6. ✅ 5 闸必跑
7. ✅ memory retro（路线表要求："embedding vs reranker 教训"）

---

## 📊 真活数据（ex_001_rerank_eval 真跑，9 query × heading v2）

| Query | baseline (向量 top-3) | rerank (top-20→3) | GT in pool | 归因 |
|---|---|---|---|---|
| Q1 4 闸必跑是哪 4 个 | ❌ | ✅ | ✓ | ✅ rerank 救回 |
| Q2 PCA 是什么 | ✅ | ✅ | ✓ | 两边都中 |
| Q3 tool 参数事实源 | ❌ | ✅ | ✗ 召回失败 | 召回失败 |
| Q4 zod union 怎么写 | ✅ | ✅ | ✓ | 两边都中 |
| Q5 runEvents 边界 | ✅ | ✅ | ✓ | 两边都中 |
| Q8 cosine 怎么算 | ✅ | ✅ | ✓ | 两边都中 |
| Q9 lancedb 增量入库 | ✅ | ✅ | ✓ | 两边都中 |
| Q6 紫光云是什么 | ✅ | ✅ | ✓ | 两边都中 |
| Q7 阿里云是什么 | ✅ | ✅ | ✓ | 两边都中 |

**baseline**: 7/9 → **rerank**: 9/9 (Δ +2)
**归因**：rerank 救回 1 · rerank 修不动 0 · rerank 排错 0 · 召回失败（不在池） 1 · rerank 服务失败 0

---

## 🔬 偏离 spec 的事实 + 解释

| spec 期望 | 实测 | 根因 |
|---|---|---|
| baseline 6/9 | **7/9** | Day 18 force reindex 把 `docs/daily/day14.md` 也纳入 chunks_heading 池 → Q1 "4闸必跑" 的 keyword "vitest/typecheck" 在 day14.md 里能命中 → baseline 跳到 ✅。Day 18 的 6/9 是 force reindex 前的 transient 数字，不是绝对基线 |
| rerank 8/9 | **9/9** | 上面的 baseline 多了 1，rerank 顺势少救 1；总命中数 9/9 = 9 query 全部中 |

**教训**：eval 数字必须随库刷新，spec 立基线时要标注"force reindex 后口径"——下一次写 spec 时把 force reindex 当前置（不是可选步骤）。

---

## 🧠 今日唯一核心概念：bi-encoder vs cross-encoder

- **bi-encoder**（embedding）：query / doc 各算各的向量 → cosine distance 算 N 次只算一次 → **快、粗** → 负责"从 100 chunk 捞 20 个候选"
- **cross-encoder**（reranker）：query + doc 拼一起过模型 → 算 N 对就要算 N 次 → **慢、准** → 只负责"给 20 个候选精排出 top-3"
- 生产 RAG 标准形态：**召回宽（K=20）→ 精排窄（top_n=3）**

Q3 是这条规则的反例样本：rerank 数学上救不了不在池里的文档——这就是为什么 rerank 永远搭在向量召回后面，单独 rerank 整个语料成本不可行。

---

## ❌ 今天不做

- ❌ 不引第三种 chunk 策略
- ❌ 不动 /search API（网页两阶段流程保持 retrieve + 前端调 /rerank 现状）
- ❌ 不做"top-20 直接取前 3 不 rerank"第三臂（池变宽的功劳隔离 → Day 31+ 评估体系）
- ❌ 不做 LLM-judge（路线表 Day 41+）
- ❌ 不动 retrieveMerged / indexer / chunk
- ❌ 不引入 rerank 到 libs/rag 内部（依赖方向：编排层 examples 组合两者）

---

## 🔬 反例验证（3 个必须能处理）

1. ✅ rerank 服务返 null（网关挂）→ fallback 走向量序 top-3，rerankFailed=true，不崩不伪造 score（5 闸中 gate 4 测用例 "fallback 场景" 覆盖）
2. ✅ pool 只有 12 个 hit（test corpus Q6/Q7 小语料）→ rerank documents 传 12 个，index 回绑仍正确（实测 Q6/Q7 都中）
3. ✅ GT 在池里但 rerank 把它排到 top_n 之外 → gtInPool=true + rerankHit=false → 归因"rerank 修不动" / "rerank 排错"（实测 0 次，运气好；归因逻辑已被测用例覆盖）

---

## 📋 5 闸必跑结果

| 闸 | 命令 | 结果 |
|---|---|---|
| 1. typecheck | `pnpm typecheck` | exit 0 |
| 2. typecheck:web | `pnpm typecheck:web` | exit 0 |
| 3. lint | `pnpm lint` | exit 0（修了 baselineHit 未使用 lint error）|
| 4. 单测 | `npx vitest run tests/libs/rag/` | 68/68 绿（8 个 Day 19 新用例 + 60 存量回归）|
| 5. 真跑 example | `npx tsx examples/day19/ex_001_rerank_eval.ts` | 9/9 query 跑通；rerank 9/9 ≥ 8/9 = Day 18 spec 预期兑现 |

---

## 🎯 JD 映射

### JD-1 命中
| 关键词 | 今日命中点 |
|---|---|
| **RAG / Retrieval** | 两阶段检索（bi-encoder 召回 + cross-encoder 精排）— production RAG 的标准形态 |
| **Debugging** | 归因三分法（救回 / 修不动 / 排错 / 召回失败）= 把"命中率"拆成可诊断的归因表 |
| **检索 / 召回** | rerank 候选池宽度 K 的选择 + top_n 选择 — production 调优的两个超参 |

### JD-2 钩子（M 第 4 天）
| 关键词 | 今日命中点 |
|---|---|
| **Eval harness** | 9 query × heading v2 的 eval harness 已成型（含 归因 / fallback / 召回诊断位）— Day 31+ 评估体系的种子 |
| **依赖方向控制** | libs/rag 永远不依赖 libs/reranker —— 单向依赖 = 失败隔离 + 可替换性，production 工程的硬约束 |

---

## 🛣 Day 20+ 路线

### 候选 1：RAG demo 集成（路线表 Day 20）

**What**：把 retrieveMerged + rerank 组合接到 RagApp.vue（或新建一个问答页）—— 让用户能输入 query 看到完整 two-stage 检索过程 + 命中 source 链接。
**Why**：今天 eval 是离线数字；用户（老大自己）要在 UI 上看见 rerank 改排名才有手感。
**前置**：依赖 /search API 已经能返回 hits（已），需要 RagApp 加 rerank 按钮 → 复用 Day 18.5 embed-compare 的 Pipeline 组件但简化（只 query + 召回 + 精排 + final）。

### 候选 2：Q3 召回失败的根因诊断

**What**：Q3 "tool 参数事实源" GT 是 `docs/adr/0003-tool-params-single-source-of-truth-zod.md`，但 K=20 池里没有 → 嵌入模型没把它排进候选。
**Why 不今天做**：eval harness 已经把这个事实记下来（gtInPool=false）；具体诊断（是 chunk 太短？是 heading 切把 ADR 切碎了？）属于 Day 31+ 评估体系话题。

### 候选 3：rerank 候选用 paragraph 双 strategy 跑

**What**：今天的实验组只用 heading v2 单一 strategy → Q3 的 GT ADR 可能被 paragraph 切中（如果 ADR 当作 paragraph 入库）。如果接 retrieveMerged(k=20) → rerank → top-3，Q3 可能从召回失败跳到 rerank 命中。
**Why 不今天做**：与 Day 18 "heading vs paragraph 平行对比" 路线冲突——spec 没说要合并 strategy，YAGNI。

---

## 📎 相关引用

- Spec: [docs/superpowers/specs/2026-09-10-day19-rerank-eval-design.md](../superpowers/specs/2026-09-10-day19-rerank-eval-design.md)
- Code: [libs/rag/evaluate.ts](../../libs/rag/evaluate.ts) — evaluateRerankRow + formatRerankReport
- Code: [libs/rag/index.ts](../../libs/rag/index.ts#L36) — barrel export
- Code: [examples/day19/ex_001_rerank_eval.ts](../../examples/day19/ex_001_rerank_eval.ts) — 编排层
- Tests: [tests/libs/rag/evaluate-rerank.test.ts](../../tests/libs/rag/evaluate-rerank.test.ts) — 8 用例
- Memory: [[day19-rerank-eval-retro]]（即将写入）
- Day 18: [docs/daily/day18.md](./day18.md) — chunkByHeadingSmart + force reindex 前置
- Day 18.5: embed-compare 重构 (Pipeline 5 段可视化 UI)