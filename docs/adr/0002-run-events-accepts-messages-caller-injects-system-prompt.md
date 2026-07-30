# ADR 0002: Agent.runEvents 接受完整 messages；systemPrompt 由 caller 注入

## Status

Accepted (2026-07-30, Day 09)

## Context

Before this decision, `Agent.runEvents(userInput: string, options?)` took only the current turn's user input. The system prompt lived in `AgentOptions.systemPrompt`, and the Agent internally constructed messages as `[system, user]`. Multi-turn conversation was impossible: each call to `runEvents` started from a fresh `messages` array, so the LLM had no memory of prior turns.

**Why this had to change for Day 09**:

1. The Day 08 retrospective (8-day review) marked multi-turn conversation as the Day 09+ roadmap item, with all prerequisites met (AbortSignal, message_delta, error yield, usage accumulation, context/run_summary observability, HeaderPill+MetricsSidebar).
2. Day 06 retrospective listed 5 acknowledged decisions blocking Day 09, all of which are addressed by this ADR (see [Day 09 §5 ack 决策](../../daily/day09.md#5-ack-决策决策的消解)).
3. As long as `systemPrompt` is an `AgentOptions` field, multi-turn requires either (a) the Agent to keep conversation state internally, or (b) the caller to keep conversation state externally but then re-inject systemPrompt on every call. (a) breaks single-instance / multi-tenant boundaries. (b) is the right shape but means `systemPrompt` is per-call data, not per-instance config — it should not be in `AgentOptions`.
4. The Day 05 "delete `onIteration` callback" precedent — *one source of truth for any given piece of state* — applies here. The Agent must not "own" the messages array; the caller does.

**Why this is more than a signature change**:

The 5 ack decisions from Day 08 (persistence, session ID, message ID, AbortSignal跨turn, run vs turn split) are all *automatically resolved* by this signature change. Persistence is YAGNI (no second implementation), session ID is YAGNI (no persistence to key on), message IDs are YAGNI (dedup is a persistence concern), AbortSignal semantics are unchanged (one AbortController per turn, same as Day 07), and `runId` is naturally `turnId` (one HTTP request = one runEvents call = one turn).

## Decision

**`Agent.runEvents(messages: readonly Message[], options?)` accepts the full message history. `AgentOptions.systemPrompt` is removed. The caller owns the message array.**

Three-layer separation, enforced by signature:

| Layer | Owner | Form |
|---|---|---|
| **Message history** (system + past turns + current user) | Caller — server.ts / web client | `readonly Message[]` passed to `runEvents` |
| **Agent orchestration** (loop, tool calls, event stream) | `Agent.runEvents` | Working copy of messages (deep-copied on entry); pushes `assistant` and `tool` messages internally; yields `AgentEvent`s |
| **Provider protocol differences** (e.g. Anthropic's separate `system` field) | Provider adapter (`AnthropicChatClient` etc.) | Extracts `system` from messages[0] if `role === 'system'` |

The Agent class in `libs/agent/agent.ts`:
- Signature: `runEvents(messages: readonly Message[], options?)` and `run(messages: readonly Message[], options?)`.
- Internal: `const workingMessages = messages.map((m) => ({ ...m }))` at the top, then push `assistant` and `tool` onto the working copy. The caller's array is never mutated.
- No `systemPrompt` field in `AgentOptions`.

The caller (e.g. `apps/api/src/server.ts`):
- Receives `{ input: string, messages?: Message[] }` in the POST body.
- Constructs `[...incomingMessages, { role: 'user', content: input }]` and passes to `runEvents`.
- Validates `input` is a non-empty string; `messages` is shape-validated only at the array level (deep validation deferred — see Consequences).

The web client (`apps/web/src/api/agentClient.ts` + `App.vue`):
- `AgentClient.stream(input, { messages?, signal? })` sends `messages` in the body.
- `App.vue.send` translates the front-end `ConversationItem[]` (4 roles: `user | assistant | thinking | error`) into server `Message[]` (2 roles: `user | assistant`) at call time. `system` and `tool` are not exposed at the front-end — they are server-internal concerns.

## Consequences

### Positive

- **Multi-turn conversation works end-to-end.** The web UI now scrolls back through prior turns; the LLM sees full history on each turn.
- **`Agent` becomes a true orchestrator, not a state container.** Single Agent instance per process; multi-tenant / multi-tab safety restored.
- **5 ack decisions auto-resolved** (see Context). Day 09's scope is dramatically smaller than the worst-case planning.
- **The Day 05 "delete `onIteration`" principle extends to the entry path.** No callback, no implicit state, no two-owners problem. `runEvents` is the single function that consumes messages; `request` events already deep-copy the working set, so the contract is consistent at entry and exit.
- **`Message` type is the boundary.** Front-end, server, Agent, and LLM clients all speak `Message`. One schema, one place to evolve.

### Negative

- **Caller responsibility increases.** Every caller (server.ts, examples, tests) must now construct the `messages` array themselves. This is 2-3 extra lines per call site, but it is *explicit* — the caller knows exactly what the LLM sees.
- **No deep validation of `messages` shape.** The current server-side check is `Array.isArray(body.messages)`. Malformed entries (e.g. `{ role: 'banana' }`) pass through and surface as provider-layer errors (typically 500). This is YAGNI today; the next time we add a provider-specific error path, schema validation becomes cheap.
- **Discipline required at the call site.** A caller that constructs `messages` without a `system` message will get a LLM with no behavioral instructions. There is no compile-time check; the Day 08 "tools-not-in-systemPrompt" code-review grep pattern extends to "system-not-in-messages-too" — caller must include one when needed.
- **Front-end `ConversationItem` and server `Message` are not the same type.** Two related types, one of which (the front-end) is a strict subset. The mapping is 4 lines in `App.vue.send`. If a 5th role appears on the front-end, the mapping must be updated. (A `useConversation` composable is YAGNI until a second consumer appears — see Day 09 notes.)

### Boundary clarifications (important)

- **`request` event semantics unchanged.** `request.messages` still carries the *working copy at the start of each iteration*, deep-copied. This is what the LLM sees; the LLM does NOT see `runEvents`'s own internal `workingMessages` array (it sees a clone, per the Day 05 rule).
- **`response` event semantics unchanged.** Still carries `ChatResponse` from the provider (content or toolCalls + usage).
- **`message_end` is the commit point.** When a caller sees `message_end`, the working copy inside `runEvents` is in its terminal state. This is the boundary that makes "atomic turn commit" work: the caller reads `message_end` and knows "this turn is complete and well-formed (assistant content + optional tool_calls + tool results, in the correct protocol order)".
- **AbortSignal semantics unchanged.** One `AbortController` per HTTP request = one turn. `signal.aborted` cancels the current turn; the conversation continues on the next send.
- **`runId` is `turnId`.** `TraceCollector.start()` is called once per POST `/agent`, and `runId` is unique per turn. Day 08's `context` and `run_summary` events naturally scope to the turn.

## Enforcement

- **Compile-time:** `AgentOptions.systemPrompt` is removed. TypeScript will reject any caller that still passes it (caught 9 example/test sites during migration).
- **Code review:** any new `runEvents` or `run` call site must show its `messages` construction inline. If the array is empty without a `system` message, suspect.
- **Grep gate (manual):** `git grep -n "systemPrompt.*Agent" libs/ apps/ examples/ tests/ --include="*.ts"` should return only:
  - `libs/llm/anthropic-chat-client.ts` (provider protocol field, not Agent config)
  - `libs/llm/observability/context-counter.ts` (same)
  - `examples/day01/ex_003_chat_with_compression.ts` (Day 01 demo, isolated)
  - historical commit messages
- **Test coverage:** `tests/apps/api/end-to-end.test.ts` covers the multi-turn HTTP path with `messages: [...]` body. `tests/apps/web/multi-turn.test.ts` covers the front-end `agentClient.stream` body shape.

## Out of scope (Day 10+)

- **Schema validation of `messages`** — when a provider-specific error path is added (反例 2 in Day 09 notes), validate `role` ∈ `system | user | assistant | tool` and `content` is string at the HTTP boundary.
- **Persistence** — YAGNI until a second implementation appears (Day 08 复盘 §6.1).
- **session ID** — YAGNI for the same reason.
- **message ID for dedup** — YAGNI; dedup is a persistence concern.
- **`useConversation` composable** — YAGNI until a second caller of `ConversationItem` appears.
- **Multi-Agent / multi-tenant** — the "single Agent 端口绑死" tech debt from Day 08 is still present; this ADR does not address it.

## Related

- Day 09 daily notes: [docs/daily/day09.md](../daily/day09.md)
- Day 08 retrospective: [docs/review/2026-07-29-day01-08-eight-day-retrospective.md](../review/2026-07-29-day01-08-eight-day-retrospective.md) § Day 09+ 路线
- Day 01-07 retrospective: [docs/review/2026-07-27-day01-07-seven-day-retrospective.md](../review/2026-07-27-day01-07-seven-day-retrospective.md) §6.1-§6.5 不足分析
- ADR 0001: [0001-tool-capability-must-not-embed-in-system-prompt.md](./0001-tool-capability-must-not-embed-in-system-prompt.md) (precedent: same separation principle at the prompt boundary)
- Code anchors:
  - `libs/agent/agent.ts` — `runEvents(messages, options?)` signature, `workingMessages` deep-copy on entry
  - `apps/api/src/server.ts` — POST `/agent` body parsing, `messages` → `runEvents`
  - `apps/web/src/api/agentClient.ts` — `StreamOptions.messages`
  - `apps/web/src/App.vue` — `resetRunState` (preserves conversation), `send` (translates ConversationItem → Message[])
  - `tests/apps/api/end-to-end.test.ts` — multi-turn e2e test
  - `tests/apps/web/multi-turn.test.ts` — front-end body shape test
- Day 09 commits:
  - `57337d8` — back-end: runEvents signature + systemPrompt removal
  - `21aac38` — e2e counter-example tests
  - `709deb5` — front-end: scrollback + multi-turn UI
