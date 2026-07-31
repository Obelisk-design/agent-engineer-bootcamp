# Future Learning Path Design — 2026-07-31

> 65 天 AI Agent 工程师训练营 · Day 09 → Day 65 路线 + 学习节奏重设计
>
> 目的：基于两份 JD（中高级 AI Coding Agent 全栈 / AI 应用工程师）+ 已学 9 天路径，优化未来 56 天每日学习路径 + 每日总结模板。
>
> 数据源：**git commit (107+) > day docs > 当前代码** + JD 文本截图

---

## §0 背景

### 0.1 已学（Day 01-09）

| Day | 主题 | 关键能力 |
|---|---|---|
| 01 | 工程脚手架 | monorepo + CI + Husky pre-commit |
| 02 | ChatClient 抽象 | OpenAI / Anthropic 双 provider |
| 03 | Streaming | `stream(messages): AsyncIterable<string>` additive |
| 04 | Agent Loop + Tool Calling | ChatRequest/Response 统一 |
| 05 | AgentEvent + SSE + Web UI | 判别联合 + ADR-0001 |
| 06 | CI Smoke Test + Trace Collector | source vs derived 双写 + snapshot 语义 |
| 07 | Streaming + AbortSignal + Usage | error throw → yield + final-iter 流式 |
| 08 | Context Window 观测 + Tailwind 4 | best-effort 派生 + 渐进式 UI 迁移 |
| 09 | 多轮对话历史 | runEvents 接受 messages + 入口深拷贝 |

**核心沉淀**：Runtime = ChatClient → Streaming → Agent Loop → 12 kind AgentEvent → SSE → Trace → 多轮。107 commit / 70+ test / 15 ADR。

### 0.2 JD 对齐缺口（vs 已学）

| JD-1 关键词 | 已学 | 缺口 |
|---|---|---|
| ChatClient / Streaming / Tool Calling | ✅ | — |
| Agent Runtime / Event 协议 | ✅ | — |
| LLM 集成 / Context 观测 | ✅ | — |
| **构建 Coding Agent 工具链**（Git / Shell / build / code search） | ❌ | **缺口最大** |
| **repo understanding**（代码导航 / 检索 / AST） | ❌ | **缺口最大** |
| **test execution / debugging** | ❌ | 缺口大 |
| **Agent container images / sandbox** | ❌ | 缺口大 |
| **优化 Agent 执行效率 / AgentRun/AgentEngine 集成** | ❌ | 缺口大 |
| Cloud Coding Agent 范式 | 部分（用 Claude Code 9 天） | 缺自己实现 |

| JD-2 关键词 | 已学 | 缺口 |
|---|---|---|
| ChatClient / Provider 适配 | ✅ | — |
| Agent Runtime | ✅ | — |
| **RAG / 向量数据库 / Embedding** | ❌ | 缺口大 |
| **Prompt Engineering 系统化** | 部分（散落在 day） | 缺口中 |
| **Fine-tuning** | ❌ | 缺口中 |
| **效果与成本优化**（latency / cache / cost） | 部分（usage + context） | 缺口中 |
| **评测体系（Eval）** | ❌ | 缺口大 |
| **MCP / Multi-Agent 协议** | ❌ | YAGNI 红线 |
| AI 工程文化 / 规范输出 | 部分（CLAUDE.md / ADR） | 缺口中 |

### 0.3 决策（基于 AskUserQuestion 已 ack）

1. **主方向**：偏 Coding Agent 全栈（JD-1 深度）
2. **日总结模板**：保留现有 dayNN.md + 加 JD 映射段
3. **路线粒度**：画完整路线图（Day 10~65 全部排好，留 25 天 buffer）

---

## §1 设计总览

### 1.1 三个方案对比

| | 方案 A（Coding Agent 深度 + JD-2 横向）✅ | 方案 B（先广后深） | 方案 C（双线并行） |
|---|---|---|---|
| 主方向 | JD-1 深度 | 先 JD-2 广度再 JD-1 | 两条线各 50% |
| 风险 | 中 | 中（前后割裂） | 高（深度不够） |
| JD-1 命中率 | 高 | 中 | 中 |
| JD-2 命中率 | 中（横向带） | 中 | 中 |
| Token 成本 | 中 | 中 | 高（双倍 context） |

**结论**：方案 A 主推。复用度最高（已学 Runtime 接 Coding Agent 工具生态），Token 最省。

