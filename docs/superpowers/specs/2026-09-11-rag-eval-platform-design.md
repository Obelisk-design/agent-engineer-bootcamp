# Day 22 — RAG 评测平台设计（Eval Harness + 三维度分类 + 五页 Web UI）

> 日期：2026-09-11
> 状态：**老大已拍板、正在写实现**
> 前置：Day 19 rerank eval 闭环 + Day 20 retrieveMerged 噪声诊断 + Day 21 200 份多格式语料 + RAG-ready pipeline

---

## 0. TL;DR

今天把"评测"从一次性脚本升级为**平台**：

1. **Eval Harness**（`libs/eval/`）—— 双套评测：库构建质量 + 端到端检索/答案质量
2. **Ground Truth QA 集**（`examples/day22/gt-dataset.json`）—— LLM 生成 + 老大人工修正
3. **三维度分类体系**（`libs/eval/classify.ts`）—— query / chunk / answer 全维度标签
4. **五页 Web UI**（`apps/web/src/views/eval/`）—— 总览 / 评测运行 / 查询详情 / 库探针 / 偏差分析

---

## 1. Context

### 1.1 现有基础（Day 19-21 已交付）

| 模块 | 路径 | 能力 |
|---|---|---|
| RAG-ready pipeline | [examples/day21/rag-ready/](examples/day21/rag-ready/) | 200 份多格式语料 → 259 chunks → 98897 tokens |
| Retrieve + rerank | [libs/rag/retrieve.ts](libs/rag/retrieve.ts) + [libs/reranker/rerank.ts](libs/reranker/rerank.ts) | retrieve(K=20) → rerank(top_n=3) |
| Eval harness seed | [libs/rag/evaluate.ts](libs/rag/evaluate.ts) | 归因 5 桶（救回 / 修不动 / 排错 / 召回失败 / 服务失败）|
| RagApp UI | [apps/web/src/views/RagApp.vue](apps/web/src/views/RagApp.vue) | tabs: 搜索 / 入库 / 两阶段检索 |

### 1.2 缺口（Day 22 解决的问题）

1. **评测是一次性脚本**——Day 19 / Day 20 各跑一次，数字没沉淀，没法跨日对比
2. **GT 只有 9 个 query**——Day 18 / Day 19 的 `DEFAULT_EVAL_QUERIES` 是手工写的，规模太小
3. **没有分类体系**——只看聚合分数，看不出"是 query 难还是 chunk 难"
4. **Web UI 没有评测页**——只能跑 CLI 看数字，看不见
5. **没有库构建质量评测**——只看检索 recall，不知道"是不是切错了"

---

## 2. Decision（已老大拍板，9 个关键开关）

| # | 决策 | 老大拍板 | 理由 / 风险 |
|---|---|---|---|
| 1 | 评测对象边界 | **两套都建**：库构建质量 + 端到端检索/答案 | 能交叉定位"切错了" vs "检错了" |
| 2 | Eval 核心产物 | **Ground Truth QA 集 + 自动评分** | 黄金标准，可跨日对比 |
| 3 | GT 来源 | **LLM 生成 + 人工修正** | 快 + 可修正 |
| 4 | GT 生成器 | **都用 qwen3-8b**（同模型，调试期）| 零额外成本；**风险**：LLM 偏见——GT 与被测同模型，eval 信号会被稀释。**缓解**：spec 里把这个风险写明，后续若数字"看着太好"要警觉 |
| 5 | 分类维度 | **query / chunk / answer 三维度全量** | 覆盖完整；但工作量爆炸 |
| 6 | Web UI 范围 | **五页全量** | 总览 + 运行 + 详情 + 探针 + 偏差 |
| 7 | 跨日策略 | **今日越期、五页全量写** | 老大 hard commit；明早 + 周末不干 |
| 8 | 跨日衔接 | **今天干完所有，明天周末不干，下周一 multi-agent 全力猛干** | "下周一多 agent 猛干"是 hard commit，今天就要把口子留好 |
| 9 | GT 规模 | **50-80 条**（30 人写 + 30-50 LLM 生成）| 老大未拍精确数字，按"够覆盖三维度 × 5 大类"估算 |

---

## 3. Architecture

### 3.1 总览

