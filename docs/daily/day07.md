# Day 07 — Agent 流式体验 + 可观测性补全

> 65 天 AI Agent 工程师训练营 · Day 07 / 65
> 主题：收口 Day 06 留下的 4 个悬挂契约 — AbortSignal 取消 / 流式 content / Token Usage / error throw→yield。

---

## 🎯 今日目标

1. ✅ ChatClient 加 `ChatOptions { signal? }` + `ChatUsage` —— 抽象层契约扩展
2. ✅ OpenAI / Anthropic provider 透传 signal + parse usage
3. ✅ AgentEvent 加 `message_delta` kind（10 kind）+ `response.usage` 可选字段
4. ✅ Agent.runEvents 加 signal + error throw→yield + final iter 切 stream + usage 累积
5. ✅ TraceCollector.addMeta 累积 meta（apps/api 层透传 usage）
6. ✅ server.ts AbortController + 监听 request.signal + meta usage + 删 try/catch
7. ✅ Web UI 打字机效果（message_delta 累加到 streaming bubble）
8. ✅ Day 04 / Day 07 demos 加 usage 打印 + 流式输出
9. ✅ run-events.test.ts 加 5 个新场景（signal / error / streaming / usage）
10. ✅ 守住 YAGNI：多轮历史 / 流式 tool_calls / WebSocket / latency-cost 全划

---

## 📦 今日产出物

```text
libs/llm/
  chat-client.ts                     MODIFIED — +ChatOptions, +ChatUsage, +ChatResponse.usage
  openai-chat-client.ts              MODIFIED — signal 透传 + usage parse
  anthropic-chat-client.ts           MODIFIED — 同上
  index.ts                           MODIFIED — +export ChatUsage, ChatOptions

libs/agent/
  event.ts                           MODIFIED — +message_delta kind, +response.usage optional
  agent.ts                           MODIFIED — runEvents signal + error yield + chat→stream + usage 累积; run() 收尾

apps/api/src/
  sse-adapter.ts                     MODIFIED (no code change) — JSON.stringify 自动处理新字段
  trace-collector.ts                 MODIFIED — +addMeta(runId, partial) 方法
  server.ts                          MODIFIED — AbortController + signal + meta usage + 删 try/catch
  web/index.html                     MODIFIED — message_delta 累加 + streaming bubble + ▍光标

examples/day04/
  ex_001_calculator_agent_openai.ts     MODIFIED — message_delta 输出 + usage 打印
  ex_002_calculator_agent_anthropic.ts  MODIFIED — 同上

examples/day07/
  ex_001_streaming_agent_openai.ts      NEW — 真流式 + AbortSignal 演示
  ex_002_streaming_agent_anthropic.ts   NEW — 同上

tests/libs/agent/
  shared/fake-chat-client.ts             MODIFIED — +streamChunks 队列 + fallback yield chat content
  run-events.test.ts                     MODIFIED — +5 Day 07 场景

tests/apps/api/
  server.test.ts                         MODIFIED — inline FakeChatClient 加 stream fallback
  trace-collector.test.ts                MODIFIED — kind sequence 加 message_delta
  web-html.test.ts                       MODIFIED — streaming bubble assertions
```

**12 commits** 落地（按 Phase A→B→C→D 顺序）：

| Phase | Commit | 内容 |
|---|---|---|
| A | `ac369d5` | feat(day07): add signal and usage to ChatClient interface |
| A | `1009656` | feat(day07): openai provider signal and usage support |
| A | `765a2be` | feat(day07): anthropic provider signal and usage support |
| B | `fe9804e` | feat(day07): add message_delta kind and response.usage to AgentEvent |
| B | `1cae03b` | feat(day07): agent signal, error yield, streaming, and usage |
| C | `79e2a89` | docs(day07): note SSE adapter handles message_delta and usage via JSON.stringify |
| C | `ac08230` | feat(day07): trace collector addMeta for partial meta merge |
| C | `0ff83aa` | feat(day07): server AbortController, signal, and meta usage |
| D | `090922a` | feat(day07): web ui typewriter and streaming bubble |
| D | `b200d2f` | refactor(day07): day 04 demos print usage and stream message_delta |
| D | `(12)` | feat(day07): streaming agent demos for both providers |
| D | `badd1c4` | test(day07): signal abort, error yield, streaming chunks, usage scenarios |

