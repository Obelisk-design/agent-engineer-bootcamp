# Day 14 — Notion/MD RAG UI（`POST /api/search` + `POST /api/ingest` SSE + `GET /api/health`）

> 65 天 AI Agent 工程师训练营 · Day 14 / 65
> 主题：把 Day 13 的 RAG CLI 链路（`notion_import` / 新抽 `md_import`）通过 Hono + Vue 暴露成「搜索 + 入库」两个 UI 页面。
> 前置：Day 13 `libs/rag/{chunk,store,retrieve,prompt,evaluate}`、Day 13.5 `libs/notion/` + `examples/notion_import/`（Day 14 的 RAG 上游链路 + notion 子进程入口）、Day 12 `libs/embedding/`、Day 11 zod schema 单一事实源（ADR 0003 → 扩到 HTTP API 层）。
> 路线修正：本 day **无修正**，按 spec §0 路线表顺序推进。

---

## ⚠️ 路线修正（First things first）

无。

spec §0 路线表 Day 14 = 「Notion / MD RAG UI 层」，与 Day 13 RAG 最小闭环顺接，按方案直接落地。

---

## 🎯 今日目标

9 项学习目标（spec §0 + plan Task 1-15 映射）：

1. ✅ `libs/api-schema/` 作为 workspace 包 `@bootcamp/api-schema`，落地 zod 单一事实源（search / ingest / error / env），前后端共用同一 TS 项目
2. ✅ `apps/api/src/{parse-phase,spawn-main,highlight,env,rag-search,rag-ingest,rag-server,rag-server-entry}.ts` —— 「日志即协议」API 层
3. ✅ `examples/md_import/{main,collect}.ts` —— 镜像 `notion_import` 形态，4 phase marker 对齐
4. ✅ 5 闸 + 新增第 5 类测试 `tests/api-contract.test.ts`（Hono `app.request()` in-process 合约 4 用例）
5. ✅ `apps/web/src/lib/{sse,state,api-schema}.ts` —— EventSource 包装、5 态 UI 状态机、schema re-export
6. ✅ `apps/web/src/components/{TabBar,QueryBox,HitCard,PhaseStream}.vue` —— 4 个 web component
7. ✅ `apps/web/src/views/{RagApp,IngestView}.vue`（SearchView 改名为 RagApp 兼容命名）+ App.vue tab 路由 + Vite /api proxy
8. ✅ 手动端到端：双终端 `dev:rag` (port 3100) + `dev:web` (port 5173)，浏览器跑通搜索热力条 + 入库 4 phase 时间线
9. ✅ 守住 YAGNI：spec §5.3 明列「❌ 不做」清单全部守住（不引新依赖 / 不写权限 / 不做 e2e / 不修改 main.ts / 重用 `libs/rag/` 不重写）

---

## 📦 今日产出物

```text
libs/api-schema/                          🆕 workspace 包（@bootcamp/api-schema）
  package.json                                # name + exports
  tsconfig.json                               # 继承根 tsconfig
  src/
    index.ts                                  # barrel
    search.ts                                 # SearchRequest/Response/Hit zod schema
    ingest.ts                                 # IngestRequest/PhaseEvent/DoneEvent/ErrorEvent
    error.ts                                  # ApiError 全局错误体
    env.ts                                    # HealthResponse/NamespaceHealth

apps/api/src/
  parse-phase.ts                          🆕 4 phase marker 正则解析（pure function）
  spawn-main.ts                           🆕 spawn 子进程 + 5min 硬超时 + abort + stderr tail
  highlight.ts                            🆕 query 关键词 → content charRange
  env.ts                                  🆕 .env 校验 + getNamespaceHealth
  rag-search.ts                           🆕 POST /api/search handler
  rag-ingest.ts                           🆕 POST /api/ingest SSE handler（streamSSE + phase event）
  rag-server.ts                           🆕 createRagApp()（与 createAgentApp 完全独立）
  rag-server-entry.ts                     🆕 独立启动 createRagApp()，绑 PORT env

examples/md_import/                          🆕 镜像 notion_import CLI 形态
  main.ts                                     # 4 phase stdout marker（与 notion_import 对齐）
  collect.ts                                  # listMdFiles + readMdFile（pure functions）

apps/web/src/lib/
  sse.ts                                  🆕 subscribeSSE<EventName> 包装（EventSource）
  state.ts                                🆕 UiState 5 态状态机（idle/loading/streaming/done/error）
  api-schema.ts                           🆕 re-export libs/api-schema 单一事实源

apps/web/src/components/
  TabBar.vue                              🆕 top tab 切换（搜索/入库）
  QueryBox.vue                            🆕 query input + namespace 下拉
  HitCard.vue                             🆕 单条命中（相似度热力条 + 高亮文本）
  PhaseStream.vue                         🆕 SSE 4 phase 时间线

apps/web/src/views/
  RagApp.vue                              🆕 搜索 view（POST /api/search + hits 渲染）
  IngestView.vue                          🆕 入库 view（fetch + ReadableStream SSE 解析 + 4 phase 时间线）

apps/web/src/App.vue                     MODIFIED — 替换为 TabBar + 当前 view
apps/web/vite.config.ts                  MODIFIED — /api proxy 到 RAG server

scripts/with-ports.ts                     MODIFIED — `rag` 子命令注入 PORT env（commit c833050）

tests/                                      🆕（注：与 apps/api 同级，仓库 vitest 默认收集）
  parse-phase.test.ts                         # 4 phase marker + 错误行 + 空行
  spawn-main.test.ts                          # 2 tests：真 spawn notion_import dry-run 解析 4 phase events + abort listener cleanup
  highlight.test.ts                           # 5 tests（英文/中文/空 query/无匹配/多次出现）
  env.test.ts                                 # 4 tests（.env 校验 + getNamespaceHealth）
  api-contract.test.ts                        # 4 tests（POST /search 缺 query → 400；POST /search bad namespace → 400；GET /health → 200 + namespaces；POST /ingest 缺 namespace → 400）

package.json                              MODIFIED — +dev:rag 脚本 + workspace 依赖 @bootcamp/api-schema
```

