# 2026-09-10 — 功能点重划（Capabilities Re-route）设计

## Context

仓库经过 day01-19 的渐进积累，已经形成：

- **libs 层**：13 个能力簇、49 个 .ts 文件、5 条 ADR，单向依赖无环
- **examples 层**：16 个 day + 4 个特殊目录、~40 个 example，但**按 day 维度组织**导致重复样板散落（双 provider demo × 5、server 启动 × 4、CalculatorAgent × 2、RAG 评测 × 5）
- **apps 层**：双 Hono app 零耦合（createAgentApp + createRagApp）、Vue3 + Vite6 + Tailwind4、无 vue-router（hash 路由）
- **ADR 体系**：5 条覆盖 tool/runtime/event/table 命名，但**3 处事实源分散未 ADR 化**（跨端 schema 双路径、protocol adapter 双写、dev 网关纪元契约）

问题：

1. **对外能力不可索引**——没有"按功能点找 example/库"的单一入口，只有 dayXX.md 个人笔记
2. **examples 层有 60-80% 模板代码重叠**——双 provider / server 启动 / RAG 评测样板重复多份
3. **事实源分散 4 处**：lancedb 路径双硬编码、`toApiMessages` 双写、`max_tokens` 双写、跨端 schema 双路径
4. **测试真空 3 处**：`openai-chat-client.ts`、`anthropic-chat-client.ts`、`embed.ts` 无单测
5. **dev 网关外部契约散落**：memory + langchain-cmp/README + docs/daily 三处提到白名单与纪元，未 ADR 化

本 spec 目标：按功能点重划对外能力列表，**保留 day 历史作为个人学习轨迹**，新增 3 层骨架（`examples/_capabilities/`、`examples/_patterns/`、`docs/capabilities/`）+ 5 条候选 ADR。

## Decision

### D1：建立"功能点目录"作为对外能力单元

新增三层骨架，**day 历史完全不动**：

```
examples/
├── day01/ ~ day19/                  ← 保留作为个人学习轨迹
├── _dev/ md_import/ notion_import/  ← 不动
├── langchain-side/                  ← 不动
├── _capabilities/                   ← 新增：按功能点组织的对外能力单元
│   ├── README.md
│   ├── llm-basic/RUN.md             ← F-E-01
│   ├── agent-tool/RUN.md            ← F-E-02
│   ├── sse-trace/RUN.md             ← F-E-03
│   ├── repo-tools/RUN.md            ← F-E-04
│   ├── embedding/RUN.md             ← F-E-05
│   ├── rag-ingest/RUN.md            ← F-E-06
│   ├── rag-eval/RUN.md              ← F-E-07
│   ├── import/RUN.md                ← F-E-08
│   ├── langchain-cmp/RUN.md         ← F-E-09
│   └── scaffold/RUN.md              ← F-E-10
└── _patterns/                       ← 新增：重复样板收敛
    ├── chat-demo.ts
    ├── agent-server-start.ts
    ├── calculator-agent-demo.ts
    └── rag-eval-run.ts

docs/
├── capabilities/                    ← 新增：能力点入口文档
│   ├── libs.md                      ← 13 个能力簇
│   ├── examples.md                  ← 10 个能力点
│   ├── apps.md                      ← 4 个功能点
│   └── dev-gateway.md               ← F-A-04 单一事实源
└── adr/
    ├── 0001 ~ 0005                  ← 已有，不动
    ├── 0006-api-schema-single-source.md
    ├── 0007-protocol-adapter-sso.md
    ├── 0008-dev-gateway-contract.md
    ├── 0009-capabilities-organization.md
    └── 0010-test-coverage-priority.md
```

### D2：每个 `_capabilities/<name>/RUN.md` 的固定结构

```markdown
# F-E-XX：<能力点名称>

## 一句话定义
...

## 涉及的 day 与 example（保留历史溯源）
- dayXX/ex_001_*.ts：...
- dayYY/ex_002_*.ts：...

## 入口命令
pnpm dev:web
pnpm dev:rag
（环境变量：OPENAI_API_KEY=...）

## 依赖
- 外部服务：dev 网关 / Notion internal token
- 本地路径：.lancedb/rag/
- 数据前提：先跑 day13/ex_001_index_corpus.ts

## 失败回滚
git checkout .lancedb/rag/
```

