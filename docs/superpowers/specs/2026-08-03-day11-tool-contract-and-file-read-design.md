# Day 11 — Tool 参数契约单一事实源 + FileReadTool (L1 闭环) — 2026-08-03

> 65 天 AI Agent 工程师训练营 · Day 11 / 65
>
> 主题：把 Day 10 暴露的「schema 骗 LLM / execute 自己臆测」根因消灭掉，然后补上 L1 缺失的第三只手 —— Read。
>
> 设计范围：Tool 参数契约重构（zod 单一事实源）+ 修 2 个已复现 bug + FileReadTool。**引入 1 个新依赖（zod）——推翻 Day 04 决策，需 ADR 0003。**

---

## §0 背景

### 0.1 触发事件：Day 10 的 `ex_003` 跑通后暴露的 bug

Day 10 的真实 LLM demo（`examples/day10/ex_003_repo_agent.ts`）在 2026-08-03 首次真跑（此前 API key 缺失未跑）。exit 0，Agent 正确调用了 `repo_index`，但 tool_call 参数是：

```
[tool_call] repo_index({"maxDepth":"1","rootPath":".../libs/tools"})
```

`maxDepth` 是**字符串** `"1"`。顺线索查出 `libs/tools/repo/*` 所有参数都声明成 `type: 'string'`，execute 里各自用 `Number()` / `Boolean()` / `Array.isArray()` 猜真实类型。

**已复现的 2 个 bug**（跑出来的，非推断）：

| # | 位置 | 复现输出 | 严重度 |
|---|---|---|---|
| A | `repo-search-tool.ts:176` `Boolean(a.includeContent)` | `includeContent:"false"` → 仍返回 `content` 字段 | 高（静默 + 烧 token） |
| B | `repo-index-tool.ts:120` `Array.isArray(ignorePatterns)` | `ignorePatterns:"tools"` → 静默回落 DEFAULT_IGNORE，`tools/` 下 10 个文件全部保留 | 高（静默丢意图） |

### 0.2 根因（修改五问 #1）

> **`ToolParameters.properties[].type` 声明的类型，和 `execute` 实际期望的类型，不是同一个事实源。**

schema 骗 LLM（说 string），execute 自己臆测（`Number()`/`Boolean()`/`Array.isArray()`），中间没有任何东西保证一致。这不是"少写了个校验"，是**契约没有单一事实源**。

### 0.3 修改五问 #2/#3

**#2 以前为什么这样？** `tool.ts:15` 的 `readonly type: string` 是开放字符串（不是 union），从来没拦过任何人。Day 04 只有 `CalculatorTool`（唯一参数 `expression` 天然是 string），坑一直没被触发；Day 10 引入数字/数组/布尔参数才引爆。**这是设计错误，不是历史包袱。**

**#3 其他地方有同类问题吗？**（已 grep 全量）

| Tool | 非-string 参数 | 是否中招 |
|---|---|---|
| `calculatorTool` | 无 | ❌ 天然免疫 |
| `repoIndexTool` | `maxDepth`(num) / `ignorePatterns`(arr) | ✅ 中招（bug B） |
| `repoSearchTool` | `maxResults`/`contextBefore`/`contextAfter`(num) / `includeContent`(bool) | ✅ 中招（bug A；三个 num 靠 `Number()` 侥幸没爆） |

**命中率：凡有非-string 参数的 tool 100% 中招。**

### 0.4 Day 11 在 5 层 Coding Agent 路线中的位置（路线修正）

```
M1 L1 Repo Understanding (Day 10-13)
  Day 10 ─▶ RepoIndexTool + RepoSearchTool          ✅ 已完成
  Day 11 ─▶ Tool 参数契约 + FileReadTool             ◀── 本设计（原计划 AST，已改）
  Day 12 ─▶ FileEditTool（副作用工具的安全边界）
  Day 13 ─▶ Repo Q&A 实战 + Prompt 系统化 (JD-2 钩子)
  AST    ─▶ 顺延，见 §6 路线决策
```