**测试**：本 day 计划 Task 15 Step 4 跑 4 闸全绿；spec §5.2 列「retrieve-namespaces.test.ts」「ingest-sse.test.ts」**未落到仓库**（Day 13.5 `tests/libs/rag/indexer.test.ts` 14 cases namespace isolation 侧面覆盖）。

---

## 🔧 关键命令速查

```bash
# === 双终端 dev（手动端到端，主验收路径）===
# terminal 1
pnpm dev:rag                  # scripts/with-ports.ts rag 3100 → apps/api/src/rag-server-entry.ts
# terminal 2
pnpm dev:web                  # Vite 5173 + /api proxy → 127.0.0.1:3100

# === 4 闸必跑 ===
pnpm typecheck                # tsc --noEmit（strict 全开）
pnpm typecheck:web            # vue-tsc --noEmit -p apps/web/tsconfig.json
pnpm lint                     # eslint .
pnpm format:check             # prettier --check .
pnpm test                     # vitest run

# === 第 5 闸（plan Task 15 Step 4）===
pnpm test tests/parse-phase.test.ts          # 4 marker + 错误行 + 空行
pnpm test tests/spawn-main.test.ts           # 2 tests（真 spawn dry-run + abort cleanup）
pnpm test tests/highlight.test.ts            # 5 tests
pnpm test tests/env.test.ts                  # 4 tests
pnpm test tests/api-contract.test.ts         # 4 tests（Hono app.request() 合约）

# === 手动端到端三步 ===
# 1. 浏览器开 http://127.0.0.1:5173
# 2. 「搜索」tab：输入 query → 看到 hits + 相似度热力条（热力条颜色 = 0..1）
# 3. 「入库」tab：选 namespace（notion/md）→ 点入库 → 看到 4 phase 时间线（fetch/diff/embed/write）
```

---

## 🎯 如何验证本章（独立可查）

> **这一章独立可查** —— 只看本节就知道怎么跑通 Day 14，不依赖前面的章节。

### 一句话验证

spec §5.1 三层验证：unit（vitest）→ integration（真 spawn 子进程 dry-run）→ API 合约（Hono in-process `app.request()`）；e2e **不做**（spec §5.3 明列）。

### 跑通命令

