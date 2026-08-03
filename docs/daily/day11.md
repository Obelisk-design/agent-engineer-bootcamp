# Day 11 — Tool 参数契约单一事实源 + FileReadTool（L1 闭环）

> 65 天 AI Agent 工程师训练营 · Day 11 / 65
> 主题：Day 10 的真 LLM demo 跑通后暴露出「schema 骗 LLM」的根因，今天把它消灭掉；顺带补上 L1 缺失的第三只手 —— Read。

---

## 🎯 今日目标

1. ✅ 真跑 Day 10 遗留未跑的 `ex_003_repo_agent.ts`，发现 LLM 传 `{"maxDepth":"1"}`（字符串）
2. ✅ 复现出 2 个静默失败 bug（A: `Boolean("false")===true`；B: `Array.isArray` 静默回落）
3. ✅ 定位根因：类型声明与 runtime 期望不是同一个事实源
4. ✅ `Tool.schema: z.ZodType` 改造 —— JSON Schema / runtime 校验 / TS 类型三者派生自一处
5. ✅ 校验上提到框架层（`runTool` / `ToolRegistry.execute`），`execute` 只收已校验 args
6. ✅ 3 个 tool 全部迁移，删除 7 处类型臆测 + 3 个手写 Args interface
7. ✅ `FileReadTool` + `output-limits`（三层截断 + cat -n 行号）
8. ✅ 33 个新增反例（18 契约 + 15 FileRead），含 5 条防复发结构性测试
9. ✅ 3 轮红绿循环验证回归测试真的有效
10. ✅ ADR 0003 落地（推翻 Day 04 的「execute 自检」决策）
11. ✅ 路线修正：AST 让位给 Read（见 §路线决策）

---

## 📦 今日产出物

```text
libs/tools/
  tool.ts                       MODIFIED — schema 事实源 + runTool()，删 ToolParameters
  tool-registry.ts              MODIFIED — execute() 校验入口 + toProviderTools 派生
  calculator-tool.ts            MODIFIED — 迁 zod，删 typeof 自检
  repo/
    repo-index-tool.ts          MODIFIED — 迁 zod（修 bug B）
    repo-search-tool.ts         MODIFIED — 迁 zod（修 bug A + C）
    file-read-tool.ts           🆕 三层截断 + cat -n 行号
    output-limits.ts            🆕 cap 常量 + 截断工具函数
    index.ts                    MODIFIED — barrel

libs/agent/agent.ts             MODIFIED — tool 调用改走 registry.execute

tests/libs/tools/
  tool-contract.test.ts         🆕 18 个契约反例（含 5 条防复发结构性测试）
  repo/file-read-tool.test.ts   🆕 15 个 FileRead 反例

examples/day11/
  ex_001_file_read.ts           🆕 手跑（含类型转换演示）
  ex_002_read_agent.ts          🆕 真 LLM demo（search → read 闭环）

docs/adr/0003-*.md              🆕
package.json                    MODIFIED — +zod ^4.4.3 (dependencies)
```

**测试**：22 files / 139 passed / 2 skipped（Day 10 为 20 / 109）

---

## 🔍 今天真正学到的东西

### 1. 「不跑」和「跑了」是两个世界

Day 10 的测试全绿、8 个反例全过、typecheck / lint 全清。但 `ex_003` 没真跑过。

真跑第一次，LLM 就传出了 `{"maxDepth":"1"}`。**测试全绿掩盖不了契约是错的** —— 因为测试是我自己按代码期望写的，我知道要传数字，所以永远传数字。只有 LLM 会老实按 schema 传字符串。

这条直接兑现了 CLAUDE.md 的「NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE」：Day 10 的 daily note 写着「缺 API key 未现场跑」，那就是一个没兑现的 claim。

### 2. 根因不是「漏了校验」，是「没有单一事实源」

第一反应会是"加个类型校验"。但那是加 if 兜住症状。

真正的问题：**同一份契约存在三个地方，互不校验**。

```
ToolParameters (手写)  ──▶ 发给 LLM     ← 说 string
execute 里的 Number()  ──▶ runtime      ← 要 number
interface XxxArgs      ──▶ TS 类型      ← 运行时无效
```

