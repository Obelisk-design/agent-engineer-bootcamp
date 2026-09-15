# 2026-09-15 — Retrieval + Ingest 全栈配置化 design

> **Status**: Draft v1 (待老大审) — self-review 待修
> **Date**: 2026-09-15
> **Deciders**: 老大 + Claude
> **Related**: [ADR 0003](0003-tool-params-single-source-of-truth-zod.md)（Tool 参数契约 zod 单一事实源，本 spec 是该原则的 RAG 配置层延伸）

## Context

工程已有 `libs/rag/retrieve.ts`（Day 12-19 演进）和 `libs/rag/indexer.ts`（Day 13-24 演进），两端的现状分别如下：

**Retrieval 端缺口（生产可用级必备，4 件全缺）：**
- **超时** —— `embed` / `store.search` 都没 timeout，hang 死整个 RAG
- **重试 + 退避** —— 网关抖动直接 fail，没有指数退避
- **AbortSignal** —— 用户取消 / agent 终止无响应
- **Filter（namespace/version/sourceKinds）** —— 几乎全在调用方硬编码（`corporate` / `docs` / `all`、version、source 等无 schema）
- **分段 metric + trace** —— 只有 `elapsedMs` 总耗时，没分 embedMs / searchMs / rerankMs / dedupMs
- **rerank 集成** —— `retrieve*` 只到 hit，还得单独调 `rerankHits`

**Ingest 端现状（已基本就位，需小补）：**
- `IncrementalIndexOptions` 已 zod-shaped（`storeUri` / `tablePrefix` / `force`）
- `IncrementalIndexReport` 已有分段 metric（statMs / deleteMs / embedMs / embedCalls / addMs / ioMs）
- 失败处理已有（`embedFallbacks` / `failedDocSources`）
- **缺**：超时 / 重试 / 退避 / AbortSignal / 与 retrieval 共享 schema

**配置 schema 现状问题：**
- topK=5、chunkStrategy='heading'、namespace='all'、baseUrl、model、apiKey 这些**散落在 examples / apps/api / apps/web 多处硬编码**
- 没有单一真相源 —— 改一处忘十处的风险（参见 CLAUDE.md "修改五问 #3"）
- 调参体验差 —— 想试不同 topK / 阈值 / rerank 配置只能在代码里改

**调用方散落：**
- `apps/web/src/views/embed-compare/EmbedCompare.vue` 硬编码 topK=5、namespace='all'、rerankEnabled=true
- `apps/web/src/views/embed-compare/components/QueryComposer.vue` 同上
- `examples/day20/ex_001_diagnose_q3_recall.ts` 硬编码 PoolK=20、FinalK=3、thresholds
- `apps/api/src/rag-server-entry.ts`（如果有）硬编码 retrieval 入参
- `examples/day24/ex_002_verify_gt.ts` 硬编码 corpus/version

## Decision

### 1. 新增 `libs/rag/config.ts` —— 共享 zod schema 单一真相源

ADR 0003 已确立 "Tool 参数契约以 zod schema 为单一事实源"。本次延展到 RAG 配置层。

