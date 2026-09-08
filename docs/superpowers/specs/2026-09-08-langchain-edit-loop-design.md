# LangChain 编辑回环对照实验设计

**Date**: 2026-09-08
**Status**: Draft（待 review）
**Scope**: 一个独立项目，验证「用 LangChain 完成与子系统 A 同等能力的 file_read → file_edit → file_read 闭环」，作为 bootcamp 自研 Agent loop 的对照实验。
**Owner**: brainstorming 输出

---

## Context

bootcamp 主线已在 Day 04–11 完整落地自研 Agent loop + Tool 抽象：

- `libs/agent/agent.ts` 实现了 `Agent.runEvents` 的完整多轮 tool 反馈循环；
- `libs/tools/` 内含 `repo_index` / `repo_search` / `file_read` 工具；
- Day 15 刚落地 `file_edit` 工具；
- 子系统 A 扩展 `AgentEvent` 加入 `tool_call_start` / `tool_call_end` 后，将拥有完整的 file_read → file_edit → file_read 闭环。

仓库已有 [examples/langchain-side/](examples/langchain-side/)（5 个 step），属于「副线」约定：

- 不进 `libs/` `apps/`；
- 装到 `devDependencies`；
- 命名 `stepN_<topic>.ts`；
- 每个 step 顶部 JSDoc 写明对照 bootcamp / 关键观察；
- 文档状态表格维护 1–N。

**问题**：副线已有的 step 1–5 关注「单次 chat / chain / RAG / chunk / Tool 抽象」，**尚未涉及「tool loop / agent 多轮反馈」**。如果继续往 step6 加，会与 step 1–5 形成编号风格冲突（1–5 都是单一对照点，step6 一次性加完整 agent loop 体量过大），也不符合「stepN 一次只关注一个对照点」的隐含节奏。

**决策**：开一个独立项目 `langchain-cmp/`，与副线平行，单独承载「多轮 tool feedback」对照实验。副线 README 加一条 cross-link 标明入口跳转关系。

---

## Decision

### 架构

```
[langchain-cmp/]
  package.json                    # 依赖：@langchain/core / @langchain/openai / @langchain/community / langchain / zod
  tsconfig.json                   # 与主仓库相同 strict 配置
  README.md                       # 写明：独立项目原因 / 与副线关系 / retro 占位
  src/
    run_edit_agent.ts              # 入口：组装 agent + 触发 file_read → file_edit → file_read
    chat_model.ts                  # ChatOpenAI 实例 + dev 网关 OPENAI_BASE_URL / OPENAI_API_KEY 注入
    fake_chat_model.ts             # 可选：用 fake chat model 验证工具调度（CI 友好）
  tools/
    file_read_tool.ts              # 复刻主线 FileReadTool（绝对路径 + cat-n 行号）
    file_edit_tool.ts              # 复刻主线 FileEditTool（最小：精确匹配 + 原子写入 + 错误前缀统一）
  scenarios/
    happy_path.ts                  # fixture 创建 → 读 → 改 → 读 → 校验
    multi_match_failure.ts         # 多匹配 + replaceAll=false → 期望 throw
    relative_path_rejected.ts      # 相对路径 → 期望 throw
```

**关键设计**：

- **不复用** [examples/langchain-side/](examples/langchain-side/) 任何文件，也不直接 import 主线 [libs/tools/](libs/tools/)。所有 file_read / file_edit 实现都是独立的最小复刻，便于 grep 复盘「LangChain 抽象 vs bootcamp 手写」的代码量与可控性差异。
- **依赖全量套件**：devDependencies 一次性装齐 `@langchain/core` / `@langchain/openai` / `@langchain/community` / `langchain` / `zod`，避免后续 step 再追加依赖导致的 token 浪费（每次追加都需重装 + 解析包大小）。
- **使用 dev 网关**：`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `CHAT_MODEL_NAME` 与主线同源（仓库根 `.env`），不再单独申请凭据。
- **可观测性对照**：在 `run_edit_agent.ts` 入口同时打印 LangChain 自身事件（on_chat_model_start / on_tool_start / on_tool_end / on_agent_finished）与「与 bootcamp AgentEvent 对照表」（tool_call ↔ on_tool_start / tool_result ↔ on_tool_end / message_end ↔ on_agent_finished）。

### Components

| 路径 | 角色 |
|---|---|
| `langchain-cmp/package.json` | workspace-local 依赖声明；不污染主仓库 `package.json` 的 `dependencies` |
| `langchain-cmp/tsconfig.json` | strict 模式 + 继承主仓库 root tsconfig（如可） |
| `langchain-cmp/README.md` | 项目入口说明 + 复盘摘要 |
| `langchain-cmp/src/run_edit_agent.ts` | 跑通「用户说改某文件 → agent 调用 file_read → file_edit → file_read → 完成」 |
| `langchain-cmp/src/chat_model.ts` | ChatOpenAI 实例工厂 |
| `langchain-cmp/src/fake_chat_model.ts` | 可选 fake 模型（CI 友好） |
| `langchain-cmp/tools/file_read_tool.ts` | 复刻主线 FileReadTool（绝对路径 + cat-n 行号 + 错误前缀） |
| `langchain-cmp/tools/file_edit_tool.ts` | 复刻主线 FileEditTool（精确匹配 + 原子写入 + 错误前缀统一） |
| `langchain-cmp/scenarios/happy_path.ts` | 跑通 happy path |
| `langchain-cmp/scenarios/multi_match_failure.ts` | 验证 LangChain 工具调用失败时的错误传递 |
| `langchain-cmp/scenarios/relative_path_rejected.ts` | 验证错误前缀统一（LangChain 是否覆盖 tool name 前缀？与 bootcamp 反例一致） |
| `langchain-cmp/.gitignore` | `node_modules/` / `*.fixture` / 测试临时文件 |
| `examples/langchain-side/README.md` | 加一行 cross-link 指向 `langchain-cmp/` |

### 数据流

```text
[用户输入]："读取 fixture.ts，把 answer = 1 改成 42，再读一遍确认"
   │
   ▼
