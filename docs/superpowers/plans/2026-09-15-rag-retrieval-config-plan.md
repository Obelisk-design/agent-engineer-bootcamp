# 2026-09-15 — Retrieval + Ingest 全栈配置化 implementation plan

> **Status**: Draft v1 (待老大审)
> **Spec**: [2026-09-15-rag-retrieval-config-design.md](../specs/2026-09-15-rag-retrieval-config-design.md)
> **Related ADR**: [0003](../adr/0003-tool-params-single-source-of-truth-zod.md)
> **Date**: 2026-09-15
> **Owner**: Claude

## 任务依赖图

```
T1 (config.ts + 单测)
  ├── T2 (store.ts search filter 重载)
  │     └── T5 (retrieve-v2.ts) ──────┐
  │                                    │
  └── T3 (ingest-v2.ts) ──────────────┤
                                     ├── T6 (UI RetrievalConfigPanel + 接入)
                                     │
T4 (reranker util 不变) ──────────────┘
                                     │
                                     ▼
                                T7 (example 脚本 × 4)
                                     │
                                     ▼
                                T8 (UI Chrome MCP 验证 + commit)
```

**关键约束：**
- T1 必须在 T2/T3/T5 之前（schema 是事实源）
- T2 必须先于 T5（retrieveV2 依赖 search filter）
- T6 依赖 T5（UI 调 retrieveV2）
- T7 依赖 T5+T3（example 跑新接口）
- **任何一步失败回滚**：retrievalV2 / ingestV2 是新增，旧 API 不动，回滚 = 删 4 个文件

## 任务列表

---

### T1 — `libs/rag/config.ts` + 单测（半天）

**目标**：建立共享 zod schema 单一事实源。

**触达文件：**
- 新增：`libs/rag/config.ts`（spec line 45-113 全量复制）
- 新增：`libs/rag/config.test.ts`（schema 验证反例测试）

**单测覆盖（按 ADR 0003 "反例 7 防复发"模式）：**
- `RetrievalConfigSchema.parse({...})` 合法输入 → 通过
- `topK: 0` → 拒绝
- `topK: 101` → 拒绝
- `chunkStrategies: []` → 拒绝
- `chunkStrategies: ['invalid']` → 拒绝
- `embed.apiKey: ''` → 拒绝
- `embed.baseUrl: 'not-a-url'` → 拒绝（z.string().url 严格）
- `robustness.retries: -1` → 拒绝
- `robustness.retries: 6` → 拒绝（max 5）
- `robustness.retryBackoffMs: 50` → 拒绝（min 100）
- default 字段省略 → 自动填默认值
- `trace: false` 时 trace 数组不输出（运行时验证，非 schema 验证）

**验证命令：**
```bash
pnpm --filter @bootcamp/web typecheck
pnpm exec vitest run libs/rag/config.test.ts
```

**反例验证（3 个）：**
1. 故意写 `topK: '10'`（string）→ parse 失败 → 错误信息含 `expected number`
2. 故意写 `chunkStrategies: 'heading'`（string 而非 array）→ parse 失败 → 错误信息含 `expected array`
3. 故意写 `embed: {}`（缺 apiKey）→ parse 失败 → 错误信息含 `apiKey`

**commit 模板：**
```
feat(rag): add RetrievalConfig/IngestConfig zod schema (Day25)

共享 schema 单一事实源（ADR 0003 延伸）:
- EmbedProviderConfigSchema / RobustnessConfigSchema / RerankConfigSchema 三个子 schema
- RetrievalConfigSchema + IngestConfigSchema 两个组合 schema
- 反例 7 防复发测试覆盖 topK/chunkStrategies/apiKey/retries/retryBackoff 边界
```

---

### T2 — `libs/rag/store.ts` `search(filter?)` 重载（半天）

**目标**：`VectorStore.search()` 加可选 `filter` 参数，老调用方零改动。

