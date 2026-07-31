# Day 10 — Repo Index + Content Search (L1 第一步)

> 65 天 AI Agent 工程师训练营 · Day 10 / 65
> 主题：L1 Repo Understanding 第一步 —— 给 Agent 「这个 repo 有什么」 + 「X 在哪 / 谁调 Y」 两个原子能力。

## 🎯 今日目标

1. ✅ RepoIndexTool —— file tree with depth + ignore
2. ✅ RepoSearchTool —— GitHub-style content search（含 fileGlob + context lines）
3. ✅ 3 个 example（2 手跑 + 1 真实 LLM demo 代码，缺 API key 未现场跑）
4. ✅ 8 反例（index 5 + search 3）
5. ✅ 1 e2e（Agent 调 repo_index tool）
6. ✅ 测试 fixture（tests/fixtures/sample-repo/）
7. ✅ JD 映射段（首次落地路线 spec §3 模板增量）

## 📦 今日产出物

```text
libs/tools/repo/
  ignore.ts                     ignore 匹配器（精确 + glob，DEFAULT_IGNORE 16 项）
  glob.ts                       自写 glob（* ** ?），不引入 micromatch
  repo-index-tool.ts            RepoIndexTool：maxDepth 默认 3、隐式 maxFiles=5000
  repo-search-tool.ts           RepoSearchTool：pattern 自判 regex、context lines、fileGlob
  index.ts                      barrel

libs/tools/index.ts             MODIFIED — re-export repo tools

examples/day10/
  ex_001_repo_index.ts          手跑：列本 repo 前 10 文件
  ex_002_repo_search.ts         手跑：搜 ToolRegistry，看 5 命中 + context
  ex_003_repo_agent.ts          真实 LLM demo（需 API key）

tests/libs/tools/repo/
  ignore.test.ts                6 cases
  glob.test.ts                  5 cases（含 1 次 glob 边界语义修正）
  repo-index-tool.test.ts       5 反例 + 2 正例 = 7 cases
  repo-search-tool.test.ts      3 反例 + 3 正例 = 6 cases

tests/fixtures/sample-repo/
  package.json
  src/foo.ts
  src/bar.test.ts

tests/apps/api/
  repo-tools-e2e.test.ts        Agent 调 repo_index tool 整链路

docs/daily/day10.md             本文件（含 §JD 映射段）
```

## 🤔 今日讨论过程（关键决策）

### 1. glob 用 micromatch 还是自写？

自写 8 行 mini-glob（`*/**/?`）。Day 10 范围小，micromatch 30KB 依赖不值。**触发条件**：Day 12 评估是否需要 `{a,b}` 字符集，到时再引 micromatch。

### 2. maxFiles 上限暴露为参数吗？

**不暴露**。默认 5000 触发 truncated=true，Agent 自己会细化查询。暴露参数 = Agent 多一个决策点（YAGNI）。

### 3. pattern 自动判 regex 还是显式声明？

**自动判**。含 `.*+?^${}()|[]\\` 任意一个 → regex；否则字面。理由：Agent 99% 场景下「Foo」字面 / `class.*Agent` regex，区分成本远大于收益。

### 4. 测试 import 路径 3 级 vs 4 级

新目录 `tests/libs/tools/repo/` 比 `tests/libs/agent/` 多一层嵌套，相对路径到 `libs/` 需要 `../../../../` 而不是 `../../../`。**教训**：目录每深一层，相对 import 数要手动重算；vitest 报错 "Does the file exist?" 第一反应应查路径深度，而不是怀疑解析器。

### 5. ex_002 手跑 0 命中 — 原因

`fileGlob: '*.ts'` 只匹配**根目录**的 `.ts` 文件；真实仓库文件都在子目录。**结论**：example 用 `'**/*.ts'`（和 `repoSearchTool` 测试里一致）。这是设计测试 / demo 时很容易漏的边界。

### 6. ex_003 真实 LLM demo 没跑

环境无 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`。demo 代码已写好，加了 `import 'dotenv/config'` + 守卫。等有 key 再补跑。

## 🏗 当前架构（Day 10 末态增量）

```
[新增到 libs/tools/]
  repo/                          新增子目录
    ignore.ts                    shouldIgnore(path, patterns) + DEFAULT_IGNORE
    glob.ts                      matchesGlob(path, pattern) — 自写 mini-glob
    repo-index-tool.ts           repoIndexTool: Tool<RepoIndexArgs, RepoIndexResult>
    repo-search-tool.ts          repoSearchTool: Tool<RepoSearchArgs, RepoSearchResult>
    index.ts                     barrel

[Day 10 触达的 Agent Runtime]
  Agent.runEvents()                → ToolRegistry.get(repo_index) → execute(args)
                                  → tool_call + tool_result events
                                  → JSON.stringify 隐式深拷贝（Day 06 snapshot 继承）
