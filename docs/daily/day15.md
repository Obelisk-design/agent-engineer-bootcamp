# Day 15 — Agent 可观测事件增量 + Edit Loop Example + LangChain 对照实验

> 65 天 AI Agent 工程师训练营 · Day 15 / 65
> 主题：把 `file_edit` 工具补到仓库（路线表 Day 13 顺延两次到今天），给 `Agent.runEvents` 加可观测事件，并用 LangChain 做一版独立对照实验。
> 前置：Day 14 RAG UI（仓库事实状态收尾）、Day 13 `libs/rag/` + Day 13.5 `examples/notion_import/`、Day 11 zod schema 单一事实源（ADR 0003）、Day 10 RepoIndex / RepoSearch / FileRead 工具。
> 路线修正：本 day **无修正**；FileEditTool 从 Day 12 / Day 13 两次推迟到今天落地，路线表 Day 15 的「Agent + tools 完整 loop」与今天的「AgentEvent 可观测性增量」对齐。

---

## ⚠️ 路线修正（First things first）

无（路线按既定顺序推进）。

FileEditTool 从 Day 12 / Day 13 顺延两次，按 Day 14 §Day 15 路线预告推荐的候选 2 落到本 day。路线表原 Day 14 的「Agent + tools 完整 loop」以「`Agent.runEvents` 加可观测事件 + file_read → file_edit → file_read 闭环 example」形式覆盖，不重写 Agent Loop 自身。

---

## 🎯 今日目标

1. ✅ `libs/tools/repo/file-edit-tool.ts` —— 精确匹配 + 原子写入 + 错误前缀统一 + Zod 单一事实源（接 Day 11 `Tool<TSchema, TReturn>` / ADR 0003）
2. ✅ `libs/tools/repo/index.ts` —— barrel 导出 `fileEditTool`
3. ✅ `tests/libs/tools/repo/file-edit-tool.test.ts` —— 18 用例（schema / 匹配语义 / IO / 原子写入 / diff / provider schema）
4. ✅ `examples/day15/ex_001_file_edit.ts` —— 手跑 file_read → file_edit 最小演示
5. ✅ `libs/agent/event.ts` —— `AgentEvent` 判别联合新增 2 kind（`tool_call_start` / `tool_call_end`），共 14 kind；详见 [ADR 0005](../adr/0005-agent-event-tool-call-start-end.md)
6. ✅ `libs/agent/agent.ts` —— `for (const tc of response.toolCalls)` 循环内按 `tool_call_start → tool_call → tool_result → tool_call_end` 顺序 yield，`latencyMs` / `ok` / `tokenUsage` 字段全到位
7. ✅ `tests/libs/agent/agent.test.ts` —— 3 用例覆盖事件顺序 / ok 语义 / latencyMs + tokenUsage
8. ✅ `tests/apps/web/agent-event-roundtrip.test.ts` —— 表驱动覆盖 14 kind，护栏：未来新增 kind 自动报警
9. ✅ `apps/web/src/api/agentClient.ts` —— `isAgentEvent` guard 扩到 14 kind，删除过期「12 kind」注释
10. ✅ `examples/day15/ex_002_edit_agent.ts` —— 真实 LLM 跑 file_read → file_edit → file_read 3 轮闭环
11. ✅ `langchain-cmp/` —— 独立项目，LangChain 全量套件对照实验
12. ✅ 5 闸必跑 + 17 个 roundtrip 用例 + 3 个 langchain-cmp 场景全 exit 0

---

## 📦 今日产出物