```bash
# Unit 层
pnpm test tests/parse-phase.test.ts          # 4 marker（Notion import / Diff / Embed / Write）+ 'fatal:' 不匹配 + 空行 skip + (DRY-RUN) infix 修复
pnpm test tests/highlight.test.ts            # 5 tests（英文/中文/空 query → []/无匹配 → []/多次出现）
pnpm test tests/env.test.ts                  # 4 tests（NOTION_TOKEN + OPENAI_API_KEY 缺失/存在 → getNamespaceHealth）

# Integration 层（真子进程 dry-run）
pnpm test tests/spawn-main.test.ts           # 2 tests：真 spawn notion_import dry-run → 解析 4 phase events + abort listener cleanup（~3.8s）

# API 合约层（Hono in-process）
pnpm test tests/api-contract.test.ts         # 4 tests：POST /search 缺 query 400；POST /search bad namespace 400；GET /health 200 + namespaces.notion/md；POST /ingest 缺 namespace 400

# CLI dry-run（验收 spec §日志即协议）
MD_SOURCE_DIR=./notes OPENAI_API_KEY=sk-test pnpm tsx examples/md_import/main.ts --dry-run
                                              # 看到 ">>> Notion import (DRY-RUN): ..." 和 ">>> Diff: ..." 两行

# 手动端到端（plan Task 15 Step 3）
# terminal 1：pnpm dev:rag        # with-ports 注入 PORT=3100 → rag-server-entry.ts
# terminal 2：pnpm dev:web        # Vite 5173 + /api proxy → 127.0.0.1:3100
# 浏览器 http://127.0.0.1:5173 → 搜索 tab 输入 query 看 hits + 相似度热力条；入库 tab 点入库看 4 phase 时间线
```

### 已知盲点

- **合约测试只覆盖错误分支**：spec §5.2 列的 `POST /api/search 200 with Hit[]` / `500 (lance mock throw)` / `POST /api/ingest SSE 4 phase + done` 三条**未落到该文件**；SSE 成功路径由 `tests/spawn-main.test.ts` 间接覆盖到 spawn 层（真 spawn dry-run 解析 4 phase events），但没走 HTTP route。
- **spec 明确不做 e2e**：搜索热力条、4 phase 时间线、tab 切换全靠浏览器手测；无 Playwright / Chrome MCP 脚本化断言。
- **`retrieve-namespaces.test.ts`（spec §5.2 列出）在仓库中不存在**；namespace 'all' merge by score 的行为由 `tests/libs/rag/indexer.test.ts` 14 cases namespace isolation 用例侧面覆盖。
- **真搜索 / 真入库需 `OPENAI_API_KEY` + 已有 lancedb 数据**（`.lancedb/`，gitignored）—— 干净 clone 跑不出 hits。
- **检索 view（RagApp.vue）真实跑 RAG 流程未在本 day 自动化**：测试用例只验错误分支 + health；success path 由手动端到端覆盖。

---

## 🐛 踩坑与修复（关键决策 ledgered）

### R6 — retrieve 签名冲突

**症状**：写 `rag-search.ts` 时直接调 `retrieve(queryVec, store, { topK })`，typecheck 报 `retrieve` 实际签名不一致。

**根因**：Day 13 `libs/rag/retrieve.ts` 的实际导出签名与 spec 假设不完全对齐（`retrieve(query, store, opts)` 三参 vs spec 假设的二参 + 查询内嵌 embed）。

**修法**（plan Task 7 Step 3 写明）：先 grep 实际导出：

```bash
grep -E "^export" libs/rag/retrieve.ts libs/rag/store.ts
```

根据实际导出调整 `rag-search.ts` 调用点到一致。**不**用 `as any` 兜住，**不**改 `retrieve.ts` 来适配调用方，而是改调用方对齐库。

**Why**：调用方对齐库方向 = "库稳定优先"。spec 写的是意图，落差修一边才不破坏 Day 13 测试。

### R8 — SSE 客户端 EventSource → fetch+ReadableStream

**症状**：Day 14 spec 初版前端用 `new EventSource('/api/ingest?namespace=...')` 消费 SSE。

**根因**：`EventSource` 浏览器原生只支持 GET，且不支持自定义 body（POST body 无法透传）。`POST /api/ingest` 必须用 `fetch + res.body.getReader()` 手动按 `\n\n` 分帧。

**修法**：

```ts
const res = await fetch('/api/ingest', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ namespace, dryRun }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf('\n\n')) >= 0) {
    const frame = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    parseFrame(frame);  // event: phase|done|error|stderr
  }
}
```

**Why**：spec §2.2 写明入库走 POST + SSE，浏览器侧只能 fetch + ReadableStream。`lib/sse.ts` 抽 helper 时沿用同样逻辑（非 EventSource 包装）。

### R10 — IngestView 接 QueryBox 共享 namespace

**症状**：IngestView 独立选用 `namespace` ref，跟 SearchView 的 `QueryBox` 隔离。

**根因**：两 view 都要选 namespace，写两份重复；QueryBox 已经是 `defineProps<{namespace}>` + emit(`namespaceChange`) 的可控组件。

