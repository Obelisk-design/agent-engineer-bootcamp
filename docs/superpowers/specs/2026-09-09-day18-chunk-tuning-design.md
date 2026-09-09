# 2026-09-09 — Day 18 Chunking 调优（heading 二次切 + paragraph overlap 翻倍）design

> **Status**: Implemented (Day 18)
> **Date**: 2026-09-09
> **Deciders**: 老大 + Claude

## Context

Day 16 baseline + Day 17 评估 v2 暴露 heading 切命中率弱于 paragraph 切：
- heading v2 baseline **6/9**
- paragraph v2 baseline **7/9**

Day 17 retro §"Day 18+ 候选"明确：调 chunk 策略看 heading 命中率能否追平 paragraph。

**Day 18 探针**（`probe_day18_density.ts`）量化根因 —— day12.md chunk 关键词命中数：

| 关键词 | heading 切 | paragraph 切 | 差距 |
|---|---|---|---|
| `cosine` | 9 | **19** | 47% |
| `PCA` | 7 | **10** | 70% |

**真根因（探针证）**：heading 切里 [2] "## 🎯 今日目标"=1093字符、[3] "## 📦 今日产出物"=1636字符 这种**长 heading 段**把 cosine / PCA 关键词稀释到大量任务清单 / 路径字符串里。paragraph 切按 `\n\n` 切后单 chunk 更短，关键词密度高。

## Decision

### 1. 新增 `chunkByHeadingSmart`

```ts
export function chunkByHeadingSmart(
  md: string,
  source: string,
  sourceKind: SourceKind = 'daily',
  maxChars = 800,
  startOrdinal = 0,
): Chunk[]
```

行为：
- 先按 `chunkByHeading` 切出 heading 段（识别 `#`/`##`/`###`）
- 对每个 heading 段，若 text 长度 ≤ maxChars → 直接产出 chunk
- 若 text 长度 > maxChars → 走二次切：
  1. **优先按子 heading 边界二次切**（段内有 `###` 时按 `###` 切，子 chunk 带最近一级 `##` heading）
  2. **无子 heading 时按段落切**（按 `\n\n` 切，每段 ≤ maxChars）
  3. **二次切不加 overlap**（heading 子段本身是语义单元）
- ordinal 全局连续（接 startOrdinal）
- byteStart / byteEnd 仍定位回原文

`chunkByHeading` 旧签名不变（向后兼容，已有调用方）。

### 2. `chunkByParagraph` 默认 overlap 200 → 400

```ts
export function chunkByParagraph(
  md: string,
  source: string,
  sourceKind: SourceKind = 'daily',
  overlapChars = 400,  // 旧 200
  startOrdinal = 0,
): Chunk[]
```

调用方可显式覆盖 `overlapChars=200`（向后兼容），但 `indexer.ts` 不传 = 用新默认 400。

### 3. `indexer.ts` heading 切改新函数

```ts
const headingChunks = dropEmptyChunks(
  chunkByHeadingSmart(src.content, src.sourceLabel, src.sourceKind),  // 新函数
);
const paragraphChunks = dropEmptyChunks(
  chunkByParagraph(src.content, src.sourceLabel, src.sourceKind),  // overlap 用新默认 400
);
```

只改一行，无新参数。

## Consequences

**正面**：
- heading 切关键词密度预计向 paragraph 切看齐（80%+ 阈值）
- heading v2 baseline 预计 6/9 → ≥ 7/9
- paragraph 切 overlap 翻倍，跨滑窗语义保留更好（**预期**段落 v2 baseline 7/9 也升到 8/9）
- 不动 retrieve / evaluate / store 接口（评估框架 0 改动）

**负面**：
- `chunks_heading` 表必须重灌（force reindex）才能用新切法
- heading 切块数变多（day12.md 35 个 → 估 50+ 个），索引体积小涨
- `chunkByHeading` 与 `chunkByHeadingSmart` 行为分叉，旧调用方继续走旧（无回归）

**反转条件**：
- 如果 ex_002 真跑 heading 仍 6/9（说明密度不是问题根因）→ 接受 + 写 Day 19 reranker 候选
- 如果二次切把 Q3/Q4 命中变 miss → 改 `chunkByHeadingSmart` 默认 maxChars=1200 重跑

## Enforcement

- [x] `chunkByHeadingSmart` 实现 + 接受 maxChars 参数（默认 800）
- [x] `chunkByParagraph` overlapChars 默认 400
- [x] `indexer.ts` heading 切改新函数（一行）
- [x] `tests/libs/rag/chunk.test.ts` 加 6+ 用例（chunkByHeadingSmart + overlap 默认）
- [x] `examples/day18/ex_001_density_diff.ts` 真跑出 heading cosine / PCA 命中数 ≥ paragraph 80%
- [x] `examples/day13/ex_001_index_corpus.ts` force reindex exit 0
- [x] `examples/day18/ex_002_v2_baseline_after.ts` 真跑 heading v2 ≥ 7/9
- [x] 5 闸必跑全绿

## Related

- [libs/rag/chunk.ts](../../libs/rag/chunk.ts) — 新增 chunkByHeadingSmart + 默认 overlap
- [libs/rag/indexer.ts](../../libs/rag/indexer.ts#L410) — heading 切改新函数
- [tests/libs/rag/chunk.test.ts](../../tests/libs/rag/chunk.test.ts) — 新增测试
- [examples/day18/ex_001_density_diff.ts](../../examples/day18/ex_001_density_diff.ts) — 关键词密度探针
- [examples/day18/ex_002_v2_baseline_after.ts](../../examples/day18/ex_002_v2_baseline_after.ts) — v2 baseline 对比
- [examples/day13/ex_001_index_corpus.ts](../../examples/day13/ex_001_index_corpus.ts) — force reindex
- ADR 0004 — 双 strategy 命名（不动）

## 不做（YAGNI）

- ❌ 不加 sentence-level tokenizer
- ❌ 不动 embed 模型 / vector store
- ❌ 不引第三种 chunk 策略
- ❌ 不动 retrieve / evaluate / store 接口
- ❌ 不动 chunkByHeading 旧签名（仅追加新函数）
- ❌ 不做 fuzzy / soft dedupe（Day 19 reranker 议题）
- ❌ 不写 reranker

## 反例（4 个必须能处理）

1. heading 段 < maxChars（≤800）→ 不二次切，行为 = 旧 chunkByHeading
2. heading 段 > maxChars 且有 `###` 子结构 → 按 `###` 切，子 chunk 带最近 `##` heading
3. heading 段 > maxChars 且无子结构 → 按 `\n\n` 切，每段 ≤ maxChars
4. heading 段 > 2× maxChars → 多段切（不止切一次），ordinal 仍连续