```text
libs/tools/repo/
  file-edit-tool.ts                        🆕 Zod schema + indexOf 精确匹配 + 临时文件 rename 原子写入 + diff 摘要
  index.ts                                 MODIFIED — barrel 导出 fileEditTool

libs/agent/
  event.ts                                 MODIFIED — +2 kind (tool_call_start, tool_call_end) → 14 kind
  agent.ts                                 MODIFIED — tool_call 循环内 yield start/end，event 顺序 end-after-result

apps/web/src/api/agentClient.ts             MODIFIED — isAgentEvent guard 14 kind；删除过期 12 kind 注释

tests/libs/tools/repo/file-edit-tool.test.ts  🆕 18 用例
tests/libs/agent/agent.test.ts               MODIFIED — +3 用例（事件顺序 / ok / latency + tokenUsage）
tests/libs/agent/run-events.test.ts          MODIFIED — 序列断言对齐 14 kind
tests/apps/api/trace-collector.test.ts       MODIFIED — 序列断言对齐 14 kind
tests/apps/web/agent-event-roundtrip.test.ts 🆕 表驱动 14 kind（+ 长度断言 + guard 漂移自检 + unknown 拒绝）

examples/day15/
  ex_001_file_edit.ts                     🆕 手跑 file_read → file_edit 最小演示
  ex_002_edit_agent.ts                    🆕 真 LLM 跑 file_read → file_edit → file_read 3 轮闭环

langchain-cmp/                              🆕 独立项目（不进 libs/ apps/，不进 dependencies）
  package.json / tsconfig.json / .gitignore / README.md
  tools/file_read_tool.ts                   file_read 最小安全集复刻（绝对路径 + cat-n 行号）
  tools/file_edit_tool.ts                   file_edit 最小安全集复刻（精确匹配 + 原子写入 + 错误前缀）
  src/chat_model.ts                         ChatOpenAI 工厂 + dev 网关 env 注入
  src/fake_chat_model.ts                    LangChain SimpleChatModel 基类的 fake 实现（CI 友好）
  scenarios/happy_path.ts                   真实 LLM 跑 file_read → file_edit → file_read 闭环
  scenarios/multi_match_failure.ts          验证 replaceAll=false 多匹配 + 错误前缀统一 + 原子性
  scenarios/relative_path_rejected.ts       验证 file_read / file_edit 都拒绝相对路径

docs/adr/0005-agent-event-tool-call-start-end.md  🆕 ADR
docs/superpowers/specs/2026-09-08-langchain-edit-loop-design.md  🆕 子系统 B spec
docs/superpowers/plans/2026-09-07-file-edit-tool.md              🆕 FileEditTool plan
docs/superpowers/plans/2026-09-08-agent-event-observability.md   🆕 AgentEvent plan
docs/superpowers/plans/2026-09-08-langchain-edit-loop.md         🆕 LangChain plan
docs/superpowers/plans/2026-09-08-a-fix-and-langchain-cmp.md      🆕 合并修复 + B 实施 plan

package.json                               MODIFIED — +@langchain/{core,openai,community,textsplitters}, +langchain（devDependencies）
examples/langchain-side/README.md          MODIFIED — +cross-link 指向 langchain-cmp
```

**测试**：41 files / 285 passed / 2 skipped（Day 14 为 40 / 268，新增 17 用例）

---

## 🔧 关键命令速查

```bash
# === FileEditTool 手跑（验证模块 1）===
pnpm exec tsx examples/day15/ex_001_file_edit.ts
# 期望：临时 fixture 创建 → file_read 输出带行号内容 → file_edit 替换 →
#       diff `-const answer = 1;` / `+const answer = 42;` → file_read 再次打印
#       replacements: 1 → 临时目录 finally 清理

# === Agent Loop 真实 LLM 闭环（验证模块 2）===
pnpm exec tsx examples/day15/ex_002_edit_agent.ts
# 期望：3 轮 tool call 全跑通（file_read → file_edit → file_read），事件顺序
#       tool_call_start → tool_call → tool_result → tool_call_end，最终 message_end + done

# === LangChain 对照实验（验证模块 3）===
pnpm exec tsx langchain-cmp/scenarios/happy_path.ts
pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts
pnpm exec tsx langchain-cmp/scenarios/relative_path_rejected.ts

# === 5 闸必跑 ===
pnpm typecheck
pnpm typecheck:web
pnpm lint
pnpm format:check
pnpm test
```

---

## 🎯 如何验证本章（独立可查）

> **这一章独立可查** —— 只看本节就知道怎么跑通 Day 15，不依赖前面的章节。

### 一句话验证

3 层验证：tool 模块（vitest 单测）→ Agent 闭环（真 LLM example）→ LangChain 对照（独立项目 3 场景）；e2e 不做（与 Day 14 一致）。

### 跑通命令

```bash
# Tool 层
pnpm test tests/libs/tools/repo/file-edit-tool.test.ts           # 18 用例

# Agent 层（事件顺序契约）
pnpm test tests/libs/agent/agent.test.ts                        # +3 用例（Day 15 增量）
pnpm test tests/apps/web/agent-event-roundtrip.test.ts          # 14 kind 表驱动

# 真 LLM 闭环
pnpm exec tsx examples/day15/ex_002_edit_agent.ts

# LangChain 对照
pnpm exec tsx langchain-cmp/scenarios/happy_path.ts
pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts
pnpm exec tsx langchain-cmp/scenarios/relative_path_rejected.ts
```

### 已知盲点

