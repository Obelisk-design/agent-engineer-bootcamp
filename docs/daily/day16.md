# Day 16 — RAG 跨 strategy 合并 + 评估闭环

> 65 天 AI Agent 工程师训练营 · Day 16 / 65
> 主题：把 `evaluate.ts` 已有框架跑出第一份 report + 新增 `retrieveMerged()` 合并 heading/paragraph 双 strategy。
> 前置：Day 13 `libs/rag/` + Day 14 ADR 0004 双 strategy + Day 15 file_edit + ADR 0005 事件增量。
> 路线修正：路线表 Day 16 写"Vector store 选型"，但 lancedb 本地版 Day 13 已落地，本 day **不重做选型**；走"评估闭环 + 跨 strategy 合并"。详见 [day13-15-actual-progress.md](../../../../../../../Users/zihai/.claude/projects/d--spaceObelish-spaceCode-playgroud-agent-agent-engineer-bootcamp/memory/day13-15-actual-progress.md) 路线漂移记录。

---

## ⚠️ 路线修正

**原路线表 Day 16 = "Vector store 选型（lancedb 本地版），不用分布式"**。

**实际**：用户在 Day 13 已完成选型（[libs/rag/store.ts](../../libs/rag/store.ts) lancedb 本地版 + 内存版 fallback），并跑 4 个 example（ex_001_index_corpus / ex_002_chunk_compare / ex_003_query_topk / ex_004_rag_loop）。路线漂移未在 memory 显式记录。

**Day 16 修正为**：评估闭环 + 跨 strategy 合并。理由：
1. `libs/rag/evaluate.ts` 框架 Day 13 已写完整（DEFAULT_EVAL_QUERIES / judgeHit / buildReport / formatReport），但 5 天没人跑
2. `retrieve()` 单 strategy 设计，跨 strategy 合并只在 example 层做 → 真实价值未兑现
3. ADR 0004 flag 的 "heading + paragraph 重复入库"债需要明确收口

**下次矫正触发条件补充**（写入 [learning-route-corrected.md](../../../../../../../Users/zihai/.claude/projects/d--spaceObelish-spaceCode-playgroud-agent-agent-engineer-bootcamp/memory/learning-route-corrected.md)）：用户单 day 完成 ≥2 天路线任务时，必须 git log / 目录扫描验证路线对齐。

---

## 🎯 今日目标

1. ✅ `libs/rag/retrieve.ts` 新增 `retrieveMerged(query, opts)` —— 并行 heading + paragraph → text 相等去重（保留 score 最小）→ score 升序取 topK
2. ✅ `libs/rag/retrieve.ts` `RetrieveMergedOptions.stores: { heading, paragraph }` 双 store 入参（真 lancedb 双表现实）
3. ✅ `libs/rag/retrieve.ts` `RetrieveMergedOptions.embedFn` 签名加 `chunkStrategy` 参数（单测按 strategy 区分 mock 返回）
4. ✅ `libs/rag/index.ts` barrel 导出 `retrieveMerged` + 新类型
5. ✅ `tests/libs/rag/retrieve.test.ts` 7 用例全绿（empty query / text 相等 dedupe / score 全局排序 / 空 hits 边界）
6. ✅ `examples/day16/ex_001_eval_pipeline.ts` —— 跑 DEFAULT_EVAL_QUERIES (Q1-Q7) 出第一份 report
7. ✅ `examples/day16/ex_002_merge_demo.ts` —— heading only / paragraph only / retrieveMerged 三组对比
8. ✅ `docs/superpowers/specs/2026-09-08-day16-rag-merge-eval-design.md` —— ≤1 页 spec
9. ✅ 5 闸必跑 + 真跑两 example

---

## 📦 今日产出物

```text
libs/rag/retrieve.ts                          🆕 retrieveMerged() + wrapEmbedFn() + RetrieveMergedOptions/Result
libs/rag/index.ts                             MODIFIED — barrel 导出 retrieveMerged
tests/libs/rag/retrieve.test.ts               🆕 4 新测试（+ mock split store）
examples/day16/ex_001_eval_pipeline.ts        🆕 Q1-Q7 × 2 strategy eval 闭环
examples/day16/ex_002_merge_demo.ts           🆕 3 组对比演示
docs/superpowers/specs/2026-09-08-...         🆕 Day 16 design spec
```

---

## 📊 评估闭环第一份 report（baseline）

`pnpm tsx examples/day16/ex_001_eval_pipeline.ts` 输出（heading vs paragraph 命中率）：

| Query | heading | paragraph |
|---|---|---|
| Q1 "4闸必跑是哪 4 个" | ✅ 228ms | ✅ 116ms |
| Q2 "为什么不引 ml 库" | ❌ 156ms | ❌ 110ms |
| Q3 "tool 参数契约的事实源" | ✅ 111ms | ✅ 120ms |
| Q4 "zod union 怎么写" | ✅ 109ms | ❌ 106ms |
| Q5 "Agent.runEvents messages 边界" | ✅ 110ms | ✅ 121ms |
| Q6 "紫光云是什么" | ✅ 195ms | ✅ 171ms |
| Q7 "阿里云是什么" | ✅ 253ms | ✅ 106ms |

