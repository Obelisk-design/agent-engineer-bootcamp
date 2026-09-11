# STATUS.md — Day 22 跨日衔接

> 老大原话：**"今天干完所有的，明天周末不干，下周一又相隔时间太差，多agent全力猛干"**
> 日期：2026-09-11 (周五)
> 接力时间：2026-09-14 (周一) multi-agent 全力猛干

---

## ✅ 已交付（Day 22 周五完成）

#### 架构
- `libs/eval/` 7 个模块（schema / gt-loader / classify / run-corpus-eval / run-retrieval-eval / judge-llm / format-report + index barrel）
- `apps/web/src/views/eval/` 5 个 vue 全活（EvalOverview / EvalRunner / QueryDetail / CorpusProbe / BiasAnalysis + EvalApp 顶层）
- `apps/api/src/eval-server.ts` 6 条 API（corpus / retrieve / dataset / reports / corpus-stats / judge）
- `apps/api/src/eval-server-entry.ts` 独立 entry（端口 3202）
- `examples/day22/` 5 个 example 脚本（ex_000 ~ ex_005）
- `.lancedb/corporate/chunks_corporate_heading` 库已建（259 chunks / 0 fallback）
- `examples/day22/gt-dataset.json` v1（80 条 GT / 30 humanReviewed 占位）
- `examples/day22/reports/` 库构建 + 检索评测报告
- `docs/daily/day22.md` 3 关齐（docs / example / 怎么测）
- `docs/daily/screenshots/day22-eval-*.png` 5 张截图
- `docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md` spec 已 commit

#### 真活数字
- **库构建**：200 文件 → 135 文本 / 35 图片 / 30 空，259 chunks
- **GT 生成**：80 条候选 / 0 fail
- **检索评测**：recall@20 70.0% / final-hit 46.3% / judge 100% 失败（教训 #2）
- **三维度分类**：80 query 覆盖 5 大类 × factual 类型 × medium 难度

---

## ⏸️ TODO（周一第一件事，按 spec §10.2 优先级）

#### P0 — GT 集扩到 ≥ 150 条（spec §10.2 第 1 项）

**现状**：80 条（30 humanReviewed 占位 + 50 LLM 生成未审）。
**目标**：老大手工审前 30 条 + 新增 70 条 = 150+ 条。
**Why**：今天 80 条是跑通流程，质量不够。GT 集是 eval 的输入，GT 质量 = eval 质量。
**文件**：[examples/day22/gt-dataset.json](examples/day22/gt-dataset.json)

**具体操作**：
1. 打开 `gt-dataset.json`，前 30 条是"占位 humanReviewed"，**逐条核对** expectedAnswer 是否准
2. 修正完后 `updatedAt` 改成新时间（多人冲突取最新）
3. 用 `examples/day22/ex_001_generate_gt.ts` 生成更多候选 → 加到 gt-dataset.json → 标 humanReviewed=true
4. 校验：每条 expectedChunkIds 在 `chunks_corporate_heading` 表存在

#### P1 — 评测跑通全流程 + Chrome MCP 五页截图（spec §10.2 第 2 项）

**现状**：ex_003 跑了 1 次，judge 100% 失败（hardcode 模型名 bug 已修但没重跑）。
**目标**：周一第一件事 = 修完 judge 后重跑 ex_003，验证 recall@20 / final-hit / judge-avg 三个数字都拿到。
**Why**：今天没拿到 judge 数字，eval 闭环差一块。

**具体操作**：
```bash
# 跑完 ex_003
pnpm exec tsx examples/day22/ex_003_retrieval_eval.ts
# 看新数字（judge 应该不 0 了）
# 然后看 Chrome MCP 五页是否正常（评测运行页跑过，500 错是 dev:eval 没读 env）
pnpm dev:eval  # 独立跑，确保读到 .env
pnpm dev:web
# Chrome MCP 访问 http://127.0.0.1:5173/#/eval
```

#### P2 — 三维度标签一致性校正（spec §10.2 第 3 项）

**现状**：LLM 自动打标 + 我代老大占位标了 30 条 humanReviewed=true。
**目标**：老大周一过一遍三维度标签，确保跨条目的标签分布合理（spec §5）。
**Why**：标签一致性是 eval 维度 breakdown 的前提——不一致的标签会让"domain=it 比 admin 难"这种结论失效。

