# LangChain 副线

> **这是实验性 / 一次性代码**，不进 `libs/` `apps/`，不污染 bootcamp 主线。
>
> 每个 step 是一段对照实验：跟 bootcamp 手写链路比，LangChain 帮砍了什么、又缺什么能力。

## 目录约定

- 所有 LangChain 实验放本目录，命名 `stepN_<topic>.ts`
- 装到 `devDependencies`（不污染生产依赖）
- 每个 step 顶部 JSDoc 里写明「对照 bootcamp X」「关键观察（看完跑通后写 retro）」

## Step 进度

| Step | 主题 | 对照 bootcamp | 状态 |
|---|---|---|---|
| Step 1 | 单次 chat | `examples/day02/ex_001_chat_client.ts` | ✅ 已完成 |
| Step 2 | 3 步 chain | bootcamp 无对照（手写循环） | ✅ 已完成 |
| Step 3 | RAG 最小闭环（chunk → embed → LanceDB → retrieve） | `examples/day13/ex_001_index_corpus.ts` + `ex_003_query_topk.ts` | ✅ 已完成 |
| Step 4 | 3 chunk 策略 hit-rate 对比（同 embedding） | `libs/rag/evaluate.ts` | ✅ 已完成 |
| Step 5 | Tool 抽象对照（zod schema 单源 vs LangChain tool()） | `libs/tools/calculator-tool.ts` | ✅ 已完成 |

## Step 5 速记

- **入口**：[step5_probe_tools.ts](step5_probe_tools.ts)（探针 → 4 个事实清楚）→ [step5_calc_tool.ts](step5_calc_tool.ts)
- **demo**：用 LangChain `tool()` 工厂 + `DynamicStructuredTool` 重写 calculator（zod schema + RPN 求值）
- **5 场景跑通**：
  - 正常计算 `1+2*3` → 7 ✅
  - 带括号 `(1+2)*3` → 9 ✅
  - 除零 → execute 内 throw ✅
  - 非法字符 `1+2&3` → execute 内 throw ✅
  - 缺 expression → `ToolInputParsingException` ✅

### Step 5 关键发现

| 维度 | bootcamp 手写 | LangChain | 胜出 |
|---|---|---|---|
| 行数 | ~40 行（Tool interface + runTool + evaluate） | ~50 行（tool() + evaluate 复刻）| bootcamp（更紧凑）|
| zod schema 单源 | ✅ Day 11 ADR 0003 | ✅ tool() 工厂原生支持 zod v3/v4 | 平 |
| invoke 自动校验 | ✅ `runTool` 内部 safeParse | ✅ `invoke` 内部 safeParse | 平 |
| default 自动填 | ✅ safeParse(data) 走 output | ✅ safeParse(input→output) | 平 |
| 异常前缀含 tool name | ✅ `formatZodError` 带 "calculator:" | ❌ `ToolInputParsingException` 消息通用，缺 tool name 前缀 | **bootcamp** |
| 异常细节 | ✅ 结构化（path.join + issue.message）| ⚠️ 通用消息 + Zod 错误堆叠 | bootcamp |
| JSON Schema 输出 | ✅ `ToolRegistry.toProviderTools()` 显式 derive | ⚠️ `getInputSchema()` 不存在（v1.x 改 input/output 分离）| **bootcamp** |
| provider 切换成本 | 改 toJSONSchema 调用 | 0 改动（tool() 多重重载 zod v3/v4/JSON Schema）| **LangChain** |

### Step 5 反哺主线

- LangChain `ToolInputParsingException` **不带 tool name 前缀** → 主线 `formatZodError` 设计是对的（**反哺主线决策，bootcamp 抽象没输**）
- LangChain `getInputSchema()` 不存在 → 主线 `ToolRegistry.toProviderTools()` 显式 derive 是必要设计（**不是过度工程**）
- 副线 calculator 复刻 evaluate() **38 行**重复 → 反证主线的复用价值（如果副线能 import 主线 RPN，重复就没了；这正是 bootcamp 主线进 libs/ 的设计取舍）

## Step 4 速记