**为什么把 AST 挪后**：真实 Coding Agent（Claude Code / Cline / Cursor / Codex）的 L1 最小闭环是 **Glob → Grep → Read → Edit**，没有一个把 AST 索引放在 Read 之前。Day 10 造了前两个，Read 缺失时 Agent 只能靠 grep 碎片猜整个文件 —— L1 是**断的**。详见 §6。

---

## §1 设计目标

### 1.1 学习目标

1. 学会「契约的单一事实源」——类型声明 / runtime 校验 / TS 类型三者同源，而不是三份各写各的
2. 学会 IO 工具的**物理约束**该放哪一层（tool 层 cap vs agent 层 budget）
3. 学会 cat -n 行号为什么是 Read/Edit 配对的**结构性要求**，不是审美
4. 第一次推翻自己早期的 ADR 级决策，并把「为什么当时对、今天为什么错」写下来

### 1.2 不在 Day 11 范围（YAGNI）

| 不做 | 留给 | 理由 |
|---|---|---|
| `FileEditTool` | Day 12 | 副作用 + 不可逆，需要单独一天做安全边界，塞进 Day 11 会两件事都做不好 |
| AST / ts-morph / tree-sitter | Day 13+ 评估 | 见 §6，且需先证明 grep+read 不够用 |
| 真 tokenizer 计数进 tool | 不做 | 业界一致用 char/line cap；token 观测已在 Agent 层（Day 08） |
| 图片 / PDF / notebook 读取 | 不做 | 今天不需要 |
| 文件缓存 / 去重重读 | 不做 | Claude Code 有，但需要先有 Edit 才有价值 |
| zod 用于 LLM 响应校验 | 不做 | 本次 zod **只**用于 tool 参数契约，不外溢 |

---

## §2 核心设计：Tool 参数契约的单一事实源

### 2.1 现状（三份事实，互不校验）

```
┌── ToolParameters (手写 JSON Schema)  ──▶ 发给 LLM（会骗它）
├── execute 里的 Number()/Boolean()    ──▶ runtime 行为（自己臆测）
└── interface RepoIndexArgs            ──▶ TS 类型（编译期，运行时无效）
```

### 2.2 目标（一份事实，三处派生）

```
                  ┌──▶ z.toJSONSchema(schema)  ──▶ 发给 LLM（说真话）
zod schema ───────┼──▶ schema.parse(args)      ──▶ runtime 校验（唯一入口）
                  └──▶ z.infer<typeof schema>  ──▶ TS 类型（自动同步）
```

### 2.3 `Tool` 接口的改动

```ts
// libs/tools/tool.ts
export interface Tool<TSchema extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly description: string;
  readonly schema: TSchema;                        // 🆕 事实源
  execute(args: z.infer<TSchema>): Promise<unknown>; // args 已校验
}
```

**关键决策：校验发生在框架层，不在每个 tool 的 execute 里。**

| 选项 | 含义 | 取舍 |
|---|---|---|
| A：每个 tool 自己 `schema.parse` | Day 04 「execute 自检」纪律的延续 | ❌ 每个新 tool 都可能忘记 → 靠纪律，不靠结构 |
| **B：`ToolRegistry` / Agent 统一 parse** | `execute` 拿到的必然是已校验的 typed args | ✅ **选它** —— 消除"忘记校验"这件事存在的条件 |

选 B 是第一原则的直接应用：**不是加 if 兜住忘记校验的情况，而是让"忘记校验"不可能发生**。

### 2.4 zod 的两个坑（已实测，必须避开）

实测环境：zod 4.4.3，本 repo `npx tsx` 跑出。

| 探针 | 实测结果 | 结论 |
|---|---|---|
| `z.coerce.boolean().parse("false")` | **`true`** | ❌ **禁用 `z.coerce.boolean()`** —— 它会原样复现 bug A |
| `z.stringbool().parse("false")` | `false` | ✅ 布尔参数一律用 `z.stringbool()` |
| `z.stringbool().parse("abc")` | throw | ✅ 无法解析的才报错 |
| `z.coerce.number().int().parse("3")` | `3` | ✅ 无损转换静默通过 |
| `z.coerce.number().int().parse("3.5")` | throw | ✅ |
| `z.coerce.number().int().parse("abc")` | throw | ✅ |
| `z.coerce.number().int().parse("")` | **`0`** | ⚠️ 空串静默变 0 → **数字参数必须带 `.min(n)` 下界** |

