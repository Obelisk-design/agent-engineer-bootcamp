# Day 10 — Repo Index + Content Search (L1 第一步) — 2026-08-01

> 65 天 AI Agent 工程师训练营 · Day 10 / 65
>
> 主题：L1 Repo Understanding 第一步 —— 给 Agent 「这个 repo 有什么」 + 「X 在哪 / 谁调 X」 两个原子能力。
>
> 设计范围：2 个 Tool（RepoIndexTool + RepoSearchTool）+ 3 个 example + 5 反例 + 1 e2e。**不引入新依赖**（纯 Node `fs`）。

---

## §0 背景

### 0.1 已学（Day 01-09）相关沉淀

| Day | 沉淀 | Day 10 复用 |
|---|---|---|
| 04 | Tool 接口 + ToolRegistry + CalculatorTool 范式 | ✅ 走 `Tool<TArgs, TReturn>` 接口 |
| 04 | Tool 失败 = throw（agent 层 catch 后 yield tool_result 的 Error 字符串） | ✅ 继承 |
| 06 | snapshot 语义（yield 时深拷贝累积型数据） | ✅ Tool 返回 plain object，agent 层 `JSON.stringify` 隐式处理 |
| 07 | error throw → yield（Agent 层），Tool 层 throw 不变 | ✅ Tool throw，Agent 层 catch |
| 09 | runEvents 接受 messages + 入口深拷贝 | ✅ example 直接复用现有 Agent 构造 |

### 0.2 Day 10 在 5 层 Coding Agent 路线中的位置

```
M1 L1 Repo Understanding (Day 10-13)
  Day 10 ─▶ RepoIndexTool + RepoSearchTool (本设计)
  Day 11   ─▶ AST 解析（ts-morph / tree-sitter）
  Day 12   ─▶ 代码导航（go-to-def / find-refs）
  Day 13   ─▶ Repo Q&A 实战 + Prompt 系统化 (JD-2 钩子)
```

**Day 10 是 L1 的「最小可工作」层**：Agent 现在能"看"到 repo 结构和内容，但还看不懂代码语义（语义留 Day 11 AST）。

### 0.3 JD 命中

| JD-1 关键词 | Day 10 命中 |
|---|---|
| repo understanding | ✅ RepoIndexTool |
| code search | ✅ RepoSearchTool |
| code parsing tools | — (Day 11) |

---

## §1 设计目标

### 1.1 学习目标

让 Agent 能：
1. 问「这个 repo 有什么」 → `repo_index` tool
2. 问「X 在哪 / 谁调用 Y」 → `repo_search` tool
3. 跑一个真实 demo：基于本 repo（agent-engineer-bootcamp），Agent 用 2 个 Tool 答问题

### 1.2 不在 Day 10 范围（YAGNI）

| 不做 | 留给 |
|---|---|
| ripgrep 二进制依赖 | Day 12+ 评估（纯 Node fs 够用） |
| AST / 函数签名 | Day 11 |
| file watcher / 增量索引 | Day 30+ 持久化 |
| git blame / 历史信息 | Day 20 debugging |
| fuzzy match / 语义搜索 | Day 21 RAG |
| 多语言 syntax 高亮 | — (YAGNI) |

---

## §2 接口设计

### 2.1 RepoIndexTool

```typescript
export interface RepoIndexArgs {
  readonly rootPath: string;                          // 必填，绝对路径
  readonly maxDepth?: number;                         // 默认 3，> 10 拒绝
  readonly ignorePatterns?: readonly string[];        // 默认见 §2.1.2
}

export interface RepoIndexResult {
  readonly files: readonly string[];                  // 相对 rootPath 的 POSIX 风格路径
  readonly total: number;                             // 实际命中文件数（不含 ignore）
  readonly truncated: boolean;                        // true = 命中 maxFiles 上限
}

export const repoIndexTool: Tool<RepoIndexArgs, RepoIndexResult>
```

**默认 ignore 列表**（精确匹配 + glob 都支持）：
```typescript
const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', '.turbo', 'coverage',
  '.next', '.nuxt', 'build', 'out', 'target',
  '*.min.js', '*.map', '*.lock', 'package-lock.json',
  'pnpm-lock.yaml', 'yarn.lock',
] as const;
```

**maxFiles 隐式上限**：`5000`（防 context 爆炸，触发 truncated=true）。**不暴露为参数**（YAGNI）。

**路径返回**：相对 rootPath 的 POSIX 风格（统一 `/`），方便 Agent 跨平台消费。