### 1.2 架构总览

```
[Day 10-32：5 层 Coding Agent 全栈能力 + Day 33-36：面试收官]
            ↓
┌─────────────────────────────────────────────────────────────┐
│  M1 L1 Repo Understanding   Day 10-13   ─┐                   │
│  M2 L2 Tool Chain           Day 14-17   ─┤                   │
│  M3 L3 Sandbox & Test       Day 18-21   ─┤ Coding Agent 全栈 │
│  M4 L4 Plan & Workflow      Day 22-26   ─┤                   │
│  M5 L5 实战 + Container     Day 27-32   ─┘                   │
│                                                             │
│  横向贯穿：JD-2 钩子（Prompt / Cost / RAG / Eval / 文化）     │
│  M6 面试准备：Day 33-36（STAR + mock）                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 节奏单元：4 天 milestone

每个 milestone 内部都是 **4 天节奏**：

- **D1-D2**：基础能力（最小可工作）
- **D3**：实战/集成（mini demo 串起来）
- **D4**：JD-2 钩子 + checkpoint（review + commit + JD 映射 + ADR）

### 1.4 路径核心：5 层 Coding Agent 能力 + 横向 JD-2

| 层 | 能力 | 对应 day | 对应 JD-1 关键词 |
|---|---|---|---|
| **L1 Repo Understanding** | 代码导航 / 检索 / AST 解析 / 结构化索引 | Day 10-13 | repo understanding, code search, code parsing tools |
| **L2 Tool Chain** | Git tools / Shell tools / Build tools（接 Agent） | Day 14-17 | Git tools, shell tools, build tools |
| **L3 Sandbox & Test** | 子进程沙箱 + 测试执行 + debugging | Day 18-21 | test execution, debugging, Agent container images |
| **L4 Plan & Workflow** | 多步计划 / 子任务分解 / Todo 状态机 | Day 22-26 | Coding Agent 范式, AgentRun/AgentEngine 集成 |
| **L5 Coding Agent 实战** | 完整 Coding Agent + Eval + UX | Day 27-32 | 优化执行效率 / 集成 AgentRun |

JD-2 横向贯穿（每层带）：

| JD-2 关键词 | 绑定 milestone | 形式 |
|---|---|---|
| Prompt Engineering 系统化 | M1 | day13 设计 system prompt for repo search |
| Cost / latency / cache 优化 | M2 | day17 把 cost / latency 接入 Tool 决策 |
| RAG + Embedding | M3 | day21 RAG for test failure patterns |
| Eval 体系 | M4 | day26 Plan 准确率评测 |
| AI 工程文化输出 | M5 | day32 文档 + ADR + 文化规范 |

---

## §2 完整路线（Day 10~65）

> 56 天 = 23 天 5 个 milestone（M1=4 / M2=4 / M3=4 / M4=5 / M5=6）+ 4 天 M6 面试 + 29 天 buffer（消化/投递/复盘）

### M1: Repo Understanding (Day 10-13)

| Day | 主题 | 关键 commit 目标 | JD-1 关键词 | JD-2 钩子 |
|---|---|---|---|---|
| 10 | Repo 索引基础 —— file tree + content search（grep / ripgrep 封装） | `repo_index` tool | repo understanding | — |
| 11 | AST 解析基础 —— ts-morph / tree-sitter 抽函数签名 / import graph | `ast_search` tool | code parsing tools | — |
| 12 | 代码导航工具 —— go-to-definition / find-references（基于 AST 索引） | `nav_tools` | code parsing tools | — |
| 13 | **Repo Q&A 实战** + **JD-2: Prompt 系统化** | `mini_repo_agent` + Prompt 模板 | repo understanding | **Prompt Engineering** |

**M1 checkpoint**：能问 "auth 在哪" 并精确返回文件 + 函数签名 + import 链路。

### M2: Coding Tool Chain (Day 14-17)

| Day | 主题 | 关键 commit 目标 | JD-1 关键词 | JD-2 钩子 |
|---|---|---|---|---|
| 14 | Git 工具集 —— status / diff / log / blame / commit（基于 child_process + simple-git） | `git_tools` | Git tools | — |
| 15 | Shell 工具 —— 安全白名单 + timeout + working dir + output 截断 | `shell_tool` | shell tools | — |
| 16 | Build 工具 —— 抽象 build 协议（pnpm / npm / make / cargo） | `build_tools` | build tools | — |
| 17 | **Tool 决策优化 + 成本意识** | `tool_strategy` | 优化执行效率 | **Cost / Latency** |

**M2 checkpoint**：Agent 能安全执行 git 流程 + shell 命令 + build 命令，并在 tool 调用日志里看到 token / latency。

**M2 关键设计（YAGNI 红线）**：
- shell 白名单 = 配置化（不是硬编码 if）
- tool 失败 = yield error 不 throw（Day 07 规则继承）
- 外部副作用 = best-effort + timeout + 白名单纪律

### M3: Sandbox & Test (Day 18-21)

| Day | 主题 | 关键 commit 目标 | JD-1 关键词 | JD-2 钩子 |
|---|---|---|---|---|
| 18 | 子进程沙箱 —— child_process exec + 隔离 env + resource limits | `exec_sandbox` | Agent container images | — |
| 19 | 测试执行 —— vitest / pytest 抽象 + 结果解析 | `test_runner` | test execution | — |
| 20 | Debugging 助手 —— 错误堆栈 + 文件跳转 + 假设生成 | `debug_helper` | debugging | — |
| 21 | **失败模式 RAG** + **JD-2: RAG / Embedding** | `fail_pattern_rag` | debugging | **RAG / Embedding** |

**M3 checkpoint**：Agent 能在沙箱里跑测试，根据失败模式检索相似 case 并给出修复建议。

**M3 关键设计**：
- day21 RAG 不起服务，只在内存里 cosine similarity
- sandbox = process 隔离（不是完整 container —— Day 31 起步）

### M4: Plan & Workflow (Day 22-26)

| Day | 主题 | 关键 commit 目标 | JD-1 关键词 | JD-2 钩子 |
|---|---|---|---|---|
| 22 | Todo 状态机 —— Agent 多步计划 + 状态持久化 | `todo_state` | Coding Agent 范式 | — |
| 23 | 任务分解 —— LLM 拆解 + 工具匹配 | `task_decomposer` | Coding Agent 范式 | — |
| 24 | 子任务回调 —— 任务树 + 进度汇报 | `sub_task_callback` | Coding Agent 范式 | — |
| 25 | 重试 & 回滚 —— 失败回退到上一个 checkpoint | `retry_rollback` | Coding Agent 范式 | — |
| 26 | **Plan Eval harness** + **JD-2: Eval 体系** | `plan_eval` | AgentRun/AgentEngine 集成 | **Eval** |

**M4 checkpoint**：能跑"给我加 JWT 认证"这样的 5-10 步任务，Plan 准确率可测可评。

**M4 关键设计**：
- Todo 状态机用 generator 表达（不是 callback hell）
- Eval harness = 固定的 10-20 个真实任务 + 自动化评分

### M5: Coding Agent 实战 (Day 27-32)

| Day | 主题 | 关键 commit 目标 | JD-1 关键词 | JD-2 钩子 |
|---|---|---|---|---|
| 27 | Coding Agent MVP —— Repo + Tool + Plan 串起来 | `coding_agent_v1` | 优化执行效率 | — |
| 28 | Human-in-the-loop —— confirm / reject / redirect | `human_in_loop` | 优化执行效率 | — |
| 29 | 长任务可观测 —— 进度条 + ETA + cancel | `long_task_observability` | 优化执行效率 | — |
| 30 | Session 持久化 —— 跨重启延续（接 day09 多轮） | `session_persist` | 优化执行效率 | — |
| 31 | Multi-Repo / Container 起步 | `container_aware` | Agent container images | — |
| 32 | **JD 映射 + 文档输出** —— AI 工程文化 + ADR + onboarding doc | `jd_mapping` | 优化执行效率 | **AI 文化** |

**M5 checkpoint**：完整 Coding Agent demo + 文档化 + ADR 沉淀。

### M6: 面试准备 (Day 33-36)

| Day | 主题 | 关键 commit 目标 |
|---|---|---|
| 33-34 | 8 个 STAR 故事 + Resume STAR bullet | `star_stories` |
| 35-36 | Coding Agent 全栈 mock interview + 复盘 | `mock_interview` |

### Buffer (Day 37-65, 25 天)

留白 —— 消化期 / 投递期 / 实际面试期 / 按复盘再迭代。

---

## §3 dayNN.md 模板增量（JD 映射段）

> 在现有 dayNN.md 末尾新增 §JD 映射段，**不动现有结构**。

### 3.1 现有结构（保留）

```markdown
# Day NN — 主题
## 🎯 今日目标
## 📦 今日产出物
## 🤔 今日讨论过程
## 🆕 详细演进（M1-M5 才有）
## 🏗 当前架构
## 📚 核心概念复习
## 📐 重要设计决策（ADR）
## 🛣 Day NN+1 路线 + 技术债
## 🔗 相关引用
```

### 3.2 新增 §JD 映射（必填）

```markdown
## 🎯 JD 映射

