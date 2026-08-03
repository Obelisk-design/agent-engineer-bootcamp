# Day 11 — Tool 参数契约单一事实源 + FileReadTool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Tool 参数契约收敛到 zod 单一事实源（消除 Day 10 两个已复现 bug 的存在条件），并补上 L1 缺失的 `FileReadTool`。

**Architecture:** `Tool.schema: z.ZodType` 为唯一事实源 → JSON Schema（发 LLM）/ runtime 校验 / TS 类型三者派生。校验上提到 `ToolRegistry` 框架层，`execute` 只接收已校验的 typed args。

**Tech Stack:** TypeScript strict + NodeNext + ES2023, zod 4.4.3, Node `fs/promises`, Vitest。

**Spec:** [2026-08-03-day11-tool-contract-and-file-read-design.md](../specs/2026-08-03-day11-tool-contract-and-file-read-design.md)

---

## Global Constraints

- TypeScript strict + NodeNext + ES2023；ESM import 必须带 `.js` 后缀
- 校验只在框架层发生一次（`ToolRegistry.execute`）；tool 的 `execute` 内**禁止**再出现 `Number()` / `Boolean()` / `Array.isArray()` 类型臆测
- **禁用 `z.coerce.boolean()`**（实测 `"false"` → `true`），布尔参数一律 `z.stringbool()`
- 数字参数必须带 `.min(n)` 下界（实测 `z.coerce.number().parse("")` → `0`）
- Tool 错误 = throw（Day 07 规则，Agent 层 catch 后 yield）
- 保留 Day 10 的三检纪律：路径绝对 / 存在性 / 上限守卫（上限守卫下沉到 zod）
- 所有 commit message 中文 + Conventional Commits
- YAGNI：不做 Edit / 不做 AST / 不做 tokenizer 进 tool / 不做文件缓存

---

## File Structure（实施前地图）

```
libs/tools/
  tool.ts                       Task 2: MODIFIED — schema 事实源，删 ToolParameters
  tool-registry.ts              Task 3: MODIFIED — 框架层统一 parse + toProviderTools 派生
  calculator-tool.ts            Task 4: MODIFIED — 迁 zod
  repo/
    repo-index-tool.ts          Task 5: MODIFIED — 迁 zod（修 bug B）
    repo-search-tool.ts         Task 6: MODIFIED — 迁 zod（修 bug A）
    file-read-tool.ts           Task 8: NEW
    output-limits.ts            Task 8: NEW — 3 个 cap 常量 + 截断工具函数
    index.ts                    Task 9: MODIFIED — barrel

libs/llm/
  openai-chat-client.ts         Task 3: 检查 ToolDefinition 消费点
  anthropic-chat-client.ts      Task 3: 同上

libs/agent/agent.ts             Task 3: MODIFIED — 改走 registry.execute（校验入口）

tests/libs/tools/
  tool-contract.test.ts         Task 7: NEW — 反例 1-7（含防复发结构性测试）
  repo/file-read-tool.test.ts   Task 8: NEW — 反例 8-15

examples/day11/
  ex_001_file_read.ts           Task 9: 手跑 FileReadTool
  ex_002_read_agent.ts          Task 9: 真实 LLM demo

docs/adr/0003-tool-params-single-source-of-truth-zod.md   Task 10: NEW
docs/daily/day11.md                                       Task 10: NEW
```

---

## Task 1 — zod 移到 dependencies

- [ ] `pnpm remove zod && pnpm add zod`（devDependencies → dependencies）
- [ ] 验证：`node -e` 读 package.json 确认 zod 在 `dependencies` 下
- [ ] **为什么**：`libs/tools/tool.ts` 是生产代码会 runtime import zod；放 devDep 会让消费方安装后崩

## Task 2 — Tool 接口改造（schema 事实源）

- [ ] `tool.ts`：`Tool<TSchema extends z.ZodType>` 加 `readonly schema: TSchema`
- [ ] `execute(args: z.infer<TSchema>)` —— args 已校验，类型真实
- [ ] 删除 `ToolParameters` 手写类型；`ToolDefinition.parameters` 改为 `z.core.JSONSchema.BaseSchema`（或等价）
- [ ] 更新文件头注释：说明事实源位置 + 指向 ADR 0003
- [ ] 验证：`pnpm typecheck` —— 预期此时**大量报错**（下游未迁移），这是正常的红灯

## Task 3 — ToolRegistry 框架层统一校验

- [ ] `toProviderTools()` 改为 `z.toJSONSchema(t.schema, { target: 'draft-7', io: 'input' })` 派生
- [ ] 新增 `ToolRegistry.execute(name, rawArgs)`：先 `schema.parse(rawArgs)` 再调 `tool.execute(parsed)`
- [ ] parse 失败 → throw，错误信息必须包含 **tool 名 + 参数名**（LLM 要能定位自己传错了什么）
- [ ] `agent.ts` 的 tool 调用点改走 `registry.execute`（不再直接 `tool.execute`）
- [ ] 验证：`pnpm typecheck`

