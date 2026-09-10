# Day 19 — Reranker 进主链路：two-stage retrieval 评估闭环

> 日期：2026-09-10 · 状态：Approved（老大拍板：rerank 独立一层 / K=20 / 实验组 = heading v2）

## 一句话

昨天在网页上"看见"了 rerank 改排名；今天用数字回答：**rerank 能把 v2 命中率从 6/9 提到几？功劳归谁（rerank 还是召回池变宽）？**

## 核心概念（今日唯一）

- **bi-encoder**（embedding）：query / doc 各算各的向量 → 快、粗 → 负责"从 100 chunk 捞 20 个候选"
- **cross-encoder**（reranker）：query + doc 拼一起过模型 → 慢、准 → 只负责"给 20 个候选精排出 top-3"
- 生产 RAG 标准形态 = **召回宽（K=20）→ 精排窄（top_n=3）**

## 架构决策（已拍板）

**rerank 独立一层，`libs/rag` 永远不 import `libs/reranker`。**
依赖方向单向：编排方（examples/day19 脚本）同时 import 两者。
- 好处 1：rerank 挂了 search 照返向量 top-K（Day 18.5 网页已验证的"失败不破流程"）
- 好处 2：换 rerank 模型 / 换 cross-encoder 实现，`libs/rag` 零改动
- 不触发 ADR 0004 反转条件（没有"单表统一检索"语义，双表不动）

## 设计：两臂 + 诊断位（不加第三臂）

| 臂 | 流程 | 回答 |
|---|---|---|
| 对照 | `retrieve(heading, k=3)` 的 top-3 → judge | 基线 6/9 |
| 实验 | `retrieve(heading, k=20)` 池 → `rerank(top_n=3)` → judge | 完整形态几命中 |
| 诊断位 | 实验组每条 query 记 `gtInPool`（GT source 在不在 top-20 池） | 归因 |

**归因三分法**（实验组 per query）：
- 在池 + baseline miss + rerank hit → **rerank 的功劳**
- 在池 + rerank 也 miss → rerank 修不动，留线索
- 不在池 → rerank 数学上救不了（只能重排池内）→ miss 算 embedding 的账

"池变宽值多少分"第三臂 → 记 TODO 推 Day 31+（YAGNI，变量隔离属于评估体系话题）。

## 改动清单

| 文件 | 改动 |
|---|---|
| `libs/rag/evaluate.ts` | +`RerankFn` 类型（自定义，不引 libs/reranker 类型）+`evaluateRerankRow(query, poolHits, finalHits, k=3) → RerankEvalRow`（baselineHit / rerankHit / gtInPool / rerankFailed）+`formatRerankReport(rows)`（markdown 表 + 归因计数 + Δ 行）。**纯函数，可 mock 单测** |
| `examples/day19/ex_001_rerank_eval.ts` | 编排层：env 读取 + 4 store 打开（同 day18/ex_002 骨架）+ 每 query 跑 retrieve(k=20) → `rerank()` → index 回绑 pool hits → fallback（rerank 返 null → 向量序 top-3，**不伪造 score**）→ `evaluateRerankRow` → 打印 |
| `tests/libs/rag/evaluate-rerank.test.ts` | 新：`evaluateRerankRow` 归因三分法 3 用例 + GT 未设 gtInPool=null + formatRerankReport 输出断言 |
| `docs/daily/day19.md` | 按模板写（§JD 映射必填） |

**不改动**（红线）：`retrieve.ts` / `indexer.ts` / `chunk.ts` / `rag-search.ts`（/search 保持纯召回，网页两阶段流程不受影响）/ web embed-compare。

## 验证（5 闸）

| 闸 | 命令 | 通过线 |
|---|---|---|
| 1 | `pnpm typecheck` | exit 0 |
| 2 | `pnpm typecheck:web` | exit 0 |
| 3 | `pnpm lint` | exit 0 |
| 4 | `npx vitest run tests/libs/rag/` | 新用例绿 + 存量不回归 |
| 5 | `npx tsx examples/day19/ex_001_rerank_eval.ts` | 9 query 跑通；判定：rerank ≥ 8/9 = Day 18 预期兑现；6-7/9 = 部分兑现看归因；≤5/9 = rerank 无效，结论写 memory |

## 反例（3 个，实现必须能处理）

1. rerank 服务返 null（网关挂）→ 该 query 走 fallback，rerankFailed=true，rerankHit 按向量序算，不崩不伪造
2. pool 只有 5 个 hit（test corpus 小）→ rerank documents 传 5 个，index 回绑仍正确
3. GT 在池里但 rerank 把它排到 top_n 之外 → gtInPool=true + rerankHit=false → 归因"rerank 修不动"，不误报为召回失败

## 完成信号

- 数字 + 归因表进 day19.md
- retro 写 memory（路线表要求：embedding vs reranker 教训）
- ADR：不新增（依赖方向是常规分层，非反直觉决策——若实现中发现"该不该放 rag-server"有争议再补）