```
                          ┌───────────────────────┐
                          │   libs/eval/          │
                          │   (eval harness)      │
                          │                       │
                          │  - gtLoader           │
                          │  - classify (3 维度)  │
                          │  - runCorpusEval      │
                          │  - runRetrievalEval   │
                          │  - formatReport       │
                          │  - judgeLLM           │
                          └─────────┬─────────────┘
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
   libs/rag/              libs/reranker/          libs/embedding/
   (retrieve)             (rerank)                (embed)
              │                     │                     │
              └────────── libs/rag (zero-dep) ───────────┘
                                    │
                                    ▼
                          apps/web/src/views/eval/
                          - EvalOverview.vue   (总览)
                          - EvalRunner.vue     (运行)
                          - QueryDetail.vue    (查询详情)
                          - CorpusProbe.vue    (库探针)
                          - BiasAnalysis.vue   (偏差分析)
                                    │
                                    ▼
                          apps/api/src/routes/eval.ts
                          - POST /eval/corpus    (库构建评测)
                          - POST /eval/retrieve  (检索评测)
                          - GET  /eval/dataset   (GT 集)
                          - GET  /eval/reports   (历史报告)
                          - POST /eval/judge     (LLM Judge)
```

### 3.2 依赖方向（**硬约束**）

- `libs/eval` → `libs/rag` / `libs/reranker` / `libs/embedding` / `libs/llm`（编排层，组合所有底层）
- `libs/rag` → **不依赖** `libs/reranker`（Day 19 铁律）
- `libs/rag` → **不依赖** `libs/eval`（避免循环）
- `apps/web` → `libs/eval` 通过 API 调用，**不直接 import**（web 不嵌 eval 逻辑）

**Why**：lib 层 zero 依赖，编排层在 examples + apps/web，eval 失败不破主链路。

---

## 4. Components

### 4.1 libs/eval/ 模块（6 个文件）

| 文件 | 职责 | 输出类型 |
|---|---|---|
| `gt-loader.ts` | 加载 + 校验 GT 集（JSON）+ 校验 GT chunk 是否存在 | `EvalDataset { queries: EvalQuery[] }` |
| `classify.ts` | 三维度分类器（query / chunk / answer）| `QueryLabels`, `ChunkLabels`, `AnswerLabels` |
| `run-corpus-eval.ts` | 库构建质量评测 | `CorpusEvalReport` |
| `run-retrieval-eval.ts` | 端到端检索/答案评测 | `RetrievalEvalReport` |
| `format-report.ts` | 报告格式化（聚合 + per-dim + per-row）| `string` |
| `judge-llm.ts` | LLM Judge（qwen3-8b）| `JudgeVerdict { score, reasoning }` |
| `index.ts` | barrel export 所有 eval 模块 | — |

### 4.2 GT 集 schema（`examples/day22/gt-dataset.json`）

```ts
type EvalQuery = {
  id: string;                    // Q001...Q080
  query: string;                 // 问题
  expectedAnswer: string;        // 期望答案（人工修正后）
  expectedChunkIds: string[];    // GT chunk_id（必须命中的 chunks）
  queryLabels: QueryLabels;      // 见 §5.1
  chunkLabels: ChunkLabels[];    // 见 §5.2（每个 expectedChunkId 一份）
  answerLabels: AnswerLabels;    // 见 §5.3
  source: 'human' | 'llm';       // 老大写的还是 LLM 生成的
  humanReviewed: boolean;        // 老大是否人工修正过
  updatedAt?: string;            // ISO 时间戳（多人修正冲突时取最新）
};

type EvalDataset = {
  version: string;               // '2026-09-11-v1'
  queries: EvalQuery[];
};

// GT loader 跑前校验后加的 transient 字段（不入 JSON）
type EvalQueryRuntime = {
  gtStale: boolean;              // expectedChunkIds 在当前库不存在
};
```

### 4.3 Web UI 五页（`apps/web/src/views/eval/`）