改成一份事实源之后，"schema 和 execute 不一致"这件事**在结构上不可能发生**。

### 3. bug C 证明了根因判断是对的

修复过程中我用 `z.stringbool()` 替换 `z.coerce.boolean()`，测试全绿。跑 LLM demo 时才发现：

- `z.stringbool()` 的 JSON Schema 输出**仍然是 `type: "string"`** —— 还是没说真话
- 而且它**拒绝原生 `true`/`false`** —— 越聪明的模型越容易踩

**在专门修这类 bug 的当天，只要"schema 不说真话"这个条件还在，同族 bug 就会继续生出来。** 这反过来证明：条件没消除，就永远在打地鼠。

正确写法：`z.union([z.boolean(), z.stringbool()])` → `anyOf: [{type:"boolean"},{type:"string"}]`。

### 4. 校验放框架层 = 靠结构，放 execute = 靠纪律

| 选项 | 本质 |
|---|---|
| 每个 tool 自己 parse | 靠纪律 —— 每个新 tool 都可能忘 |
| 框架层统一 parse | 靠结构 —— 「忘记校验」不可能发生 |

选后者。代价是 `execute` 的参数类型变成「已 parse」的输出类型，测试不能再直接调 `execute` 传部分参数。**这是契约在起作用，不是缺陷** —— typecheck 报的那一批错，每一个都在说"你绕过了校验入口"。

### 5. 结构性测试要覆盖全部语义类型，漏一种就漏一类 bug

最初的反例 7 只断言了 integer / array，**漏了 boolean**，所以没抓到 bug C。补上之后红绿循环验证：退回 `z.stringbool()` 单用 → 3 个测试立刻红。

### 6. 物理约束 vs 预算，是两层职责

Day 08 学了 `countContextTokens`。今天的问题是「测量该放哪一层」。

| 层 | 管什么 | 手段 |
|---|---|---|
| Tool 层 | **物理约束** | 行数 / 字符数 cap |
| Agent 层 | **预算** | token 观测，决定"还能不能再读一个文件" |

业界（Claude Code / Cline / Codex / Aider）4 家一致把 cap 放 executor 内，只有 Aider 数真 token。理由：tokenizer 每次数毫秒累积不划算；char≈4:1 的近似对代码够用；一个 cap 对所有 model 通用。

### 7. cat -n 行号是结构性要求，不是审美

`file_read` 输出 `  42 | const x = 1;` 的行号，是为了给 **Day 12 的 Edit tool 提供唯一锚点**。模型说"改第 42 行"，调用方才能定位。Cline / Claude Code 都默认带行号，正是为了配对 Edit。

---

## 🔬 根因消除的直接证据

同一个 example、同一个 prompt、同一个 model，只改了 schema 声明：

| | Day 10 | Day 11 |
|---|---|---|
| LLM 传的参数 | `{"maxDepth":"1"}` ← 字符串 | `{"maxDepth":1}` ← 数字 |

**不是加 if 兜住了错误输入，是 LLM 不再传错。**

---

## 📐 重要设计决策（ADR）

[ADR 0003](../adr/0003-tool-params-single-source-of-truth-zod.md) —— Tool 参数契约以 zod schema 为单一事实源。**推翻 Day 04 在 `tool.ts` 文件头写下的「不引入 zod/ajv，由 execute 自检」**。

Day 04 的决策在当时是对的（唯一 tool 只有 string 参数，自检成本为零）。Day 10 引入非-string 参数后条件变了。**推翻旧决策要写清「当时为什么对、今天什么变了」，不能默默改掉。**

---

## 🛣 路线决策：AST 让位给 Read

原 roadmap Day 11 = AST 解析。改为 Tool 契约 + Read，依据：

1. **L1 闭环是断的。** 真实 Coding Agent 的最小闭环是 Glob → Grep → **Read** → Edit。Day 10 造了前两个，没有 Read 时 Agent 只能靠 grep 碎片猜整个文件。
2. **AST 不在主流实现的关键路径上。** 调研 5 个生产 Agent：Claude Code 无 AST 索引；Codex 连 `read_file` 都没有（让模型跑 `cat`/`sed`）；Cline 无 AST。唯一用 tree-sitter 的 Aider 只拿它生成 RepoMap（默认 1024 tokens），不用于导航。
3. **契约 bug 是 Read/Edit 的地基。** Edit 需要 `replaceAll: boolean` —— 在裂缝上盖楼 = 不可逆写入 + 静默错参双重风险。