```ts
import { z } from 'zod';

// ─── 共享子 schema（retrieval + ingest 都用）───────────────────────
export const EmbedProviderConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1),
  model: z.string().default('qwen3-embedding-8b'),
  dimensions: z.union([z.literal(4096), z.literal(256)]).optional(),
});
export type EmbedProviderConfig = z.infer<typeof EmbedProviderConfigSchema>;

export const RobustnessConfigSchema = z.object({
  timeoutMs: z.number().int().positive().default(30_000),
  retries: z.number().int().min(0).max(5).default(2),
  retryBackoffMs: z.number().int().min(100).default(500),
  abortSignal: z.instanceof(AbortSignal).optional(),
});
export type RobustnessConfig = z.infer<typeof RobustnessConfigSchema>;

export const RerankConfigSchema = z.object({
  enabled: z.boolean().default(false),
  topK: z.number().int().min(1).max(20).default(3),
  model: z.string().default('qwen3-reranker-4b'),
  baseUrl: z.string().url().optional(),
  relevanceThreshold: z.number().min(0).max(1).optional(),
});
export type RerankConfig = z.infer<typeof RerankConfigSchema>;

// ─── Retrieval 专属 ───────────────────────────────────────────────
export const ChunkStrategySchema = z.enum(['heading', 'paragraph']);

export const FilterConfigSchema = z.object({
  namespace: z.enum(['corporate', 'docs', 'all']).default('all'),
  version: z.string().optional(),
  sourceKinds: z.array(z.string()).optional(),
});
export type FilterConfig = z.infer<typeof FilterConfigSchema>;

export const RetrievalConfigSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(100).default(10),
  chunkStrategies: z.array(ChunkStrategySchema).min(1).default(['heading']),
  dedupBy: z.enum(['text', 'id']).default('text'),

  filter: FilterConfigSchema.default({ namespace: 'all' }),
  embed: EmbedProviderConfigSchema,
  rerank: RerankConfigSchema.default({ enabled: false, topK: 3, model: 'qwen3-reranker-4b' }),
  robustness: RobustnessConfigSchema.default({}),

  trace: z.boolean().default(false),
  stores: z.object({
    heading: z.custom<VectorStore>(),
    paragraph: z.custom<VectorStore>().optional(),
  }),
});
export type RetrievalConfig = z.infer<typeof RetrievalConfigSchema>;

// ─── Ingest 专属 ─────────────────────────────────────────────────
export const IngestConfigSchema = z.object({
  sources: z.array(z.custom<DocSource | DocEntry>()),
  embed: EmbedProviderConfigSchema,
  robustness: RobustnessConfigSchema.default({}),

  storeUri: z.string().default('.lancedb/rag'),
  tablePrefix: z.string().default('chunks'),
  force: z.boolean().default(false),
});
export type IngestConfig = z.infer<typeof IngestConfigSchema>;
```

### 2. 新增 `retrieveV2(config)` —— 生产可用级 retrieval

```ts
export interface RetrieveV2Result {
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly elapsedMs: number;
  readonly phases: {
    readonly embedMs: number;
    readonly searchMs: number;
    readonly rerankMs: number;
    readonly dedupMs: number;
    readonly retries: number;
  };
  readonly trace: readonly TraceEvent[];
}

export async function retrieveV2(config: RetrievalConfig): Promise<RetrieveV2Result>;
```

**关键行为契约：**
- **超时**：`robustness.timeoutMs` 用 `AbortSignal.timeout()` 实现；embed / search / rerank 三阶段分别有 timeout
- **重试 + 退避**：embed / search / rerank 任一失败 → 指数退避（`retryBackoffMs * 2^attempt`）→ 最多 `robustness.retries` 次
- **AbortSignal**：`config.robustness.abortSignal` 透传，三阶段都监听
- **Filter**：`namespace` / `version` / `sourceKinds` 推到 `store.search` 层的 lancedb SQL `WHERE` 子句（新增 `VectorStore.search(filter?)` 重载，**保留旧 search 不变**）
- **分段 metric**：embedMs / searchMs / rerankMs / dedupMs 各自累计
- **trace**：返回 `TraceEvent[]`（每阶段 `{ stage, status, ms, error? }`），开关由 `trace` 控制（默认 false）
- **rerank**：enabled 才接；rerank 失败 → 标记失败但不破主流程（fallback 到未 rerank 的 hits）

### 3. 新增 `ingestV2(config)` —— 复用共享 schema 的 ingest

```ts
export async function ingestV2(config: IngestConfig): Promise<IncrementalIndexReport>;
```

**与现有 `incrementalIndex` 关系：** 完全等价行为，外层包一层 zod 验证 + RobustnessConfig 透传。`IncrementalIndexOptions` 保留，**Day24 等现有调用方不动**。

### 4. UI 调参面板 —— `/embed-compare` 折叠面板

在 `EmbedCompare.vue` 的 QueryComposer 下方，新增 `<RetrievalConfigPanel>` 折叠组件（默认折叠）。

**面板字段（按 schema 字段映射）：**
- Top K（数字滑块 1-20，默认 10）
- Namespace（select：corporate / docs / all）
- Rerank toggle + topK（启用时才显示）
- Timeout（数字，默认 30000ms）
- Retries（数字，默认 2）
- [展开 trace] 折叠区（展开后看分段 metric：embedMs / searchMs / rerankMs）