[ChatOpenAI / dev 网关]
   │ 生成 toolCalls: [file_read, file_edit, file_read]
   ▼
[LangChain AgentExecutor / createAgent]
   │ 顺序执行 toolCalls
   │ on_tool_start / on_tool_end 事件回调
   ▼
[Tool: file_read / file_edit]
   │ 复刻主线的安全约束（绝对路径 / 原子写入 / 错误前缀）
   │ execute() 抛错 → LangChain ToolException 包装 → 模型可见
   ▼
[最终 ChatResponse] → 用户看到结果
```

### Error Handling

- 工具错误：LangChain `tool()` 工厂的 execute 抛错 → LangChain `ToolException` 包装 → 模型可读错误字符串。**预期**对比 bootcamp：`ToolInputParsingException` 缺 tool name 前缀（已在副线 step 5 记录），LangChain `ToolException` 是否带 tool name 前缀待本次验证。
- 子进程错误：本期不使用子进程，所有 file_read / file_edit 在 Node 主进程内执行。
- 网络错误：dev 网关 401 / 403 / 5xx → LangChain SDK 内置重试；不接入自定义 retry 策略。
- 取消：本期不支持 abort signal；用户用 Ctrl-C 中断进程即可。

### Testing

| 层 | 工具 | 覆盖 |
|---|---|---|
| unit | vitest 或 plain `node --test` | file_read / file_edit 在 LangChain tool() 工厂下的安全行为 |
| integration | tsx + 真 dev 网关 | happy path / multi_match_failure / relative_path_rejected |

e2e（Playwright / 真 SSE）**不做** —— 与副线节奏一致，YAGNI。

### 反 YAGNI 红线

- ❌ 不接前端 / SSE；
- ❌ 不复用 [examples/langchain-side/](examples/langchain-side/) 任何文件；
- ❌ 不直接 import 主线 [libs/tools/](libs/tools/)；
- ❌ 不接 RAG；
- ❌ 不接 Retry / Permission / Patch 格式；
- ❌ 不做权限 / symlink / binary 处理；
- ❌ 不做真 e2e / Playwright；
- ❌ 不引入持久化 / 跨进程；
- ❌ 不引入自定义 tool name 命名约定（沿用 `file_read` / `file_edit`，与主线一致便于对照）。

---

## Consequences

### 收益

1. **抽象对照落地**：与 bootcamp 自研 loop + tool 抽象形成 1:1 对照（工具数量、工具数量、事件粒度、错误前缀、安全约束）。
2. **零主仓库污染**：所有 LangChain 依赖只进 devDependencies；`libs/` / `apps/` 完全不引入 LangChain。
3. **复盘材料独立**：retro 写在 `langchain-cmp/README.md` 末段，便于搜索 / grep。
4. **代码量量化**：可直接对比「happy_path 在 LangChain vs bootcamp 自研」两套实现的行数。

### 代价

1. **依赖体积**：devDependencies 增加 ~80 MB LangChain 全量套件；首次安装稍慢。
2. **复刻代码量**：file_read / file_edit 复刻合计 ~80 行；不复用会略冗余，但保证可独立 grep 复盘。
3. **dev 网关依赖**：依赖 dev 网关开放列表；当前已知白名单（admin-only）锁死部分 provider，agent loop 用 `CHAT_MODEL_NAME` 应在白名单内。

---

## Enforcement

- [ ]x **不引依赖到主仓库**：`grep -r "langchain" package.json pnpm-lock.yaml` 应只在 devDependencies。
- [ ]x **不复用主线**：`grep -r "from '../../libs" langchain-cmp/` 应无输出。
- [ ]x **副线 README 加 cross-link**：[examples/langchain-side/README.md](examples/langchain-side/README.md) 增加一行指向 `langchain-cmp/`。
- [ ]x **CLAUDE.md 红线守住**：不写权限校验链、不写历史遗留兼容性逻辑、不引新依赖到主线。

---

## Open Questions

无。所有澄清问题在 brainstorming 阶段已确认。