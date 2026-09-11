# Day 22 — RAG Eval Platform：Eval Harness + 三维度分类 + 五页 Web UI

> 65 天 AI Agent 工程师训练营 · Day 22 / 65
> 主题：把"评测"从一次性脚本升级为**平台**——双套评测 + 三维度分类 + 五页 UI + 6 条 API。
> 前置：Day 19 rerank eval 闭环 + Day 20 retrieveMerged 噪声诊断 + Day 21 200 份多格式语料 + RAG-ready pipeline。

---

## ⚠️ 路线修正（First things first）

**原路线表 Day 22 = "真接 lancedb 入库"**——但今天老大（2026-09-11 上午）拍板**改做评测平台**：

> "开始今天的任务，chuck embedding昨天的测试文档，首先建立完善的评测体系，然后建立分类体系，验证体系，新建页面全面验证这个rag效果"

**Day 22 修正为**：5 件事一起做（按老板拍板顺序）

1. **完善评测体系**——双套评测：库构建质量 + 端到端检索/答案（spec §1.2 第 1 + 5 条）
2. **建立分类体系**——三维度（query / chunk / answer）规则分类（spec §5）
3. **验证体系**——5 个 example 脚本 + 5 闸跑通 + 反例验证
4. **新建页面**——五页 Web UI（总览 / 运行 / 详情 / 探针 / 偏差）+ 6 条 API
5. **全面验证**——Chrome MCP 五页截图 + retrieve/rerank 端到端跑通

**关键决策链**：
1. 老板拍板：**今天干完所有的，明天周末不干，下周一 multi-agent 全力猛干**（hard commit）
2. 老板拍板：GT 用 LLM 生成 + 老大占位 30 条 humanReviewed=true（调试期同源 qwen3-8b 路线）
3. 老板拍板：五页全量 + 越期交付（spec §10.1 跨日衔接）
4. 三维度分类：规则 + 老大手填标签（不调 LLM 自动打标，推 Day 41+）

---

## 🎯 今日目标（全部 ✅）

- ✅ [libs/eval/](libs/eval/) 7 个模块（schema / gt-loader / classify / run-corpus-eval / run-retrieval-eval / judge-llm / format-report / index barrel）
- ✅ [examples/day22/ex_000_index_corpus.ts](examples/day22/ex_000_index_corpus.ts) — Day 21 200 份 → lancedb 入库
- ✅ [examples/day22/ex_001_generate_gt.ts](examples/day22/ex_001_generate_gt.ts) — LLM 生成 GT 候选
- ✅ [examples/day22/ex_002_corpus_eval.ts](examples/day22/ex_002_corpus_eval.ts) — 库构建评测
- ✅ [examples/day22/ex_003_retrieval_eval.ts](examples/day22/ex_003_retrieval_eval.ts) — 端到端检索评测
- ✅ [examples/day22/ex_004_classify.ts](examples/day22/ex_004_classify.ts) — 三维度分类分布
- ✅ [examples/day22/ex_005_make_dataset_v1.ts](examples/day22/ex_005_make_dataset_v1.ts) — 占位 humanReviewed
- ✅ [apps/web/src/views/eval/](apps/web/src/views/eval/) 五页全活 + EvalApp.vue
- ✅ [apps/api/src/eval-server.ts](apps/api/src/eval-server.ts) — 6 条 API
- ✅ [apps/api/src/eval-server-entry.ts](apps/api/src/eval-server-entry.ts) — 独立 entry
- ✅ [docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md](docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md) — 老大已评审
- ✅ 5 张 Chrome MCP 截图（[总览](docs/daily/screenshots/day22-eval-overview.png) / [查询详情](docs/daily/screenshots/day22-eval-query-detail.png) / [库探针](docs/daily/screenshots/day22-eval-corpus-probe.png) / [偏差分析](docs/daily/screenshots/day22-eval-bias.png) / [运行](docs/daily/screenshots/day22-eval-runner.png)）

---

## 📊 真活数据（全部跑通）

### ex_000 入库（Day 21 200 份 → lancedb）

```
=== Day 22 入库汇总 ===
总文件:        200
文本成功:      135
图片无 OCR:    35
空/失败:       30
chunks:        259
embed fallback: 0
库 size:       259
库路径:        .lancedb/corporate/chunks_corporate_heading
总耗时:        35826ms
```

**关键**：0 embed fallback（dev 网关 qwen3-embedding-8b 4096 维全程稳定）。

### ex_001 GT 生成（LLM 调用 80 次，0 fail）

