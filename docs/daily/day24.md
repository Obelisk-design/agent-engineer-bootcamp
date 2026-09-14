# Day 24 — docs + corporate-docs 版本化增量入库 + 召回页走查 + Notion 摘除

> 日期:2026-09-11 (周五)
> 接力:周一(2026-09-14)清洗语料 → 入 v2 → judge-avg 对比

## 已交付

### A. 版本化增量入库核心
- `examples/day24/index-corpus.ts` — `--corpus corporate|docs --version v1|v2 [--dry-run] [--force]`
  - 复用 `diffDocs`/`hashText`/`openMetaStore`(Day 13 diff 引擎大脑)
  - embed+add 循环照抄 ex_000(extractByFile → chunkText → embed → 入库含 fallback 占位)
  - chunk_id 由 `filename#NNN` 确定性生成 → **逐字复现 259/旧表**(命门 1)
  - 守卫:`v.length===0` 跳过空向量(createTable 不崩);failedDocs 不记账(下次重试)
- `examples/day24/ex_002_verify_gt.ts` — 对比旧表 chunk_id + GT expectedChunkIds 有效性

### B. 入库数字
| corpus | 文件 | chunks | 用时 | fallback |
|---|---|---|---|---|
| corporate v1 | 135/200(图片/空 skip) | **259**(逐字匹配旧表,GT 80 条 0 stale) | 38s | 0 |
| docs v1 | 73/73(全 md) | 933 | 118s | 6(网关 NaN 占位,无影响) |

增量三关:全量 38s → 连跑 351ms(0 embed)→ 改一文件 947ms(1 embed)

### C. 召回页接统一库 + Notion 摘除
- `rag-search.ts` — uri 按 corpus 分,加 `RAG_ACTIVE_VERSION` 默认 v1,目标表 fail-fast,notion/md 后端降级返空
- `eval-server.ts` — `/retrieve`+`/corpus-stats` 接 `body.version`/query,report 带 `corpus`/`version`/`ignoreStale`,新增 `GET /versions`
- `libs/eval/run-retrieval-eval.ts` — `ignoreStale` option(命门 2:v2 清洗后 chunk_id 漂移时 judge-avg 分母稳定)
- `libs/api-schema` — namespace/sourceKind 加 'corporate'/'docs'(加法不删 notion,灰区最保守)
- `env.ts` — health 改 `Record<string, NamespaceHealth>`,只剩 `corpus` 必填
- `spawn-main.ts` — namespace 类型扩展,corpus/docs 走 day24 脚本
- 前端 store/SearchView/IngestView/QueryComposer/EmbedCompare/analysisState/api — namespace 统一 `corporate | docs | all`,下拉项去掉 notion/md

### D. Chrome MCP 走查(实物验证)
- **/rag 搜索**:"员工报销" → 5 hits · 310ms,#1 `corporate / 058_财务_员工报销时限规定.docx`,heading,score 0.178,真实文档内容
- **/rag namespace 下拉**:三个选项 `all (corporate + docs)` / `corporate` / `docs`,无 notion/md
- **/eval/probe 库探针**:表名 `chunks_corporate_v1_heading`,size 259,样本跨多格式(.docx/.yaml/.zip/.json/.pptx/.eml/.md/.csv)

### E. typecheck 全绿,0 错

## ⏸️ TODO(周一第一件事,按优先级)

#### P0 — 清洗语料 + 入 v2(命门 2 主体)
- 老大手工清洗语料(`tests/fixtures/corporate-docs/`),清洗策略自定
- **跑入库**(去掉 `--dry-run`):
  ```bash
  NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsx examples/day24/index-corpus.ts --corpus corporate --version v2
  ```
  会建新表 `.lancedb/corporate/chunks_corporate_v2_heading` + meta `chunks_corporate_v2_meta`(与 v1 完全隔离)
- **fallback 6 个占位 chunk** 不阻塞(占位向量不参与检索命中,设计预期)

#### P1 — judge-avg 跨版本对比
- 启 `pnpm dev:eval`
- 跑两次:
  ```bash
  # v1 baseline
  curl -X POST -H "Content-Type: application/json" -d '{"version":"v1","ignoreStale":true}' http://localhost:3202/eval/retrieve
  # v2 对比
  curl -X POST -H "Content-Type: application/json" -d '{"version":"v2","ignoreStale":true}' http://localhost:3202/eval/retrieve
  ```
