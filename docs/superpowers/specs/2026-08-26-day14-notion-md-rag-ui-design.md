# Day 14 — Notion/MD RAG UI 层设计

**Date**: 2026-08-26
**Status**: Draft (待 review)
**Author**: brainstorming 输出
**Scope**: Day 14 一天的学习内容

---

## Context

Day 13 把个人 Notion workspace + md 文件 chunk + embed + 入 lancedb 这条链路跑通了，但只是 CLI：
- `examples/notion_import/main.ts` 全量 / 增量入库
- md 文件目前**没有可 spawn 的 CLI 入口**（手动调 `libs/rag/incrementalIndexFromSources`）

Day 14 的目标：把这套链路提升到一个**完整 UI 应用**，让"输入 query → 看到命中 chunks + 相似度"以及"点入库按钮 → 看 phase 进度"成为可交互体验。同时 Day 14 也是第一次把仓库现有的 `apps/web`（Vue）+ `apps/api`（Hono）真正串到一个具体业务场景上。

### 关键约束（用户已确认）

1. **UI 角色**：搜索台（只读 lancedb）+ 入库台（写 lancedb）两个 tab 都要
2. **可视化形态**：相似度热力条（余弦相似度 0..1）+ 命中 chunk 文本
3. **API 形态**：搜索 POST，入库走 SSE（4 phase 流式）
4. **Config**：UI 不管 config，全走 .env
5. **namespace**：notion / md / all 三个下拉，分别对应独立 lancedb table
6. **md 入库**：Day14 内先抽 `examples/md_import/main.ts`（镜像 notion_import 形态）
7. **超时**：5 分钟硬超时
8. **highlight**：后端计算（query 关键词在 content 中的 charRange）
9. **e2e**：不做
10. **学习目标 9 项**：前后端分离工程化 / zod 单一事实源 / CLI 复用 / SSE 协议设计 / 可视化设计 / 错误处理 / 测试 / 跨进程错误传递 / UI 状态机

---

## Decision

### 架构（推荐方案 1）

```
[Vue SPA @5173]
   ├─ tab=搜索：POST /api/search {query, topK, namespace}
   └─ tab=入库：POST /api/ingest {namespace} → SSE
[Hono @3000]
   ├─ /api/search  → libs/rag/retrieve()
   └─ /api/ingest  → spawn `tsx examples/<ns>_import/main.ts` + parse stdout → SSE
[.lancedb/rag]
   ├─ chunks_notion_heading + chunks_notion_paragraph + chunks_notion_meta
   └─ chunks_md_heading + chunks_md_paragraph + chunks_md_meta
```

**关键设计**：
- **复用 main.ts，不重写 RAG 核心**。API 层只做"命令 + 转发 + phase 解析"。
- **日志即协议**：不改 main.ts 的 stdout 文案，API 层用正则 parse `>>> Notion import / >>> Diff / >>> Embed / >>> Write` 这 4 行，转成结构化 SSE phase 事件。
- **zod schema 单一事实源**：放 `libs/api-schema/`，前后端共用（同 TS project）。

---

## Components

### 新增文件

| 路径 | 角色 |
|---|---|
| `libs/api-schema/src/index.ts` | barrel |
| `libs/api-schema/src/search.ts` | `SearchRequest` / `SearchResponse` / `Hit` zod schema |
| `libs/api-schema/src/ingest.ts` | `IngestRequest` / `PhaseEvent` / `DoneEvent` / `ErrorEvent` |
| `libs/api-schema/src/error.ts` | `ApiError` 错误返回体 |
| `libs/api-schema/src/env.ts` | `HealthResponse` / `NamespaceHealth` |
| `apps/api/src/rag-search.ts` | POST /api/search handler |
| `apps/api/src/rag-ingest.ts` | POST /api/ingest SSE handler |
| `apps/api/src/spawn-main.ts` | spawn 子进程 + 解析 stdout 的 phase 行 |
| `apps/api/src/parse-phase.ts` | 4 种 phase marker 正则解析（pure function） |
| `apps/api/src/env.ts` | .env 校验 + `/api/health` |
| `apps/api/src/highlight.ts` | query 关键词 → content charRange |
| `examples/md_import/main.ts` | 镜像 notion_import，md 文件入 `chunks_md` 前缀（indexer 自动拼 `_heading` / `_paragraph` / `_meta` 三表，详见 ADR 0004） |
| `examples/md_import/collect.ts` | md 文件 glob + read |
| `apps/web/src/views/SearchView.vue` | 搜索 tab 整体 |
| `apps/web/src/views/IngestView.vue` | 入库 tab 整体 |
| `apps/web/src/components/HitCard.vue` | 单条命中（相似度热力条 + 高亮文本） |
| `apps/web/src/components/PhaseStream.vue` | SSE 4 phase 时间线 |
| `apps/web/src/components/QueryBox.vue` | 输入框 + namespace 下拉 |
| `apps/web/src/components/TabBar.vue` | 顶 tab 切换 |
| `apps/web/src/lib/sse.ts` | 浏览器 EventSource 包装（带 cancel + abort） |
| `apps/web/src/lib/api-schema.ts` | re-export `libs/api-schema` |
| `apps/web/src/lib/state.ts` | 4 态 UI 状态机 (`idle`/`loading`/`streaming`/`done`/`error`) |
| `tests/parse-phase.test.ts` | 4 phase marker + 错误行解析 |
| `tests/retrieve-namespaces.test.ts` | 单 namespace / all namespace merge topK |
| `tests/ingest-sse.test.ts` | spawn mock → 4 phase + done + error |
| `tests/highlight.test.ts` | 中文 / 空 query / 无匹配 |