**修法**：两 view 都 `<QueryBox :namespace="namespace" @namespace-change="..." />`，namespace ref 在 view 内部。

**Why**：组件职责清晰（QueryBox = 输入 + namespace 选择，view = 状态 + 编排）。

### R12 — App.vue 替换 → hash route tab 切换

**症状**：初版用 `vue-router` 切两个 view。

**根因**：Day 12 已经用 hash switch 17 行实现「Agent / Embed」两 view（`apps/web/src/router/` 不存在，vue-router 未引）。Day 14 两个 RAG view 走同模式，避免引 vue-router。

**修法**：`active = ref<'搜索' | '入库'>('搜索')`，`<SearchView v-if="active === '搜索'" /><IngestView v-else />`。

**Why**：YAGNI 红线 —— 项目唯一的「路由」就是这两条 day14 dev 页面，引 vue-router = 引入一整套生命周期只为这一条路由，明显过度。

### F-1 — PhaseStream 类型契约

**症状**：`<PhaseStream :phases="..." :done="..." :error="..." />` 三 prop 类型在 component 定义 vs page 调用时不一致。

**根因**：`PhaseEvent` schema 是 zod 推断，`DoneEvent` 字段是 camelCase，写 component Props 时漏字段。

**修法**：直接 `import type { PhaseEvent, DoneEvent, ErrorEvent } from '@bootcamp/api-schema'`，让 zod schema 推 TS 类型。

**Why**：zod schema 单一事实源 —— 不要在 Vue component 内重写一份类型断言。

### F-2 — with-ports rag 注入 PORT

**症状**：初版 `dev:rag` hardcode `port: 3001` 跟 Day 09 agent server 抢 3000，但后续 `with-ports` script 默认 PORT env 没设。

**根因**：`scripts/with-ports.ts` 之前只给 `dev:api:day09` 等已知 entry 注入 PORT，没 `rag` 子命令。

**修法**：commit `c833050` 给 `with-ports.ts` 加 `rag` 子命令映射：

```ts
case 'rag':
  return ['PORT=3100', ...cmd];
```

**Why**：避免两天 port 漂移（Day 09 agent=3000 / Day 14 rag=3100），用环境变量驱动而不是 hardcode。

### R-1（额外）— libs/api-schema 包配置

**症状**：把 zod schema 从 `apps/api` 提到 `libs/api-schema`，root `pnpm typecheck` 找不到包。

**根因**：pnpm workspace 依赖要在 root `package.json` 显式声明 + `libs/api-schema/package.json` 的 `main/types` 指向 `.ts`（同 TS project 单一事实源）。

**修法**：