> 今日学到的东西能投哪些 JD 岗位 / 能回答哪些面试问题。

### JD-1 (Coding Agent 全栈) 命中

| 关键词 | 今日命中点 |
|---|---|
| repo understanding | ex_001 实现 file tree 索引 |
| Git tools | — |
| shell tools | — |
| ... | ... |

### JD-2 (AI 应用工程师) 命中

| 关键词 | 今日命中点 |
|---|---|
| Prompt Engineering | system prompt 模板化 |
| RAG / Embedding | — |
| Eval | — |
| ... | ... |

### 面试可讲（30s STAR 骨架）

1. **判别联合扩 Tool 接口**（如果今天加了 Tool）：S/T/A/R 各一句
2. **X**：...
```

### 3.3 增量填写规则

- **每天的 JD-1 命中 ≥ 1 条**（否则偏离主方向）
- **每个 milestone 第 4 天（checkpoint）的 JD-2 命中 ≥ 1 条**（否则横向钩子失效）
- **30s STAR 骨架 ≥ 1 条 / 周**（否则面试准备失去增量）

---

## §4 节奏原则

### 4.1 继承（CLAUDE.md + project CLAUDE.md）

- Think First → Design → Review → Implement → Review
- YAGNI / Progressive Design / 苏格拉底式
- 修改五问 / 系统化调试 5 步 / 完成前必跑
- 0 临时 API 残留 / 0 兜底 if / 派生不替代源
- 渐进式 UI 迁移 / snapshot 语义 / best-effort 派生

### 4.2 新增 5 条 Coding Agent 专用

1. **每加一个 Tool，先问"它属于 5 层哪一层"** —— 防止 Tool 爆炸（已有 Calculator tool，再加 N 个就有 N 个复杂度）
2. **每个 milestone 第 4 天 = checkpoint day** —— review + commit + JD 映射 + 写 ADR（防止"实现完就跳"）
3. **Tool 失败 = yield error 不 throw**（Day 07 已立规则，继承）
4. **所有外部副作用（shell / git / build）= best-effort + timeout + 白名单** —— 不可信输入的纪律
5. **Eval harness 是 M4 必修** —— Plan 成功率评测是 Coding Agent 的核心 KPI

---

## §5 风险与 YAGNI 边界

### 5.1 YAGNI 红线（今天不碰）

| 类别 | YAGNI 红线 | 触发时机 |
|---|---|---|
| **Multi-Agent 编排** | M1-M3 不引入 supervisor / dispatcher | M5 L5 评估 |
| **RAG 服务化** | day21 RAG 不起服务，只在内存里 | 投递前评估 |
| **Fine-tuning** | 全程不引入训练脚本 | — |
| **Container 镜像完整化** | day31 只做"识别 repo 在容器内"的能力 | 工作后做 |
| **MCP Server / Client** | 全程不引入 MCP 协议层 | — |
| **Vector DB 服务化** | day21 用内存 cosine similarity | 投递前评估 |
| **LangChain / LlamaIndex / AutoGen** | 全程不引入现成框架 | — |

### 5.2 已知风险与应对

| 风险 | 应对 |
|---|---|
| Day 33 才发现 M1-M5 练得不够深 | M6 前 4 天设「补强日」，可插入 Day 32.x |
| Tool 爆炸（> 15 个） | 触发即 review（每 milestone 第 4 天） |
| 跨里程碑依赖断裂 | 每个 checkpoint day 写「下一里程碑的接口契约」 |
| 实战跑不通（M5） | Day 27 失败 → 退 Day 26 复盘 → 不死磕 |
| Token 成本失控（每个 milestone 横向钩子都要 LLM 跑） | day17 成本意识 + day21 RAG 用内存 cosine + day26 Eval 用确定性 ground truth |

### 5.3 milestone 退出标准（每 milestone 第 4 天必走）

- [ ] 代码产出 ≥ 1 个 Tool 类 / 抽象
- [ ] 至少 1 个 demo（真实 LLM 跑通）
- [ ] 至少 1 个反例测试
- [ ] JD-1 命中 ≥ 1 条
- [ ] JD-2 钩子命中 ≥ 1 条
- [ ] ADR（如有架构变更）
- [ ] 下一 milestone 的接口契约（防断裂）

---

## §6 与已学的不变量关系

### 6.1 已有不变量（Day 09 末态）

- 判别联合 + 增量演化（AgentEvent 12 kind）
- source vs derived 双写（events[] + meta）
- snapshot 语义（yield 时深拷贝累积型）
- best-effort 派生（count_tokens 失败不抛）
- 渐进式 UI 迁移（Tailwind 4 + scoped CSS 并存）
- error throw → yield
- AbortSignal 透传整条调用链

### 6.2 Day 10+ 必须继承的 5 条

1. **所有 Tool 失败 = yield error 不 throw**（Day 07 规则）
2. **Tool yield 出去的 argument / result = 深拷贝**（Day 06 snapshot 规则）
3. **Tool usage 字段 = 派生自 tool 调用日志，不污染 Tool 接口**（Day 08 derived 规则）
4. **Tool 设计必须走"修改五问"**（CLAUDE.md 全局）
5. **Tool registry 用判别联合扩，不加 optional 平铺**（Day 05 规则）

### 6.3 关键决策点（每 milestone 第 4 天必答）

| 决策点 | 答 | 影响 |
|---|---|---|
| Tool 注册走 Tool 接口还是 message channel？ | Tool 接口 | 复用 libs/tools/ 现有结构 |
| Tool 错误回 Agent 走 error event 还是 throw？ | error event | Day 07 规则 |
| Tool 决策谁负责（Agent 还是外部 orchestrator）？ | Day 23 task_decomposer 后定 | 影响 M4 架构 |
| Sandbox 边界 = process 还是 container？ | process（M3），container（M5 起步） | Day 18 / Day 31 |

---

## §7 面试准备（M6）

### 7.1 Day 33-34: 8 个 STAR 故事

**目标**：从 Day 01-32 沉淀 8 个 30s 可讲的 STAR 故事，覆盖 JD-1 + JD-2 关键词。

| # | STAR 主题 | JD 命中 |
|---|---|---|
| 1 | 判别联合 + 增量演化的接口设计（贯穿 9+ 天） | JD-2 系统设计 |
| 2 | Source vs Derived 双写（Runtime 不感知 Trace） | JD-1 系统设计 / JD-2 可观测 |
| 3 | Snapshot 语义 + Yield 时深拷贝 | JD-1 Runtime |
| 4 | 渐进式 UI 技术栈迁移（Tailwind 4 + Vue 3 SFC） | JD-2 工程文化 |
| 5 | **新增 M1**: Repo Understanding 的 Tool 设计（如何让 Agent 读懂代码） | JD-1 repo understanding |
| 6 | **新增 M2**: 不可信输入的纪律（shell 白名单 + timeout + best-effort） | JD-1 shell tools / JD-2 成本意识 |
| 7 | **新增 M3/M4**: Sandbox + Plan + Eval harness（Coding Agent 范式） | JD-1 AgentRun 集成 / JD-2 Eval |
| 8 | **新增 M5**: 完整 Coding Agent MVP 实战 + Human-in-the-loop | JD-1 优化执行效率 |

### 7.2 Day 35-36: Coding Agent 全栈 mock interview

- **面试官视角**：JD-1 + JD-2 关键词全覆盖
- **结构**：30s 项目概述 → 5min 深度追问（10 题）→ 15min Coding Agent 实战 demo
- **复盘**：每个 STAR 故事跑 3 遍（卡时间 / 卡关键词 / 卡反问）

### 7.3 Resume STAR bullet 模板

```markdown
- [动词] + [对象] + [度量结果]
  例：「设计 ChatClient 抽象层，让 0 调用方改动即可切换 OpenAI / Anthropic 双 provider，节省 3 天接入工作」