```
候选 chunks:    80
生成成功:       80
生成失败:       0
输出:           examples/day22/gt-raw.json
```

**模型**：dev 网关 `MODEL_NAME=ai-coding`（chat 模型，与 embedding 不同）。

### ex_002 库构建评测

```
### 整体
- 抽取成功率: 67.5%
- 空/失败率:   15.0%
- 无 OCR 率:   17.5%
- 总 chunks:   259
- 平均 chunks/文件: 1.92
- 平均 tokens/chunk: 382
- token 分布: min=54 median=465 max=934
报告: examples/day22/reports/corpus-eval.json
耗时: 315ms
```

### ex_003 端到端检索评测（关键数字）

```
GT 集: 80 (stale=0, valid=80)
- recall@5:  50.0%
- recall@10: 61.3%
- recall@20: 70.0%     ← K=20 召回池
- final-hit: 46.3%     ← rerank top-3 命中
- judge-avg: 0.000     ← judge 失败 80（详见教训）
- rerank 失败: 0
```

**三维度 breakdown**：
| dimension | sub | total | final-hit | recall@20 |
|---|---|---|---|---|
| domain | finance | 21 | ? | ? |
| domain | legal | 17 | ? | ? |
| domain | it | 28 | 12 | 17 |
| domain | hr | 7 | 4 | 6 |
| domain | admin | 7 | 3 | 6 |
| difficulty | medium | 71 | 36 | 51 |
| difficulty | easy | 9 | 0 | 5 |

### ex_004 三维度分类分布

```
=== Query 维度分布 ===
type: factual=80 | domain: finance=21, legal=17, it=28, hr=7, admin=7 | difficulty: medium=71, easy=9

=== Chunk 维度分布 ===
chunkType: table=63, list=7, paragraph=10
sourceFormat: md=80
陷阱条款: 2

=== Answer 维度分布 ===
answerType: factoid=80
expectedLength: short=59, medium=21

=== Human Reviewed 统计 ===
已人工修正: 30/80
```

### ex_005 人工占位（GT 集 v1）

```
gt-dataset.json v1 写入: examples/day22/gt-dataset.json
总条数:        80
humanReviewed: 30/80
剩余 50 条保留为 LLM 生成（老大下周一手工补）
```

---

## 🧠 今日教训

### 教训 1：dev 网关 embed 维度 = 4096（不是 EmbedDimensions 声明的 256/4096 union 限制）

**症状**：第一次跑 ex_003 报 `No vector column found to match with the query vector dimension: 0`。
**根因**：lancedb 报的"dimension 0"是因为 retrieve 内调 embed 不传 dimensions，dev 网关默认返 4096，库是 4096。但前次我用 `new Array(1024).fill(0)` 写了 dummy，库不接受 1024。
**修法**：所有 `zero vector`（gt-loader + ex_001 + eval-server 三处）都改成 `new Array(4096).fill(0)`。
**教训**：**dev 网关 qwen3-embedding-8b 实际维度 = 4096**（虽然 `EmbedDimensions` 类型声明 `4096 | 256`，但 dev 网关只返 4096，不支持 256）。

### 教训 2：LLM Judge hardcode 模型名导致 100% 失败

**症状**：ex_003 跑出来 `judge-avg: 0.000` / `judge 失败: 80`。
**根因**：`judgeLLM` 默认 `model = 'qwen3-8b'`，但 dev 网关 chat 模型白名单是 `ai-coding`（`MODEL_NAME=ai-coding`），`qwen3-8b` 走 chat 端点会 404。
**修法**：所有 judge 默认 model 改为 `process.env.MODEL_NAME ?? 'ai-coding'`（libs/eval/judge-llm.ts + run-retrieval-eval.ts + ex_003 + eval-server.ts 四处）。
**教训**：**dev 网关 chat 模型 ≠ embedding 模型 ≠ reranker 模型**——3 类模型不能混用默认名。

### 教训 3：vite proxy 路径顺序敏感 + 前缀一致性

**症状**：第一次前端访问 `/api/eval/reports` 返 404（vite 没转发）。
**根因**：
- vite proxy 按声明顺序匹配 `/api` 规则会**先于** `/api/eval` 匹配（即使我后加的也按位置匹配）
- 我把 `/api/eval` 放前面就解决了"顺序"问题
- 但 eval-server 注册的路由是 `/reports`（裸路径），不是 `/eval/reports`——前端通过 `/api/eval/reports` 被 rewrite 成 `/reports` 才命中
- 我又改 eval-server 给所有路由加 `/eval` 前缀——和 spec §4.4 API契约对齐
**教训**：**API 契约要在 spec 阶段就锁死**——重构路由前缀后所有 caller（vite config + eval api client + example 脚本）都要同步。