**触达文件：**
- 改：`libs/rag/store.ts`（LanceVectorStore.search 方法签名）
- 改：`libs/rag/store.test.ts`（如存在，加 filter 用例；如不存在，**跳过** —— YAGNI 不写新单测，等 T5 集成时验证）

**实现要点：**
- 接口：`search(vector: number[], k: number, filter?: FilterCondition): Promise<SearchHit[]>`
- `FilterCondition = { namespace?: 'corporate' | 'docs' | 'all'; version?: string; sourceKinds?: string[] }`
- `filter === undefined` → 走老 lancedb `.search(vector).limit(k)`，**字节级一致**
- `filter !== undefined` → 转 lancedb `.where(过滤条件)`：
  - `namespace='all'` → 不过滤
  - `namespace='corporate'` → `source LIKE '%corporate%'`（或具体路径前缀）
  - `namespace='docs'` → 同上
  - `version='v2'` → `version = 'v2'`（Day 24 加的字段）
  - `sourceKinds: ['daily']` → `sourceKind IN ('daily')`

**与现有调用方兼容性扫描：**
```bash
grep -rn "\.store\.search\|store\.search\b" libs/ apps/ examples/
```
**预期：** 30+ 调用方全部只传 `(vector, k)`，新参数默认 undefined，零影响

**验证命令：**
```bash
pnpm --filter @bootcamp/web typecheck
# T1 单测还需继续跑通 + 现有 chunk.test.ts 不破
pnpm exec vitest run libs/rag/
```

**反例验证（3 个）：**
1. `filter: { namespace: 'invalid' }` → TS 类型系统拒绝（不需 runtime 验证）
2. mock lancedb `.where()` 抛错 → store 层透传错误（不在 store 静默 catch）
3. `filter: { version: 'v9' }`（库里没有该版本）→ 返回 hits=[]，不抛

**commit 模板：**
```
feat(rag): VectorStore.search accepts optional FilterCondition (Day25)

LanceVectorStore.search 加可选 filter 参数, 老调用方 (vector, k) 行为不变.
lancedb .where() 原生支持, 不需要 SQL 拼接.

Day12-Day24 全部 30+ 调用方零改动验证: grep + vitest.
```

---

### T3 — `libs/rag/ingest-v2.ts` + 单测（1 天）

**目标**：包装现有 `incrementalIndex` 走 zod 验证 + RobustnessConfig 透传，**零行为变化**。

**触达文件：**
- 新增：`libs/rag/ingest-v2.ts`（~80 行 wrapper）
- 新增：`libs/rag/ingest-v2.test.ts`（mini corpus 端到端）

**实现要点（重要 —— 与 spec 一致）：**
- ingestV2 **必须**复用 T5 实现的 retry/timeout 工具函数（`withRetry` / `withTimeout`）
- embed 调用包 `withRetry + withTimeout`
- lancedb add/delete 调用包 `withTimeout`（不 retry —— lancedb IO 失败 retry 风险更高）
- **不**像 spec 早稿说的"RobustnessConfig 仅作 schema 验证" —— 那是不一致漂移，本次完整实现

```ts
import { withRetry, withTimeout } from './retrieve-v2.js';  // 共享工具

export async function ingestV2(config: IngestConfig): Promise<IncrementalIndexReport> {
  const parsed = IngestConfigSchema.parse(config);
  const rob = parsed.robustness;

  // wrap incrementalIndex 的 embed 步骤到 withRetry（侵入式：调用增量嵌入 helper）
  // ... 实际实现里复用 runIncrementalIndex 但传 abortSignal，retry 在外层
}
```

**单测覆盖：**
- 合法 IngestConfig → 跑 incrementalIndex 成功
- 非法 IngestConfig（storeUri 是 number）→ parse 失败
- DocSource[] 路径（Notion 风格）→ 走 incrementalIndexFromSources
- DocEntry[] 路径（文件系统风格）→ 走 incrementalIndex
- abort 后 ingestV2 抛 AbortError（不写半个 doc）