### 复用文件（不重写）

- `libs/rag/index.ts` 全部 export
- `examples/notion_import/main.ts` — 直接 spawn，不改
- `examples/notion_import/collect.ts` — 不动
- `apps/api/src/server.ts` — 加两个 route，不动 SSE adapter
- `apps/api/src/sse-adapter.ts` — 复用 Hono `streamSSE`

---

## API Contract

### POST /api/search

**Request**:
```ts
SearchRequest = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(50).default(5),
  namespace: z.enum(['notion', 'md', 'all']).default('all'),
});
```

**Response 200**:
```ts
Hit = z.object({
  chunkId: z.string(),
  sourceKind: z.enum(['notion', 'md']),
  sourceLabel: z.string(),
  content: z.string(),
  score: z.number(),                          // 0..1 cosine similarity，越大越相似（后端把 lance cosine distance 转成 1-distance）
  chunkKind: z.enum(['heading', 'paragraph']),
  highlight: z.array(z.object({               // 后端算
    start: z.number().int(),
    end: z.number().int(),
    term: z.string(),
  })),
  meta: z.record(z.string(), z.unknown()).optional(),
});

SearchResponse = z.object({
  hits: z.array(Hit),
  phases: z.object({
    embedMs: z.number(),
    retrieveMs: z.number(),
    totalMs: z.number(),
  }),
});
```

**错误**: 400 / 500（zod parse / lance / embed）

### POST /api/ingest（SSE）

**Request body**:
```ts
IngestRequest = z.object({
  namespace: z.enum(['notion', 'md']),
  dryRun: z.boolean().default(false),
});
```

**SSE events**:

| event | data 形状 | 来源（main.ts stdout） |
|---|---|---|
| `phase` | `{ name: 'fetch', ms, payload: {...} }` | `>>> Notion import: ... in Nms` |
| `phase` | `{ name: 'diff', ms, payload: {...} }` | `>>> Diff: +N added, ...` |
| `phase` | `{ name: 'embed', ms, payload: {...} }` | `>>> Embed: heading=N paragraph=M (fallback: {...})` |
| `phase` | `{ name: 'write', ms, payload: {...} }` | `>>> Write: N chunks in Nms` |
| `done` | `{ namespace, dryRun, added, modified, removed, totalMs }` | 子进程 exit 0 |
| `error` | `{ message, exitCode?, stderrTail? }` | 子进程 exit ≠ 0 / spawn 失败 / timeout |

### GET /api/health

**Response**:
```ts
HealthResponse = z.object({
  ok: z.boolean(),
  namespaces: z.object({
    notion: NamespaceHealth,    // { ready: bool, missing: string[] }
    md: NamespaceHealth,
  }),
});
```

### 全局错误体

```ts
ApiError = z.object({
  error: z.string(),
  code: z.enum([
    'bad_request', 'unauthorized', 'not_found',
    'env_missing', 'ingest_failed', 'lance_error', 'embed_error',
  ]),
  details: z.record(z.string(), z.unknown()).optional(),
});
```

---

## Data Flow

### 一次搜索