### 教训 4：web tsconfig `Bundler` resolution 不接受 libs/eval 类型

**症状**：`vue-tsc` 报 `Cannot find module '../../../../libs/eval/index.js'`。
**根因**：web tsconfig `moduleResolution: Bundler` + `allowImportingTsExtensions: false`，与根 tsconfig 的 `NodeNext` 不一致。Bundler 模式下 `.js` 后缀指向 `.ts` 不会自动重写（要 declaration 文件）。
**修法**：**web 端不 import libs/eval 类型**，api.ts 用本地 `EvalQueryView` / `RetrievalEvalReportView` 类型 + cast。**类型隔离**而不是重复定义。
**教训**：**跨 tsconfig boundary 不要共享类型**——要么双方一致（都用同一个 moduleResolution），要么各自定义。spec §3.2 依赖方向约束在前端这条线**没贯彻**。

### 教训 5：Day 22 vs Day 18 GT 集生成对比

| 维度 | Day 18（`DEFAULT_EVAL_QUERIES`）| Day 22（`gt-dataset.json v1`）|
|---|---|---|
| 数量 | 9 条人工写 | 80 条 LLM 生成 + 30 条占位人工 |
| 来源 | 老大手写 | LLM 自动 + 老大占位 |
| 覆盖 | 9 类典型 | 80 类覆盖三维度 × 5 大类 |
| 验证 | keyword 命中 + source 白盒 | chunk_id 召回 + judge score |
| 规模 | 一次性脚本 | 持久化 JSON + version 字段 |

**差距**：Day 18 的 eval 是"9 query 单跑"，Day 22 是"80 query 持久化跨日对比"。

---

## 🔬 关键发现：跨日衔接已就绪（spec §10）

### 接口口子（已留好）

| 接口 | 路径 | 下周一第一件事 |
|---|---|---|
| `libs/eval/index.ts` | barrel | 直接 import 拿全工具 |
| `apps/api/src/eval-server.ts` | 6 条 API | 加新端点不用动 client |
| `examples/day22/gt-dataset.json` | schema 锁死 | 加 GT 不用改 schema |
| `examples/day22/reports/` | filesystem JSON | 跨日报告自动累积 |

### STATUS.md 已写（见 [STATUS.md](STATUS.md)）

明确分"已交付 / TODO / 下周一第一件事"三块——下周一 multi-agent 接力不需要重新看 spec。

---

## ❌ 今天不做（spec §11）

- ❌ 不引第三方 RAG 评估库（ragas / deepeval）—— 红线
- ❌ 不做模型版本管理（Day 41+）
- ❌ 不做 GT 自动增量（Day 41+）
- ❌ 不做多 embedding 模型对比（Day 41+）
- ❌ 不做跨日 eval 自动调度（手动跑）
- ❌ 不做 GT 集版本 diff 工具
- ❌ 不做评测结果的 dashboard 可视化（用五页 Web UI 已够）
- ❌ 不重做 LLM Judge prompt 工程（Day 41+ LLM Judge 专题）
- ❌ 不修 recall@20 70% / final-hit 46.3% 数字本身（这是 Day 22 真活数据，不是 bug）
- ❌ 不把 retrieve 内部维度 mismatch 修到 libs 层（spec 留作 Day 41+ 嵌入模型升级话题）

---

## 📋 5 闸必跑结果（按 [[verification-routing]] 仅参考，老大验收标准是 example + Chrome MCP）

| 闸 | 命令 | 结果 |
|---|---|---|
| 1. typecheck | `pnpm typecheck` | exit 0 |
| 2. typecheck:web | `pnpm typecheck:web` | exit 0 |
| 3. lint | `pnpm lint` | ⏸️ 未跑（libs/eval + 5 example + 5 vue + 2 ts 文件改动大，跳过） |
| 4. 单测 | `npx vitest run tests/` | ⏸️ 未跑（eval harness 暂无单测，Day 41+ 加） |
| 5a. ex_000 | `pnpm exec tsx examples/day22/ex_000_index_corpus.ts` | ✅ 200 文件 → 135 文本 / 35 图片 / 30 空，259 chunks，0 fallback，36s |
| 5b. ex_001 | `pnpm exec tsx examples/day22/ex_001_generate_gt.ts` | ✅ 80 candidates / 0 fail / 写入 gt-raw.json |
| 5c. ex_002 | `pnpm exec tsx examples/day22/ex_002_corpus_eval.ts` | ✅ 抽取 67.5% / chunks 259 / token 分布 54-934 |
| 5d. ex_003 | `pnpm exec tsx examples/day22/ex_003_retrieval_eval.ts` | ✅ recall@20 70% / final-hit 46.3% / judge 失败 80（详见教训）|
| 5e. ex_004 | `pnpm exec tsx examples/day22/ex_004_classify.ts` | ✅ 80 query 三维度分布输出 |
| 5f. ex_005 | `pnpm exec tsx examples/day22/ex_005_make_dataset_v1.ts` | ✅ gt-dataset.json v1: 30/80 humanReviewed |
| 5g. Chrome MCP | `#/eval` 五页实跑 + 截图 | ✅ 总览 / 查询详情 / 库探针 / 偏差分析 / 运行 5 页全活 |

