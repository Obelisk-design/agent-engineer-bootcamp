# 2026-09-08 — Day 16 RAG merge + 评估闭环 design

> **Status**: Implemented (Day 16)
> **Date**: 2026-09-08
> **Deciders**: 老大 + Claude

## Context

`learning-route-corrected.md` 写 Day 16 = "Vector store 选型（lancedb 本地版）"——但 lancedb 本地版在 Day 13 已落地（[libs/rag/store.ts](../../libs/rag/store.ts) + [libs/rag/indexer.ts](../../libs/rag/indexer.ts) + 4 个 example）。Day 14 扩到 heading + paragraph 双 strategy（[ADR 0004](../adr/0004-rag-table-naming-follows-implementation.md)）。Day 15 收口 file_edit + ADR 0005。

**Day 16 真活盘点**：

1. **`evaluate.ts` 框架已写但 5 天没人跑**——`DEFAULT_EVAL_QUERIES` (Q1-Q7) + `judgeHit` + `buildReport` + `formatReport` 全在，但 Day 13-15 没 example 跑出第一份 report
2. **`retrieve()` 单 strategy 设计从未合并 heading + paragraph**——Day 14 ADR 0004 flag 过"heading + paragraph 重复入库"但 id 跨 strategy 不冲突（byteStart/byteEnd 不一致），真重复来源是 paragraph 切的 overlap + 跨 strategy 合并需求未实现
3. **路线漂移未记录**——[learning-route-corrected.md](../../../../../../../Users/zihai/.claude/projects/d--spaceObelish-spaceCode-playgroud-agent-agent-engineer-bootcamp/memory/learning-route-corrected.md) 第 105 行没考虑"用户提前完成路线任务"这种漂移

## Decision

### 1. `retrieveMerged(query, opts)` 新函数

签名：

```ts
interface RetrieveMergedOptions {
  k: number;
  stores: { heading: VectorStore; paragraph: VectorStore };  // 双 store，不是单 store
  embedFn?: (req, apiKey, chunkStrategy) => Promise<EmbedResult>;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

interface RetrieveMergedResult {
  query: string;
  hits: readonly SearchHit[];
  elapsedMs: number;
  headingHits: number;    // heading retrieve 返回的 hits 数
  paragraphHits: number;  // paragraph retrieve 返回的 hits 数
  deduped: number;        // 被 text 相等去重 drop 多少条
}
```

行为：

- 并行 `Promise.all([retrieve(heading), retrieve(paragraph)])`
- 用 `Map<text, SearchHit>` 按 text 相等去重（保留 score 最小那条）
- 按 score 升序取 topK

**dedupe key = `record.text`（不是 `record.id`）**：

- heading 切按 heading 边界 / paragraph 切按 \n\n 边界 + overlap → 跨 strategy id 不冲突
- paragraph 切内部 overlap 切出 text 尾部重复 → text 相等可识别
- 跨 strategy id 不会冲突，无 dedupe 价值

### 2. `examples/day16/ex_001_eval_pipeline.ts`

跑 `DEFAULT_EVAL_QUERIES`（Q1-Q7）→ 每条 query 跑 heading + paragraph 两种 strategy → `judgeHit` 判 hit/miss → `buildReport` + `formatReport` 出 Markdown 表 + JSON rows 调试输出。

**前置**：`examples/day13/ex_001_index_corpus.ts` 已跑过（`chunks_heading` / `chunks_paragraph` / `chunks_test_heading` / `chunks_test_paragraph` 4 张表都建好）。

**产物**：第一份 eval report 是 Day 17 调 chunk / Day 19 上 reranker 的 baseline。

### 3. `examples/day16/ex_002_merge_demo.ts`

同一 query 跑 3 次（heading only / paragraph only / `retrieveMerged`）→ 打印 hits 分布 + summary。直观对比合并价值。

**前置**：同 ex_001。

## Consequences

**正面**：

- 评估闭环从"有框架"变"有数据"——Day 17/19 调优有 baseline 对照
- `retrieveMerged` 把 Day 14 ADR 0004 留的"跨 strategy 合并"债显式收口
- 双 store 入参设计（`stores: { heading, paragraph }`）反映真 lancedb 双表现实，避免 mock 测试通过但真场景跑错的陷阱

**负面**：

- `RetrieveMergedOptions.embedFn` 签名比 `RetrieveOptions.embedFn` 多一个 `chunkStrategy` 参数——破坏性 API 变更
- `retrieveMerged` 接受双 store 破坏"单个 store"惯例——单测需要 mock 两个 store
- ex_001 真跑 7 query × 2 strategy = 14 次 embedding（依赖 dev 网关 + 真语料，单跑成本高）

**反转条件**：

- Day 19 上 reranker 后 `retrieveMerged` 的"score 全局排序"语义可能需要重做（reranker score vs cosine score 不同分布）
- 如果未来要支持 ≥3 strategy（heading / paragraph / sentence），需把 `stores` 改成 `Record<ChunkStrategy, VectorStore>`

## Enforcement

- [x] `retrieveMerged` 单测 7 用例（empty query / text 相等 dedupe / score 全局排序 / 空 hits / null input 边界）
- [x] `RetrieveMergedOptions` 双 store 入参 typecheck 保护
- [x] `evaluate.ts` 既有 API 不动（只调用 `judgeHit` / `buildReport` / `formatReport`）
- [x] ex_001 / ex_002 真跑通（不只 typecheck）
- [x] 5 闸：typecheck / typecheck:web / lint / test / 真跑两 example

## Related

- [ADR 0004](../adr/0004-rag-table-naming-follows-implementation.md) — 双 strategy 命名 + Day 16 合并债
- [ADR 0005](../adr/0005-agent-event-tool-call-start-end.md) — Day 15 tool_call_start/end（Day 16 不动）
- [libs/rag/retrieve.ts](../../libs/rag/retrieve.ts) — `retrieveMerged` 实现
- [libs/rag/evaluate.ts](../../libs/rag/evaluate.ts) — 既有评估框架（Day 16 调用）
- [examples/day16/ex_001_eval_pipeline.ts](../../examples/day16/ex_001_eval_pipeline.ts) — 评估 pipeline
- [examples/day16/ex_002_merge_demo.ts](../../examples/day16/ex_002_merge_demo.ts) — 合并 demo

## 不做（YAGNI）

- ❌ reranker（Day 19）
- ❌ 换 vector store / embedding 模型
- ❌ 改 chunk 策略（Day 18）
- ❌ 改 indexer schema / 加新 strategy
- ❌ 性能优化 / 缓存
- ❌ LLM-judge 评估（关键词命中够，NDCG 留给 Day 31+）
- ❌ report 存文件 / JSON 导出

## 反例（3 个必须能处理）

1. **跨 strategy 同 text + 不同 score** → 保留 score 最小那条（`record.text === record.text && h.score < existing.score`）
2. **跨 strategy 同 text + 相同 score** → Map 插入顺序稳定，第一条 wins，deduped += 1
3. **空 hits（query 没命中任何 chunk）** → `merged.hits = []`，`headingHits/paragraphHits = 0`，`deduped = 0`，不抛错（空检索是合法状态）