- **FileEditTool review 5 项未修**（用户决策「不修只验证」）：错误前缀统一（写入/rename 失败路径未包 `file_edit:`）、diff 上限（按匹配次数判断不按字符总量）、权限丢失（umask 影响）、symlink 替换语义、二进制损坏（UTF-8 解码再写回）。留作后续阶段。
- **LangChain 对照**不进入主线依赖，仅 devDependencies；LangChain 全量套件体积 ~80 MB。
- **happy_path 与 dev 网关绑定**：本地 `.env` 必须含 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL_NAME`；当前 `recursionLimit=20`，ai-coding 模型在某些 prompt 下可能调更多 tool。
- **`tool_call_end` 在 `tool_result` 之后**：与 ADR 0005 / day14 §Day 15 增量段一致；语义是「这组调用全部完成（含 result）」。
- **`tokenUsage` 是 turn 累计快照**：顺序执行场景下每个 tool 拿到同一份；后续若开并行 tool，tokenUsage 会多份相同（schema 不变，语义 ADR 已记）。

---

## 🐛 踩坑与修复（关键决策 ledgered）

### F-1 — 事件顺序契约漂移（Plan A 后续修复）

**症状**：Plan A 初版实现 `tool_call_end` yield 在 `tool_result` 之前，但 ADR 0005 / plan 文档均描述 end-after-result。

**根因**：Plan A 落地时 `agent.ts` 与 ADR 文字不一致；测试断言照抄了错误的顺序，把契约「锁死」为错版本。

**修法**：把 [libs/agent/agent.ts:309-326](libs/agent/agent.ts#L309-L326) 的 yield 顺序改为 `tool_call_end` 在 `tool_result` 之后；同步更新 3 个测试文件的序列断言（`agent.test.ts` / `run-events.test.ts` / `trace-collector.test.ts`）；commit `27cb9bf` 后再修 ADR 0005 / plan 描述（commit `6ee08c3`）。

**Why**：判别联合的字段与顺序属于 SSE 唯一消费契约，必须以文档为准——一旦契约漂移，所有 consumer 都会跟着错。

### F-2 — 前端 `isAgentEvent` guard 静默丢弃新 kind

**症状**：Plan A 落地后 `pnpm test` 全绿，但前端 `apps/web/src/api/agentClient.ts` 的 `isAgentEvent` runtime allowlist 没扩，2 个新 kind 在 `parseFrame` 处被静默丢弃。

**根因**：runtime allowlist 不在类型系统保护范围内；TS 无法捕获「漏写 `||`」；既有 test 套件也没覆盖 SSE roundtrip。

**修法**：[apps/web/src/api/agentClient.ts:113-132](apps/web/src/api/agentClient.ts#L113-L132) 扩 `isAgentEvent` 加入 2 个新 kind；新增 [tests/apps/web/agent-event-roundtrip.test.ts](tests/apps/web/agent-event-roundtrip.test.ts) 表驱动 14 kind + 长度断言 + guard 漂移自检 + unknown kind 拒绝。

**Why**：dev-time 缺护栏 → 静默 bug；护栏放测试里，未来加 kind 自动捕获。

### F-3 — langchain-cmp TS4094（匿名类不能导出）

**症状**：`FakeChatModel` 用匿名 class 导出，root `tsc --noEmit` 报 `TS4094: Public private method 'lc_name' of exported anonymous class`。

**根因**：LangChain `SimpleChatModel` 基类用 `_lc_*` 私有名继承；匿名类不能保留私有继承。

**修法**：把匿名 class 改为命名 class `FakeChatModel`，`createFakeChatModel` 改为 `new FakeChatModel(responses)` 工厂。

**Why**：subagent 自己报告 + 自修；typecheck 即刻绿。

---

## ✅ Acceptance Criteria 核对

每条均为本 day 实际跑命令验证（不靠推断）：

- ✅ `pnpm typecheck` 0 errors（含 langchain-cmp）
- ✅ `pnpm typecheck:web` 0 errors
- ✅ `pnpm lint` 0 errors
- ✅ `pnpm format:check` 全绿
- ✅ `pnpm test` 41 files / 285 passed / 2 skipped（0 failed）
- ✅ `pnpm test tests/libs/tools/repo/file-edit-tool.test.ts` PASS（18/18）
- ✅ `pnpm test tests/libs/agent/agent.test.ts` PASS（新增 3 用例）
- ✅ `pnpm test tests/apps/web/agent-event-roundtrip.test.ts` PASS（17 用例）
- ✅ `pnpm exec tsx examples/day15/ex_001_file_edit.ts` exit 0（手跑 file_edit）
- ✅ `pnpm exec tsx examples/day15/ex_002_edit_agent.ts` exit 0（真 LLM 跑 3 轮闭环）
- ✅ `pnpm exec tsx langchain-cmp/scenarios/happy_path.ts` exit 0（fixture 改成功）
- ✅ `pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts` exit 0（多匹配 throw + 原文件不变）
- ✅ `pnpm exec tsx langchain-cmp/scenarios/relative_path_rejected.ts` exit 0（双 tool 拒相对路径）
- ✅ LangChain 仅在 devDependencies（grep 验证）
- ✅ `libs/` `apps/` 无 langchain import（grep 验证）
- ✅ `libs/tools/repo/file-edit-tool.ts` 未触（review 5 项留给后续阶段）

### 本 day 已知遗留

- ⚠️ `FileEditTool` review 5 项（错误前缀统一 / diff 上限 / 权限 / symlink / binary）未修；user 决策「不修只验证」
- ⚠️ langchain-cmp 3 个场景未进 CI / vitest，是可执行脚本（dev 网关失败时不破坏 CI）
- ⚠️ RAG namespace isolation 历史超时本次未复现（之前 5 个 fail，本次 0 failed；建议下个 session 复跑确认）

---

## 🌐 手动端到端

### 准备

1. **`.env` 必填项**（gitignored）：
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_BASE_URL=https://...
   MODEL_NAME=gpt-4o-mini  # 或其他白名单内模型
   ```