```
User → QueryBox.submit("RAG chunk 策略")
   │
   ▼
SearchView: state = 'loading'
   │ fetch POST /api/search {query, topK:5, namespace:'all'}
   ▼
Hono /api/search
   │ zod parse → 400 if invalid
   │ embed(query) [libs/rag embed helpers]
   │ retrieve(query, namespace):
   │   ├── 'notion' → openVectorStore('chunks_notion_heading').search()（ADR 0004 双表对齐）
   │   ├── 'md'     → openVectorStore('chunks_md_heading').search()（ADR 0004 双表对齐）
   │   └── 'all'    → 并行两路，merge topK by score
   │ highlights: 后端对每个 hit 算 query 关键词 charRange
   │ → { hits, phases }
   ▼
SearchView: state = 'done'
   │ render <HitList>
   ▼
User 看到 5 条 <HitCard>：
   ┌─ #1 ████████▏ 0.871 ─────────────────┐
   │ heading / source: notion/AI 笔记.md │
   │ # RAG chunk 策略                    │
   │ chunkByHeading + chunkByParagraph…  │
   └─────────────────────────────────────┘
```

### 一次入库

```
User → IngestView.click("入库") + namespace=notion
   │
   ▼
IngestView: state = 'streaming'
   │ new EventSource('/api/ingest?namespace=notion')
   ▼
Hono /api/ingest (streamSSE)
   │ zod parse
   │ child = spawn('pnpm', ['tsx', 'examples/notion_import/main.ts', ...])
   │ setTimeout 5min → kill child (硬超时)
   │ child.stdout.on('data', line =>
   │     parseLine(line) → match /^>>> (Notion import|Diff|Embed|Write):/
   │     → writeSSE({event:'phase', data:{name, ms, payload}})
   │  )
   │ child.on('exit', code =>
   │     writeSSE({event:'done'}) or writeSSE({event:'error', ...})
   │  )
   ▼
EventSource onmessage
   │ append to phases[]
   ▼
PhaseStream 渲染
   ┌─ ✓ fetch   12.3s  seedPages=8, childPages=42 ──┐
   ├─ ✓ diff     0.8s  +5 +3 -1 unchanged=12 ──────┤
   ├─ ◌ embed   2.3s  (streaming…)                  │
   ├─ ○ write                                       │
   └─────────────────────────────────────────────────┘
```

### UI 状态机

```
                 submit
[ idle ] ────────────────────► [ loading ]
   ▲                              │ fetch resolve
   │                              ▼
[ done ] ◄────────────────── [ loading → streaming ]
   ▲                              │ (入库流式阶段)
   │                              ▼
[ error ] ◄──────────────────── [ streaming ]
   ▲   ▲
   │   │ abort / network err
   └───┘
```

每个 view 内部 5 态：`idle` / `loading` / `streaming` / `done` / `error`。

---

## Error Handling

### 4.1 .env 校验

启动时校验：
```ts
const required = {
  search: ['OPENAI_API_KEY'],
  notion: ['NOTION_TOKEN', 'OPENAI_API_KEY'],
  md:     ['OPENAI_API_KEY'],
};
```

`/api/health` 返回 `{ ok, namespaces: { notion: {ready, missing}, md: {ready, missing} } }`。

UI 在 mount 时 GET /api/health：
- `notion.ready === false` → 入库台 "入库 notion" 按钮置灰 + tooltip 列出缺 key
- `md.ready === false` → 同上
- 检索台按钮永远可用（无 key 时显示 "embedding 服务未配置"）

### 4.2 入库子进程错误传递

- 子进程 exit ≠ 0 → SSE `event: error`，data: `{ exitCode, stderrTail: 500 }`（stderr 最后 500 字符）
- spawn 失败（tsx 不在 PATH）→ SSE `error`，data: `{ message: 'tsx not found' }`
- 客户端断线（request.signal.abort）→ `child.kill('SIGTERM')` + SSE 关闭
- 5 分钟硬超时 → `child.kill('SIGTERM')` + SSE `error`，data: `{ message: 'ingest timeout after 5min' }`

### 4.3 搜索错误

- embed API 5xx → 500 `embed_error`，UI toast: "embedding 服务挂了"
- lance 读失败 → 500 `lance_error`，UI toast: "索引读取失败"
- zod parse fail → 400 `bad_request`，UI toast: 输入校验失败原因

### 4.4 跨进程错误传递的学习点

Day14 第一次涉及"主进程 ↔ 子进程"错误传递：
- 子进程 `exit code` 是**唯一可靠的失败信号**（main.ts 内部 try/catch 把错吃掉时也只剩 exit code）
- stderr 是**唯一可靠的 stack trace 通道**（stdout 被 phase marker 占用）
- API 层需要把 `(exit code, stderr tail)` 翻译成 SSE `error` 事件，**不能直接 forward stderr 原文**（可能含 Notion 文档内容、内部错误堆栈等敏感信息）
- 学习目标明确：**这是后续 Day 15+ Coding Agent 跑子进程时会复用的模式**

---

## Testing