**交互契约：**
- 改面板字段 → 实时反映到 `analysisState.retrievalConfig`（新增 state 字段）
- 点 [Analyze] → `retrieveV2(analysisState.retrievalConfig)`
- Panel 显示当前分段 metric（实时刷新）

### 5. 不破坏现有 API

| 保留 | 不动 |
|------|------|
| `retrieve(query, opts)` | Day12-Day20 example 全部能用 |
| `retrieveMerged(query, opts)` | Day14-Day20 全部能用 |
| `incrementalIndex(docs, opts)` | Day13-Day24 全部能用 |
| `IncrementalIndexOptions` | 不变 schema 名称，行为不变 |
| `IncrementalIndexReport` | 加新字段（不删旧）|

## Design

### A. `VectorStore.search(filter?)` 兼容性扫描

`libs/rag/store.ts` 的 `VectorStore` 是接口，由 `openVectorStore()` 返回的 LanceVectorStore 实现（基于 lancedb）。本次加可选 `filter` 参数：

```ts
// 旧（Day 12-Day 24 全部用这个）：
search(vector: number[], k: number): Promise<SearchHit[]>

// 新：
search(vector: number[], k: number, filter?: FilterCondition): Promise<SearchHit[]>
```

**实现方只有 1 个**（LanceVectorStore in `store.ts`）—— **没有第三方实现需要兼容**。Lancedb `.search(vector).where(filter).limit(k)` API 原生支持，不需要 SQL 拼接。

测试矩阵：

- `filter === undefined` → 走老路径，行为完全一致（grep 现有 30+ 调用方不破）
- `filter = { namespace: 'corporate' }` → 验证 heading/paragraph 双表都正确 WHERE
- `filter = { version: 'v2' }` → 验证 version 字段（Day 24 加的）能正确 WHERE
- `filter = { sourceKinds: ['daily', 'policy'] }` → 验证数组转 SQL `IN`

**新增（4 个）：**
- `libs/rag/config.ts` —— zod schema + types
- `libs/rag/retrieve-v2.ts` —— retrieveV2() 实现
- `libs/rag/ingest-v2.ts` —— ingestV2() 实现
- `apps/web/src/views/embed-compare/components/RetrievalConfigPanel.vue` —— UI 调参面板

**改动（5 个）：**
- `libs/rag/index.ts` —— barrel 加新 export
- `libs/rag/store.ts` —— `VectorStore.search(filter?)` 新增可选 filter 参数（默认 undefined，行为不变）
- `apps/web/src/views/embed-compare/EmbedCompare.vue` —— `run()` 改用 retrieveV2；state 加 retrievalConfig 字段
- `apps/web/src/views/embed-compare/components/QueryComposer.vue` —— 加 `<RetrievalConfigPanel>` 引用
- `apps/web/src/views/embed-compare/analysisState.ts` —— `AnalysisState` 加 `retrievalConfig: RetrievalConfig | null`

### B. 关键不变量

- **超时边界**：`abortSignal.timeout()` 在 embed / search / rerank 三阶段都包，不能只在顶层
- **重试退避算法**：`delay = retryBackoffMs * Math.pow(2, attempt)` + `±20% jitter`
- **重试跳过 AbortError**：用户主动取消不重试，直接抛
- **rerank 失败软降级**：rerank 失败 → `phases.rerankMs = 0` + `trace` 记 error，hits 用未 rerank 结果 + UI 提示
- **filter SQL 转义**：复用现有 `inListFilter()` 工具（indexer.ts line 538）

### C. 测试矩阵

| 维度 | 验证 |
|------|------|
| **正常路径** | retrieveV2 跟 retrieveMerged hits 一致（同一 config 输入） |
| **超时** | mock embed 故意 sleep 35s → retrieveV2 超时报错、不 hang |
| **重试** | mock embed 第 1 次 fail 第 2 次成功 → retrieveV2 返回成功、trace 有 2 次 embed |
| **Abort** | AbortController.abort() 后 retrieveV2 抛 AbortError、不重试 |
| **Filter** | namespace='corporate' → hits 全 source 都在 corporate 路径下 |
| **rerank 软降级** | mock rerank 失败 → hits 仍是未 rerank、UI 显示提示 |
| **trace** | trace=true → 5 个 TraceEvent（embed / search* N / dedup / rerank）|

