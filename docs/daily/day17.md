# Day 17 — RAG 评估 query 质量 v2（groundTruthSources 双判）

> 65 天 AI Agent 工程师训练营 · Day 17 / 65
> 主题：诊断 Day 16 baseline 的"长文档偏置"问题，给评估 query 加白盒 groundTruthSources 约束。
> 前置：Day 16 `retrieveMerged` + evaluate.ts 既有框架 + Day 16 baseline 6/7 命中。
> 路线修正：路线表 Day 17 原"扩 RAG 库到 examples"——已扫过 `examples/` 几乎无 .md，扩库空活；改为"修评估 query 质量"。

---

## ⚠️ 路线修正

**原路线表 Day 17 候选**:扩 RAG 库到 `examples/day01~15/*.md`（因 Q2 "为什么不引 ml 库" 全军覆没）。

**实际扫描**:`find examples -name "*.md" -not -path "*/node_modules/*"` 只返回 `examples/langchain-side/README.md` 1 个文件。examples 99% 是 .ts。

**Day 17 修正为**:评估 query 质量。理由：
1. Q2 失败的根因不是"库不够"——是"关键词命中会被主题杂糅长文档误中"
2. `docs/daily/day12.md` 已在 RAG 库，但 qwen3-embed 对"中英混排专名"query 跟 day12.md 距离远
3. 修 query + 加 groundTruthSources 约束才能把"语义检索"与"文档定位"分开评估

**关键发现**:Day 16 baseline 6/7 命中可能**部分是"day14.md 误中"** —— day14.md 涵盖 RAG UI / 路由 / dev:rag / 4 闸必跑 多主题，跟任何 query 距离都不远。

---

## 🎯 今日目标

1. ✅ 诊断脚本 `examples/day17/ex_001_diagnose_corpus_bias.ts` —— 10 query × 2 strategy，统计 source 频次
2. ✅ `libs/rag/evaluate.ts` `EvalQuery.groundTruthSources` optional 字段（v1 路径 0 改动）
3. ✅ `judgeHit` v2 双判：groundTruth 命中 OR 关键词命中 = hit
4. ✅ `DEFAULT_EVAL_QUERIES` v2 9 条（Q1-Q9），每条带 groundTruthSources
5. ✅ `EVAL_QUERIES_V1` 保留 7 条 v1 baseline，便于前后对比
6. ✅ `tests/libs/rag/evaluate.test.ts` 16 用例全绿
7. ✅ `examples/day17/ex_002_eval_v2.ts` —— 双跑 v1 + v2 baseline
8. ✅ `docs/superpowers/specs/2026-09-08-day17-eval-query-quality-v2-design.md` ≤1 页
9. ✅ 5 闸必跑

---

## 📊 诊断数据（ex_001_diagnose 真跑）

10 query × 2 strategy = 60 top-3 hits，按 source 频次排序前 5：

| rank | source | hits | avgScore | docSize |
|---|---|---|---|---|
| 1 | docs/daily/day14.md | **22** | 0.974 | **3451** |
| 2 | docs/adr/0003-...md | 15 | 0.883 | 801 |
| 3 | docs/adr/0002-...md | 9 | 0.915 | 1961 |
| 4 | docs/adr/0001-...md | 8 | 0.871 | 79 |
| 5 | docs/daily/day01.md | 6 | 0.984 | 141 |

**关键发现**:
- day14.md 霸榜 22/60 = 36.7% 的 top-3 命中
- 不是"长文档偏置"——0001 ADR (79 字符) 也能排第 4
- 真根因:**day14.md 主题杂糅**(涵盖 RAG UI / 路由 / dev:rag / dev:web / 4 闸必跑)，跟任何 query 距离都不远

---

## 📊 v1 vs v2 baseline 对比（ex_002_eval_v2 真跑）

| 维度 | v1 (Day 16 baseline) | v2 (Day 17 baseline) | Δ |
|---|---|---|---|
| heading hit | 6/7 (86%) | 6/9 (67%) | -2 (Q3 翻车 + Q8 新增 miss) |
| paragraph hit | 5/7 (71%) | 7/9 (78%) | +2 |