---

## 🔧 关键命令速查

```bash
# === Day 07 流式 demo（真实 LLM）===
pnpm exec tsx examples/day07/ex_001_streaming_agent_openai.ts
pnpm exec tsx examples/day07/ex_002_streaming_agent_anthropic.ts

# === Day 04 demos 改用 message_delta + usage ===
pnpm exec tsx examples/day04/ex_001_calculator_agent_openai.ts
pnpm exec tsx examples/day04/ex_002_calculator_agent_anthropic.ts

# === Day 05/06 Web UI（现在支持打字机）===
pnpm exec tsx examples/day05/ex_002_web_ui.ts   # 浏览器访问 http://127.0.0.1:3000/

# === 质量门 ===
pnpm typecheck       # 0 error
pnpm lint            # 0 error
pnpm format:check    # 全绿
pnpm test            # 74 / 74 passed
```

**如何判断"真流式"**：demo 跑出 `message_delta count: N` + 逐字符输出 + `total usage: prompt=X completion=Y`。

---

## 📚 知识点

### 1. AbortSignal 进 ChatClient 抽象层 — Day 02 纪律的兑现

Day 02 立 ChatClient 抽象时定下"抽象层跟数据走"。Day 03 思考题 #3 留了"signal 应该进 ChatClient 还是 apps/api adapter？"未答。

**Day 07 答案：ChatClient 契约层加 `ChatOptions { signal? }`**

```ts
interface ChatClient {
  chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse>;
  stream(request: ChatRequest, options?: ChatOptions): AsyncIterable<ChatChunk>;
  setModel(model: string): void;
}
```

**为什么不是 apps/api 层？**

如果 signal 只在 `apps/api/server.ts` 监听并触发，**Agent.runEvents 拿不到 signal 状态**，流式中断时 SDK 不知道，已发送 token 浪费。

- 抽象层有 signal → provider 透传给 SDK → SDK 终止请求 → 已发 token 不浪费（流式 UX 关键）
- 抽象层无 signal → 消费方只能 break iterator，不能取消已发请求 → 流式 token 计费痛点

> **教学点**：抽象层加 signal 是 Day 02 "抽象层 = 数据持有方的内聚职责" 的延伸。`AsyncIterable` 的 cleanup 语义（Day 03 笔记 §3）只是 iterator 层；远端推理取消属于 SDK / HTTP 层。**iterator 结束 ≠ 远端终止**。

### 2. message_delta 限定在 final-answer iter — 决策点 2b

Day 07 决策：tool_calls iter 不流式（仍走 request/response 事件），仅 final-answer iter 流式 yield message_delta。

**为什么？**

| 方案 | UX |
|---|---|
| 每次 chat() 都流式 | 中间 assistant message 也流式 = 信息噪声 |
| 仅 final-answer 流式 ✅ | **Claude Code 风格**："AI 想 → 调工具 → 看结果 → 打字机答" |

工具调用的中间态 assistant message 走 request/response 事件已足够可视化（Day 05 阶段三已加），流式只会让 timeline 更乱。