### D. UI Mockup（描述）

```
┌─ QueryComposer ─────────────────────────────────────┐
│  [textarea：输入查询]                                  │
│  [TokenPreview 区域（若有）]                            │
├─ [展开/折叠] 高级配置 ▼ ──────────────────────────────┤
│  Top K:           [— 10 +]                            │
│  Namespace:       [all ▼]                             │
│  □ Rerank On   └ Top K: [— 3 +]                       │
│  Timeout:         [30000]ms                            │
│  Retries:         [— 2 +]                             │
│  □ 显示 Trace (advanced)                              │
└─────────────────────────────────────────────────────┘
```

## Examples

**新增 example 脚本（验证用）：**

- `examples/day25/ex_001_retrieve_v2_basic.ts` —— 跑 retrieveV2 vs retrieveMerged 对比，验证基本路径
- `examples/day25/ex_002_retrieve_v2_resilience.ts` —— mock 超时 / 重试 / abort / rerank 软降级
- `examples/day25/ex_003_retrieve_v2_filter.ts` —— namespace=corporate vs all 召回差异
- `examples/day25/ex_004_ingest_v2.ts` —— 用 IngestConfig 跑增量入库

## Consequences

### 正面
- 调参体验从"改代码重启" 升级到"UI 实时调"
- 配置 schema 单一真相源，retrieval/ingest 共享（DRY）
- 生产可用级 4 件全到位（超时 / 重试 / 退避 / abort / filter / metric / trace / rerank）
- 旧 API 0 破坏，Day12-Day24 所有调用方不动
- eval 可复现 —— 同一 config 跑 N 次结果稳定
- 为后续子项目（query 预处理、answer 生成）铺路 —— 都用同一套 RobustnessConfig / EmbedProviderConfig

### 负面
- API 表面变大（新增 retrieveV2 / ingestV2 / config schema）—— 需要 docs 跟进
- `VectorStore.search(filter?)` 是公开接口变更（虽然默认行为不变）—— 需扫一遍 store 实现方
- UI 调参面板增加 QueryComposer 视觉复杂度 —— 默认折叠可缓解

### Risks
- **Lancedb filter 兼容性**：retrieval 层第一次用 lancedb SQL filter，需测 heading/paragraph 双表都支持 namespace filter
- **rerank 软降级可能掩盖 bug**：rerank 频繁失败时需要告警（暂 YAGNI，留 metric 字段）
- **schema 演化成本**：未来加字段要谨慎（已有 Day24 在用，演化要兼容）

## Testing

**单测（vitest）：**
- `libs/rag/config.test.ts` —— schema validation 全覆盖（边界值 / 非法值 / default）
- `libs/rag/retrieve-v2.test.ts` —— 用 in-memory mock store + mock embedFn 验证 6 维度（正常/超时/重试/Abort/filter/rerank）
- `libs/rag/ingest-v2.test.ts` —— 跑 mini corpus（3 篇 doc）端到端入库

**集成测：**
- 4 个 example 脚本（见 Examples 节）
- 端到端跑通 dev:web + Chrome MCP 验证 UI 调参面板

**完成 3 关（按 Day09 checklist）：**
- ✅ docs：spec 文档 + ADR 0006（如需）
- ✅ example：4 个 example 脚本跑通
- ✅ 怎么测：单测 + 集成测 + UI MCP 截图

## Open Questions —— 暂不做的 3 项

明确 **3 个 deferred 项**（不阻塞本 spec，后续子项目单独 spec）：

1. **Embedding 模型锁版本**（qwen3-embedding-8b 跟其他模型 vocab 不同，切换导致 chunks_* 表现不一致）—— YAGNI，等真要切模型再说
2. **Rerank soft-failure 告警** —— 暂用 trace + phases.rerankError 字段暴露，告警逻辑留 hook 给 Day26+ 监控子项目
3. **UI 配置 localStorage 持久化** —— 暂不持久化（用户体验降级比调参重做一次成本低），留 TODO

以上3 项**不阻塞本 spec**，不写进 plan。