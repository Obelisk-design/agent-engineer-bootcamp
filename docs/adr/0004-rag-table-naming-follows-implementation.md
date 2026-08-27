# 0004 — RAG table 命名必须以实现为准（spec 与 indexer 对称）

> **Status**: Accepted（Day 14 post-mortem）
> **Date**: 2026-08-27
> **Deciders**: 老大 + Claude

## Context

Day 14 实现 `examples/md_import/main.ts`（`TABLE_PREFIX = 'chunks_md'`）调用 `libs/rag/indexer.ts` 的 `incrementalIndexFromSources`，indexer 内部按 Day 13 RAG 设计写**双表**：`${prefix}_heading` + `${prefix}_paragraph`（再加 `${prefix}_meta`）。

但 Day 14 spec §2.2 / 计划 §R6.1 / docs 里写 `chunks_md` / `chunks_notion` **单表**，导致 [apps/api/src/rag-search.ts:38-41](../apps/api/src/rag-search.ts#L38-L41) 写的 `TABLE_BY_NAMESPACE` 配的是不存在的单表 → 真入库后 search 仍 0 hits。

落地查 grep 表名：

```bash
$ grep -rE 'chunks_md|chunks_notion' docs apps examples libs
docs/superpowers/specs/2026-08-26-day14-notion-md-rag-ui-design.md:46:   └─ chunks_md         ← 单表（错）
docs/superpowers/plans/2026-08-26-day14-notion-md-rag-ui.md:917:  - 写到 `.lancedb/rag/chunks_md`  ← 单表（错）
apps/api/src/rag-search.ts:39-40:  md: 'chunks_md'                       ← 单表（错）
examples/md_import/main.ts:36: const TABLE_PREFIX = 'chunks_md';          ← prefix 对，indexer 拼后缀
examples/notion_import/main.ts:49: const TABLE_PREFIX = 'chunks_notion';
docs/superpowers/specs/2026-08-25-notion-import-design.md:36:           ← 双表（对）
docs/superpowers/specs/2026-08-25-notion-import-runbook.md:34:           ← 双表（对）
```

**spec 错了，实现沿用 Day 13 双表设计是对的**。Day 14 spec 简写时丢了「双表 + 后缀」信息。

## Decision

**RAG table 命名 = `${prefix}_${strategy}` 双表（heading + paragraph），由 `libs/rag/indexer.ts` 单一事实源决定。Spec / plan / 调用方必须**对齐实现**，不能凭直觉简写为 `${prefix}`。

具体约束：

- **indexer**：保持 Day 13 双表设计不变。`tablePrefix` 入参是「不带 strategy 后缀的前缀」，内部拼 `${prefix}_heading` / `${prefix}_paragraph` / `${prefix}_meta` 三张表。
- **检索端**：`openVectorStore(uri, tableName)` 调用必须传**完整 tableName**（含 strategy 后缀），由 caller 知道要查哪个 strategy 表。Day 14 spec 误以为有「`chunks_md` 合并表」不存在 → 删。
- **CLI 直跑入口**（`examples/md_import/main.ts`）：只设 `tablePrefix`，不拼具体表名（indexer 负责拼）。
- **Day 14 修复**：[apps/api/src/rag-search.ts:42-44](../apps/api/src/rag-search.ts#L42-L44) `TABLE_BY_NAMESPACE` 配 `chunks_notion_heading` / `chunks_md_heading`。
- **未来扩展**：检索端只查 heading 表是 Day 14 YAGNI 决策（最少代码路径）。Day 15+ 要扩 paragraph 时，search handler 改成并行两 strategy 后合并 topK by score。届时 spec 应**显式列出**「heading + paragraph merge topK by score」约束。

## Consequences

**正面**：

- 调用方对齐实现方向（调用方稳定于库）—— Day 13 测试不变，Day 14 只改 rag-search.ts 一处
- Day 15+ 扩 paragraph 时，search handler 直接 `Promise.all` 双 strategy 即可，不动 indexer
- 命名规则统一：所有 `${prefix}_*` 表共享同一个 metadata 表（`${prefix}_meta`）

**负面**：

- spec §Day 14 当前写错 → 必须在 plan 文档 + spec 文档补「**实际表名 = `${prefix}_heading` / `${prefix}_paragraph`**」澄清
- 「search 只查 heading」是 Day 14 YAGNI 设计 —— **Day 14 后段已扩到 heading + paragraph 双 strategy + merge by score**（lance cosine distance 升序）。⚠️ 同一文本在 heading / paragraph 表里被重复入库（chunkByHeading 第一 chunk ≈ chunkByParagraph 第一段），search topK 会出现**同 chunkId 多次**（duplicate）。**Day 15+ 需 dedupe by chunkId + score min 合并**。
- 检索端 caller 必须知道「有 heading / paragraph 两个具体表」，认知负担 +1（vs 假设的「`chunks_md` 合并表」）

**反转条件**：

- 如果 Day 15+ 引 reranker 后想要「单表统一检索」语义（例如把 heading + paragraph 合并到同一 vector space），应改 indexer 写单表 + search 单表 —— 此 ADR 反转。届时同步更新本 ADR。

## Enforcement

- [ ] **CI grep guard**（待补 .github/workflows）：禁止 `chunks_md` / `chunks_notion` 单表名出现在代码里（除非明确指 `${prefix}_*` 前缀匹配）。
  ```bash
  # 应 0 命中（除 `${prefix}_` 后接字母下划线的合法用法外）
  grep -rE 'chunks_(md|notion)[^_a-zA-Z]' apps libs examples tests --include='*.ts'
  ```
- [x] **spec 同步**：[docs/superpowers/specs/2026-08-26-day14-notion-md-rag-ui-design.md](../superpowers/specs/2026-08-26-day14-notion-md-rag-ui-design.md) §2.2 / plan §R6.1 同步澄清「实际表 = 双表」
- [ ] **Day 15 路线**：明确「search paragraph merge by score」是 Day 15 候选，不在 Day 14 做

## Related

- ADR 0003（Tool params 单一事实源 zod schema）—— 同精神：单一事实源 = `libs/rag/indexer.ts` 实际写法，不是 spec 草稿
- Day 13 RAG 最小闭环（`chunks_heading` / `chunks_paragraph` 双表）
- Day 13.5 Notion import（`chunks_notion_heading` / `chunks_notion_paragraph` 双表）
- Day 14 RAG UI（[docs/daily/day14.md](../daily/day14.md) — R13/R14/R15/R16/R17 五条 fix）