| 页 | 职责 | 关键组件 | 数据源 |
|---|---|---|---|
| **总览** `EvalOverview.vue` | 各维度分数面板 + 总分 + 跨日对比 | `ScorePanel`, `Heatmap`, `RunHistory` | `GET /eval/reports` |
| **评测运行** `EvalRunner.vue` | 选评测类型 + 跑 + 看进度 | `RunProgress`, `LogStream` | `POST /eval/corpus\|/retrieve` |
| **查询详情** `QueryDetail.vue` | 单 query：GT / 检索 chunks / 重排 / 答案 / 三维度标签 / recall@k / EM | `QueryHeader`, `RetrievalPanel`, `AnswerPanel`, `LabelsPanel` | `GET /eval/dataset` + `POST /eval/retrieve` |
| **库探针** `CorpusProbe.vue` | 随机抽 chunk 看 metadata + embedding 维度分布 | `ChunkBrowser`, `EmbeddingStats` | `GET /eval/corpus-stats` |
| **偏差分析** `BiasAnalysis.vue` | LLM 偏见检测：GT 生成器 vs 被测答案生成器是否同分布 | `BiasHeatmap`, `LengthDistribution` | `GET /eval/dataset` + `POST /eval/judge` |

### 4.4 API（`apps/api/src/routes/eval.ts`）

```ts
// POST /eval/corpus       —— 库构建质量评测（覆盖率 / 平均 chunk 数 / 抽取失败率）
// POST /eval/retrieve     —— 端到端检索/答案评测（recall@k / EM / Judge score）
// GET  /eval/dataset      —— GT 集
// GET  /eval/reports      —— 历史报告（含跨日对比）
// GET  /eval/corpus-stats —— 库探针元数据
// POST /eval/judge        —— LLM Judge 单条评估
```

---

## 5. 三维度分类体系（schema 锁定）

### 5.1 query 维度（`QueryLabels`）

| 标签 | 值域 | 说明 |
|---|---|---|
| `type` | `'factual' \| 'multi_hop' \| 'comparative' \| 'definitional' \| 'cross_domain'` | 问题类型 |
| `domain` | `'hr' \| 'admin' \| 'finance' \| 'it' \| 'legal'` | 领域（5 大类）|
| `difficulty` | `'easy' \| 'medium' \| 'hard'` | 难度 |
| `requiresMultiSource` | `boolean` | 是否需要跨 chunk 拼接 |
| `requiresNumeric` | `boolean` | 是否需要数字/金额事实 |

### 5.2 chunk 维度（`ChunkLabels[]`）

| 标签 | 值域 | 说明 |
|---|---|---|
| `chunkType` | `'heading' \| 'paragraph' \| 'table' \| 'list' \| 'image_text'` | chunk 结构 |
| `sourceFormat` | `'md' \| 'pdf' \| 'docx' \| ...` | 来源格式（17 种）|
| `hasNumeric` | `boolean` | 是否含数字/金额 |
| `hasList` | `boolean` | 是否含列表结构 |
| `isTrapClause` | `boolean` | 是否为"陷阱条款"（前后矛盾）|

### 5.3 answer 维度（`AnswerLabels`）

| 标签 | 值域 | 说明 |
|---|---|---|
| `answerType` | `'factoid' \| 'explanation' \| 'procedure' \| 'comparison'` | 答案类型 |
| `expectedLength` | `'short' \| 'medium' \| 'long'` | 期望答案长度 |
| `requiresReasoning` | `boolean` | 是否需要推理链 |
| `isAmbiguous` | `boolean` | 答案是否有多解 |

---

## 6. Data Flow

### 6.1 GT 生成（一次性）
```
┌──────────────────┐    ┌─────────────────┐    ┌────────────────────┐
│ 200 份语料       │ →  │ LLM (qwen3-8b)  │ →  │ GT 候选 (80 条)    │
│ (Day 21 产出)    │    │ 生成 query+GT  │    │ 自动写入 gt-raw    │
└──────────────────┘    └─────────────────┘    └─────────┬──────────┘
                                                         │
                                                         ▼
                                            ┌────────────────────────┐
                                            │ 老大人工修正            │
                                            │ (30 条核心 + 修正其余)  │
                                            └────────────┬───────────┘
                                                         │
                                                         ▼
                                            ┌────────────────────────┐
                                            │ gt-dataset.json v1      │
                                            │ humanReviewed=true     │
                                            └────────────────────────┘
```

### 6.2 评测运行（每次）
```
┌──────────────┐
│ Web UI       │
│ EvalRunner   │  POST /eval/retrieve
└──────┬───────┘
       ▼
┌──────────────────┐
│ apps/api         │
│ eval route       │  → libs/eval/run-retrieval-eval.ts
└──────┬───────────┘
       │
       ├─→ for each query in GT:
       │     1. retrieve(K=20)  → pool
       │     2. rerank(top_n=3) → final
       │     3. judgeLLM(answer vs expectedAnswer) → score
       │     4. compute recall@k, EM
       │     5. tag with 3-dim labels
       │
       ▼
┌──────────────────┐
│ RetrievalEvalReport
│ - aggregate scores
│ - per-dimension breakdown
│ - per-query rows
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ /eval/reports    │  ← 持久化（filesystem JSON）
│ {runId, ts, ...} │
└──────────────────┘
```

