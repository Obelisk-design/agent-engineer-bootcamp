# 2026-09-08 — Day 17 RAG 评估 query 质量 v2 (groundTruthSources 双判) design

> **Status**: Implemented (Day 17)
> **Date**: 2026-09-08
> **Deciders**: 老大 + Claude

## Context

Day 16 跑出第一份 baseline（heading 6/7 vs paragraph 5/7），但 Q2 "为什么不引 ml 库" 全军覆没暴露 baseline 真实性问题：关键词命中会被"主题杂糅长文档"误中。

**Day 17 诊断**（`examples/day17/ex_001_diagnose_corpus_bias.ts`）：

- 跑 10 query × 2 strategy = 60 top-3 hits
- Top-3 霸榜文档：`docs/daily/day14.md` (22/60 = 36.7%)，docSize=3451 字符
- 短文档 `0001 ADR` (79 字符) 也能进 top-3（8/60）—— **不是简单"长文档偏置"**
- 真根因：**day14.md 涵盖 RAG UI / 路由 / dev:rag / dev:web / 4 闸必跑** —— 主题杂糅长文档，跟任何 query 距离都不远

**结论**：v1 baseline 的 6/7 命中可能**部分是"day14 误中"**。需要白盒 groundTruthSources 约束把"语义检索"与"文档定位"分开评估。

## Decision

### 1. `EvalQuery` 加 optional `groundTruthSources`

```ts
interface EvalQuery {
  // ...既有字段
  readonly groundTruthSources?: readonly string[];  // Day 17 新增
}
```

- 不存在 → 走 v1 关键词逻辑（向后兼容，旧代码 0 改动）
- 存在且非空 → 走 v2 双判
- 存在但为空数组 → 走 v1 关键词逻辑（防御性）

### 2. `judgeHit` v2 双判

```ts
function judgeHit(query, hits, k = 3): boolean {
  // v2 路径：groundTruthSources 存在时双判（关键词 OR 文档命中）
  if (query.groundTruthSources !== undefined && query.groundTruthSources.length > 0) {
    const docHit = top.some((h) => query.groundTruthSources.includes(h.record.source));
    const kwHit = judgeByKeywords(query, top);
    return docHit || kwHit;
  }
  // v1 路径：纯关键词（向后兼容）
  return judgeByKeywords(query, top);
}
```

### 3. `DEFAULT_EVAL_QUERIES` v2 9 条（vs v1 7 条）

| ID | query | groundTruthSources | 改 v1 原因 |
|---|---|---|---|
| Q1 | "4 闸必跑是哪 4 个" | `day12.md`, `day14.md` | v1 命中 ✅ 保留；加 groundTruth 防"其他大文档误中" |
| Q2 | "PCA 是什么" | `day12.md` | v1 "为什么不引 ml 库"语义远，改问"是什么" |
| Q3 | "tool 参数事实源" | `0003 ADR` | v1 命中 day14.md（zod 关键词误中），v2 groundTruth=0003 修正 |
| Q4 | "zod union 怎么写" | `0003 ADR` | v1 heading ✅ paragraph ❌，保留给 Day 18 调 chunk 留 baseline |
| Q5 | "runEvents 边界" | `0002 ADR` | v1 命中 ✅ 保留；扩 keyword `caller` |
| Q6 | "紫光云是什么" | `test-corpus/紫光云.md` | v1 命中 ✅ 保留 |
| Q7 | "阿里云是什么" | `test-corpus/aliyun.md` | v1 命中 ✅ 保留 |
| **Q8** | "cosine 怎么算" | `day12.md` | v1 无；覆盖 day12 内容 |
| **Q9** | "lancedb 增量入库" | `day13.md` | v1 无；覆盖 day13 内容 |

### 4. `EVAL_QUERIES_V1` 保留为 export

v1 baseline 7 条 query 保留在 `EVAL_QUERIES_V1` 常量里，`ex_002_eval_v2.ts` 双跑 v1 + v2 出 diff。

### 5. `examples/day17/ex_001_diagnose_corpus_bias.ts` 诊断脚本

10 query × 2 strategy = 60 hits → 按 source 统计"被命中频次 + 平均 score + docSize" → 排序看"霸榜 top-K 的文档"。

## Consequences

**正面**：

- 评估 query 质量提升：v2 的 `groundTruthSources` 把"语义检索"和"文档定位"分开
- v1 baseline 保留为 export，便于前后对比
- judgeHit v2 双判覆盖原 v1 行为（向后兼容 0 改动）
- 诊断脚本可复跑，独立验证"长文档偏置"假设

**负面**：

- v2 命中率比 v1 低（heading 6/9 vs 6/7）—— **更严的评估 = 暴露更多问题**（不是坏事）
- Q2 / Q8 仍 miss —— 真实暴露"qwen3-embed 在小语料 + 中英混排专名"的能力边界
- EvalQuery 加 optional 字段，**未来 v3 不能再加 optional 字段**（应改 `EvalQueryV2` 接口 + 保留 v2）—— 渐进设计 token 用尽

**反转条件**：

- Day 19 上 reranker 后，可考虑用 reranker score 取代 groundTruth 文档约束
- 文档量足够大（> 100 docs）后 groundTruthSources 价值降低

## Enforcement

- [x] `EvalQuery.groundTruthSources` optional，向后兼容
- [x] `judgeHit` v1 路径 0 改动
- [x] `EVAL_QUERIES_V1` export 保留 v1 baseline
- [x] 16 单测全绿（v1 5 用例 + v2 5 用例 + 数据契约 4 + v1 备份 2）
- [x] ex_001_diagnose 真跑出"day14 霸榜 22/60"事实
- [x] ex_002_eval_v2 真跑出 v1 vs v2 baseline diff

## Related

- [libs/rag/evaluate.ts](../../libs/rag/evaluate.ts) — judgeHit v2 实现
- [tests/libs/rag/evaluate.test.ts](../../tests/libs/rag/evaluate.test.ts) — 16 用例
- [examples/day17/ex_001_diagnose_corpus_bias.ts](../../examples/day17/ex_001_diagnose_corpus_bias.ts) — 诊断脚本
- [examples/day17/ex_002_eval_v2.ts](../../examples/day17/ex_002_eval_v2.ts) — 双跑 baseline
- [ADR 0004](../adr/0004-rag-table-naming-follows-implementation.md) — 双 strategy 命名
- [docs/daily/day16.md](../daily/day16.md) — Day 16 baseline + Q2 暴露问题

## 不做（YAGNI）

- ❌ LLM-judge 评估（NDCG / MRR 留给 Day 31+）
- ❌ 改 chunk 策略（Day 18）
- ❌ reranker（Day 19）
- ❌ 扩 RAG 库到 examples/（已确认 examples 几乎无 .md）
- ❌ 改 embed 模型 / vector store
- ❌ report 存文件 / 画图
- ❌ 改 EvalQuery 结构（保留向后兼容，下版本才换 EvalQueryV2）

## 反例（3 个必须能处理）

1. **`groundTruthSources` 存在但关键词全不命中，top-3 命中 groundTruth** → hit（OR 逻辑，单测覆盖）
2. **`groundTruthSources` 不存在（旧 v1 query），走纯关键词逻辑** → 向后兼容（单测覆盖）
3. **`groundTruthSources` 为空数组 `[]`** → 走 v1（防御性，单测覆盖）
4. **top-3 全是 day14.md，groundTruth 是 day12.md** → miss（暴露"主题杂糅长文档"问题，Q2 / Q8 真实命中）
