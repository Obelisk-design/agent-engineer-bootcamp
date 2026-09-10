# Day 20 — RAG demo 集成 + Q3 根因诊断 + retrieveMerged+rerank

> 日期：2026-09-10 · 状态：Approved（老大拍板：复用 embed-compare Pipeline UI / 先诊断再决定 / 3 候选全做）

## 一句话

把 Day 19 跑出的 9/9 数字**用到 UI 上**——让老大在网页上看见 retrieveMerged + rerank 的两阶段流程；同时诊断 Q3 召回失败（ADR 不在 K=20 池）的根因；并验 retrieveMerged+rerank 是否仍保 9/9 + 修 Q3。

## 三个交付物

1. **Q3 根因诊断**（不进 chunkByHeadingSmart 改 / 不动 ADR-specific 切法）：列 chunks_heading 表里 `source 含 docs/adr/` 的全部 chunk + GT ADR 全文 → 判"未入库 / 入库但切碎 / 切到 paragraph 池"三种病
2. **retrieveMerged + rerank 评估**：复用 Day 19 `evaluateRerankRow` / `formatRerankReport`，recall 来源改 `retrieveMerged(k=20, stores=双 strategy)`，rerank top_n=3 → 输出归因表 + Δ
3. **RagApp 两阶段 tab**：复用 Day 18.5 embed-compare 的 Pipeline 5 段组件，新 view `TwoStageView.vue` 挂到 `#/rag` → [两阶段检索] tab

## 改动清单

| 文件 | 改动 |
|---|---|
| `examples/day20/ex_001_diagnose_q3_recall.ts` | +遍历 chunks_heading 表，列出 `source.startsWith('docs/adr/')` 的全部 chunk + 跟 `docs/adr/0003-...md` 全文对比 + 同样列 paragraph 池 + 输出诊断（"未入库 / 入库但 heading 切到 0 段 / paragraph 切也碎"） |
| `examples/day20/ex_002_merged_rerank_eval.ts` | +复用 day19 evaluateRerankRow/formatRerankReport，retrieve 用 retrieveMerged(双 strategy, K=20) → rerank top_n=3 → 归因 + Δ vs Day 19 |
| `apps/web/src/views/RagApp.vue` | +`tabs` 加 `'两阶段检索'` → 新 view |
| `apps/web/src/views/TwoStageView.vue`（新）|+复用 embed-compare Pipeline 5 段组件（QueryComposer / PipelineStatus / EmbeddingPanel / VectorSpace / VectorSearchPanel / RerankerPanel / FinalResults）→ 单 [Analyze] 按钮 |
| `apps/web/src/views/SearchView.vue` | +`namespace` 改为 `'md'` 默认 / `'all'` 可选；'all' 走 retrieveMerged 双 strategy（Step 1 of Step 3 是 UI 拆，Step 3 走 retrieveMerged + rerank 全由 TwoStageView 接） |

**不改动**（红线）：`libs/rag/{retrieve,indexer,chunk,store}.ts` / `/search API` / `/rerank API` / `evaluate.ts`（保持纯函数）/ embed-compare 页面本身。

## 验证（5 闸）

| 闸 | 命令 | 通过线 |
|---|---|---|
| 1 | `pnpm typecheck` | exit 0 |
| 2 | `pnpm typecheck:web` | exit 0 |
| 3 | `pnpm lint` | exit 0 |
| 4 | `npx vitest run tests/` | 存量 68 全绿（如有 helper 新增则补） |
| 5a | `npx tsx examples/day20/ex_001_diagnose_q3_recall.ts` | 输出 ADR 池 chunk 列表 + 诊断结论 |
| 5b | `npx tsx examples/day20/ex_002_merged_rerank_eval.ts` | rerank 命中 ≥ Day 19 9/9；Q3 从召回失败桶升级为 ✅ |
| 5c | Chrome MCP：`#/rag` → [两阶段检索] → 输入 query → Pipeline 5 段全亮 → FinalResults 渲染 | console 0 error |

## 反例（5 个必须能处理）

1. Q3 诊断发现 ADR 未入库 → 诊断脚本直接打印 0 chunk，**不报错不伪造 0**
2. retrieveMerged 双 strategy → 同 doc 在 heading + paragraph 重复 → rerank documents 用 text 去重
3. UI query 空 → embed-compare EmptyState 复用（不重新发明）
4. UI 上 rerank 服务挂 → FinalResults 走 fallback 向量序 + 标"rerank skipped"（Day 19 语义延续）
5. UI namespace='all' 但两 strategy 池都空 → VectorSearchPanel 显示"0 hits" + EmptyState 提示

## 完成信号

- day20.md 收尾（含 3 个交付数据 + Q3 根因结论 + 是否返 Day 21 修切法）
- memory retro：retrieveMerged vs single-strategy 召回差异 + UI 复用 Pipeline 的复用边界教训
- ADR 不新增（依赖方向 Day 19 已立；retrieveMerged 已是 Day 16 决策）