# ADR 0003: Tool 参数契约以 zod schema 为单一事实源

## Status

Accepted (2026-08-03, Day 11)

## Context

Day 04 在 `libs/tools/tool.ts` 的文件头写下：

> `ToolParameters` 是简化版 JSON Schema (type/object/properties/required) —— Day 04 不引入
> zod/ajv runtime validation, 由 tool execute 自检 (Day 04 CalculatorTool 走此纪律)。

**那个决策在当时是对的。** Day 04 只有 `CalculatorTool` 一个 tool，唯一参数 `expression` 天然是 string，手写 schema 与 execute 自检不可能不一致，引入 zod 的收益为零。

**Day 10 改变了条件。** `RepoIndexTool` / `RepoSearchTool` 引入了 number / boolean / array 参数，于是同一份契约变成了三处各写各的：

```
┌── ToolParameters (手写 JSON Schema)  ──▶ 发给 LLM
├── execute 里的 Number()/Boolean()    ──▶ runtime 行为
└── interface XxxArgs                  ──▶ TS 类型（运行时无效）
```

`ToolParameters.properties[].type` 是开放的 `string` 类型（不是 union），从来没拦过任何人。Day 10 的两个 repo tool 把**所有**参数都声明成了 `type: 'string'`，然后在 execute 里用 `Number()` / `Boolean()` / `Array.isArray()` 各自臆测真实类型。

### 触发本决策的三个已复现 bug

2026-08-03 首次真跑 `examples/day10/ex_003_repo_agent.ts`（Day 10 时因缺 API key 未跑），LLM 传出 `{"maxDepth":"1"}` —— **字符串**。顺线索复现出：

| # | 位置 | 症状 | 类别 |
|---|---|---|---|
| A | `repo-search-tool.ts` `Boolean(a.includeContent)` | `"false"` → `Boolean("false") === true` → content 照返 | 静默失败 + 烧 token |
| B | `repo-index-tool.ts` `Array.isArray(ignorePatterns)` | 传字符串 → 不是数组 → 静默回落 DEFAULT_IGNORE | 静默丢意图 |
| C | 修复过程中引入 | `z.stringbool()` 单用：JSON Schema 仍是 `string`，且**拒绝原生 `true`/`false`** | 越强的模型越容易踩 |

**命中率：凡有非-string 参数的 tool，100% 中招。** bug C 尤其说明问题——即使在专门修这类 bug 的当天，只要"schema 不说真话"这个条件还在，同族 bug 就会继续生出来。

### 根因

**类型声明与 runtime 期望不是同一个事实源。** schema 骗 LLM，execute 自己臆测，中间没有任何东西保证一致。这不是"漏写了校验"，加校验只是兜住症状。

## Decision

**`Tool.schema: z.ZodType` 是 tool 参数契约的唯一事实源。三处全部派生自它。**

```
                  ┌──▶ z.toJSONSchema()  ──▶ 发给 LLM 的 JSON Schema
zod schema ───────┼──▶ schema.parse()    ──▶ runtime 校验
                  └──▶ z.infer<>         ──▶ execute 的参数 TS 类型
```

### 校验发生在框架层，不在 execute 内

| 选项 | 含义 | 结论 |
|---|---|---|
| A：每个 tool 自己 parse | Day 04「execute 自检」纪律的延续 | ❌ 靠纪律 —— 每个新 tool 都可能忘 |
| **B：框架层统一 parse** | `execute` 拿到的必然是已校验的 typed args | ✅ 靠结构 —— 「忘记校验」不可能发生 |

选 B。两个入口共享同一份校验实现：

- `runTool(tool, rawArgs)` —— 单 tool 版本，返回类型精确
- `ToolRegistry.execute(name, rawArgs)` —— 按名字查找版本，内部委托到前者

绕过校验直接调 `tool.execute()` 会被类型系统拦住：`execute` 的参数类型是 `z.infer<TSchema>`（default 已填充的输出类型），手工构造它比走 `runTool` 更麻烦。

### 类型错误的处理：无损转换静默通过，无法解析才报错

| 输入 | 行为 | 成本 |
|---|---|---|
| `"3"` → number | 无损转换 | 0 |
| `"false"` / `false` → boolean | 无损转换 | 0 |
| `"abc"` → number | throw | 1 轮，值得 |

更重要的是**根因效应**：schema 说真话之后 LLM 本来就会传对类型，报错路径从「必然」降为「罕见」。

### 三条实测出来的 zod 禁令

| 禁止 | 原因（本机 zod 4.4.3 实测） |
|---|---|
| `z.coerce.boolean()` | `parse("false") === true` —— 原样复现 bug A |
| `z.stringbool()` 单用 | JSON Schema 输出 `type: "string"`（仍不说真话）；且拒绝原生 `true`/`false` |
| 无下界的 `z.coerce.number()` | `parse("") === 0` —— 空串静默变 0，必须配 `.min(n)` |

布尔参数的正确写法：`z.union([z.boolean(), z.stringbool()])` → JSON Schema 为 `anyOf: [{type:"boolean"},{type:"string"}]`。

## Consequences

**新增**：`zod` 生产依赖（`dependencies`，不是 devDependencies —— `libs/tools/tool.ts` 是 runtime import）。

**删除**：手写 `ToolParameters` 类型、execute 内 7 处类型臆测、3 个手写 `interface XxxArgs`。净减少分支。

**行为变化**：
- 类型错误从「静默失败」变为「明确报错」，错误信息含 tool 名 + 参数路径（LLM 能定位自己传错了什么）
- tool 不存在的处理下沉到 `ToolRegistry.execute`，Agent 层的 `if (tool === undefined)` 分支删除
- 上限守卫（`maxDepth ≤ 10` 等）从手写 if 下沉到 zod，错误信息文案随之改变

**代价**：`execute` 的参数类型是「已 parse」的输出类型，测试/example 不能再直接调 `execute` 传部分参数，必须走 `runTool`。这是契约在起作用，不是缺陷。

## Enforcement

`tests/libs/tools/tool-contract.test.ts` 的「反例 7 —— 防复发」组：直接断言 `toProviderTools()` 输出的 JSON Schema 里，**每一种非-string 语义类型都说真话**：

- 数字参数 → `type === 'integer'`
- 数组参数 → `type === 'array'` 且 `items.type === 'string'`
- 布尔参数 → 分支中必须出现 `'boolean'`
- 带 `.default()` 的参数不进 `required`
- registry 派生结果与直接对 schema 求 JSON Schema 相等（单一事实源）

这组测试不测功能，只测**契约的诚实性**。红绿循环已验证：把任一 schema 写回错误类型，对应测试立刻变红。

> bug C 的教训写进了这条 Enforcement：最初的反例 7 只查了 integer / array，漏了 boolean，于是没抓到 `z.stringbool()` 的问题。**结构性测试必须覆盖所有非-string 语义类型，漏一种就漏一类 bug。**

## Supersedes

推翻 Day 04 在 `libs/tools/tool.ts` 文件头写下的「不引入 zod/ajv runtime validation, 由 tool execute 自检」。原决策在只有 string 参数时正确；引入非-string 参数后条件已变。