### 2.2 RepoSearchTool

```typescript
export interface RepoSearchArgs {
  readonly rootPath: string;
  readonly pattern: string;                           // 字符串字面 OR 正则（看 §2.2.1）
  readonly maxResults?: number;                       // 默认 50，> 500 拒绝
  readonly fileGlob?: string;                         // 例 '*.ts'（glob 模式，非 regex）
  readonly includeContent?: boolean;                  // 默认 true
  readonly contextBefore?: number;                    // 默认 0
  readonly contextAfter?: number;                     // 默认 0
}

export interface RepoSearchMatch {
  readonly file: string;                              // POSIX 相对路径
  readonly line: number;                              // 1-based
  readonly column?: number;                           // 1-based，regex 命中位置（字面匹配不返回）
  readonly content: string;                           // includeContent=true 时
  readonly before?: readonly string[];                // contextBefore 行
  readonly after?: readonly string[];                 // contextAfter 行
}

export interface RepoSearchResult {
  readonly matches: readonly RepoSearchMatch[];
  readonly total: number;                             // 实际命中数（可能 > matches.length 因 truncated）
  readonly truncated: boolean;
}
```

**pattern 模式判定**：
- 字符串里包含正则元字符（`.*+?^${}()|[]\\`）→ 当 regex 处理
- 否则字面匹配（防误匹配 + 转义负担）

**fileGlob**：用 `micromatch`-like glob → **不引入新依赖**，自写 8 行简化版（只支持 `*` 和 `**` 和 `?`）。Day 10 用最小子集：`*`（单层）、`**`（多层）、`?`（单字符）、`{a,b}` 留 Day 12 评估。

**并发**：搜索是 IO bound，**不用并发**（Node 单进程 + 文件读 atomic）。如果 Day 12 实测慢，再换 `p-limit`。

### 2.3 Tool name / description（给 LLM 看）

```typescript
// repo_index
name: 'repo_index',
description: 'List files in a repository directory tree (respects .gitignore-style ignores).
  Use this when you need to know "what files exist in this repo" or "what is the structure".
  Input: { rootPath: absolute path, maxDepth?: 1-10, ignorePatterns?: string[] }
  Returns: { files: string[]; total: number; truncated: boolean }
  Files are POSIX-relative to rootPath. Truncated=true means hit the 5000-file cap.'

// repo_search
name: 'repo_search',
description: 'Search file contents for a pattern (string literal or regex).
  Use this when you need to find "where X is defined" or "who calls Y".
  Input: { rootPath, pattern, maxResults?: ≤500, fileGlob?: '*.ts' etc, includeContent?, contextBefore?, contextAfter? }
  Returns: { matches: { file, line, column?, content?, before?, after? }[]; total; truncated }
  Pattern auto-detected as regex if contains metachars.'
```

---

## §3 错误处理

### 3.1 Tool throw 矩阵（Agent 层在 agent.ts:286 catch 后 yield `Error: <msg>` 进 tool_result）

| 场景 | throw message | 测试用例 |
|---|---|---|
| rootPath 不存在 | `repo_index: rootPath does not exist: <path>` | 反例 1 |
| rootPath 不是目录 | `repo_index: rootPath is not a directory: <path>` | 反例 3 |
| rootPath 是相对路径 | `repo_index: rootPath must be absolute, got: <path>` | 反例 2 |
| maxDepth > 10 | `repo_index: maxDepth too large (max 10, got N)` | — |
| maxDepth < 1 | `repo_index: maxDepth must be >= 1` | — |
| maxResults > 500 | `repo_search: maxResults too large (max 500, got N)` | — |
| pattern 是无效 regex | `repo_search: invalid regex pattern: <err.message>` | 反例 4 |
| fileGlob 是无效 glob | `repo_search: invalid glob: <err.message>` | — |
| 任意 fs 抛错 | 透传 throw | — |

**关键纪律**：**Tool 抛错 = agent 层兜底**，不在 Tool 里 try/catch + 返回 error 对象（Day 07 不变量继承）。

### 3.2 truncated 语义

- `truncated=true` 时 `total` 是真实命中数（> matches.length），`matches.length === maxResults/maxFiles`
- Agent 收到 truncated=true 应该缩小范围（更具体的 fileGlob / 更小的 rootPath）再查
- 不在 Tool 里写"自动细化"逻辑（YAGNI —— Agent 自己会判断）

---

## §4 文件结构