```

## 📚 核心概念复习

### 1. Tool 接口 = additive 扩展（Day 04 + Day 10）

`Tool<TArgs, TReturn>` 接口从 Day 04 CalculatorTool 立起，Day 10 加 RepoIndexTool / RepoSearchTool **不改 Tool 接口本身**。这是判别联合扩类型的纪律（不是加 optional 平铺）。

### 2. Tool 错误 = throw（Day 07 继承）

Tool execute 抛错 → Agent 层 catch（[libs/agent/agent.ts:286](libs/agent/agent.ts#L286)）→ yield tool_result 的 `Error: <msg>` 内容（[libs/agent/agent.ts:289](libs/agent/agent.ts#L289)）。

Day 10 的 8 个反例（5 index + 3 search）全部走 throw，Agent 拿到 `Error: repo_index: maxDepth too large (max 10, got 100)` 这种字符串。

### 3. snapshot 语义 + JSON.stringify 隐式深拷贝（Day 06 继承）

Tool 返回 plain object → Agent 层 [JSON.stringify(result)](libs/agent/agent.ts#L287) → 字符串（值类型，深拷贝语义）。

### 4. 不可信输入的纪律（Day 10 新）

每个 IO Tool 入口走三检：
1. `rootPath` 必须是绝对路径
2. 路径必须存在且是目录
3. 上限参数（maxDepth ≤ 10, maxResults ≤ 500）

## 📐 重要设计决策（ADR）

本设计无新增 ADR —— 复用 Day 04 Tool 接口 / Day 06 snapshot / Day 07 错误抛投 + 无新依赖。

**未来可能的 ADR**：
- ADR-016（Day 12+）：micromatch 引入的决策（如果 Day 12 评估需要 `{a,b}` 字符集）

## 🛣 Day 11+ 路线

- **Day 11**：AST 解析（ts-morph / tree-sitter），抽函数签名 / import graph。新增 `ast_search` tool。**接口契约**：接 Day 10 的 `files: string[]`，只解析 `.ts` / `.tsx`。
- **Day 12**：代码导航（go-to-def / find-refs 基于 AST 索引）。新增 `nav_*` tools。
- **Day 13**：Repo Q&A 实战 + Prompt 系统化（JD-2 钩子）。

## 🎯 JD 映射

> 首次落地路线 spec §3 模板增量。验证可执行后 Day 11-65 都按此格式写。

### JD-1 (Coding Agent 全栈) 命中

| 关键词 | 今日命中点 |
|---|---|
| repo understanding | RepoIndexTool — 给 Agent「这个 repo 有什么」的能力 |
| code search | RepoSearchTool — 给 Agent「X 在哪 / 谁调 Y」的能力 |
| code parsing tools | — (Day 11) |

### JD-2 (AI 应用工程师) 命中

| 关键词 | 今日命中点 |
|---|---|
| Prompt Engineering | — (Day 13 钩子日) |
| RAG / Embedding | — (Day 21 钩子日) |
| Eval | — (Day 26 钩子日) |
| Cost / Latency | — (Day 17 钩子日) |
| AI 文化 | — (Day 32 钩子日) |

> **Day 10 不命中 JD-2 是预期的**：M1 第 4 天（Day 13）才是 JD-2 钩子日（Prompt Engineering）。

### 面试可讲（30s STAR 骨架）

1. **Tool 接口扩展走判别联合不重写** —— Day 04 CalculatorTool 立 Tool 接口，Day 10 RepoIndexTool / RepoSearchTool 不动 Tool 本身，只加新 Tool 类。
   **S**：Day 09 末态有 ChatClient + CalculatorTool，Agent 还看不见 repo
   **T**：Day 10 加 2 个 IO 类 Tool 立 L1 Repo Understanding 第一步
   **A**：复用 Day 04 `Tool<TArgs, TReturn>` 接口 + Day 07 throw 规则 + Day 06 snapshot；自写 mini-glob 不引 micromatch
   **R**：5 反例 + 3 正例 + 1 e2e 全过；Agent 能答「libs/tools/ 下面有什么」

2. **不可信输入的纪律** —— Tool 必走「参数类型 + 路径绝对 + 上限守卫」三检。
   **S**：Tool 接受任意字符串 args，Agent 决策不可控
   **T**：不能让 LLM 误传相对路径 / 过大 maxDepth / 无效 regex 让进程崩
   **A**：每个 Tool 入口走 3 检（rootPath 绝对 / maxDepth 在 [1,10] / pattern 是合法 regex）
   **R**：5+3 反例全 throw 出明确错误信息；Agent 收到后能定位「我传错了什么」

## 🔗 相关引用

- **路线 spec**：[2026-07-31-future-learning-path-design.md](../superpowers/specs/2026-07-31-future-learning-path-design.md) §2 M1
- **Day 10 spec**：[2026-08-01-day10-repo-index-design.md](../superpowers/specs/2026-08-01-day10-repo-index-design.md)
- **Day 10 plan**：[2026-08-01-day10-repo-index.md](../superpowers/plans/2026-08-01-day10-repo-index.md)
- **Day 09 spec**：[2026-07-30-day09-multi-turn-design.md](../superpowers/specs/2026-07-30-day09-multi-turn-design.md)
- **Tool 接口**：[libs/tools/tool.ts](../../libs/tools/tool.ts)
- **ToolRegistry**：[libs/tools/tool-registry.ts](../../libs/tools/tool-registry.ts)
- **Agent Tool 调用链**：[libs/agent/agent.ts:280-305](../../libs/agent/agent.ts#L280-L305)
- **Day 10 新增文件**：[libs/tools/repo/repo-index-tool.ts](../../libs/tools/repo/repo-index-tool.ts) / [libs/tools/repo/repo-search-tool.ts](../../libs/tools/repo/repo-search-tool.ts)