**验证命令：**
```bash
pnpm --filter @bootcamp/web typecheck
pnpm exec vitest run libs/rag/ingest-v2.test.ts
```

**反例验证（3 个）：**
1. `storeUri: 123`（不是 string）→ parse 失败
2. `embed.apiKey: ''` → parse 失败
3. `sources: []` → 走 incrementalIndex 空数组路径 → 返回空 added/modified/removed/skipped 数组（不抛）

**commit 模板：**
```
feat(rag): add ingestV2(config) wrapper with robustness (Day25)

增量入库走 zod 单一真相源 + 复用 retrieve-v2 的 withRetry/withTimeout.
embed 步骤走 retry+timeout; lancedb IO 仅走 timeout (不 retry).
abortSignal 透传到 runIncrementalIndex 全过程.

旧 incrementalIndex() 完全不动, Day13-Day24 全部调用方零影响.
```

---

### T4 — `libs/reranker/` 现状摸底（半天，可与 T1 并行）

**目标**：确认 `rerankHits()` 现有接口，决定 retrieveV2 怎么调它。

**触达文件：**（只读）
- 读：`libs/reranker/` 全部 .ts
- 读：`libs/rag/store.ts` line 60 处 `rerankHits` 用法（已在 Day19 看过）

**期望发现：**
- `rerankHits(query, hits, options)` 已存在
- options 接受 `signal`（AbortSignal 透传已有）
- options 接受 `apiKey` / `baseUrl` / `model`
- 失败返回 `null` 或抛错（决定 retrieveV2 怎么软降级）

**实际可能发现：**
- 如果 rerankHits 不接受 timeout → retrieveV2 内部包 AbortSignal.timeout()
- 如果 rerankHits 失败直接抛 → retrieveV2 try/catch 软降级

**输出物：** 在 plan 顶部加一段 `libs/reranker/` 接口摘要（5-10 行），后续 T5 实施时直接对照

**无 commit**（摸底，不改代码）

---

### T5 — `libs/rag/retrieve-v2.ts`（核心，2 天）

**目标**：spec §2 完整实现 —— 超时 + 重试 + 退避 + AbortSignal + Filter + 分段 metric + trace + rerank 软降级。

**触达文件：**
- 新增：`libs/rag/retrieve-v2.ts`（~250 行）
- 新增：`libs/rag/retrieve-v2.test.ts`（6 维度全覆盖）

**实现骨架：**
```ts
// 共用的 withRetry + withTimeout 工具（导出, T3 复用）
export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(ms);
  const combined = parentSignal
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
    if (combined.aborted) return onAbort();
    combined.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => { combined.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { combined.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  backoffMs: number,
  signal?: AbortSignal,
): Promise<{ value: T; retries: number }> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    try {
      const value = await fn();
      return { value, retries: attempt };
    } catch (e) {
      lastErr = e;
      if (e instanceof DOMException && e.name === 'AbortError') throw e;  // 不重试 abort
      if (attempt === retries) break;
      const delay = backoffMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4);  // ±20% jitter
      await new Promise<void>(r => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

export async function retrieveV2(config: RetrievalConfig): Promise<RetrieveV2Result> {
  const c = RetrievalConfigSchema.parse(config);  // zod 验证
  const trace: TraceEvent[] = [];
  let embedMs = 0, searchMs = 0, rerankMs = 0, dedupMs = 0;
  let totalRetries = 0;

  // 1. embed (with retry + timeout + abort)
  const t0 = Date.now();
  const embedResult = await withRetry(
    () => withTimeout(
      embed({...}, c.embed.apiKey),
      c.robustness.timeoutMs,
      c.robustness.abortSignal,
    ),
    c.robustness.retries,
    c.robustness.retryBackoffMs,
    c.robustness.abortSignal,
  );
  embedMs = Date.now() - t0;
  totalRetries += embedResult.retries;
  trace.push({ stage: 'embed', status: 'success', ms: embedMs });

  const queryVec = embedResult.value.vectors[0]!;
  if (queryVec === undefined) throw new Error('embed returned empty');

  // 2. search (并行 heading + paragraph) — with retry/timeout
  // ... 同样模式（Promise.all([withRetry(heading), withRetry(paragraph)])

  // 3. dedup
  const t3 = Date.now();
  // ... 复用 retrieveMerged 去重逻辑
  dedupMs = Date.now() - t3;

  // 4. rerank (可选, 软降级)
  if (c.rerank.enabled && hits.length > 0) {
    try {
      const t4 = Date.now();
      const rerankRes = await withTimeout(
        rerankHits(query, hits, { signal: c.robustness.abortSignal }),
        c.robustness.timeoutMs,
        c.robustness.abortSignal,
      );
      rerankMs = Date.now() - t4;
      hits = rerankRes.hits;
    } catch (e) {
      trace.push({ stage: 'rerank', status: 'error', ms: 0, error: String(e) });
      // 软降级: 继续用未 rerank 的 hits
    }
  }

  return {
    query: c.query,
    hits,
    elapsedMs: embedMs + searchMs + rerankMs + dedupMs,
    phases: { embedMs, searchMs, rerankMs, dedupMs, retries: totalRetries },
    trace: c.trace ? trace : [],
  };
}
```