### 2.5 类型错误的处理策略（Q2 落地）

肥老大的决定是「强制报错，不能浪费 token」。zod 天然分层，正好命中意图：

| 输入 | 行为 | token 成本 |
|---|---|---|
| `"3"` → number | 无损转换 | 0（不报错） |
| `"false"` → bool（`z.stringbool`） | 无损转换 | 0（不报错） |
| `"abc"` → number | throw → Agent yield `tool_result` 错误串 | 1 轮，值得 |

**更重要的是根因效应**：schema 说真话之后，LLM 本来就会传对类型（今天传 `"1"` 正是因为 schema 骗它）。**报错路径从「必然」降级成「罕见」**——这才是消除条件，不是兜住条件。

### 2.6 `ToolParameters` 的去向

现有 `ToolParameters` 无法承载 `minimum` / `maximum` / `items` / `default`（`properties` 的值类型只有 `{type, description?}`）。改为直接用 `z.toJSONSchema()` 的输出类型。

实测 `z.toJSONSchema(S, { target: 'draft-7', io: 'input' })` 输出：

```json
{"$schema":"http://json-schema.org/draft-07/schema#","type":"object",
 "properties":{
   "rootPath":{"type":"string","description":"Absolute path"},
   "maxDepth":{"default":3,"description":"1-10","type":"integer","minimum":1,"maximum":10},
   "ignorePatterns":{"type":"array","items":{"type":"string"}}},
 "required":["rootPath"]}
```

带 `.default()` 的字段自动不进 `required` —— 语义正确。

> **验证依据**：Anthropic tool `input_schema` 与 OpenAI function `parameters` 均接受完整 JSON Schema（`integer` / `array` / `enum` / `minimum` / `additionalProperties` 等）。draft-7 是通用目标（Vercel AI SDK 也用 draft-7）。

---

## §3 FileReadTool 设计

### 3.1 业界调研结论（有出处）

| 问题 | 结论 | 出处 |
|---|---|---|
| 截断在哪层 | **Tool 层**（不是 Agent 层） | Cline `output-limits.ts` 注释：*"Executors enforce these caps; tool descriptions reference them so the model pages or narrows instead of retrying."* |
| 怎么告诉模型 | **尾部纯文本 marker**（不是结构化 `truncated` 字段） | Cline: `[Showing lines 100-1200 of 5430. Use start_line/end_line to read other sections.]` |
| 行号 | **cat -n 必带**，为 Edit 提供唯一锚点 | Cline `includeLineNumbers: true` 默认；Claude Code CHANGELOG "compact line-number format" |
| 数 token 还是行/字符 | **行/字符**（Aider 是唯一例外） | Cline 注释：*"measured in characters (UTF-16 code units), which tracks token cost more closely than bytes"* |

**为什么 marker 放尾部而不是 JSON 字段**：Cline 注释原话 —— *"Truncation notices always live in the preserved head/tail of an entry, never in the elided middle... keeping the notices at the edges means the recovery guidance survives that cut too."* 截断提示本身必须能抗二次截断。

### 3.2 上限常量（抄 Cline，已验证的生产值）

```
MAX_READ_LINES        = 2_000   // 单次最多 2000 行
MAX_LINE_CHARS        = 2_000   // 单行超长截断（防 minified 单行炸内存）
MAX_READ_OUTPUT_CHARS = 48_000  // 单次输出总字符上限（≈12k tokens）
```

### 3.3 与 Day 08 的分层（回答"测量该在哪一层"）

| 层 | 管什么 | 手段 | 为什么 |
|---|---|---|---|
| **Tool 层** | 物理约束 | 行数 / 字符数 cap | 便宜、确定、跨 model 通用；只有 tool 知道文件结构和字符位置 |
| **Agent 层** | 预算 | Day 08 `countContextTokens` + `context` 事件 | 决定"还能不能再读一个文件"是编排问题，不是 IO 问题 |

**`countContextTokens` 不进 tool。** 理由：tiktoken 类调用每次 5-10ms，累积在每次 Read 上不划算；char 4≈1 token 的近似对代码够用；一个 cap 对所有 model 通用，避免维护 per-model tokenizer 表。