```
libs/tools/
  repo/
    repo-index-tool.ts           NEW
    repo-search-tool.ts          NEW
    glob.ts                      NEW — 自写简化版 glob（8 行）
    ignore.ts                    NEW — ignore 匹配（精确 + glob）
    index.ts                     NEW — barrel
  tool.ts                        (no change)
  tool-registry.ts               (no change)
  calculator-tool.ts             (no change)
  index.ts                       MODIFIED — export repo tools

examples/day10/
  ex_001_repo_index.ts           NEW — 手跑 RepoIndexTool
  ex_002_repo_search.ts          NEW — 手跑 RepoSearchTool
  ex_003_repo_agent.ts           NEW — 真实 LLM 跑一轮

tests/libs/tools/repo/
  repo-index-tool.test.ts        NEW — 5 反例 + 2 正例
  repo-search-tool.test.ts       NEW — 3 正例 + 2 反例
  glob.test.ts                   NEW — 5 个 glob 场景
  ignore.test.ts                 NEW — 5 个 ignore 场景

tests/apps/api/
  repo-tools-e2e.test.ts         NEW — Agent 调 repo tool e2e

docs/daily/day10.md              NEW — 当日笔记（含 §JD 映射段）
```

---

## §5 测试策略

### 5.1 单元测试（5 反例 + 2 正例 / Tool）

**RepoIndexTool 反例**：
1. rootPath = `/nonexistent/path/xxx` → throw `does not exist`
2. rootPath = `./` （相对路径） → throw `must be absolute`
3. rootPath = `/etc/passwd` （文件非目录） → throw `not a directory`
4. maxDepth = 100 → throw `too large`
5. maxDepth = 0 → throw `must be >= 1`

**RepoIndexTool 正例**：
1. 跑本 repo（agent-engineer-bootcamp） → files 数 > 50，total 命中
2. 跑一个临时 fixture（tests/fixtures/sample-repo/） → files 精确匹配

**RepoSearchTool 反例**：
1. pattern = `[invalid(regex` → throw `invalid regex`
2. 永不命中的 pattern → matches=[], total=0, truncated=false
3. maxResults > 500 → throw `too large`

**RepoSearchTool 正例**：
1. 搜 `ToolRegistry` → matches 命中 3+（tool-registry.ts + tests + agent.ts）
2. fileGlob = `*.ts` + 搜 `class` → 只在 .ts 文件命中
3. contextBefore=2 → before 数组 2 行

**Glob 单元**：5 场景（`*` / `**` / `?` / 字面 / 无效）

**Ignore 单元**：5 场景（精确匹配 / glob 匹配 / 嵌套 / 数组包含 / 默认列表）

### 5.2 e2e 测试（`tests/apps/api/repo-tools-e2e.test.ts`）

```typescript
// 1. createAgentApp 一次，注入 agent + repo tools
// 2. POST /agent with messages + 模拟 LLM tool_call(repo_index)
//    (FakeChatClient: 收到 tool_call 后预设返回 repo_index 的执行结果)
// 3. 验证：
//    - trace.events 含 tool_call(repo_index)
//    - trace.events 含 tool_result(repo_index) with JSON parseable content
//    - tool_result 字段结构对齐 RepoIndexResult
```

### 5.3 demo 计划

**`examples/day10/ex_001_repo_index.ts`**：手跑 RepoIndexTool(rootPath=本仓库, maxDepth=2)，打印 files 前 20 个。

**`examples/day10/ex_002_repo_search.ts`**：手跑 RepoSearchTool(rootPath=本仓库, pattern='ToolRegistry', fileGlob='*.ts')，打印 matches。

**`examples/day10/ex_003_repo_agent.ts`**：**真实 LLM**（OpenAI / Anthropic 二选一），Agent 拿两个 Tool 答「libs/tools/ 下面有哪些文件」。打印 AgentEvent 流 + 最终回答。

### 5.4 验收 checklist

- [ ] `pnpm typecheck` 0 error
- [ ] `pnpm test` 全过（单元 8 + e2e 1 = 9 个测试套件）
- [ ] 3 个 example 跑通（手跑 2 + LLM 1）
- [ ] JD-1 命中：repo understanding / code search
- [ ] 无 YAGNI 红线（不引入 ripgrep / 不做 AST / 不做持久化）
- [ ] `docs/daily/day10.md` 末尾新增 §JD 映射段
- [ ] 1 条 ADR（如有架构变更 —— 本设计无 ADR 必要，Tool 是 Day 04 接口的复用）