- **入口**：[step4_probe_embeddings.ts](step4_probe_embeddings.ts)（探针 → 发现 dev 网关白名单锁死）→ [step4_compare_chunks.ts](step4_compare_chunks.ts)
- **真实结果**：同 `qwen3-embedding-8b` embedding × 3 chunk 策略

| 策略 | Q1 | Q2 | Q3 | Q4 | Q5 | 总命中率 | 平均耗时 |
|---|---|---|---|---|---|---|---|
| heading (381 rows) | ❌ | ❌ | ✅ | ✅ | ✅ | **3/5** | 89ms |
| paragraph (1420 rows) | ❌ | ❌ | ✅ | ❌ | ✅ | **2/5** | 88ms |
| langchain-recursive (547 rows) | ❌ | ❌ | ✅ | ✅ | ✅ | **3/5** | 16ms |

### Step 4 关键发现

1. **dev 网关 admin 白名单锁死**：`GET /v1/models` 只列 3 个；`text-embedding-3-small/large/ada-002/bge-large-*` 全部 HTTP 403 `team not allowed` —— "真对比 embedding 模型"被外部约束阻断
2. **转向同 embedding 不同 chunk**：3 个 collection 共用 `qwen3-embedding-8b`，对比转向 chunk 策略
3. **Q1 全策略失败**："4闸必跑是哪4 个" 在 heading 库内 6 个 ground-truth chunks（day01/02/09），但 top-3 都被 day13.md 元信息（"Q1 失败案例分析"段落）抢走 —— **"ground truth 存在 ≠ top-3 命中"** 是真 RAG 召回问题
4. **副线 RecursiveCharacterTextSplitter (500/50) = heading 命中率持平**，且 **平均耗时最低（16ms）** —— chunkSize 适中 + 不保护代码块也没显著退化

### Step 4 反哺主线

- Q1 召回问题 → 写进主线 `evaluate.ts` 注释 / 报告（已存在 day13 §7 "检索 ≠ 答案"）
- 探针发现 admin 锁定 → 写进 [memory: dev-gateway-embedding-whitelist]（待办）

## Step 3 速记

- **入口**：[step3_probe.ts](step3_probe.ts)（先探针，跑通才能跑 demo）→ [step3_rag.ts](step3_rag.ts)
- **数据**：共用主线 `.lancedb/rag/` 根目录，但**独立 collection** `langchain_side_chunks`（schema 不兼容主线 `LanceStore`，必须独立）
- **chunk 策略**：`RecursiveCharacterTextSplitter` (500/50) vs 主线 `chunkByHeading / chunkByParagraph` —— 策略本身就是对比点
- **代价**：重复入库一次 ~13s（547 chunks），**这是 LangChain 抽象税的一部分，不是 bug**

### Step 3 关键发现（详细见 [step3_rag.ts](step3_rag.ts) 底部 JSDoc）

1. **LangChain LanceDB 类的设计缺陷**：`new LanceDB({uri, tableName})` **不会从磁盘 reopen table**（构造函数只看 args.table）。必须保留 `fromDocuments` 返回的实例直接用，否则报 "Table not found. Please add vectors to the table first."
2. **schema 不兼容**：LangChain `{vector, text, metadata.*}` ≠ 主线 `{id, vector, text, source, sourceKind}` —— 共享数据必须 metadata 字段适配
3. **vs bootcamp**：chunk+embed+index+retrieve 一条龙 70 行 vs 主线 84 行手写 LanceStore + 增量入库（hash 比较 + 4 阶段 phase 表）
4. **价值评估**：5% 场景下 LangChain **不省**（多 1 个 metadata 字段配置 + 1 个 reopen 文档坑），省的是心智（chunking 不用自己写）

## 已知 warning

- LangChain v1.x API 跟 v0.x 不一样（参考 Step 1 retro）—— 照搬旧文档必报错
- `@langchain/community` 标 deprecated（LangChain v1.0 推荐新结构），但 `@langchain/community/vectorstores/lancedb` 路径仍可用

## 相关 memory

- [[langchain-side-retro]] —— Step 1-2 真实感受 + "LangChain 在规模效应下才有用"的核心判断