**单测覆盖（spec §C 测试矩阵 6 维度）：**
- 正常路径：retrieveV2 跟 retrieveMerged hits 集合一致
- 超时：mock embed sleep 35s → retrieveV2 超时报错、不 hang
- 重试：mock embed 第 1 次 fail 第 2 次成功 → 成功 + trace 有 2 次 embed
- Abort：AbortController.abort() → 抛 AbortError、不重试
- Filter：namespace='corporate' → hits 全在 corporate 路径下
- rerank 软降级：mock rerank 失败 → hits 用未 rerank + trace 有 error

**验证命令：**
```bash
pnpm --filter @bootcamp/web typecheck
pnpm exec vitest run libs/rag/retrieve-v2.test.ts
```

**反例验证（spec §C 6 维度 + 3 个边界）：**
1. config 缺 `embed.apiKey` → parse 失败 → 不进 retry 循环
2. config 缺 `stores.heading` → parse 失败
3. 全部阶段 retry 都失败 → 抛最后的错 + trace 有 N 次失败

**commit 模板：**
```
feat(rag): add retrieveV2(config) production-grade retrieval (Day25)

实现 spec §2 全部契约:
- RobustnessConfig: timeoutMs + retries + retryBackoffMs + abortSignal
- Filter: namespace/version/sourceKinds 推 store.search
- Phases metric: embedMs/searchMs/rerankMs/dedupMs/retries
- Trace: TraceEvent[] (trace=true 时输出)
- Rerank 软降级: rerank 失败不破主流程

旧 retrieve()/retrieveMerged() 不动, Day12-Day20 example 全部能用.
```

---

### T6 — UI `RetrievalConfigPanel.vue` + 接入（2 天）

**目标**：在 `/embed-compare` 加折叠调参面板，让用户改 schema 字段实时看效果。

**触达文件：**
- 新增：`apps/web/src/views/embed-compare/components/RetrievalConfigPanel.vue`（~150 行）
- 改：`apps/web/src/views/embed-compare/components/QueryComposer.vue`（加 `<RetrievalConfigPanel>` 引用 + emit 新事件）
- 改：`apps/web/src/views/embed-compare/EmbedCompare.vue`（`run()` 改调 retrieveV2；state 加 retrievalConfig）
- 改：`apps/web/src/views/embed-compare/analysisState.ts`（`AnalysisState` 加 `retrievalConfig: RetrievalConfig | null`）

**UI Mockup（spec §D 描述）：**
```
Top K:           [— 10 +]
Namespace:       [all ▼]
□ Rerank On   └ Top K: [— 3 +]
Timeout:         [30000]ms
Retries:         [— 2 +]
□ 显示 Trace (advanced)
```