### 3.4 参数 schema（草案）

```ts
z.object({
  path:       z.string().describe('Absolute path to the file'),
  startLine:  z.coerce.number().int().min(1).optional().describe('1-based start line'),
  endLine:    z.coerce.number().int().min(1).optional().describe('1-based end line, inclusive'),
})
```

三检继承 Day 10：路径必须绝对 / 必须存在且是文件 / 上限守卫（由 zod `.min()` 承担）。

### 3.5 输出格式

```
  42 | const x = 1;
  43 | const y = 2;

[Showing lines 42-2041 of 5430. Use startLine/endLine to read other sections.]
```

---

## §4 反例清单（TDD 先写）

### 4.1 契约层（回归 Day 10 的 2 个 bug）

1. `includeContent: "false"` → `content` 字段**必须**消失（bug A 回归）
2. `ignorePatterns: "tools"`（字符串而非数组）→ **必须**明确报错，不静默回落（bug B 回归）
3. `maxDepth: "1"` → 无损转换为 `1`，不报错
4. `maxDepth: "abc"` → 报错，错误信息包含参数名
5. `maxDepth: ""` → 报错（覆盖 `""→0` 的 zod 坑）
6. `maxDepth: 100` → 报错（上限守卫仍在）
7. `z.toJSONSchema` 输出中 `maxDepth.type === 'integer'`（不是 `'string'`）——**防止本次根因复发的结构性测试**

### 4.2 FileReadTool

8. 相对路径 → throw
9. 不存在的路径 → throw
10. 目录而非文件 → throw
11. 5000 行文件默认读 → 只返回 2000 行 + 尾部 marker 含 `of 5000`
12. `startLine > endLine` → throw
13. 单行 5000 字符 → 该行截断到 2000 + `[line truncated]`
14. 空文件 → 不 throw，返回空内容
15. 行号格式：第 42 行输出必须以 `  42 | ` 开头（Edit 锚点契约）

### 4.3 回归

16. Day 10 的 8 个既有反例全过（契约重构不能破坏既有行为）
17. `ex_003_repo_agent.ts` 真 LLM 重跑，tool_call 的 `maxDepth` 必须是**数字** `1` 而非 `"1"`

---

## §5 技术债预算

```
技术债变化：
+ 新增 zod 依赖（tool 参数契约唯一事实源）
    —— 维护成本 低（zod 4 原生 toJSONSchema，无需 zod-to-json-schema 转换器）
    —— 3 年存活率 高（Vercel AI SDK / Cline / OpenAI SDK 均已标准化此模式）
+ 新增 FileReadTool（3 个 cap 常量 + cat -n 格式）
    —— 维护成本 低，常量抄自 Cline 生产实现
    —— 3 年存活率 高（L1 闭环的必需件）
- 删除 ToolParameters 手写 JSON Schema 类型（合并到 z.toJSONSchema 输出）
- 删除 execute 内 7 处 Number()/Boolean()/Array.isArray() 臆测（合并到 schema.parse）
- 删除 3 个 interface XxxArgs 手写类型（合并到 z.infer）
净增：-1（删除的分支多于新增）

反驳记录：
- 「Day 04 说不引 zod」是历史决策还是仍然正确？
  → Day 04 时唯一 tool 只有 string 参数，自检成本 ≈ 0，决策正确。
    Day 10 引入 num/bool/arr 后自检成本 > zod 成本，且已产生 2 个真 bug。
    条件变了，决策该变 → 写 ADR 0003 记录，不默默改。
- 「zod 是不是过度设计」？
  → 它删除的分支比新增的多（净 -1），且消除了一整类 bug 的存在条件。不是加抽象，是换事实源。
```

---

## §6 路线决策：为什么 AST 让位

原 roadmap（memory `day10-65-roadmap`）Day 11 = AST 解析。本设计改为 Tool 契约 + Read。

**依据**：