### 5.1 测试分层

| 层 | 工具 | 覆盖 |
|---|---|---|
| unit | vitest | `parse-phase.ts` / `highlight.ts` / `env.ts` |
| integration | vitest + spawn mock | `retrieve()` 跨 namespace merge；spawn dry-run → 4 phase + done |
| api 合约 | vitest + `app.request()` | 200 / 400 / 500；SSE 4 phase + done + error |

e2e 不做（YAGNI，Day15+）。

### 5.2 关键测试用例

```
parse-phase.test.ts
  ✓ 匹配 `>>> Notion import: seedPages=8, childPages=42, total=50 pages in 12345ms`
  ✓ 匹配 `>>> Diff: +5 added, +3 modified, -1 removed, 12 unchanged`
  ✓ 匹配 `>>> Embed: heading=8 paragraph=15 (fallback: {...})`
  ✓ 匹配 `>>> Write: 23 chunks in 1500ms`
  ✓ 不匹配 `fatal: ...` 行
  ✓ 空行 skip

highlight.test.ts
  ✓ 英文 query / content
  ✓ 中文 query / content
  ✓ 空 query → 返回 []
  ✓ 无匹配 → 返回 []

retrieve-namespaces.test.ts
  ✓ 单 namespace topK
  ✓ 'all' namespace: 两条 topK merge by score
  ✓ namespace 名错（'foo'）→ 400

ingest-sse.test.ts
  ✓ spawn notion_import dry-run → 4 phase events + done
  ✓ spawn md_import（mock）→ 4 phase events + done
  ✓ 子进程 exit 1 → error event
  ✓ 5 分钟超时 → error event (mock setTimeout)
  ✓ abort → child killed

api-contract.test.ts
  ✓ POST /api/search 200 with Hit[]
  ✓ POST /api/search 400 (缺 query)
  ✓ POST /api/search 500 (lance mock throw)
  ✓ POST /api/ingest SSE 4 phase + done
  ✓ POST /api/ingest 错误 namespace → 400
  ✓ GET /api/health
```

### 5.3 反 YAGNI 红线

- ❌ 不做 chunk 删除 / 编辑 UI
- ❌ 不做多 embedding 模型切换 UI
- ❌ 不做 user 系统 / 登录
- ❌ 不做 trace 持久化
- ❌ 不做 ingest 历史回放
- ❌ 不做 chunk preview hover（仅命中后展示全文）

---

## Consequences

### 收益

1. Day 13 CLI 链路可视化了 → "可演示"价值升级
2. **零 RAG 重写**：复用 `examples/notion_import/main.ts` + `libs/rag/retrieve()`，Day 13 写的代码没浪费
3. **zod 单一事实源**：把 ADR-0003 精神从 Tool 扩到 HTTP API
4. **SSE phase 流**：建立"主进程 ↔ 子进程"错误传递模式（Day 15+ Coding Agent 会复用）

### 代价 / 风险

1. **spawn 进程开销**：每次入库都 fork 一个 tsx 子进程（启动 ~1-2s）。可接受（手动触发，非高频）
2. **stdout 文案耦合**：parse-phase.ts 正则与 main.ts 文案硬绑定 → main.ts 改文案要同步改 parse-phase.ts。**只 1 个耦合点**，可控
3. **5 分钟硬超时可能误杀**：Notion 库大时 embedding 可能超过 5 分钟。Day14 接受；后续可调
4. **md_import/main.ts 是新写的**：Day14 范围内第一次有 md CLI 入口，需要先把 md 文件 → DocSource 的转换抽出来（从 `libs/rag/fixtures/docs-corpus.ts` 借代码）

### Day 14 一句话范围

> 把 `examples/notion_import/main.ts` + 新抽的 `examples/md_import/main.ts` 两条 CLI 链路，通过 Hono SSE + Vue 暴露为「搜索 + 入库」两个 UI 页面，全程复用 `libs/rag/` 不重写 RAG 核心。

---

## Enforcement

- [ ] **不引新依赖**：grep `pnpm-lock.yaml` / `package.json` 确认 Day14 无新依赖
- [ ] **不改 main.ts**：notion_import / md_import 的 stdout 文案不被 UI / API 改动
- [ ] **zod 单一事实源**：`grep -r 'z\.object' apps/api apps/web` 应只命中 `libs/api-schema/`
- [ ] **不写权限校验**（CLAUDE.md 红线）：本任务无用户系统
- [ ] **不写历史遗留兼容**（CLAUDE.md 红线）：Day14 是新增

---

## Open Questions

无。所有澄清问题在 brainstorming 阶段已确认。