**实现要点：**
- Element Plus `<el-collapse>` 默认折叠
- props: `modelValue: RetrievalConfig`
- emits: `update:modelValue`
- 数字用 `<el-input-number>`，select 用 `<el-select>`，开关用 `<el-switch>`
- 分析结果区显示分段 metric（Phases metric 实时刷新）

**state 字段：**
```ts
// analysisState.ts
retrievalConfig: RetrievalConfig | null  // null = 用默认
// 初始化: defaultRetrievalConfig() factory
```

**EmbedCompare.run() 改造：**
```ts
async function run() {
  const cfg = analysisState.value.retrievalConfig ?? defaultRetrievalConfig();
  cfg.query = analysisState.value.query;  // 把 query 注入
  cfg.embed = {
    apiKey: ...,
    baseUrl: ...,
    model: embeddingModel,
  };
  cfg.stores = { heading: headingStore, paragraph: paragraphStore };
  const result = await retrieveV2(cfg);
  analysisState.value.phases = result.phases;
  analysisState.value.trace = result.trace;
  // ... 把 hits 喂给下游 panel
}
```

**验证命令：**
```bash
pnpm --filter @bootcamp/web typecheck
# dev 跑起来视觉验证
pnpm dev:web
# Chrome MCP 手动验证（不在 CI）
```

**反例验证（3 个）：**
1. 用户在面板输入 topK=0 → el-input-number 阻止（min=1）
2. 用户改 namespace='docs' → 下次 Analyze → hits 全在 docs 路径
3. 用户点 Rerank On 但 rerank 端报错 → UI 显示 "rerank failed, fallback to vector only" 提示

**commit 模板：**
```
feat(web): add RetrievalConfigPanel to embed-compare (Day25)

UI 调参面板 (Element Plus 折叠):
- Top K / Namespace / Rerank toggle / Timeout / Retries / Trace toggle
- 默认折叠, 不破坏 QueryComposer 视觉

EmbedCompare.run() 改用 retrieveV2; state 加 retrievalConfig 字段.
面板字段实时反映到 analysisState.retrievalConfig.
```

---

### T7 — example 脚本 ×4（1 天）

**目标**：4 个 example 验证 retrieveV2/ingestV2 各维度。

**触达文件：**
- 新增：`examples/day25/ex_001_retrieve_v2_basic.ts`
- 新增：`examples/day25/ex_002_retrieve_v2_resilience.ts`
- 新增：`examples/day25/ex_003_retrieve_v2_filter.ts`
- 新增：`examples/day25/ex_004_ingest_v2.ts`

**每个 example 内容（spec §Examples）：**
- ex_001 basic: 跑 retrieveV2 vs retrieveMerged 对比，验证基本路径
- ex_002 resilience: mock 超时 / 重试 / abort / rerank 软降级
- ex_003 filter: namespace=corporate vs all 召回差异
- ex_004 ingest: 用 IngestConfig 跑增量入库（mini corpus 3 篇 doc）

**验证命令：**
```bash
pnpm exec tsx examples/day25/ex_001_retrieve_v2_basic.ts
pnpm exec tsx examples/day25/ex_002_retrieve_v2_resilience.ts
pnpm exec tsx examples/day25/ex_003_retrieve_v2_filter.ts
pnpm exec tsx examples/day25/ex_004_ingest_v2.ts
```

**反例验证（3 个）：**
1. ex_001 拿不到 lancedb → 提示"先跑 ex_004 ingest 入库"
2. ex_002 mock embed 故意 sleep 40s → 验证超时（不 hang）
3. ex_003 namespace=docs + corpus 没数据 → 返回 hits=[]（不抛）

**commit 模板：**
```
docs(examples): add Day25 retrieveV2/ingestV2 verification (Day25)

4 个 example 脚本验证:
- ex_001: basic retrieval 对比 retrieveMerged
- ex_002: resilience (timeout/retry/abort/rerank fallback)
- ex_003: filter by namespace
- ex_004: ingest mini corpus
```