---

## §6 不变量继承（自 [Day 10-65 roadmap](../../../../memory/day10-65-roadmap.md) §6.2）

1. ✅ Tool 失败 = throw（Agent 层 catch 后 yield tool_result 的 Error 字符串）—— Day 04 规则
2. ✅ Tool 返回 plain object，Agent 层 `JSON.stringify` 隐式深拷贝 —— Day 06 规则
3. ✅ Tool usage 字段 = 派生自 tool 调用日志（本次无 usage 字段，Day 17 再加）
4. ✅ Tool 设计走"修改五问" —— 本设计已走（见 §7）
5. ✅ Tool registry 用判别联合扩 —— 走现有 `Tool` 接口，未平铺 optional

---

## §7 修改五问（设计前走）

### 1. 根因是什么？

LLM Agent 没有"看 repo"能力 → 看不到结构 / 搜不到内容 → 不能答"X 在哪"。

### 2. 以前代码为什么这样？

libs/tools/ 下只有 CalculatorTool —— 一个纯函数 tool，不涉及 IO / 文件系统。Day 10 加的两个 Tool 是**第一个 IO 类 Tool**，要给后续 Day 14-21 Tool 立范式。

### 3. 其他地方有同类问题吗？

Grep `libs/tools/calculator-tool.ts` —— Calculator 抛错模式 vs Day 10 的 IO 抛错：Calculator 用 `throw new Error` 含 type 前缀（如 `calculator: invalid number at N`），Day 10 沿用同样模式（`repo_index: <message>`）。

其他模块无同类问题。

### 4. 最合理的架构是什么？

- **Tool 接口不动**（Day 04 已立足够抽象）
- **错误处理走 Tool 自身 throw + Agent 层 catch**（Day 07 规则）
- **不引入 ripgrep 二进制**（依赖污染 + 跨平台麻烦 —— Day 18 sandbox 阶段再评估）
- **不引入 micromatch**（8 行自写 glob 够用）
- **maxFiles 隐式上限 5000**（不暴露参数 = 防 context 爆炸）

### 5. 今天重新设计会怎么设计？

差异 < 50%，沿用现有 Tool 抽象。

---

## §8 YAGNI 边界（Day 10 不碰）

| 类别 | 红线 |
|---|---|
| ripgrep 二进制 | 用纯 Node fs |
| AST 解析 | Day 11 |
| file watcher | Day 30+ |
| git blame | Day 20 |
| fuzzy match / 语义搜索 | Day 21 |
| glob 完整语法 | 只支持 `*` `**` `?` |
| micromatch | 自写 8 行 |
| maxFiles 参数化 | 隐式 5000 |

---

## §9 与 Day 11 的接口契约（防断裂）

| Day 10 产物 | Day 11 假设 |
|---|---|
| `RepoIndexResult.files: readonly string[]` | Day 11 AST 解析接 `files`，只解析 .ts / .tsx |
| `RepoSearchResult.matches[].file + line + content` | Day 11 AST 在此基础上抽 `functionName` |
| ignore 列表默认含 `node_modules` `.git` | Day 11 沿用，AST 解析跳过 ignore 同款 |
| glob.ts 自写简化版 | Day 11 复用同一份 glob（不引入 micromatch） |

---

## §10 相关引用

- **路线 spec**：[2026-07-31-future-learning-path-design.md](2026-07-31-future-learning-path-design.md) §2 M1
- **Day 09 design**：[2026-07-30-day09-multi-turn-design.md](2026-07-30-day09-multi-turn-design.md)
- **Tool 接口**：[libs/tools/tool.ts](../../../../libs/tools/tool.ts)
- **ToolRegistry**：[libs/tools/tool-registry.ts](../../../../libs/tools/tool-registry.ts)
- **Calculator 范式**：[libs/tools/calculator-tool.ts](../../../../libs/tools/calculator-tool.ts)
- **Agent.ts Tool 调用**：[libs/agent/agent.ts](../../../../libs/agent/agent.ts#L280-L305)
- **memory**：[day10-65-roadmap](../../../../../.claude/projects/d--spaceObelish-spaceCode-playgroud-agent-agent-engineer-bootcamp/memory/day10-65-roadmap.md)

---

> **写给 Day 10 的自己**：2 个 Tool，5+3 反例，1 e2e。完成后 dayNN.md 末尾加 §JD 映射段。下一个 day 直接走 Day 11 AST 解析，接口契约见 §9。