1. **L1 闭环是断的。** 真实 Coding Agent 的 Repo Understanding 最小闭环是 Glob → Grep → **Read** → Edit。Day 10 造了前两个。没有 Read，Agent 拿到 `repo_search` 的 5 行 context 后无法读完整文件，只能靠碎片猜。
2. **AST 不在任何主流实现的关键路径上。** 调研 5 个生产 Coding Agent：Claude Code 无 AST 索引（grep + read）；Codex 连 `read_file` 都没有，直接让模型跑 `cat`/`sed`；Cline 无 AST。唯一用 tree-sitter 的是 Aider，且只用于生成 RepoMap（默认 1024 tokens），不用于导航。
3. **契约 bug 是 Read/Edit 的地基。** `FileReadTool` 需要 `startLine`/`endLine`（number），`FileEditTool` 需要 `replaceAll`（bool）。在裂缝上盖楼 = Day 12 的 Edit 会带着**不可逆写入 + 静默错参**双重风险。
4. **AST 不损失。** JD-1 的 "code parsing" 关键词延后一天命中，无实质代价。

**AST 的重新定位**：Day 13+ 评估，且必须先回答「grep + read 在什么场景下不够用」。若答不出，走 YAGNI 红线砍掉。

---

## §7 ADR 0003（需落地）

**标题**：Tool 参数契约以 zod schema 为单一事实源

**Status**: Proposed (2026-08-03, Day 11)

**Context**: Day 04 决定「不引入 zod/ajv runtime validation, 由 tool execute 自检」（`tool.ts:10`）。该决策在只有 string 参数时成本为零且正确。Day 10 引入 number/boolean/array 参数后，`ToolParameters` 与 `execute` 成为两份互不校验的事实源，已产生 2 个可复现的静默失败 bug。

**Decision**: `Tool.schema: z.ZodType` 为唯一事实源；JSON Schema / runtime 校验 / TS 类型三者全部派生自它；校验在框架层统一执行，`execute` 只接收已校验的 typed args。

**Consequences**: 新增 zod 依赖；删除手写 JSON Schema、execute 内类型臆测、手写 Args interface 三类代码；类型错误从「静默失败」变为「明确报错」，且发生率从必然降为罕见。

**Enforcement**: 反例 #7 —— `z.toJSONSchema` 输出中数字参数的 `type` 必须是 `'integer'`，防止根因复发。

---

## §8 JD 映射（预填）

### JD-1 (Coding Agent 全栈)

| 关键词 | Day 11 命中点 |
|---|---|
| repo understanding | FileReadTool 补齐 Glob→Grep→Read 闭环 |
| code parsing tools | —（顺延，见 §6） |
| 优化执行效率 | tool 层 char/line cap，防单文件吃掉 context |

### 面试可讲（30s STAR 骨架）

**「schema 骗模型」类 bug 的根因消除**
- **S**：Day 10 两个 repo tool 上线，真 LLM demo 跑通、测试全绿
- **T**：跑真实 demo 时发现 LLM 传 `"maxDepth":"1"`（字符串），顺线索复现出 2 个静默失败
- **A**：定位根因不是漏校验，是 schema 声明与 execute 期望不同源；改为 zod 单一事实源，校验上提到框架层，并加结构性测试防复发
- **R**：删除 7 处类型臆测 + 3 个手写类型；类型错误从静默失败变明确报错，且发生率从必然降为罕见

---

## §9 相关引用

- Day 10 spec: [2026-08-01-day10-repo-index-design.md](2026-08-01-day10-repo-index-design.md)
- Day 10 daily: [day10.md](../../daily/day10.md)
- ADR 0001 / 0002: [docs/adr/](../../adr/)
- 现状代码：[tool.ts](../../../libs/tools/tool.ts) / [tool-registry.ts](../../../libs/tools/tool-registry.ts) / [repo-index-tool.ts](../../../libs/tools/repo/repo-index-tool.ts) / [repo-search-tool.ts](../../../libs/tools/repo/repo-search-tool.ts)
- 业界参考：Cline [output-limits.ts](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/executors/output-limits.ts) / [file-read.ts](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/executors/file-read.ts) / [schemas.ts](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/schemas.ts)
- 业界参考：Vercel AI SDK [schema.ts](https://github.com/vercel/ai/blob/main/packages/provider-utils/src/schema.ts)
- 业界参考：Claude Code [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)（Read 工具 offset/limit、PARTIAL view、compact line-number format）