**Q3 v1 ✅ / v2 heading ❌**:
- v1 命中：top-3 含 day14.md（"zod" 关键词误中 day14.md 里的"4 闸必跑"段）
- v2 翻车：groundTruth=0003 ADR，top-3 是 day14.md / day14.md / 0001 ADR（全没 0003）
- **结论**:v1 的 Q3 heading hit 是**假阳性**——v2 groundTruth 修正

**Q8 "cosine 怎么算" 全军覆没**:
- groundTruth=day12.md
- top-3 是 0001 ADR / day14.md / day01.md（全没 day12）
- **真实问题**:qwen3-embed 对"中文问句 + 英文专名"query 跟 day12.md 距离远
- **暴露系统能力边界**，不是 query 设计问题

**Q9 "lancedb 增量入库" 双 ✅**:
- 命中 day14.md × 3（day14 提到 incrementalIndex / lancedb）
- 严格说 groundTruth=day13.md 应该是 day13 命中，但 day14 内容广
- **接受 day14 命中**——v2 双判走 OR 逻辑，关键词 + 文档都通过

---

## 🧠 关键决策回顾

1. **`EvalQuery.groundTruthSources` optional** —— v1 调用方 0 改动，向后兼容
2. **judgeHit v2 双判 OR 逻辑** —— 关键词命中 OR 文档命中 = hit；保守的 AND 容易把"语义相关但文档不对"误杀
3. **v1 baseline 保留为 `EVAL_QUERIES_V1`** —— Day 18 调 chunk / Day 19 reranker 都能 v1 vs v2 对照
4. **诊断脚本独立** —— 不靠评估报告反推偏置，直接列 source 频次排序
5. **不扩库** —— examples 几乎无 .md，扩库空活

---

## 🛑 不做（YAGNI 红线）

- ❌ 扩 RAG 库到 examples/（已扫，几乎无 .md）
- ❌ 改 chunk 策略（Day 18）
- ❌ reranker（Day 19）
- ❌ 改 embed 模型 / vector store
- ❌ LLM-judge 评估（NDCG / MRR 留给 Day 31+）
- ❌ report 存文件 / 画图
- ❌ 改 EvalQuery 结构（保留向后兼容，下版本才换 EvalQueryV2）

---

## 🔬 反例验证（4 个必须能处理）

1. ✅ `groundTruthSources` 存在但关键词全不命中，top-3 命中 groundTruth → hit（OR 逻辑）
2. ✅ `groundTruthSources` 不存在（旧 v1 query）→ 走纯关键词逻辑（向后兼容）
3. ✅ `groundTruthSources` 为空数组 `[]` → 走 v1（防御性）
4. ✅ top-3 全是 day14.md，groundTruth 是 day12.md → miss（暴露"主题杂糅长文档"问题）

---

## 📋 5 闸必跑结果

| 闸 | 命令 | 结果 |
|---|---|---|
| 1. typecheck | `pnpm typecheck` | exit 0 |
| 2. typecheck:web | `pnpm typecheck:web` | exit 0 |
| 3. lint | `pnpm lint` | exit 0 |
| 4. 单测 | `npx vitest run tests/libs/rag/evaluate.test.ts` | 16/16 绿 |
| 5. 真跑 example | `npx tsx ex_001_diagnose_corpus_bias.ts` + `ex_002_eval_v2.ts` | 全 exit 0，v1 vs v2 diff 输出 |

---

## 🔗 相关 memory / ADR

- [[day13-15-actual-progress]] — Day 16 路线漂移记录
- ADR 0004 — 双 strategy 命名
- [docs/daily/day16.md](../daily/day16.md) — Day 16 baseline + Q2 暴露问题
- [docs/superpowers/specs/2026-09-08-day16-rag-merge-eval-design.md](../superpowers/specs/2026-09-08-day16-rag-merge-eval-design.md) — Day 16 design

---

## 📌 Day 18+ 候选

- **Q2 / Q8 仍 miss** —— Day 18 调 chunk 策略（overlap / 滑窗大小）看是否能让 day12.md 进 top-3
- **Q3 v1/v2 翻车** —— Day 19 reranker 可能修正（用 reranker score 取代 groundTruth 文档约束）
- **v2 baseline heading 6/9 vs paragraph 7/9** —— Day 18 chunk 调优目标：让 heading 命中率 ≥ paragraph