#### P3 — LLM Judge prompt 工程（spec §10.2 第 4 项）

**现状**：`judge-llm.ts` 是最小 prompt（直接问"对不对"）。
**目标**：周一调 prompt，加 few-shot + 评分细则（0/1 二值 + reasoning）。
**Why**：今天是 0/1 二值（spec §2 决策 5 默认方案），Day 41+ 上 0-5 分 + multi-judge ensemble。

#### P4 — 跨日对比报告（spec §10.2 第 5 项）

**现状**：`examples/day22/reports/retrieval-eval-*.json` 只有 1 个 run。
**目标**：周一做 2-3 个 run（不同 K、不同 strategy），写对比表（Day 22 baseline vs Day 23+ 优化后）。
**Why**：跨日对比是 eval 闭环的最后一块——只跑 1 次 eval 不知道"是变好了还是变差了"。

---

## 🔧 接口口子（已留好）

**前端的 page 已经在用 libs/eval 类型以外的独立 view 类型**（api.ts 的 `EvalQueryView` / `RetrievalEvalReportView`）—— 周一改 libs/eval 类型不会破 web。

**eval-server 6 条 API 契约稳定**——加新端点不用改 client 不用改 spec。

**gt-dataset.json schema 锁死**（EvalQuery / EvalDataset / QueryLabels / ChunkLabels / AnswerLabels 都在 libs/eval/schema.ts）—— 加 GT 不用改 schema。

**libs/eval/index.ts barrel** —— 周一多 agent 不用重新理解目录结构。

---

## 🚨 已知风险（spec §9.1）

1. **LLM 偏见**：GT 与被测都用 qwen3-8b，eval 信号会被稀释 → 后续若数字"看着太好"要警觉
2. **GT 质量债**：30 条占位是 LLM 生成 + 我代标 humanReviewed=true；老大周一必须重做这些
3. **跨日完成债**：今天越期写五页，五页功能"能加载"但 UI 简陋（不上 ui-ux pro max）

---

## 📂 文件清单（周一直接定位）

```
libs/eval/                                  # 7 模块 + index barrel
examples/day22/                             # 5 example 脚本
  ├── ex_000_index_corpus.ts
  ├── ex_001_generate_gt.ts
  ├── ex_002_corpus_eval.ts
  ├── ex_003_retrieval_eval.ts
  ├── ex_004_classify.ts
  └── ex_005_make_dataset_v1.ts
examples/day22/gt-raw.json                  # 80 条 LLM 生成（原始）
examples/day22/gt-dataset.json              # 80 条（30 占位 humanReviewed）v1
examples/day22/reports/                     # 跑出来的报告
apps/web/src/views/eval/                    # 5 个 vue
apps/api/src/eval-server.ts                 # 6 条 API
apps/api/src/eval-server-entry.ts           # 独立 entry
.lancedb/corporate/chunks_corporate_heading # 入库的库
docs/daily/day22.md                         # 今日 day doc
docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md  # spec
docs/daily/screenshots/day22-eval-*.png     # 5 张截图
```

---

## 🎯 周一 multi-agent 任务分配建议

| Agent | 任务 | 文件 |
|---|---|---|
| Agent-A | GT 集扩到 150 条 + 标签校正 | `gt-dataset.json` |
| Agent-B | 重跑 ex_003 + 跨日对比报告 | `examples/day22/ex_003_retrieval_eval.ts` + `reports/` |
| Agent-C | LLM Judge prompt 工程 + few-shot | `libs/eval/judge-llm.ts` |
| Agent-D | retrieveMerged 合并噪声修复（用真 GT 复现 Q1/Q3/Q8） | `libs/rag/retrieve.ts` |
| Agent-E | UI 抛光 + 添加真实图表 | `apps/web/src/views/eval/` |

**为什么这样分**：每个 agent 改的文件**不重叠**，避免 git contention（[[day-12-retro]] 教训）。

---

## 📞 周一第一句要问自己的话

> "spec §10.2 的 4 件事，按 GT 集 / eval 闭环 / 标签 / judge prompt 顺序，我今天干哪件？"

如果还有 spec 没看清的细节（chunkLabels array 还是单值？LLM Judge 阈值？），回头看 [docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md](../superpowers/specs/2026-09-11-rag-eval-platform-design.md) §5 §7。