**AST 重新定位**：Day 13+ 评估，且必须先答出「grep + read 在什么场景下不够用」。答不出就按 YAGNI 红线砍掉。

## 🛣 Day 12 路线

- **Day 12**：`FileEditTool` —— 副作用工具的安全边界。**接口契约**：接 `file_read` 的 cat -n 行号做锚点；`replaceAll: boolean` 必须走 `z.union([z.boolean(), z.stringbool()])`（bug C 的教训）。
- **Day 13**：Repo Q&A 实战 + Prompt 系统化（JD-2 钩子）

---

## 🎯 JD 映射

### JD-1 (Coding Agent 全栈) 命中

| 关键词 | 今日命中点 |
|---|---|
| repo understanding | `file_read` 补齐 Glob→Grep→Read 闭环，真 LLM demo 验证 search→read 串通 |
| 优化执行效率 | tool 层三层截断（行/单行字符/总字符），防单文件吃掉 context |
| code parsing tools | —（顺延，见路线决策） |

### JD-2 (AI 应用工程师) 命中

| 关键词 | 今日命中点 |
|---|---|
| Prompt Engineering | —（Day 13 钩子日） |

### 面试可讲（30s STAR 骨架）

**1. 「schema 骗模型」类 bug 的根因消除**
- **S**：Day 10 两个 repo tool 上线，109 个测试全绿、typecheck/lint 全清
- **T**：补跑遗留的真 LLM demo，发现 LLM 传 `"maxDepth":"1"`（字符串），顺线索复现 2 个静默失败
- **A**：定位根因不是漏校验，是 schema 声明与 execute 期望不同源。改为 zod 单一事实源（JSON Schema / runtime 校验 / TS 类型三者派生），校验上提到框架层；加结构性测试断言「发给 LLM 的 schema 必须说真话」
- **R**：同一 prompt 同一 model 重跑，LLM 传的从 `"1"` 变成 `1`；删除 7 处类型臆测 + 3 个手写类型；33 个新反例 + 3 轮红绿循环验证

**2. 修复过程中自己踩了同族的第三个坑**
- **S**：用 `z.stringbool()` 替换有坑的 `z.coerce.boolean()`，测试全绿
- **T**：跑真 LLM demo 时发现 `z.stringbool()` 的 JSON Schema 仍输出 `type:"string"`，且拒绝原生布尔
- **A**：改 `z.union([z.boolean(), z.stringbool()])`；并意识到结构性测试漏了 boolean 这一类，补齐后红绿验证
- **R**：这件事反过来证明根因判断正确 —— 条件不消除，同族 bug 当天就会再生一个

---

## 🔗 相关引用

- **Day 11 spec**：[2026-08-03-day11-tool-contract-and-file-read-design.md](../superpowers/specs/2026-08-03-day11-tool-contract-and-file-read-design.md)
- **Day 11 plan**：[2026-08-03-day11-tool-contract-and-file-read.md](../superpowers/plans/2026-08-03-day11-tool-contract-and-file-read.md)
- **ADR 0003**：[0003-tool-params-single-source-of-truth-zod.md](../adr/0003-tool-params-single-source-of-truth-zod.md)
- **事实源**：[libs/tools/tool.ts](../../libs/tools/tool.ts) / [tool-registry.ts](../../libs/tools/tool-registry.ts)
- **新 tool**：[file-read-tool.ts](../../libs/tools/repo/file-read-tool.ts) / [output-limits.ts](../../libs/tools/repo/output-limits.ts)
- **防复发测试**：[tool-contract.test.ts](../../tests/libs/tools/tool-contract.test.ts)
- 业界参考：Cline [output-limits.ts](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/executors/output-limits.ts) / [schemas.ts](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/tools/schemas.ts)、Vercel AI SDK [schema.ts](https://github.com/vercel/ai/blob/main/packages/provider-utils/src/schema.ts)、Claude Code [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