---

### T8 — Chrome MCP 端到端验证 + 总 commit（半天）

**目标**：浏览器实测 UI + 关闭整个 task。

**步骤：**
1. `pnpm dev:web` 起 dev server
2. Chrome MCP 打开 `http://127.0.0.1:5173/embed-compare`
3. 输入 query "ai-coding 是什么"
4. 截图：默认折叠状态、展开调参面板、改 topK=3、改 namespace=docs、点 Rerank On
5. 验证：分段 metric 在结果区显示
6. git status 确认 working tree 干净（除新建文件）
7. 写 commit message，commit 整个 Day25 工作

**commit 模板：**
```
feat(day25): retrieval + ingest 全栈配置化 + UI 调参面板

完整 spec: docs/superpowers/specs/2026-09-15-rag-retrieval-config-design.md

实施:
- libs/rag/config.ts: 共享 zod schema (EmbedProvider/Robustness/Rerank + Retrieval/Ingest)
- libs/rag/retrieve-v2.ts: 生产可用级 retrieval (timeout/retry/abort/filter/metric/trace)
- libs/rag/ingest-v2.ts: 复用 schema 的 ingest wrapper
- libs/rag/store.ts: search() 加可选 FilterCondition
- apps/web: RetrievalConfigPanel.vue + EmbedCompare.run() 改 retrieveV2
- examples/day25: 4 个验证 example

旧 API (retrieve/retrieveMerged/incrementalIndex) 0 破坏,
Day12-Day24 全部调用方不动.
Chrome MCP 端到端验证通过.
```

---

## 验证总览（Day09 3 关）

| 关 | 内容 | 状态 |
|----|------|------|
| **docs** | spec (committed) + ADR 0003 cross-ref | ✅ |
| **example** | 4 个 example 脚本（T7） | ⏳ T7 后 |
| **怎么测** | 单测（T1/T3/T5） + 集成测（T7）+ Chrome MCP（T8） | ⏳ T8 后 |

## 总耗时预估

| 任务 | 预估 |
|------|------|
| T1 config + 单测 | 半天 |
| T2 store search 重载 | 半天 |
| T3 ingest-v2 + 单测 | 1 天 |
| T4 reranker 摸底 | 半天（与 T1 并行）|
| T5 retrieve-v2 + 单测 | 2 天 |
| T6 UI 面板 | 2 天 |
| T7 example ×4 | 1 天 |
| T8 Chrome MCP 验证 | 半天 |
| **合计** | **~8 天**（与 spec 一致） |

## 风险与回滚

**回滚成本：** 新增 4 个文件 + 改 5 个文件 → 回滚 = 删 4 文件 + `git checkout` 5 文件，**5 分钟**

**风险 1：lancedb .where() 性能**
- 大库 + filter 可能慢 → T2 实施时跑 perf 基准
- 缓解：T5 单测里加 perf 断言（粗略，不强求）

**风险 2：retry 风暴**
- 极端网络下 retry 累计时间 = timeoutMs × retries → 可能 90s
- 缓解：UI Timeout 字段暴露给用户，让他们自己调

**风险 3：rerank 软降级掩盖 bug**
- rerank 频繁失败但用户不知 → 日志记 trace
- 缓解：T6 UI 显示 "rerank failed, fallback" 红色提示

## 决策点（实施过程中需老大拍板）

1. **rerankHits mock 策略**：用 vitest mock 还是真实 fetch？→ T4 摸底后决定
2. **lancedb .where() 语法**：用字符串 SQL 还是 builder？→ T2 决定
3. **UI 调参面板放在哪里**：QueryComposer 内部 vs 外部？→ T6 决定（spec 已倾向外部）
4. **commit 节奏**：8 个 commit（T1-T7 各一，T8 总）vs 单 commit？→ 建议 8 个（小步快跑，便于回滚）