### 跑 3 个手动演示

```bash
# terminal 1
pnpm exec tsx examples/day15/ex_001_file_edit.ts
# 期望：临时 fixture 创建 → file_read → file_edit → file_read → 临时目录清理

# terminal 2（如果上一步已退出）
pnpm exec tsx examples/day15/ex_002_edit_agent.ts
# 期望：Agent 调用 file_read → file_edit → file_read 3 轮 tool call，
#       事件顺序 tool_call_start → tool_call → tool_result → tool_call_end，
#       最终 message_end + done

# terminal 3
pnpm exec tsx langchain-cmp/scenarios/happy_path.ts
# 期望：LangChain agent 同样完成 file_read → file_edit → file_read，
#       fixture 文件最终含 `42`
```

---

## 🔮 Day 16 路线预告

按 spec §0 + survey 跨天观察，可能方向：

1. **FileEditTool review 5 项修复**：错误前缀统一（写入/rename 路径）+ diff 上限（按字符总量）；前 2 项是低风险高收益，后 3 项（权限 / symlink / binary）属安全边界深化，可分阶段。
2. **真正接 SSE**：把 `tool_call_start` / `tool_call_end` 接到 `apps/web/` 渲染层（DevTools timeline 视图），验证前端契约未被再次漂移。
3. **LangChain 对照报告**：在 `langchain-cmp/README.md` 写复盘摘要（代码量、token 消耗、错误前缀、工具调度粒度），与副线 step 1–5 风格一致。
4. **Reranker**：dev 网关 `qwen3-reranker-4b` 已就绪；spec §Day 13 已记。
5. **多 agent 编排**：Day 09 路线遗留（`createAgentApp({ agents: ... })`）。

**推荐候选**：候选 1 — **FileEditTool review 5 项修复（前 2 项）**。理由：plan 落地未修 review 项，工具在 Agent 闭环里已经跑通；安全边界深化是文件编辑工具「接 Coding Agent 之前」的最后一道关。

---

## 📎 相关引用

- **Spec**：[`docs/superpowers/specs/2026-09-08-langchain-edit-loop-design.md`](../superpowers/specs/2026-09-08-langchain-edit-loop-design.md)（子系统 B）
- **Plans**：
  - [`docs/superpowers/plans/2026-09-07-file-edit-tool.md`](../superpowers/plans/2026-09-07-file-edit-tool.md)（FileEditTool 实施）
  - [`docs/superpowers/plans/2026-09-08-agent-event-observability.md`](../superpowers/plans/2026-09-08-agent-event-observability.md)（AgentEvent 增量实施）
  - [`docs/superpowers/plans/2026-09-08-langchain-edit-loop.md`](../superpowers/plans/2026-09-08-langchain-edit-loop.md)（LangChain 对照实验实施）
  - [`docs/superpowers/plans/2026-09-08-a-fix-and-langchain-cmp.md`](../superpowers/plans/2026-09-08-a-fix-and-langchain-cmp.md)（合并修复 + B 实施）
- **ADR**：[`docs/adr/0005-agent-event-tool-call-start-end.md`](../adr/0005-agent-event-tool-call-start-end.md)
- **上一日**：[`docs/daily/day14.md`](./day14.md) — RAG UI 收尾 + FileEditTool 路线预告
- **代码锚点**：
  - [libs/tools/repo/file-edit-tool.ts](../../libs/tools/repo/file-edit-tool.ts)
  - [libs/agent/event.ts](../../libs/agent/event.ts)
  - [libs/agent/agent.ts](../../libs/agent/agent.ts)
  - [apps/web/src/api/agentClient.ts](../../apps/web/src/api/agentClient.ts)
  - [examples/day15/](../../examples/day15/)
  - [langchain-cmp/](../../langchain-cmp/)
- **测试锚点**：
  - [tests/libs/tools/repo/file-edit-tool.test.ts](../../tests/libs/tools/repo/file-edit-tool.test.ts)
  - [tests/libs/agent/agent.test.ts](../../tests/libs/agent/agent.test.ts)
  - [tests/apps/web/agent-event-roundtrip.test.ts](../../tests/apps/web/agent-event-roundtrip.test.ts)