## Task 4 — calculatorTool 迁移

- [ ] `parameters` → `schema: z.object({ expression: z.string().describe(...) })`
- [ ] execute 签名改为已校验类型，删除内部 `typeof` 自检
- [ ] 验证：`npx vitest run tests/libs/tools/calculator-tool.test.ts` 全绿

## Task 5 — repoIndexTool 迁移（修 bug B）

- [ ] schema：`rootPath: z.string()` / `maxDepth: z.coerce.number().int().min(1).max(10).default(3)` / `ignorePatterns: z.array(z.string()).optional()`
- [ ] 删除 execute 内的 `Number(maxDepthRaw)` / `Array.isArray(ignorePatterns)` / `typeof rootPath` 三处臆测
- [ ] **保留**路径绝对性 + 存在性 + isDirectory 三检（zod 管不了 IO）
- [ ] 验证：`npx vitest run tests/libs/tools/repo/repo-index-tool.test.ts` 全绿

## Task 6 — repoSearchTool 迁移（修 bug A）

- [ ] schema：`includeContent: z.stringbool().default(true)`（**不是** `z.coerce.boolean()`）
- [ ] `maxResults: z.coerce.number().int().min(1).max(500).default(50)`
- [ ] `contextBefore/After: z.coerce.number().int().min(0).default(0)`
- [ ] 删除 execute 内 `Boolean()` / `Number()` / `typeof` 五处臆测
- [ ] 验证：`npx vitest run tests/libs/tools/repo/repo-search-tool.test.ts` 全绿

## Task 7 — 契约层反例（TDD：先写测试看它红）

- [ ] 反例 1：`includeContent: "false"` → 结果**不含** content（bug A 回归）
- [ ] 反例 2：`ignorePatterns: "tools"` → 明确 throw，不静默回落（bug B 回归）
- [ ] 反例 3：`maxDepth: "1"` → 无损转 `1`，不 throw
- [ ] 反例 4：`maxDepth: "abc"` → throw，信息含参数名
- [ ] 反例 5：`maxDepth: ""` → throw（覆盖 zod `""→0` 坑）
- [ ] 反例 6：`maxDepth: 100` → throw（上限守卫仍在）
- [ ] 反例 7：**防复发结构性测试** —— `z.toJSONSchema` 输出中 `maxDepth.type === 'integer'`，`ignorePatterns.type === 'array'`
- [ ] 红绿循环：写完先跑（必红）→ 实现 → 再跑（必绿）

## Task 8 — FileReadTool + output-limits

- [ ] `output-limits.ts`：`MAX_READ_LINES=2000` / `MAX_LINE_CHARS=2000` / `MAX_READ_OUTPUT_CHARS=48000` + 截断函数
- [ ] `file-read-tool.ts`：schema `{ path, startLine?, endLine? }`
- [ ] cat -n 输出格式：`{右对齐行号} | {内容}`
- [ ] 截断 marker 放**尾部**：`[Showing lines A-B of N. Use startLine/endLine to read other sections.]`
- [ ] 单行超长：截到 2000 char + ` [line truncated]`
- [ ] 反例 8-15（见 spec §4.2）
- [ ] 验证：`npx vitest run tests/libs/tools/repo/file-read-tool.test.ts` 全绿

## Task 9 — barrel + examples

- [ ] `libs/tools/repo/index.ts` + `libs/tools/index.ts` 导出 FileReadTool
- [ ] `examples/day11/ex_001_file_read.ts`：手跑读本 repo 某文件
- [ ] `examples/day11/ex_002_read_agent.ts`：真 LLM demo（search → read 链路）
- [ ] 验证：两个 example 都真跑，贴输出

## Task 10 — ADR + daily note

- [ ] `docs/adr/0003-tool-params-single-source-of-truth-zod.md`（Context/Decision/Consequences/Enforcement）
- [ ] `CLAUDE.md` 的 ADR 列表加 0003
- [ ] `docs/daily/day11.md`（含 JD 映射段 + STAR）

## Task 11 — 回归验证（完成前必跑）

- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint` 0 errors
- [ ] `pnpm test` —— Day 10 的 8 个既有反例 + 新增全绿
- [ ] **反例 17（关键）**：重跑 `examples/day10/ex_003_repo_agent.ts`，tool_call 的 `maxDepth` 必须是数字 `1` 而非字符串 `"1"` —— 这是根因真被消除的**唯一直接证据**
- [ ] 红绿循环验证反例 7：临时把 schema 改回 `z.string()` → 测试必红 → 恢复 → 必绿
