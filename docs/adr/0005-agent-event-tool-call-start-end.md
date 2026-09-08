# 0005 — AgentEvent 增量 tool_call_start / tool_call_end，不替换既有 tool_call / tool_result

## Status

Accepted (Day 15 阶段)

## Context

Day 04–08 建立的 12 kind AgentEvent 已稳定，是 SSE / TraceCollector 唯一消费契约。其中 `tool_call` / `tool_result` 严格 1:1 配对（agent.ts 注释明确）。

当前缺失：tool 调用的耗时、起止时间戳、当前 turn 的累计 usage 快照。DevTools / TraceCollector / 后续 e2e 可观测性需要这些字段。如果替换现有 `tool_call` / `tool_result`（改为合并事件），会破坏 4 天（Day 05–09）的消费方；如果新增平铺字段（混入 `tool_event_meta`），违反判别联合设计。

## Decision

在 `AgentEvent` 判别联合中追加 2 个新 kind：

- `tool_call_start` —— 在 `tool_call` 之前 yield，携带 `id` / `name` / `args` / `startedAt: number`。
- `tool_call_end` —— 在 `tool_result` 之后 yield，携带 `id` / `name` / `latencyMs: number` / `ok: boolean` / `tokenUsage?: { promptTokens, completionTokens }`。

`tokenUsage` 始终写当前 turn 的累计 usage（即 tool 调用执行后那一刻的 `totalPromptTokens` / `totalCompletionTokens` 快照），不依赖 `ok`，让 error 路径也能关联到轮次。

事件顺序：`tool_call_start → tool_call → tool_call_end → tool_result`，与既有节奏一致。

## Consequences

### 收益

1. 可观测性：DevTools / TraceCollector / 未来 e2e 可直接读 start / end / latencyMs。
2. 错误关联：`tokenUsage` 让 tool error 也能追溯到具体 turn。
3. 判别联合保持：消费方继续用 `switch (ev.kind)`，新增分支即可，无需重构。

### 代价

1. 事件序列变长：tool 相关从 2 个事件变 4 个，对旧消费方无影响（仍是同一份 `switch`）。
2. `Date.now()` 精度：取决于 Node 进程时钟；不引入高精度计时依赖（YAGNI）。

## Enforcement

- [x] 既有 `tool_call` / `tool_result` 字段未改。
- [x] 不替换、不重排既有 12 kind。
- [x] `libs/tools/repo/file-edit-tool.ts` 未触（review 待修复项留给后续阶段）。
- [x] `Tool<T>` schema 契约未触。

## Related

- 事件模型定义：[libs/agent/event.ts](../../libs/agent/event.ts)
- Agent loop：[libs/agent/agent.ts](../../libs/agent/agent.ts)
- 测试覆盖：[tests/libs/agent/agent.test.ts](../../tests/libs/agent/agent.test.ts)
- Example：[examples/day15/ex_002_edit_agent.ts](../../examples/day15/ex_002_edit_agent.ts)
- 既有 ADR：[0001](0001-tool-capability-must-not-embed-in-system-prompt.md) / [0002](0002-run-events-accepts-messages-caller-injects-system-prompt.md) / [0003](0003-tool-params-single-source-of-truth-zod.md) / [0004](0004-rag-table-naming-follows-implementation.md)