- **judge-avg 为主对比指标**(recall/final-hit 在 chunk_id 漂移时仅供参考)
- `ignoreStale:true` 保证 judge-avg 分母 = 全量 80 条 query(stale 不被 skip)

#### P2 — 跨日对比报告(可选,看时间)
- 两份 report 写在 `examples/day22/reports/retrieval-eval-v{N}-*.json`(已带 corpus/version 标签)
- 对比表:judge-avg / final-hit / recall@20 各版本

#### P3 — UI EvalRunner 加 version + ignoreStale 选择器(本次没动)
- 涉及 `EvalRunner/index.vue` + `eval/api.ts`,加 version 下拉 + ignoreStale checkbox
- EvalOverview 加 version 列
- 5 分钟 UI 改动,后续接力

## 🚨 已知风险(周一注意)

1. **GT chunk_id 漂移**(命门 2):清洗改文本 → `chunkSeq` 重排 → v2 表里 expectedChunkIds 大面积 `gtStale`。`ignoreStale:true` 让 judge-avg 不受影响(stale query 仍跑 judge),但 recall@k/final-hit 会偏低(GT 引用了已漂移的 id)。**judge-avg 是唯一可靠的对比指标**。
2. **embed 网关 epoch 漂移**(memory `dev-gateway-embedding-drift`):如果 dev 网关周一重部署,v1/v2 嵌入纪元不同,v1 baseline 表的向量可能与新查询向量不在同一空间 → 召回质量系统性下降。**周一开跑前用 ex_002 验证 v1 表 chunk_id 与 GT 一致**;若召回异常降级,考虑 force v1 重灌。
3. **fallback 6 chunk 占位**:docs v1 入库时 6 个 chunk 走 `[empty]` 占位(内容确定 NaN,force 重跑仍是 6)。不影响检索命中,但 docs 召回 top-K 里缺 6 个潜在相关位置。如果周一对比只看 corporate 不看 docs,无影响。

## 📂 文件清单(周一直接定位)

```
examples/day24/
├── index-corpus.ts          # 版本化增量入库主脚本
└── ex_002_verify_gt.ts      # chunk_id + GT 验证(周一跑 v2 前验 v1)

.lancedb/corporate/
├── chunks_corporate_heading.lance           # 旧表(ex_000 产物,259 chunks),deprecated 保留不动
├── chunks_corporate_v1_heading.lance        # v1 baseline(259 chunks,今天入库)
├── chunks_corporate_v1_meta.lance           # v1 meta
├── chunks_corporate_v2_heading.lance        # 周一 v2(待跑)
└── chunks_corporate_v2_meta.lance           # 周一 v2 meta(待跑)

.lancedb/docs/
├── chunks_docs_v1_heading.lance             # docs v1(933 chunks)
└── chunks_docs_v1_meta.lance                # docs v1 meta

apps/api/src/
├── rag-search.ts          # 召回:namespace→table,fail-fast,RAG_ACTIVE_VERSION
├── rag-server.ts          # /health → corpus
├── rag-ingest.ts          # spawn namespace (无改动,接入新 namespace enum)
├── spawn-main.ts          # corporate/docs → day24 脚本
├── env.ts                 # health {corpus: {...}}
└── eval-server.ts         # /retrieve+body.version, /corpus-stats?version=, /versions,report 带 version

libs/
├── api-schema/src/{search,ingest,env}.ts    # enum 加 corporate/docs(不删 notion)
└── eval/run-retrieval-eval.ts               # ignoreStale option

apps/web/src/
├── store/modules/rag.ts                     # namespace: corporate|docs|all
├── api/rag/index.ts                         # namespace 类型同步
└── views/{rag,embed-compare}/               # 下拉项去 notion,加 corporate/docs

tests/env.test.ts                            # 改写为 corpus 健康断言
```

## 🎯 周一第一句要问自己的话

> "v1 baseline 已就位(259/GT 80 全命中),周一清洗 → 入 v2 → judge-avg 跨版本对比。recall 在 chunk_id 漂移时不可比,只看 judge-avg。"