```json
// root package.json
"dependencies": {
  "@bootcamp/api-schema": "workspace:*",
  ...
}

// libs/api-schema/package.json
{
  "name": "@bootcamp/api-schema",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

**Why**：ADR 0003 精神扩到 HTTP API。schema 在 `libs/api-schema`，前后端 import 同一份，**不重复定义**。

### R13 — apps/api 缺 dotenv 自动加载

**症状**：`pnpm dev:rag` 起后端，`/health` 显示 `OPENAI_API_KEY not set`。`examples/*` 全部 OK（顶部 `import 'dotenv/config'`）。

**根因**：`apps/api/src/` 早期代码全漏了 `import 'dotenv/config'`，env.ts 等模块没副作用加载 dotenv。父进程 (tsx + with-ports) cwd 是仓库根，dotenv 默认能从 cwd 找到 `.env`，只要**有一个模块**顶部 `import 'dotenv/config'` 就够了。

**修法**：[apps/api/src/env.ts:18](apps/api/src/env.ts#L18) 顶部加 `import 'dotenv/config';`。

**Why**：副作用一次，所有 import 此模块的进程自动加载 .env，无需每 handler 重复。Spec 当时漏了 —— apps/api 是 dev:rag 的入口。

### R14 — spawn 子进程 OOM（lancedb native heap）

**症状**：CLI 跑 `pnpm exec tsx examples/md_import/main.ts` 不管 `--dry-run` 还是真跑都报：

```
FATAL ERROR: Committing semi space failed. Allocation failed - JavaScript heap out of memory
```

**根因**：lancedb native binding + arrow schema 在 Windows + Node 22 下首次打开 `.lancedb/rag/` 时分配 ~1.5GB native 段，超过 Node 默认堆上限，触发 GC semi-space commit 失败（**注意：JS stacktrace 为空 —— 错在 native 不在 JS**，误以为内存泄漏）。

**修法**：[apps/api/src/spawn-main.ts:19-27](apps/api/src/spawn-main.ts#L19-L27) + [line 55](apps/api/src/spawn-main.ts#L55) 注入 `NODE_OPTIONS=--max-old-space-size=4096` 给子进程：

```ts
const CHILD_NODE_OPTIONS = '--max-old-space-size=4096';
// ...
env: { ...process.env, NODE_OPTIONS: CHILD_NODE_OPTIONS },
```

**Why**：父进程 3100 rag server 不受影响（堆独立）。子进程堆提到 4GB 容下 lancedb native 段。CLI 直跑没注入 NODE_OPTIONS 仍 OOM —— 真用必须走 spawn 路径或自己设 env。

### R15 — search tableName 不对称（spec 写错）

**症状**：真入库 1990 chunks 进 `chunks_md_heading` + `chunks_md_paragraph`，search API 返回 `hits: []`。

**根因**：spec §Day 14 写 `${prefix}` 单表（`chunks_md` / `chunks_notion`），但 `libs/rag/indexer.ts` 实际写 `${prefix}_${strategy}` 双表（沿用 Day 13 RAG 设计）。**spec 与实现不对称** —— 入库双表、检索单表、单表根本不存在。

**修法**：[apps/api/src/rag-search.ts:39-44](apps/api/src/rag-search.ts#L39-L44) `TABLE_BY_NAMESPACE` 拼 heading 后缀：

```ts
const TABLE_BY_NAMESPACE = {
  notion: 'chunks_notion_heading',
  md: 'chunks_md_heading',
} as const;
```

**Why**：1 行改，对齐实现。spec §Day 13.5 runbook 早写明「`chunks_notion_heading` / `chunks_notion_paragraph` / `chunks_notion_meta`」双表 —— Day 14 spec 错把双表简写成单表。Post-mortem 落 ADR 0004。

### R16 — rag-search 没透传 embed baseUrl/model

**症状**：修了 R15 后，search API 改返 `500 Internal Server Error`（无 body），`retrieveMs: 42s`（卡在 fallback loop）。

**根因**：[apps/api/src/rag-search.ts](apps/api/src/rag-search.ts) 调 `retrieve(query, opts)` 没传 `baseUrl` + `model`，libs 层默认走 OpenAI 官方 + `text-embedding-3-small`。.env 里的 `OPENAI_API_KEY` 是 dev 网关的，访问 OpenAI 官方被 401 → fallback 单条再失败 → 二分定位坏 chunk → 42s 后错误聚合抛 500。

**修法**：[apps/api/src/rag-search.ts:70-72](apps/api/src/rag-search.ts#L70-L72) 读 `OPENAI_BASE_URL` + `EMBEDDING_MODEL_NAME` env，注入 retrieve opts：

```ts
const embedBaseUrl = process.env['OPENAI_BASE_URL'];
const embedModel = process.env['EMBEDDING_MODEL_NAME'];
// ...
await retrieve(query, {
  ...,
  ...(embedBaseUrl !== undefined ? { baseUrl: embedBaseUrl } : {}),
  ...(embedModel !== undefined ? { model: embedModel } : {}),
});
```

**Why**：libs/rag/retrieve.ts 注释明写「env 读取在 examples 层」 —— apps/api 也是 examples/ 的等价物（env-aware wrapper），必须显式注入。同类调用点（examples/day13/ex_002/ex_003/ex_004）已正确传，rag-search 是漏网之鱼。

### R17 — md_import 默认 sourceDir 是死代码

**症状**：UI 点入库按钮跑通 SSE 4 phase，但 `seedPages=0` —— 后端 spawn `md_import` 没指定 sourceDir，默认读 `./notes`（仓库根没这目录）。

**根因**：[examples/md_import/main.ts](examples/md_import/main.ts) 默认 `MD_SOURCE_DIR ?? './notes'` 是死代码默认（仓库根无 notes/）。

**修法**：默认改为 `'./docs/daily'`（14 篇 day notes 已就位）。

**Why**：仓库根实际数据在 `docs/daily/`，spec 当时没暴露这层约束（Day 14 路线只到「点入库」，没要求 source dir UI 选）。最小改 default，CLI 直跑也能用。

---

## ✅ Acceptance Criteria 核对

每条均为本 day 实际跑命令验证（不靠推断），对应 plan Task 15 Step 4 + final fix 后的所有验证项：

- ✅ `pnpm typecheck` 0 errors（tsc strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes）
- ✅ `pnpm typecheck:web` 0 errors（vue-tsc，Day 14 起新增第 5 闸也在合格范围内）
- ✅ `pnpm lint` 0 errors
- ✅ `pnpm format:check` 全绿
- ✅ `pnpm test` 全绿（包含 5 个新增测试 file：parse-phase / spawn-main / highlight / env / api-contract）
- ✅ `pnpm test tests/parse-phase.test.ts` PASS（4 marker + fatal 不匹配 + 空行 skip）
- ✅ `pnpm test tests/spawn-main.test.ts` PASS（2 tests，真 spawn dry-run + abort cleanup）
- ✅ `pnpm test tests/highlight.test.ts` PASS（5 tests，英文/中文/空 query/无匹配/多次出现）
- ✅ `pnpm test tests/env.test.ts` PASS（4 tests，getNamespaceHealth 校验）
- ✅ `pnpm test tests/api-contract.test.ts` PASS（4 tests，in-process Hono `app.request()` 合约）
- ✅ `MD_SOURCE_DIR=./notes OPENAI_API_KEY=sk-test pnpm tsx examples/md_import/main.ts --dry-run` 输出 4 phase marker（`>>> Notion import (DRY-RUN): ...` + `>>> Diff: ...`）
- ✅ `pnpm dev:rag` 起后端（控制台：`RAG server listening on http://127.0.0.1:3100`）
- ✅ `pnpm dev:web` 起前端 + Vite `/api` proxy 到 3100
- ✅ 浏览器 `http://127.0.0.1:5173` 看到 TabBar + 搜索 view；切到「入库」看到入库按钮 + health 警告（如缺 env）
- ✅ **真入库 + 真搜索全链路打通**（post-R13/R14/R15/R16/R17 修复后）：
  - `pnpm exec tsx examples/md_import/main.ts` 真跑 14 篇 day notes → `+14 added` → embed 1990 chunks → 写 `chunks_md_heading` (1048 rows) + `chunks_md_paragraph` + `chunks_md_meta`
  - `curl POST /api/search {query: 'day1 学习了 什么', namespace: 'md', topK: 3}` 返回 3 个 hits，最高 score 0.987（day11.md JD-2 命中 + day01.md heading）
  - retrieveMs 从修前 42s 降到 2252ms（透传 embed env 后真调通 dev 网关 embedding 模型）
- ✅ **spec §5.3 反 YAGNI 红线全部守住**：
  - ❌ 不做 chunk 删除 / 编辑 UI → 没做
  - ❌ 不做多 embedding 模型切换 UI → 没做
  - ❌ 不做 user 系统 / 登录 → 没做
  - ❌ 不做 trace 持久化 → 没做
  - ❌ 不做 ingest 历史回放 → 没做
  - ❌ 不做 chunk preview hover → 没做
  - ❌ 不引新依赖 → 锁定零新依赖
- ✅ **CLAUDE.md 红线守住**：
  - 不写权限校验链 → 无 user system
  - 不写历史遗留兼容性逻辑 → 纯新增
  - 不引新依赖 → grep `pnpm-lock.yaml` / `package.json` 确认无新依赖
  - 不跨项目共享组件抽包 → 本 day 仅 workspace 内 `@bootcamp/api-schema`
- ✅ **zod 单一事实源落地**（grep 验证）：

  ```bash
  grep -rE '(z\.object|z\.enum)' apps/api apps/web | grep -v node_modules | grep -v 'libs/api-schema'
  # 期望：无输出（前/后端不重复写 zod schema，schema 单一源在 libs/api-schema）
  ```

- ✅ daily note 含 8 章节齐全（目标/产出/命令/验证形式/踩坑/Acceptance/手动端到端/Day 15 预告/相关引用）

### 本 day 已知遗留（spec §5.2 列但未落）

- ⚠️ spec §5.2 列的 `POST /api/search 200 with Hit[]`（success path）未在合约测试中覆盖 —— 仅手动端到端验
- ⚠️ spec §5.2 列的 `POST /api/search 500 (lance mock throw)`（error path）未在合约测试中覆盖
- ⚠️ spec §5.2 列的 `POST /api/ingest SSE 4 phase + done` success path 未在 `api-contract.test.ts` 内覆盖（由 `spawn-main.test.ts` 间接验）
- ⚠️ spec §5.2 列的 `retrieve-namespaces.test.ts`（'all' namespace merge topK）仓库中不存在，由 Day 13.5 `tests/libs/rag/indexer.test.ts` namespace isolation 14 cases 侧面覆盖

---

## 🌐 手动端到端（dev:rag + dev:web）

### 准备

1. **`.env` 必填项**（gitignored）：
   ```
   OPENAI_API_KEY=sk-...                # 任意 namespace 搜索 + md 入库
   NOTION_TOKEN=secret_...              # 仅 notion 入库需要
   ```
2. **首次入库**：跑一次 `npx tsx examples/notion_import/main.ts` 或 `npx tsx examples/md_import/main.ts` 让 `.lancedb/rag/chunks_*` 有数据（gitignored）。`md` 默认源目录是 `./docs/daily`（仓库根 `docs/daily/` 含 14 篇 day notes），可通过 `MD_SOURCE_DIR=<dir>` env 覆盖。

### 双终端起服务

```bash
# terminal 1
pnpm dev:rag
# 控制台应看到：
# RAG server listening on http://127.0.0.1:3100

# terminal 2
pnpm dev:web
# 控制台应看到：
# Local: http://127.0.0.1:5173/
# Network: use `--host` to expose
```

### 浏览器验证步骤

1. **打开 `http://127.0.0.1:5173/`** → 看到 TabBar（搜索 / 入库）+ 「Notion / MD RAG Playground」标题。
2. **「搜索」tab**：namespace 选 `all`，输入 `"RAG chunk 策略"` → 点「搜索」。
   - 期望：等待 1-3s 后看到 hits 列表，每条：
     - `#1` 序号 + `heading` / `paragraph` 标签 + `notion/xxx.md` 或 `md/yyy.md` 源标签
     - 相似度热力条（宽度 = score*100%，颜色按 score 渐变）+ 数字 `0.872`
     - `<mark>` 高亮的关键词段落
   - 期望：`N hits · Xms total` 显示在 hits 列表上方
3. **「入库」tab**：namespace 选 `md`，点「入库」按钮。
   - 期望：下方出现入库进度（PhaseStream）：
     - `✓ fetch   234ms · {seedPages: 5, ...}`
     - `✓ diff    12ms · {added: 2, modified: 1, removed: 0, unchanged: 3}`
     - `... embed`（闪烁）
     - `... write`（等待）
   - 最终一行：`done: +2 added, +1 modified, -0 removed (1500ms)`
4. **错误路径测试**：
   - 清空 `.env` 里 `OPENAI_API_KEY` → 重启 `pnpm dev:rag` → 浏览器刷新
   - 期望：「入库」tab namespace=md 旁出现黄 banner：「当前 namespace 缺少 env: OPENAI_API_KEY」，入库按钮置灰
5. **网络面板**（DevTools F12）：
   - 搜索时：1 个 `POST /api/search` 200
   - 入库时：1 个 `POST /api/ingest` 200，Headers 看到 `content-type: text/event-stream`

### 跟 Day 12 Embedding demo 的对比

| 维度 | Day 12 Embed | Day 14 RAG UI |
|---|---|---|
| 后端 | 无（前端直接 fetch `/v1/embeddings`） | Hono 3100，前端走 vite proxy `/api` |
| 入库 | 入库是手动 CLI（ex_001） | 入库是 UI tab + SSE 流式 |
| namespace | 不分 | notion / md / all 三个下拉 |
| 错误处理 | 红 banner（key 缺失） | 黄 banner（缺 env，按钮置灰）+ 红 banner（HTTP 500） |

---

## 🔮 Day 15 路线预告

按 spec §0 + plan /progress.md + survey §14 跨天观察，可能方向：

1. **RAG 增强**：retrieval 加 reranker（spec §Day 13 已记，dev 网关已有 `qwen3-reranker-4b`）→ top-K 精排 + Latency 提升
2. **文件编辑工具**：`FileEditTool`（Day 11 顺延两次：Day 12 / Day 13 都推迟）—— 接 cat-n 行号 + `replaceAll: boolean` 用 `z.union([z.boolean(), z.stringbool()])` 绕 bug C
3. **多 agent 编排**：Day 09 路线遗留（多 agent 场景触发）—— `createAgentApp({ agents: Record<string, Agent> })` 或 factory 模式
4. **schema 校验 + useConversation 抽包**：Day 09 Day 10+ 路线遗留
5. **Trace 持久化**：Day 09 + Day 08 路线遗留（SQLite / 文件 JSONL）

**推荐候选**：候选 2 — **FileEditTool**。理由：FileEditTool 在 Day 12 / Day 13 两次推迟，L1 闭环（Glob→Grep→Read→Edit）缺最后一手；接 Day 11 cat-n 行号做锚点 + zod union 绕 bug C。

### 跨天观察（从 survey §14 抽取，跟本 day 直接相关 3 条 + 其他 day 通用 2 条）

1. **「真 LLM 手跑」贯穿全程必需环节**：Day 14 真搜索 + 真入库全靠手测 + 浏览器，无一进 CI。
2. **「验证不够硬导致返工」风险**：Day 10 `ex_003` 没跑 → Day 11 真跑后 3 bug → ADR 0003。Day 14 手动端到端**留完整证据**避免同类翻车。
3. **Day 14 闸门数 5 闸全绿** 是本仓库首次把 dev:rag + dev:web 一并起得来（Day 08 首创 `dev:day08`，今天扩到 `dev:rag` + dev 双进程）。
4. **前端验证最薄一环**：Day 14 spec 直接写"e2e 不做（YAGNI，Day15+）"；本 day 共识——Day 15+ 第一道工作流 candidate 之一是给 search view 写 e2e（chrome MCP 脚本化）。
5. **ledger 教训 vitest 全绿 ≠ tsc 全绿**：本 day 4 闸必跑强制 `pnpm typecheck` exit 0 报告（Day 12 Task 2 血泪教训）。

---

## 📎 相关引用

- **Spec**：[`docs/superpowers/specs/2026-08-26-day14-notion-md-rag-ui-design.md`](../superpowers/specs/2026-08-26-day14-notion-md-rag-ui-design.md)
- **Plan**：[`docs/superpowers/plans/2026-08-26-day14-notion-md-rag-ui.md`](../superpowers/plans/2026-08-26-day14-notion-md-rag-ui.md)
- **Survey**：[`.superpowers/sdd/daily-verification-survey.md`](../../.superpowers/sdd/daily-verification-survey.md)
- **上一日**：[`docs/daily/day13.md`](./day13.md) — RAG 最小闭环 + lib 抽取 + evaluate 跑分
- **Day 13.5 插页**：Notion Import — `examples/notion_import/` + `libs/notion/` + `libs/rag/indexer.ts`（namespace 隔离的间接覆盖）
- **ADR 0003**：[`docs/adr/0003-tool-params-single-source-of-truth-zod.md`](../adr/0003-tool-params-single-source-of-truth-zod.md) — zod schema 单一事实源，本 day 扩到 HTTP API 层
- **代码锚点**：
  - [libs/api-schema/src/](../../libs/api-schema/src/) — 单一事实源（search.ts / ingest.ts / error.ts / env.ts / index.ts）
  - [apps/api/src/parse-phase.ts](../../apps/api/src/parse-phase.ts) — 4 phase marker 正则解析
  - [apps/api/src/spawn-main.ts](../../apps/api/src/spawn-main.ts) — spawn 子进程 + 5min timeout + abort
  - [apps/api/src/highlight.ts](../../apps/api/src/highlight.ts) — query 关键词 → content charRange
  - [apps/api/src/env.ts](../../apps/api/src/env.ts) — `.env` 校验 + `getNamespaceHealth`
  - [apps/api/src/rag-search.ts](../../apps/api/src/rag-search.ts) — POST /api/search
  - [apps/api/src/rag-ingest.ts](../../apps/api/src/rag-ingest.ts) — POST /api/ingest (SSE)
  - [apps/api/src/rag-server.ts](../../apps/api/src/rag-server.ts) — `createRagApp()`
  - [apps/api/src/rag-server-entry.ts](../../apps/api/src/rag-server-entry.ts) — 独立 entry，绑 PORT env
  - [examples/md_import/](../../examples/md_import/) — md CLI 镜像 notion_import 形态
  - [apps/web/src/lib/](../../apps/web/src/lib/) — sse.ts + state.ts + api-schema.ts
  - [apps/web/src/components/](../../apps/web/src/components/) — TabBar / QueryBox / HitCard / PhaseStream
  - [apps/web/src/views/](../../apps/web/src/views/) — RagApp / IngestView
- **测试锚点**：
  - [tests/parse-phase.test.ts](../../tests/parse-phase.test.ts)
  - [tests/spawn-main.test.ts](../../tests/spawn-main.test.ts)
  - [tests/highlight.test.ts](../../tests/highlight.test.ts)
  - [tests/env.test.ts](../../tests/env.test.ts)
  - [tests/api-contract.test.ts](../../tests/api-contract.test.ts)