### 6.3 UI 查看（每次）
```
Web UI 总览 ← GET /eval/reports (历史)
       ↓ 点击某 run
Web UI 查询详情 ← GET /eval/dataset + 该 run 的 per-query rows
       ↓ 点击某 query
单 query 全维度可视化
```

---

## 7. Error Handling

### 7.1 GT 生成失败
- LLM 返 null / 超时 → **跳过该 query**，记入 `gt-generation-failures.log`
- 不阻塞其他 query 生成

### 7.2 评测运行失败
- **rerank 服务挂** → 沿用 Day 19 fallback：向量序 top-3 + `rerankFailed=true`
- **judge LLM 挂** → 该 query 跳过 judge，记入 `judge-failures.log`，不影响 recall/EM
- **embedding 服务挂** → **整个 run 失败**，不部分出报告（避免假信号）

### 7.3 老大人工修正冲突
- 同一 query 多人修正 → **取最后改的版本**（`updatedAt` 最新）
- 修正覆盖原 LLM 生成 → `humanReviewed=true`

### 7.4 库刷新（库口径 transient）
- 库 reindex 后 GT 中的 `expectedChunkIds` 可能失效
- **缓解**：GT loader 跑前校验：每个 expectedChunkId 必须在当前 chunks_heading/paragraph 表存在
- **不命中** → 该 query 标 `gtStale=true`，eval 跳过该 query 不算失败

---

## 8. Testing

按 [[verification-routing]]：**只验 example 脚本 + Chrome MCP 截图**，不机械跑 5 闸。

| 验证项 | 命令 | 验收标准 |
|---|---|---|
| GT 生成 | `pnpm tsx examples/day22/ex_001_generate_gt.ts` | 输出 ≥80 条候选，写入 `gt-raw.json` |
| GT 修正 | 老大手工改 `gt-dataset.json` 30 条 | `humanReviewed=true` 数 ≥ 30 |
| 库构建 eval | `pnpm tsx examples/day22/ex_002_corpus_eval.ts` | 输出覆盖率 / 平均 chunk 数 / 抽取失败率 |
| 检索 eval | `pnpm tsx examples/day22/ex_003_retrieval_eval.ts` | 输出 recall@k / EM / Judge score，含归因 5 桶 |
| 三维度分类 | `pnpm tsx examples/day22/ex_004_classify.ts` | 输出每个 query 的 3 维度标签分布 |
| Web UI | Chrome MCP 实跑 `#/eval/*` 5 页 | 五页均能加载、点击有效、截图存证 |

**反例验证（5 个必跑）**：
1. ✅ GT 集空（0 条 query）→ eval runner 不崩，输出 "no queries"
2. ✅ rerank 服务挂 → 该 query rerankFailed=true，fallback 走向量序
3. ✅ judge LLM 挂 → judge 跳过，recall/EM 仍正常输出
4. ✅ expectedChunkId 在当前库不存在 → 该 query 标 gtStale=true，跳过不算失败
5. ✅ Web UI 加载中 reload → 不留半初始化状态

---

## 9. Consequences

### 9.1 已知技术债（spec 必须明示）

1. **LLM 偏见风险**：GT 和被测都用 qwen3-8b，eval 信号会被稀释 → 后续若数字"看着太好"要警觉
2. **跨日完成债**：今日越期写五页，跨日衔接 hard commit——下周一 multi-agent 猛干时，第一件事是收口（验证五页全活 + 补 GT 30 条人工修正）
3. **GT 规模债**：80 条目标，今天能跑通流程即可；GT 质量要老大慢慢修，不要今天硬凑
4. **三维度标签一致性**：LLM 自动打标可能不一致 → 每批 GT 修正时老大同步校正标签

### 9.2 与未来课程的关系

- Day 23+ 真接 lancedb 入库 → `eval` 模块复用 Day 22 GT 集，验真语料 vs Day 18-20 假语料
- Day 31+ 评估体系扩展 → `eval` 模块成为基础设施，retrieval/chunking/embedding 任何改动都先跑 GT eval
- Day 41+ LLM-judge 专题 → `judge-llm.ts` 的 prompt 工程是核心