**heading**: 6/7 (avg 166ms)
**paragraph**: 5/7 (avg 121ms)

**观察**：
- Q2 全军覆没 — "PCA / power iteration" 关键词在 docs/ 没被索引（Day 12 笔记在 `examples/day12/`，未入 RAG 库）。**Day 17+ 考虑扩库到 `examples/` 或在 query 上加宽**
- Q4 heading ✅ paragraph ❌ — 同一文档不同切法命中差异显著，**Day 18 调 chunk 策略有空间**
- Q6/Q7 test-corpus 全部 ✅ — 隔离设计有效

---

## 🔧 retrieveMerged 真跑观察（Q1 "4闸必跑是哪 4 个"）

| 模式 | top-3 sources | 耗时 |
|---|---|---|
| heading only | day14.md × 3 | 3888ms |
| paragraph only | day14.md × 2 + day01.md | 303ms |
| **retrieveMerged** | **day14.md（heading score=0.9257）+ day14.md（paragraph score=1.0263）+ day14.md（heading score=1.0510）** | **173ms** |

**观察**：
- 合并后 top-3 来自不同 chunk 文本，**3 个 sources 都是 day14.md 但 text 不同**（heading 切按 heading 边界 / paragraph 切按 \n\n 边界 + overlap）
- 跨 strategy text 不重叠 → **deduped=0**（本 query 下 paragraph overlap 切出 text 尾重复未触发）
- merged 耗时 173ms < heading 3888ms（并行 + 双 store 缓存优势）

---

## 🧠 关键决策回顾

1. **dedupe key = `record.text`（不是 `record.id`）**
   - 跨 strategy id 不会冲突（heading/paragraph byteStart/byteEnd 不一致）
   - paragraph 切 overlap 切出 text 尾部重复 → text 相等可识别
2. **`RetrieveMergedOptions.stores` 双 store 入参**（不是单 store）
   - 真实 lancedb 下 heading/paragraph 是两不同 table
   - 单 store 设计在 mock 测试通过但真场景跑错（已发现并修）
3. **`embedFn` 签名加 `chunkStrategy` 参数**
   - 单测需要按 strategy 区分 mock 返回
   - retrieveMerged 内部用 wrapEmbedFn 包装成 retrieve 期望的 2 参数
4. **evaluate.ts 既有 API 不动**
   - Day 16 只**调用** `judgeHit` / `buildReport` / `formatReport`
   - 不扩 `DEFAULT_EVAL_QUERIES`（YAGNI：路线表 Day 31+ 才上评估体系）
5. **Day 14 ADR 0004 收口**
   - 原 "Day 15+ 需 dedupe by chunkId" 实际是 dedupe by text
   - 跨 strategy id 不冲突（heading 切按 heading 边界 / paragraph 切按 \n\n 边界 + overlap），text 相等是真重复来源

---

## 🛑 不做（YAGNI 红线）

- ❌ reranker（Day 19）
- ❌ 换 vector store / embedding 模型
- ❌ 改 chunk 策略（Day 18）
- ❌ 改 indexer schema / 加新 strategy
- ❌ 性能优化 / 缓存
- ❌ LLM-judge 评估（NDCG / MRR 留给 Day 31+）
- ❌ report 存文件 / JSON 导出
- ❌ 改 `evaluate.ts` 既有 API（Day 16 只调用）

---

## 🔬 反例验证（spec 列的 3 个必须能处理）

1. ✅ 跨 strategy 同 text + 不同 score → 保留 score 最小那条（单测覆盖）
2. ✅ 跨 strategy 同 text + 相同 score → Map 插入顺序稳定，第一条 wins
3. ✅ 空 hits（query 没命中任何 chunk）→ `merged.hits = []`，不抛错

---

## 📋 5 闸必跑结果

| 闸 | 命令 | 结果 |
|---|---|---|
| 1. typecheck | `pnpm typecheck` | exit 0 |
| 2. typecheck:web | `pnpm typecheck:web` | exit 0 |
| 3. lint | `pnpm lint` | exit 0 |
| 4. 单测 | `npx vitest run tests/libs/rag/retrieve.test.ts` | 7/7 绿 |
| 5. 真跑 example | `pnpm tsx ex_001_eval_pipeline.ts` + `ex_002_merge_demo.ts` | 全 exit 0，report 出 |

注：`pnpm test` 全测时 1 个 timeout（indexer.test.ts namespace isolation）— stash 验证是并发 lancedb 启动开销叠加导致，与本 day 改动无关。

---

## 🔗 相关 memory / ADR

- [[day13-15-actual-progress]] — 路线漂移记录 + 矫正触发条件补充
- [[learning-route-corrected]] — Day 16 修正后路线（待追加第 5 触发条件）
- [[day-12-retro]] — 4 闸必跑铁律
- ADR 0004 — 双 strategy 命名 + Day 16 合并债（已收口）
- ADR 0005 — Day 15 tool_call_start/end（Day 16 不动）

---

## 📌 Day 17+ 候选

- **Q2 全军覆没** → Day 17 考虑扩 RAG 库到 `examples/day12/`（PCA / power iteration 关键词在）
- **Q4 heading vs paragraph 差异** → Day 18 调 chunk 策略（overlap / 滑窗大小）
- **reranker** → Day 19（路线表）