### D3：每个 `_patterns/*.ts` 的设计原则

- **单文件 + 参数化**：provider、topK、querySet 通过函数参数传入
- **不直接 import libs 之外的路径**：避免把 day 历史耦合进来
- **被 dayXX example import**：原 example 改"调一行"模式，逐步减少模板代码

### D4：5 条候选 ADR 的核心决策

| ADR | 核心决策 | Enforcement |
|---|---|---|
| **0006** api-schema-single-source | 跨端 zod schema 唯一入口为 `@bootcamp/api-schema` workspace 包；禁止相对路径 `libs/api-schema/src` 直接 import；`apps/web/src/lib/api-schema.ts` 是唯一 re-export 路径 | ESLint `no-restricted-imports` 规则 + CI grep guard |
| **0007** protocol-adapter-sso | `toApiMessages` / `max_tokens` 默认值等 protocol adapter 字段必须由单一文件导出；observability 模块 import 而非重写 | ESLint `import/no-internal-modules` 规则 + 代码评审 checklist |
| **0008** dev-gateway-contract | dev 网关白名单 + 纪元切换契约：白名单模型由 `docs/capabilities/dev-gateway.md` 单一事实源；纪元切换须全量重灌；`incrementalIndex` 分批入库同前缀互删已知 | README + `scripts/check-gateway-models.ts` 启动校验 |
| **0009** capabilities-organization | `examples/_capabilities/` + `docs/capabilities/` 是对外能力单元的单一入口；新增能力必须先在 `_capabilities/` 起 RUN.md，再考虑是否派生 `_patterns/`；day 历史仍允许自由演进 | README + 季度 review |
| **0010** test-coverage-priority | 测试覆盖优先级：core fact-source（agent.ts / rag/indexer.ts / tool-registry.ts）> thin wrapper（reranker / notion/fetch）> adapter（chat-client / embed）；embedding/chat-client 的网络依赖用 mock fetch 兜底 | `vitest --coverage` + CI gate |

### D5：4 个 Phase 的渐进落地

**Phase A — 骨架（不动 day 代码）**

- 新增 `examples/_capabilities/` 10 个 RUN.md
- 新增 `examples/_patterns/` 4 个样板
- 新增 `docs/capabilities/` 4 个入口文档
- 写 ADR 0006 / 0009
- 跑一次 `pnpm test` + `pnpm typecheck` 确认无回归

**Phase B — DRY + 测试空洞**

- 拆 `toApiMessages` 为 `libs/llm/anthropic-chat-client.ts` 的 exported helper，observability 改为 import（ADR 0007）
- 抽 `DEFAULT_LANCE_URI` 常量统一 lancedb 路径
- 新增 `embed.test.ts` + `openai-chat-client.test.ts` + `anthropic-chat-client.test.ts` 三个单测（mock fetch）
- ADR 0006 落地（统一 schema 路径）
- ADR 0010 落地（覆盖率优先级）

**Phase C — 拆大型文件 + 修 web 风险**

- 拆 `libs/rag/chunk.ts` → `chunk-long-heading.ts`
- 拆 `libs/rag/indexer.ts` → 4 phase 文件
- 拆 `libs/agent/agent.ts` 的 runEvents iteration handler
- 拆 `libs/tools/repo/file-edit-tool.ts` helper
- 修 web 5 个风险点：
  - `loadHealth()` 加 catch/loading
  - `IngestView` SSE handler 显式处理 stderr + done
  - `embed-demo` Panel 加 error/loading
  - `EmbedCompare` heatmap 失败不再静默
  - `AgentClient parseSSEEvents` 加 body end 校验
  - `lib/state.ts` UiStateMachine 要么迁入要么删除
- 写 ADR 0008

**Phase D — 主线工程化 + 收尾**