### 9.3 不做的事（YAGNI 红线）

- ❌ 不引第三方 RAG 评估库（ragas / deepeval）—— 红线"核心链路不引入新依赖"
- ❌ 不做模型版本管理（GT 一旦定，不锁 embedding 模型版本）—— Day 41+ 话题
- ❌ 不做 GT 自动增量（今天手动扩）—— Day 41+ 话题
- ❌ 不做多 embedding 模型对比（只有 qwen3-8b 一种）—— Day 41+ 话题

---

## 10. 跨日衔接（hard commit）

老大原话：**"今天干完所有的，明天周末不干，下周一又相隔时间太差，多agent全力猛干"**

### 10.1 今天必须交付

- [ ] `libs/eval/` 6 个模块（gt-loader / classify / run-corpus-eval / run-retrieval-eval / judge-llm / format-report）+ `index.ts` barrel
- [ ] `examples/day22/ex_001_generate_gt.ts` → `gt-raw.json`（≥ 80 条）
- [ ] `examples/day22/ex_002_corpus_eval.ts` → 库构建报告
- [ ] `examples/day22/ex_003_retrieval_eval.ts` → 检索/答案报告
- [ ] `examples/day22/ex_004_classify.ts` → 三维度标签分布
- [ ] `apps/web/src/views/eval/` 五页全活（即使简单，必须能加载）
- [ ] `apps/api/src/routes/eval.ts` 六条 API（corpus / retrieve / dataset / reports / corpus-stats / judge）
- [ ] `examples/day22/gt-dataset.json` v1（LLM 生成 + 老大人工修正 ≥ 30 条）
- [ ] `docs/daily/day22.md` 3 关齐（docs / example / 怎么测）
- [ ] `STATUS.md` 写明"已交付 / TODO / 下周一第一件事"

### 10.2 下周一 multi-agent 猛干（口子留好）

第一优先级（按序）：
1. GT 集扩到 ≥ 150 条（老大人工修正）
2. 评测跑通全流程 + Chrome MCP 五页截图
3. 三维度标签一致性校正
4. LLM Judge prompt 工程（少废话，多命中）
5. 跨日对比报告（Day 22 vs Day 23+ 数字）

### 10.3 接口口子（今天就留好）

- `libs/eval/index.ts` barrel export：所有 eval 模块统一入口 → 后续 multi-agent 不用重新理解目录结构
- `apps/api/src/routes/eval.ts`：API 契约固定 → 前端/后端 multi-agent 不打架
- `examples/day22/gt-dataset.json` schema 锁死 → 后续扩 GT 不用改 schema

---

## 11. Out of Scope（今日明确不做）

- ❌ 不引第三方 RAG 评估库
- ❌ 不做模型版本管理
- ❌ 不做 GT 自动增量
- ❌ 不做多 embedding 模型对比
- ❌ 不做跨日 eval 自动调度（手动跑）
- ❌ 不做 GT 集版本 diff 工具
- ❌ 不做评测结果的 dashboard 可视化（用五页 Web UI 已够）

---

## 12. References

- Day 19 spec: [2026-09-10-day19-rerank-eval-design.md](2026-09-10-day19-rerank-eval-design.md)
- Day 20 spec: [2026-09-10-day20-rag-demo-integration-design.md](2026-09-10-day20-rag-demo-integration-design.md)
- Day 21 pipeline: [examples/day21/ex_001_rag_ready_pipeline.ts](../../examples/day21/ex_001_rag_ready_pipeline.ts)
- Eval harness seed: [libs/rag/evaluate.ts](../../libs/rag/evaluate.ts)
- ADR 0003 (zod 单源): [../adr/0003-tool-params-single-source-of-truth-zod.md](../adr/0003-tool-params-single-source-of-truth-zod.md)
- ADR 0004 (RAG table 命名): [../adr/0004-rag-table-naming-follows-implementation.md](../adr/0004-rag-table-naming-follows-implementation.md)
- Memory [[day19-rerank-eval-retro]]（归因 5 桶 + 库口径 transient）
- Memory [[day20-retrieveMerged-noise]]（合并池噪声 + UI 复用 trade-off）
- Memory [[verification-routing]]（只看 example + Chrome MCP，不跑 5 闸）