**实现位置**（[libs/agent/agent.ts:118-141](../../libs/agent/agent.ts#L118-L141)）：

```ts
if (probe.content !== undefined) {
  // final-answer iter: 重调 stream() 流式 yield message_delta
  let accumulated = '';
  for await (const chunk of this.options.chat.stream({ messages }, options)) {
    if (signal?.aborted) { yield error; return; }
    if (chunk.content) {
      accumulated += chunk.content;
      yield { kind: 'message_delta', content: chunk.content };
    }
  }
  response = { content: accumulated, ...(probe.usage !== undefined ? { usage: probe.usage } : {}) };
}
```

> **教学点**：AgentEvent 加 kind 走的是"修改五问" —— 加 1 个新 kind 后，测试 + 文档 + 复盘要同步。**closed set 不可悄悄扩张**。

### 3. error throw → yield：行为变更的灰区纪律

Day 06 决策（[day06.md:91-96](day06.md#L91-L96)）留了 error 处理未决。Day 07 拍板：**所有错误统一 yield error 事件**（决策点 4a）。

```ts
// Day 07：error 不再 throw
if (signal?.aborted) yield { kind: 'error', message: 'aborted by signal' };
try { ... } catch (err) { yield { kind: 'error', message: ... }; }
yield { kind: 'error', message: `exceeded ${max} iterations ...` };  // 取代 throw
```

**为什么 yield 比 throw 好？**

- 消费方统一不 catch（`for await` 看不到 throw 就接住）
- 协议层错误（HTTP 400）走 HTTP status，业务层错误走 SSE event —— **边界清晰**
- 跟 `done` 互斥：error 后不发 done，success 才发 done

**`Agent.run()` 保持向后兼容**：

```ts
async run(userInput: string, options?: AgentRunOptions): Promise<string> {
  for await (const ev of this.runEvents(userInput, options)) {
    if (ev.kind === 'message_end') return ev.content;
    if (ev.kind === 'error') throw new Error(ev.message);
  }
  return '';
}
```

> **教学点**：行为变更（CLAUDE.md 灰区）需要肥老大 ack。Day 07 决策点 4 + Day 06 §1 已写明"待决定"，spec §7 ack 后才落地。**灰区纪律 = 留 TODO 锚点 + 显式 ack 链路**。

### 4. Token Usage 是 derived 数据（source → derived）

`ChatResponse.usage` 是**事实源**（provider SDK 返回的），`TraceCollector.meta.usage` 是**派生**（apps/api 层累积多轮之和）。

```ts
// 事实源：ChatResponse
{ content?: string; toolCalls?: ...; usage?: { promptTokens, completionTokens } }

// 派生：Trace meta（多轮之和）
{ usage: { promptTokens: 100, completionTokens: 50 } }  // 3 轮 LLM 调用累计
```

**为什么双写？**

- `ChatResponse` 不写 usage → SDK 免费数据浪费
- `Trace meta` 不写 usage → 可观测性范围缺失

**为什么不让 Agent 累积 meta？**

- Agent Runtime 不感知 Trace 存在（Day 06 原则）—— Trace 是消费方关注的事
- Agent 只 yield 事件，apps/api 层决定怎么消费
- 不同 transport 可能用不同累积策略（流式 vs 批处理）

> **教学点**：source vs derived 双写是 Day 06 trace collector 的延伸 —— "meta 是 derived，事件是 source"。新增 derived 字段不改 source 字段。

### 5. Web UI 打字机：append 优于 replace

`message_delta` 事件到来时，正确的处理是 **append to existing bubble**，不是 replace or rebuild。

```js
function appendStreamingDelta(text) {
  if (streamingBubble === null) startStreamingBubble();
  streamingBubble.textContent += text;  // 累加，不替换
  conversationEl.scrollTop = conversationEl.scrollHeight;
}
function finalizeStreamingBubble() {
  streamingBubble?.parentElement.classList.remove('streaming');  // 标记完成
  streamingBubble = null;
}
```

**为什么 append 不是 replace？**

- Replace → 每次 delta 重建节点，DOM 抖动，光标位置跳
- Append → 节点不变，只追加文本，浏览器增量渲染
- `message_end` → finalize（去掉 streaming 类，去掉光标），不重建节点

CSS 打字机光标：

```css
.message.ai.streaming .streaming-body::after {
  content: '▍';
  color: var(--accent-blue);
  animation: blink 1s steps(1) infinite;
}
```

> **教学点**：Web UI 打字机是消费方的事。libs/agent 不需要知道 UI 怎么渲染，只 yield `message_delta`。**流式语义（增量）跟渲染策略（append vs replace）解耦**。

### 6. generator return value 的限制 — 简化方案

OpenAI / Anthropic SDK 的流式 chat 完成后，usage 在 generator **return value** 里：

```ts
async *stream(): AsyncGenerator<ChatChunk, ChatUsage | undefined, undefined> { ... }
```

但 `for await` 消费 generator 时，return value **拿不到**（被丢弃）。

**Plan Task 5 简化方案**：

1. Agent 先 `chat()` 探测拿 usage
2. 若 `probe.content !== undefined` → final-answer iter → 重调 `stream()` yield message_delta
3. usage 用 probe 的（chat 探测已拿到），stream 只 yield chunks

**代价**：final-answer iter 双重调用 = 双重 token 计费。

**Day 10+ 优化方向**：单次 stream 调用 + 在 ChatChunk 加 `usage?` optional（仅最后一个 chunk 带）。**今天不引入**（YAGNI）。

> **教学点**：知道 generator return value 拿不到后，简化方案不是"绕过限制"而是"接受 cost，先收口契约"。**今天不写的东西不代表想不到，但要等到真要写时再写**。

### 7. AbortSignal 跨平台 + SDK 透传

| 层 | signal 来源 |
|---|---|
| 浏览器 fetch | `request.signal`（客户端主动 abort / 断线） |
| Node AbortController | `new AbortController().signal` |
| OpenAI SDK | `chat.completions.create({}, { signal })` 第二参数 |
| Anthropic SDK | `messages.create({}, { signal })` / `messages.stream({}, { signal })` |

**Node 22 + OpenAI SDK 6.x + Anthropic SDK 0.x 兼容性**：透传给 SDK 第二参数均支持，无 race 风险。

> **教学点**：signal 是标准 Web API（Node 22 全实现），provider SDK 都接受。**不引入第三方 polyfill**。

### 8. snapshot 语义保持 — Day 06 纪律不破

Day 06 加的 `messages.map(m => ({...m}))` 深拷贝仍要保留：

```ts
yield { kind: 'request', iteration: i + 1, messages: messages.map(m => ({ ...m })) };
```

`message_delta` 不需要深拷贝（值类型），`response.usage` 也不需要（值类型）。**只有 reference type（messages, toolCalls）需要 snapshot**。

> **教学点**：snapshot 语义只对"累积型"数据生效。流式 + usage 都是"单次"数据，不存在累积污染。

---

## ❓ 思考题

1. **chat + stream 双重调用的成本**：final-answer iter 双重 LLM 调用 = 双重 token 计费。Day 10+ 的"一次 stream + 末尾 yield usage chunk"方案具体怎么改 ChatChunk / AgentEvent？现有调用方（Web UI / apps/api / demos）要做什么迁移？

2. **AbortSignal 在 agent 多 iter 间的语义**：当前 signal.aborted 在每次 iter 起始检查，触发后 yield error + return。**未执行的 tool_call 怎么处理？** Day 04 tool_calls iter 还没执行到时 signal abort，partial tool 状态需要 cleanup 吗？

3. **usage 在 response 事件 vs message_end 事件**：当前 response 事件携带单轮 usage，message_end 不携带。**消费方想知道"最终总 usage"应该看哪个？** apps/api 层在 message_end 时写 meta.usage。如果 Agent loop 提前 error，meta.usage 是 partial sum 还是 0？

4. **error 事件序列约束**：当前 error 后立即 return（不发 done / message_end）。如果消费方用 `Promise.race([for-await runEvents, timeout])`，error 路径会不会跟 timeout 路径竞争？

5. **AgentEvent 联合扩到 10 kind 的纪律考验**：closed set 扩张（Day 05 7 → Day 05 阶段三 9 → Day 07 10）。每加一种 kind 都要走修改五问 + 同步测试 + 文档。**未来要加 `message_done` / `tool_call_delta` 时的触发条件**？要不要在 event.ts 加 `// 加新 kind 前必读` 注释？

6. **Web UI 打字机的可访问性**：`.streaming::after` 的 ▍ 闪烁光标在屏幕阅读器里会怎么读？`.sr-only` 隐藏还是 `aria-live` 公告？

7. **流式 chat 的 usage 在 Anthropic SDK 中怎么拿？** Anthropic 流式 `messages.stream()` 完成后需 `await finalMessage()` 拿 usage。今天 Agent 不调 finalMessage（因为简化方案走 probe chat），**等真的接入"一次 stream"方案时** finalMessage 调用该怎么放？

8. **多轮历史依赖 signal 的传递**：Day 08+ 多轮对话（plan 推迟）需要"前一轮的 request signal" 也能 abort。AbortController 怎么跨多 turn 复用？

---

## ⚠️ 今日踩坑

### 1. TS2367 — `signal?.aborted === true` 类型收窄

**症状**：agent.ts:119 / 129 typecheck 报 `comparison appears to be unintentional`。

**根因**：TypeScript control flow analysis 在多次 await 后把 `signal?.aborted` 收窄为 `false | undefined`，`=== true` 被认为永不为真。

**修法**：用 truthy check `if (signal?.aborted)` —— `false | undefined` 都 falsy，语义等价。

**Why**：等号比对需要 type 包含比较值；truthy check 不需要。这是 TypeScript 严类型 + 控制流收窄的副作用。

> **学习**：等号 vs truthy check 的选择，在 TypeScript strict 模式下要查类型兼容性，不是凭"代码风格"。

### 2. Server.test.ts 有自己的 inline FakeChatClient

**症状**：改了 shared `tests/libs/agent/shared/fake-chat-client.ts` 后，server.test.ts 仍用旧 stream() yield `{ content: 'fake' }`。

**根因**：grep "FakeChatClient" 发现 `tests/apps/api/server.test.ts:8` 单独定义 inline class，**不 import shared helper**。

**修法**：更新 inline FakeChatClient 也加 stream fallback。Plan Task 13 写的"shared helper"是 Day 06 重构假设，但 server.test.ts 当时没迁过去。

**Why**：测试 helper 共享不是"未来要做"，是"测试文件要 import 同一个 helper"。**重构时只改 shared 不改 inline = 漏一半**。

> **学习**：发现 helper 重复定义时，要看历史 —— 这次是 Day 06 重构时漏的。要么回退到 inline 各自维护，要么**这次 Day 07 顺手统一到 shared**。选了后者。

### 3. 12 个测试因行为变更失败 — 不是 bug，是 spec 兑现

**症状**：Task 5 改完后 12 个测试失败。

**根因**：
- Day 06 测试期待 kind 序列不含 `message_delta`（Day 07 加了）
- Day 06 测试期待 `runEvents` throw（Day 07 改 yield error）
- Day 06 测试期待 `response.content === 'the answer'`（Day 07 改 accumulated from stream）

**修法**：
- 加 `message_delta` 到期望 kind 序列
- 改 throw 期待为 yield error 事件
- 更新 FakeChatClient.stream() fallback yield chat content（让 accumulated 跟 content 一致）

**Why**：测试失败不是 bug，是 spec 兑现的副作用。**spec 落地 → 测试更新** 是契约演化的标准动作，不是"测试出问题了"。

> **学习**：行为变更类 day 必看测试期望变更列表（spec §4 触达文件清单 + plan 风险表已列）。CLAUDE.md "完成前必跑" 铁律要求 fresh verification —— 12 个失败时**重读 spec 决策点**比改测试更快。

### 4. 改 `'ai'` 字符串后 web-html.test.ts 失败

**症状**：把 `addMessage('ai', ...)` 改成 streaming bubble 机制后，test 期待 `'ai'` 字面量存在失败。

**根因**：测试断言 HTML 包含 `'ai'`（旧 role 字符串），新机制用 `'message ai streaming'` className + `appendStreamingDelta` 函数。

**修法**：更新测试断言 `'user'` / `'error'` / `'message thinking'` + 新增 `'message ai streaming'` / `appendStreamingDelta` / `finalizeStreamingBubble`。

**Why**：重构时字符串字面量的"看似无害的删减"会被测试发现。**测试不仅是验证，也是行为契约的文档**。

> **学习**：把 `addMessage('ai', ...)` 改成 `startStreamingBubble()` 是 1 行改动，但 HTML 文本形态变了 —— 集成测试断言要看 HTML 文本，重构后必然要更新。

### 5. commitlint 拒了 "OpenAI" / "TraceCollector" / "AI" — pascal-case 触发

**症状**：多次 commit 被 commitlint 拒，提示 `subject must not be sentence-case, start-case, pascal-case, upper-case`。

**根因**：commitlint 默认 `subject-case` 规则禁止大写开头的多字母单词（"OpenAI" / "TraceCollector" / "AI" 都触发）。

**修法**：所有 feat subject 改为全小写：`openai` / `anthropic` / `agent` / `trace` / `ai` / `web` 等。

**Why**：仓库 commitlint 配置严格遵循 Conventional Commits 规范。**scope 内可以含专有名词缩写，subject 必须 lowercase**。

> **学习**：发现 commitlint 规则后，每次 commit 前 pre-commit hook 会先跑 lint-staged。**规则固化在 hooks 里比记在大脑里稳**。

---

## 🎯 如何验证本章（独立可查）

> **这一章独立可查** —— 只看本节就知道怎么跑通 Day 07，不依赖前面的章节。

### 一句话验证

74/74 单测含 5 个新场景（signal / error / streaming / usage）+ 真实流式 demo + 浏览器打字机。

### 跑通命令

```bash
pnpm test tests/libs/agent/run-events.test.ts                                   # 含 signal / error / streaming / usage 5 个新场景
pnpm exec tsx examples/day07/ex_001_streaming_agent_openai.ts                   # message_delta count + 逐字符输出 + usage 打印
pnpm exec tsx examples/day07/ex_002_streaming_agent_anthropic.ts                # 同上
pnpm exec tsx examples/day04/ex_001_calculator_agent_openai.ts                  # 回归：改用 message_delta + usage
pnpm exec tsx examples/day04/ex_002_calculator_agent_anthropic.ts               # 同上
pnpm exec tsx examples/day05/ex_002_web_ui.ts                                   # 浏览器验打字机
```

### 已知盲点

AbortSignal 真实取消（网络层 SDK 透传）只在 mock 层验，真实中断浏览器/网络行为靠手测。打字机 UI 靠 `web-html.test.ts` 静态断言 + 肉眼。error `throw → yield` 是行为变更，当时有 12 个测试红掉后改断言（"不是 bug，是 spec 兑现"）。

---

## 📋 验收清单

- [x] ChatClient 加 `ChatOptions { signal? }` + `ChatUsage`，chat/stream 加 options 参数
- [x] OpenAI provider 透传 signal + parse `completion.usage`
- [x] Anthropic provider 透传 signal + parse `response.usage`
- [x] `libs/agent/event.ts` 加 `message_delta` kind（10 kind）+ `response.usage?` optional
- [x] `Agent.runEvents(userInput, options?: { signal? })` 加 signal 参数
- [x] signal.aborted 检查在每次 iter 起始 / chat 后 / 每个 stream chunk 后
- [x] error throw → yield 行为变更（maxIterations / chat 抛错 / signal abort）
- [x] `Agent.run()` 保持 `Promise<string>` 契约，内部消费 runEvents error 事件
- [x] final-answer iter 切 stream() 流式 yield message_delta
- [x] `TraceCollector.addMeta(runId, partial)` 方法
- [x] `apps/api/server.ts` AbortController + 监听 request.signal + meta usage 写入 + 删 try/catch
- [x] `apps/api/src/web/index.html` 打字机效果（streaming bubble + ▍ 光标 + finalize）
- [x] Day 04 / Day 07 demos 加 message_delta 输出 + usage 累积打印
- [x] run-events.test.ts 加 5 个新场景（signal / error / streaming / usage）
- [x] web-html.test.ts 更新 streaming 机制断言
- [x] trace-collector.test.ts kind 序列加 message_delta
- [x] `pnpm typecheck` 0 error（strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes）
- [x] `pnpm lint` 0 error
- [x] `pnpm format:check` 全绿
- [x] `pnpm test` **74 / 74 passed**（Day 06 69 + Day 07 +5）
- [x] 未引入新 npm 依赖
- [x] 多轮对话历史 / 流式 tool_calls / WebSocket / schema validation / latency-cost 全 YAGNI

---

## 🆕 与 Day 06 复盘路线对照

| 复盘路线建议 | Day 07 状态 |
|---|---|
| 候选 1（流式 content via `message_delta`） | ✅ **Day 07 完成** |
| 候选 2（AbortSignal 取消） | ✅ **Day 07 完成** |
| 候选 3（多轮对话历史） | ⏳ 推迟到 Day 08+ |
| 候选 4（无 LLM smoke test） | ✅ Day 06 已完成 |

**Day 07 收口 Day 06 留下的 4 个悬挂契约**：

1. error throw vs yield → yield（决策点 4a）
2. meta 字段 Token Usage → 填 usage（决策点 3b）
3. message_delta 加进联合 → 加（决策点 2b）
4. AbortSignal 进入 ChatClient → 加（决策点 1a）

**关键技术债**：

```
+ 新增 AgentEvent.message_delta kind —— 维护成本 低，3 年存活率 高
+ 新增 ChatOptions / ChatUsage type —— 维护成本 低，3 年存活率 高
+ 新增 TraceCollector.addMeta —— 维护成本 低，3 年存活率 高
+ 新增 error yield 行为变更 —— 维护成本 中（消费方要审），3 年存活率 高
+ 新增 Web UI streaming bubble 机制 —— 维护成本 中，3 年存活率 中
+ 新增 12 commit（含测试更新）—— 维护成本 中，3 年存活率 高
- 删除 server.ts try/catch（合并到 error 事件路径）—— 减少重复错误处理 1 处
净增：+6 能力 / -1 重复
反驳记录：
  - 行为变更（error throw→yield）是灰区，spec §7 已 ack
  - chat + stream 双重调用 = 双重 token，Day 10+ 评估一次 stream 方案
  - "OpenAI" / "TraceCollector" 等专有名词 commit subject 必须 lowercase（commitlint 规则）
```

---

## 🚀 Day 08 预告

**推荐**：多轮对话历史（Day 06 复盘路线标 Day 09+，但 Day 07 完成后基础更稳，可前移）。

**核心课题**：
- `Conversation` 类（messages: Message[] 持久化）
- session 隔离（按 sessionId 区分）
- Web UI scrollback（不每次 send 清空 conversation）
- 与 Day 07 的 signal 配合（每 turn 独立 AbortController？）

**前置条件**：Day 07 的 AbortSignal + message_delta + error yield 都已落地，Day 08 不用从头设计事件流。

**关键决策待 ack**：
1. 持久化策略（in-memory session vs localStorage vs server-side）
2. session ID 传递方式（cookie / URL param / body field）
3. message ID 体系（要不要给每条 message 唯一 ID 用于 deduplication）
4. AbortSignal 跨 turn 行为（同一 turn 内 abort 全部 message，还是 abort 当前 turn）

---

## 🔗 相关引用

- 设计 spec：[docs/superpowers/specs/2026-07-27-day07-agent-streaming-observability-design.md](../superpowers/specs/2026-07-27-day07-agent-streaming-observability-design.md)
- 实施 plan：[docs/superpowers/plans/2026-07-27-day07-agent-streaming-observability.md](../superpowers/plans/2026-07-27-day07-agent-streaming-observability.md)
- 全局约束：[CLAUDE.md](../../CLAUDE.md) — "内部统一使用 AgentEvent，对外统一通过 SSE 传输 AgentEvent"
- Day 06 笔记：[day06.md](day06.md) — TraceCollector / snapshot 语义来源
- 复盘路线：[docs/review/2026-07-22-day01-05-architecture-review.md](../review/2026-07-22-day01-05-architecture-review.md)
- 代码锚点：
  - [libs/llm/chat-client.ts](../../libs/llm/chat-client.ts) — `ChatOptions` / `ChatUsage` / `ChatResponse.usage?`
  - [libs/agent/event.ts](../../libs/agent/event.ts) — `message_delta` kind + `response.usage?`
  - [libs/agent/agent.ts](../../libs/agent/agent.ts) — `runEvents` signal + error yield + chat→stream
  - [apps/api/src/trace-collector.ts](../../apps/api/src/trace-collector.ts) — `addMeta` 方法
  - [apps/api/src/server.ts](../../apps/api/src/server.ts) — AbortController + meta usage
  - [apps/api/src/web/index.html](../../apps/api/src/web/index.html) — 打字机 streaming bubble

---

> 教学点：学习笔记最怕"只有结论，没有线索"。把 spec / plan / 报告 / 代码的相对路径固定下来，未来再起 Day 08 / Day 09 时回看今天只需要顺着这条链读，不必先考古 commit log。