- `examples/_capabilities/rag-eval/` 跑完整 v1→v2→rerank baseline
- 5 个重复 RAG 评测 example 收敛到 `_patterns/rag-eval-run.ts`
- md_import + notion_import 提到 `_capabilities/import/`
- README + CLAUDE.md 顶部新增"按功能点查找"链接
- 跑全量 lint + typecheck + test 确认无回归
- ADR 0010 收尾（覆盖率目标达成）

每个 Phase **独立可跑、独立可中断**。

### D6：YAGNI 红线（不做的事）

- **不重写 day 历史**：dayXX 作为个人学习轨迹保留
- **不抽 LangChain 副线**：`langchain-side/` 保持现状
- **不引入新的状态管理库**：Vue Composition API ref/computed/reactive 足够
- **不引入 vue-router**：hash 路由已经够用
- **不引入 shadcn/Element Plus**：自研 Vue SFC + Tailwind4 风格已定
- **不做 Agent 并行 tool / 持久化 history / latency cost 计算**（已在注释里 YAGNI）
- **不做 Embedding batch retry / RAG fuzzy dedup / VectorStore multi-tenant**
- **不补 mock dev 网关**：外部依赖由 ADR 0008 约束即可

## Consequences

### 正面

- **对外能力可索引**：未来新人/JD 评估者可通过 `docs/capabilities/` 5 分钟了解仓库能力
- **examples 模板代码减少 60-80%**：5 个双 provider demo、4 个 server 启动 demo、5 个 RAG 评测 demo 收敛到 `_patterns/`
- **事实源单一**：3 处分散的 DRY 风险点收敛到 ADR 化
- **测试覆盖提升**：3 个核心模块新增 mock 单测
- **dev 网关契约显式化**：纪元切换 / 白名单约束不再散落

### 负面

- **新增 3 层目录骨架**：新人需要先理解 `_capabilities/` / `_patterns/` / `capabilities/` 三层关系
- **Phase A 增量内容最多**：10 个 RUN.md + 4 个样板 + 4 个入口文档，文字工作量大但代码量小
- **day 历史可能"双指针"**：未来 day21 之后的内容可能不再严格对应 `_capabilities/` 索引，需季度 review

### 风险

- **Phase B 的 DRY 改动可能引入协议兼容性问题**（`toApiMessages` 双写期间曾因 private 不能复用）→ 必须先写导出 helper 再切换 import，**不直接重写**
- **Phase C 拆大型文件可能破坏公共 API**（`runEvents` 是事实源端点）→ 必须先看 consumer（`apps/api/server.ts`、`App.vue`）再下笔
- **web 风险修复可能改变 UI 行为**（heatmap 失败不再静默吞掉 = 用户能看到 error）→ 需要老大确认 UX 变更可接受

## Enforcement

### 自动检查

- **ESLint `no-restricted-imports`**：禁止 `libs/api-schema/src` 直接 import（ADR 0006）
- **ESLint `import/no-internal-modules`**：禁止 `libs/llm/anthropic-chat-client.ts` 内部 helper 双写（ADR 0007）
- **CI grep guard**：grep `\.lancedb/rag` 检查路径一致性
- **`scripts/check-gateway-models.ts`**：启动时校验模型名是否在白名单（ADR 0008）
- **`vitest --coverage`**：覆盖率门禁按 ADR 0010 优先级提升

### 文档/Review

- **CLAUDE.md 顶部**新增"按功能点查找"链接区块
- **README** 新增"能力矩阵"章节
- **季度 review**：每 10 个 day 一次，确认 `_capabilities/` 索引与 day 历史仍对齐
- **PR review checklist**：新增能力是否在 `_capabilities/` 起 RUN.md

### 已有 ADR 引用

- 0001 tool capability 不可嵌入 system prompt → 仍然生效
- 0002 runEvents 接受完整 messages → 仍然生效
- 0003 tool 参数契约 zod 唯一事实源 → 仍然生效
- 0004 RAG table 命名以实现为准 → CI grep guard 待补（ADR 0006 顺手补）
- 0005 AgentEvent 14 kind → 仍然生效

## 实施计划（待 writing-plans skill）

落库后由老大拍板是否进入 writing-plans 阶段拆实施 plan。
