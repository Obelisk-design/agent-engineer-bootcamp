# ADR 0001: Tool capability declaration MUST NOT be embedded into system prompt

## Status

Accepted (2026-07-22, Day 05 stage five)

## Context

Before this decision, four demos (`examples/day04/ex_001`, `examples/day04/ex_002`, `examples/day05/ex_001`, `examples/day05/ex_002`) and one README sample all hard-coded the same line in the Agent systemPrompt:

```text
"You have access to a calculator tool. When arithmetic is needed, call it. Then answer based on the result."
```

This was raised as a smell by 肥老大 on 2026-07-22.

**Why the smell was real**:

1. `ToolDefinition.description` is a protocol field. It travels to the model via `ChatClient.chat({ tools })` — the model already sees the tool, with its real description, in the structured tool block.
2. The duplicated natural-language sentence is therefore redundant for the model. It does not make tool calling more likely; it is dead weight in the prompt.
3. It is a maintenance trap. Adding a second tool required editing four prompts in lockstep. The "do not forget to update X" coupling was implicit.
4. It conflated two different concerns: **what the agent is** (identity, behavior) and **what tools exist** (capability, protocol).
5. `ToolDefinition.description` is a *structured* field. Translating it back into natural language inside a prompt is a step that no part of the system owns, and which future ChatClient providers (or non-text providers) cannot easily consume.

## Decision

**Tool capability declaration MUST NOT be embedded into system prompt.**

Three-layer separation, enforced by file:

| Layer | Owner | Form |
|---|---|---|
| **Agent Prompt** (identity, behavior, constraints, runtime context) | Call site writes; future `PromptBuilder` assembles | Free-form text in the `system` message |
| **Tool capability** (what tools exist, what they do) | `ToolRegistry` | `ToolDefinition` objects, sent via `ChatClient.chat({ tools })` |
| **Tool execution** (how the tool runs) | `ToolRegistry` | `tool.execute(args)` |
| **Provider protocol differences** (e.g. models without native tool calling) | Provider adapter | `PromptToolCallingAdapter` lives in the provider layer, never the agent layer |

The Agent class in `libs/agent/agent.ts` is unchanged: it still passes `systemPrompt` (if any) as the first system message, and `tools` separately. The `ChatClient` is unchanged: it already sends `system` and `tools` to providers per their protocol.

## Consequences

### Positive

- **Adding a tool = one line.** `ToolRegistry.register(newTool)` is enough. No systemPrompt edit.
- **ToolDefinition.description stops being a dead field.** It is consumed by the chat protocol, not re-translated into prompt text.
- **Multi-user / multi-role systemPrompts can be assembled by a future `PromptBuilder`** without entangling tool capability.
- **Provider portability is preserved.** A future provider that lacks native tool calling can be bridged by a `PromptToolCallingAdapter` in the provider layer, without the agent layer ever learning about it.

### Negative

- **Discipline required at the call site.** The author of a systemPrompt must "forget" that tools exist. There is no compile-time check that they did. The enforcement section below mitigates this.
- **Subtle implicit assumptions still possible.** A complex workflow-style systemPrompt ("first look up the order, then compute the total") can implicitly assume a tool. This is a soft constraint — code review must catch it, the language cannot.

## Enforcement

- **Code review**: any PR that touches a systemPrompt string must grep `tools` in the same diff. If `tools` is added or removed, the systemPrompt is suspect.
- **Grep gate (manual)**: `git grep -n "systemPrompt.*tool"` should return zero hits in demo / call-site code.
- **Future**: a `PromptBuilder` with a typed schema can encode the separation at compile time. Out of scope today (YAGNI).

## Out of scope (Day 06+)

- `PromptBuilder` — when systemPrompts become dynamic (multi-user, multi-role, runtime context).
- `PromptToolCallingAdapter` — for providers without native tool calling; lives in the provider layer, never the agent layer.
- Compile-time enforcement via a typed prompt schema.

## Related

- Day 05 stage five notes: [docs/daily/day05.md](../daily/day05.md) (search for "阶段五")
- Day 01-05 architecture review: [docs/review/2026-07-22-day01-05-architecture-review.md](../review/2026-07-22-day01-05-architecture-review.md) (risk point #6, reminder bullet "systemPrompt must not include tool descriptions")
- ChatClient: [libs/llm/chat-client.ts](../../libs/llm/chat-client.ts)
- ToolDefinition: [libs/tools/tool.ts](../../libs/tools/tool.ts)
- ToolRegistry: [libs/tools/tool-registry.ts](../../libs/tools/tool-registry.ts)
- Agent: [libs/agent/agent.ts](../../libs/agent/agent.ts)