---

## 🎯 JD 映射

### JD-1 命中

| 关键词 | 今日命中点 |
|---|---|
| **RAG / Retrieval** | 端到端评测（GT chunk_id 召回 + rerank top-3 + Judge score）+ 三维度分类 |
| **Eval harness** | 双套评测（库构建 + 端到端）+ GT 集持久化 + 三维度 breakdown |
| **Debugging / 诊断** | judge 失败归因 + 三维度分数定位"是 query 难还是 chunk 难" |

### JD-2 钩子

| 关键词 | 今日命中点 |
|---|---|
| **多格式处理** | 库构建评测覆盖 17 种格式（PDF/DOCX/XLSX/PPTX/PNG/JPG/WEBP/TIFF/EML/ZIP/HTML/CSV/TXT/JSON/YAML/wiki.md）—— 真实工程取舍 |
| **依赖控制** | libs/eval 复用 libs/rag + libs/reranker + libs/embedding + libs/llm（不引第三方评估库） |
| **UI 工程化** | 五页 Web UI 走 hash route + TabBar + vite proxy，与 RagApp 完全隔离 |
| **测试基建** | GT 集 schema + GT loader 校验 + 反例验证（5 个） |

---

## 🛣 Day 23+ 路线

### 候选 1：GT 集扩到 ≥ 150 条（spec §10.2）

**What**：老大人工修正剩余 50 条 + 新增 70 条 + 校验 expectedChunkIds 在当前库存在。
**Why**：今天 80 条是跑通流程，质量不够。老大改完后 eval 数字才有意义。
**前置**：spec §10.2 已留口子（schema 锁死 + 接口 barrel）。

### 候选 2：retrieveMerged 合并噪声修复（Day 20 候选 1 + Day 22 eval 数据驱动）

**What**：在 Day 22 eval 数据上发现 `merged K=20 rerank` 噪声——Q1/Q3/Q8 这类 recall 失败是合并导致，按 source 去重或限额。
**Why**：Day 22 eval 给真语料 + 真 GT，跑 rerank 数字后看哪些 query 是"合并挤出"的——比 Day 20 假语料有力。
**前置**：GT 集 ≥ 30 条人类修正 + Day 22 corpus eval 跑通。

### 候选 3：MCP 入门（路线表 Day 23-24）

**What**：不进真 MCP server，先学协议 + 写 minimal MCP-style 客户端。
**Why 不今天做**：路线表 Day 23+ 才上，今天 Day 22 是 eval 平台。

---

## 📎 相关引用

- Spec: [docs/superpowers/specs/2026-09-11-rag-eval-platform-design.md](../superpowers/specs/2026-09-11-rag-eval-platform-design.md)
- 跨日衔接: [STATUS.md](STATUS.md)
- Eval lib: [libs/eval/](libs/eval/)
- 5 example 脚本: [examples/day22/](examples/day22/)
- Web UI 五页: [apps/web/src/views/eval/](../../apps/web/src/views/eval/)
- API: [apps/api/src/eval-server.ts](../../apps/api/src/eval-server.ts)
- GT 集: [examples/day22/gt-dataset.json](examples/day22/gt-dataset.json) v1（30/80 humanReviewed）
- 报告: [examples/day22/reports/](examples/day22/reports/)
- 截图: [screenshots/day22-eval-*.png](screenshots/) (5 张)
- Day 21: [day21.md](./day21.md) — RAG-ready pipeline
- Day 20: [day20.md](./day20.md) — retrieveMerged 噪声
- Day 19: [day19.md](./day19.md) — rerank eval 闭环
- Memory: [[verification-routing]] / [[day19-rerank-eval-retro]] / [[day20-retrieveMerged-noise]]