```

---

## §8 技术债预算（路线级）

```
技术债变化（Day 10-36 累计预算）：
+ 新增 libs/tools/repo/*（L1, ~4 file）                —— 维护成本 中，3 年存活率 高
+ 新增 libs/tools/git/*（L2, ~3 file）                 —— 维护成本 中，3 年存活率 高
+ 新增 libs/tools/shell/*（L2, ~3 file, 含白名单配置）  —— 维护成本 中，3 年存活率 高
+ 新增 libs/tools/build/*（L2, ~3 file）               —— 维护成本 中，3 年存活率 中
+ 新增 libs/tools/sandbox/*（L3, ~4 file）             —— 维护成本 高，3 年存活率 高
+ 新增 libs/tools/test/*（L3, ~3 file）                —— 维护成本 中，3 年存活率 高
+ 新增 libs/tools/debug/*（L3, ~3 file）               —— 维护成本 中，3 年存活率 高
+ 新增 libs/rag/*（M3 RAG 横向钩子, ~3 file）          —— 维护成本 中，3 年存活率 中
+ 新增 libs/plan/*（L4 Todo 状态机 + 任务分解, ~5 file）—— 维护成本 高，3 年存活率 高
+ 新增 libs/eval/*（L4 Eval harness, ~3 file）         —— 维护成本 中，3 年存活率 中
+ 新增 libs/coding-agent/*（L5 集成层, ~5 file）        —— 维护成本 高，3 年存活率 高
+ 新增 apps/coding-agent/*（L5 入口, ~5 file）         —— 维护成本 中，3 年存活率 高
+ 新增 ADR-016~025（10 条）                            —— 维护成本 低，3 年存活率 高
+ 新增 docs/jd-mapping/（JD 映射段累计 27 天）          —— 维护成本 低，3 年存活率 高
净增：~44 file / 10 ADR / 0 重复
反驳记录：
  - Multi-Agent / MCP / Fine-tuning / LangChain 全部 YAGNI —— 与已有决策一致
  - day21 RAG 不起服务（用内存 cosine）= 主动控制复杂度
  - 渐进式 UI 迁移规则继承（Day 08 ADR-015）
  - Tool 接口走判别联合扩，不平铺 optional（继承 Day 05）
  - Tool 失败 yield error 不 throw（继承 Day 07）
```

---

## §9 验收 Checklist（Day 32 / Day 36 / Day 65 必走）

### Day 32（M5 末）验收

- [ ] 5 个 milestone 全部完成（M1-M5）
- [ ] 至少 1 个完整 Coding Agent demo 跑通
- [ ] JD-1 关键词命中率 ≥ 80%（按路线表逐条核对）
- [ ] JD-2 钩子命中 ≥ 5 条
- [ ] ADR ≥ 25 条（Day 01-15 + Day 10-25 增量）
- [ ] 测试 ≥ 100 个通过

### Day 36（M6 末）验收

- [ ] 8 个 STAR 故事全部能 30s 讲完
- [ ] Resume STAR bullet ≥ 10 条
- [ ] Mock interview 至少 1 轮跑通 + 复盘

### Day 65（投递期）验收

- [ ] JD-1 投递 ≥ 3 家
- [ ] 面试 ≥ 1 家
- [ ] 复盘文档（Day 65 final review）

---

## §10 相关引用

- **9 天路线总览**：[day01-08 retrospective](../review/2026-07-29-day01-08-eight-day-retrospective.md)
- **Day 笔记**：[day01.md](../daily/day01.md) ~ [day09.md](../daily/day09.md)
- **既有 ADR**：[0001](../adr/0001-tool-capability-must-not-embed-in-system-prompt.md) / [0002](../adr/0002-run-events-accepts-messages-caller-injects-system-prompt.md)
- **既有 spec/plan**：[docs/superpowers/specs/](../superpowers/specs/) + [docs/superpowers/plans/](../superpowers/plans/)
- **CLAUDE.md 全局约定**：[../../../CLAUDE.md](../../../CLAUDE.md) + [../../../../CLAUDE.md](../../../../CLAUDE.md)
- **JD 文本**：截图中两份 JD 原文（BOSS 直聘 / 拉勾网）

---

> **写给未来的自己**：56 天不是"重复实现"，是"在 Runtime 上接 Coding Agent 全栈"。如果你忘了 L1-L5 怎么排，看 §1.2 + §2 路线表；如果你忘了 JD 怎么命中，看 §3 模板增量；如果你忘了"为什么这样排"，看 §4 节奏原则 + §5 YAGNI 边界；如果你忘了面试怎么讲，看 §7。