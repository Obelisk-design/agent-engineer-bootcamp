# Day 03 — ChatClient Streaming + 多 provider 兑现

> 65 天 AI Agent 工程师训练营 · Day 03 / 65
> 主题：把 Day 02 的 ChatClient 抽象层延伸到 streaming，验证两个 provider 真的能并存 + 流式。

---

## 🎯 今日目标

1. ✅ `ChatClient` interface 加 `stream()`，保持 Day 02 `chat()` 契约不变
2. ✅ 实现 `OpenAIChatClient.stream()`，只向调用方 yield 文本 delta
3. ✅ OpenAI 流式 demo 真跑通：57～63 chunks，耗时约 3～5 秒
4. ✅ 实现 `AnthropicChatClient.stream()`，把 SDK 事件流过滤成纯文本增量
5. ✅ Anthropic 流式 demo 真跑通：6～7 chunks，耗时约 2～4 秒
6. ✅ Task 4 review 后抽出 `toApiMessages()`，消除 `chat()` / `stream()` 协议适配复制
7. ✅ 跑完 typecheck / lint / format / test，并验证 Day 02 两个 `chat()` demo 无回归
8. ✅ 守住 YAGNI：不加 AbortSignal / 单测 / HTTP / SSE / Vue / `tool_use`

> **教学点**：Day 03 不是“给两个 SDK 各抄一段流式代码”。真正目标是检验 Day 02 的抽象能否在第二种调用形态下继续隐藏 provider 差异。

---

## 📦 今日产出物

```text
agent-engineer-bootcamp/
├── libs/llm/
│   ├── chat-client.ts                         # ✏️ 接口新增 stream(): AsyncIterable<string>
│   ├── openai-chat-client.ts                  # ✏️ OpenAI async generator + null delta 过滤
│   └── anthropic-chat-client.ts               # ✏️ Anthropic 事件过滤 + toApiMessages helper
├── examples/day03/
│   ├── ex_001_openai_stream.ts                # 🆕 OpenAI 真实流式 demo
│   └── ex_002_anthropic_stream.ts             # 🆕 Anthropic 真实流式 demo
└── docs/daily/day03.md                        # 🆕 本学习笔记
```

**文件变化**：3 个修改文件 + 3 个新文件。

代码与 demo 在写本笔记前已经落成 6 个实现 commit：

| Commit    | 产出                              |
| --------- | --------------------------------- |
| `4628c01` | `ChatClient` 新增 `stream()` 契约 |
| `b228718` | `OpenAIChatClient.stream()`       |
| `4229361` | OpenAI streaming demo             |
| `c1e8696` | `AnthropicChatClient.stream()`    |
| `7987bac` | review fix：抽 `toApiMessages()`  |
| `30b9e76` | Anthropic streaming demo          |

Task 4 比原计划多一个 fix commit。这个“多”不是失控，而是 review 找到真实 duplication 后留下的可审计修正记录。

> **教学点**：计划里的文件数可以稳定，commit 数不必强行稳定。Review 发现值得修的根因时，独立 fix commit 比把历史揉成“从没犯过错”更有学习价值。

---

## 🔧 关键命令速查

```bash
# === Day 03 真实流式 demo ===
pnpm exec tsx examples/day03/ex_001_openai_stream.ts
pnpm exec tsx examples/day03/ex_002_anthropic_stream.ts

# === Day 02 backward-compat ===
pnpm exec tsx examples/day02/ex_001_chat_client.ts
pnpm exec tsx examples/day02/ex_002_anthropic_chat_client.ts

# === 完整质量门 ===
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test

# === 提交：pre-commit 自动跑 lint-staged ===
git add docs/daily/day03.md
git commit -m "docs(day03): add daily learning note" -m "..."
```

**如何判断“真流式”**：不能只看最终字符串。两个 demo 都记录 `chunks`、`chars`、`elapsedMs`，并通过 `process.stdout.write(chunk)` 逐块输出。

```text
OpenAI:    chunks=57～63, elapsedMs=3317～5062
Anthropic: chunks=6～7,   elapsedMs=1940～3646
```

不同 provider 的 chunk 粒度不同，但调用方消费方式相同。**chunk 数相同从来不是契约**，文本增量可被顺序消费才是。

---

## 📚 知识点

### 1. ChatClient 接口的 additive 演化：对调用方不破坏，对实现方要协调

Day 02 的接口是：

```ts
interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  setModel(model: string): void;
}
```

Day 03 选择候选 A：

```ts
// 候选 A：保留 chat()，新增并行入口
interface ChatClient {
  chat(messages: Message[]): Promise<string>;
  stream(messages: Message[]): AsyncIterable<string>;
  setModel(model: string): void;
}
```

拒绝候选 B：

```ts
// 候选 B：直接改变旧入口返回类型
interface ChatClient {
  chat(messages: Message[]): AsyncIterable<string>;
  setModel(model: string): void;
}
```

| 维度          | 候选 A：新增 `stream()` | 候选 B：修改 `chat()`      |
| ------------- | ----------------------- | -------------------------- |
| Day 02 调用方 | 0 行修改                | `await` 全改为 `for await` |
| 一次性响应    | 继续用 `chat()`         | 需要自行拼接 chunk         |
| 流式响应      | 显式选择 `stream()`     | 被强制成为默认             |
| 契约演化      | consumer-additive       | 明确 breaking              |

**结论**：A 赢。实现见 [chat-client.ts:36-39](../../libs/llm/chat-client.ts#L36-L39)。

但有一个必须讲清的细节：给 interface 新增**必选方法**，对已有调用方是 additive，对已有 `implements ChatClient` 的类却是 source-breaking。Task 1 落地后两个 provider 都出现 TS2420，直到 Tasks 2、4 补齐实现才恢复全绿。

> **教学点**：“additive”不是对所有角色都无成本。API 消费者、接口实现者、运行时数据各自有不同兼容性。Day 03 保住的是 Day 02 `chat()` 消费契约，而不是假装 interface implementer 不需要改。

### 2. `AsyncIterable` vs `AsyncGenerator`：接口宽，具体实现窄

接口声明：

```ts
stream(messages: Message[]): AsyncIterable<string>;
```

两个 provider 实现声明：

```ts
async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
  // ...
}
```

关系可以画成：

```text
AsyncGenerator<string, void, undefined>
        implements
AsyncIterator<string> + AsyncIterable<string>
                         ▲
                         │ interface 只依赖这一层
```

| 选择                                      | 承诺                          | 代价                                                    |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `AsyncIterable<string>`                   | 能被 `for await` 消费         | 不保证 `.next()` / `.return()` 的具体实现来自 generator |
| `AsyncGenerator<string, void, undefined>` | 明确是 `async function*` 产物 | 把实现机制写进公共接口                                  |

未来某个 provider 可以直接包装 SDK 自带的 `AsyncIterable<string>`，不必为了满足接口再人为套一层 generator。今天的两个实现仍用 `async function*`，因为它最贴合“收到一块就产出一块”的控制流。

对应位置：

- 接口：[chat-client.ts:38](../../libs/llm/chat-client.ts#L38)
- OpenAI：[openai-chat-client.ts:68-79](../../libs/llm/openai-chat-client.ts#L68-L79)
- Anthropic：[anthropic-chat-client.ts:78-103](../../libs/llm/anthropic-chat-client.ts#L78-L103)

> **教学点**：依赖能力，不依赖构造方式。接口只问“你能否异步迭代”，实现才回答“我是 async generator”。

### 3. AsyncGenerator 的 cleanup 语义：`break` 会请求 `return()`，但不等于网络已取消

消费方提前退出时，JavaScript 的异步迭代关闭流程会调用 iterator 的 `return()`；如果 generator 内有 `finally`，它会获得执行机会：

```ts
async function* source(): AsyncGenerator<string> {
  try {
    yield 'a';
    yield 'b';
  } finally {
    console.log('iterator closed');
  }
}
for await (const chunk of source()) break;
```

但 Day 03 的 provider 没有显式 `try/finally`，也没有把 `AbortSignal` 传给 SDK。提前 `break` 只能保证 iterator close，不能保证远端请求、token 生成与网络连接立即终止。因此 generator cleanup 是未来取消语义的语言基础，不是 AbortSignal 的替代品。

> **教学点**：资源释放必须追到资源所有者。iterator 结束属于语言层；远端推理取消属于 SDK / HTTP 层。两者不能用一句“generator 会 cleanup”混为一谈。

### 4. Anthropic 事件流的“协议隐藏”：双重判别联合压成一条 yield 路径

Anthropic SDK 返回的不是 `string` 流，而是事件判别联合。当前 SDK 类型有 6 个顶层事件变体：

| 顶层事件              | Day 03 处理           |
| --------------------- | --------------------- |
| `message_start`       | 跳过                  |
| `content_block_start` | 跳过                  |
| `content_block_delta` | 继续检查 `delta.type` |
| `content_block_stop`  | 跳过                  |
| `message_delta`       | 跳过                  |
| `message_stop`        | 跳过                  |

`content_block_delta` 里面又有 5 个 delta 变体：

| `delta.type`       | Day 03 处理                  |
| ------------------ | ---------------------------- |
| `text_delta`       | ✅ yield `event.delta.text`  |
| `input_json_delta` | 跳过，未来 `tool_use` 才需要 |
| `citations_delta`  | 跳过                         |
| `thinking_delta`   | 跳过                         |
| `signature_delta`  | 跳过                         |

最终出口只有一条：

```ts
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    yield event.delta.text;
  }
}
```

实现见 [anthropic-chat-client.ts:80-103](../../libs/llm/anthropic-chat-client.ts#L80-L103)。双 discriminant 检查让 TypeScript 把 `event.delta` 自动收窄成 `TextDelta`，不需要 cast。

```text
RawMessageStreamEvent
  └─ content_block_delta
       └─ text_delta
            └─ string                 ← ChatClient 唯一出口
```

> **教学点**：抽象层不是把 SDK 方法换个名字。它必须消化协议分叉，让调用方不需要知道 `message_start`、`thinking_delta` 或 provider SDK 类型。

### 5. OpenAI null delta 的 skip 模式：不制造“伪 chunk”

OpenAI 的流式 chunk 可能只有 role 或 finish metadata，`delta.content` 是 `null` / `undefined`。Day 03 选择 A：

```ts
// A：没有文本，就没有 chunk
const delta = chunk.choices[0]?.delta?.content;
if (delta) yield delta;
```

拒绝 B：

```ts
// B：没有文本，也制造空字符串 chunk
yield chunk.choices[0]?.delta?.content ?? '';
```

| 行为                   | A：skip        | B：yield `''`      |
| ---------------------- | -------------- | ------------------ |
| 调用方收到的每个 chunk | 都有文本       | 可能是空字符串     |
| chunk 计数             | 近似文本事件数 | 被协议元事件污染   |
| UI render              | 无空更新       | 可能触发无意义更新 |
| 拼接结果               | 相同           | 相同               |

实现见 [openai-chat-client.ts:74-78](../../libs/llm/openai-chat-client.ts#L74-L78)。

这里用 `if (delta)` 还会跳过 `''`。对“纯文本增量”契约来说，空字符串不携带信息，所以跳过是正确的。若未来空字符串本身需要表达事件，那就说明 chunk 已经不该是裸 `string`。

> **教学点**：不要用空值占位来假装事件存在。流的语义单位应该是“有效增量”，不是“上游每来一个包就必须 yield 一次”。

### 6. `async function*` 内部还能 `for await`：同步两层异步背压

Provider generator 内部消费另一个异步流，再把过滤结果交给调用方：

```ts
async *stream(messages: Message[]): AsyncGenerator<string, void, undefined> {
  const sdkStream = await createSdkStream(messages);
  for await (const sdkChunk of sdkStream) {
    const text = extractText(sdkChunk);
    if (text) yield text;
  }
}
```

数据链是 `SDK AsyncIterable<Event> → provider filter → ChatClient AsyncIterable<string> → caller`。外层请求下一块时 generator 才继续推进；generator 又要从 SDK stream 读到事件后才能产出，因此不需要手写 callback、队列或 event emitter。

这只是 JavaScript 迭代层的消费节奏，不代表远端模型也按同样粒度停住。SDK、HTTP 缓冲区和 provider 服务器仍可能预取或合并数据。

> **教学点**：`async function*` 的价值不是语法短，而是它把“上游异步读取 → 中间过滤 → 下游异步消费”写成一条可读的数据流。

### 7. chunk 拼接 ≈ `chat()`：纯文本场景的语义等价，不是永恒定律

Day 03 承诺：

```ts
let streamed = '';
for await (const chunk of client.stream(messages)) {
  streamed += chunk;
}

const completed = await client.chat(messages);
// 对同一纯文本回复，streamed ≈ completed
```

这里用 `≈`，不用 `===`，原因有两层：

1. 两次真实 LLM 请求本身可能生成不同措辞，不能拿两次调用直接做字符串相等测试。
2. 契约表达的是“同一次纯文本响应的所有 text delta 拼接，等价于完整文本”，不是承诺 provider 每次采样确定。

成立条件：

- 输出只有文本；
- 文本块按顺序到达；
- 没有 `tool_use`、thinking、citation 等需要保留的结构；
- 调用方不丢 chunk。

一旦出现结构化输出，裸字符串会丢掉事件边界：

```ts
// 未来可能需要，但 Day 03 不设计
// { type: 'text_delta', text: '...' }
// { type: 'tool_call_delta', ... }
// { type: 'usage', ... }
```

> **教学点**：今天的 string 契约是主动收窄，不是宣称 LLM streaming 天生只有文本。等价性有适用域，超出适用域就要重新设计。

### 8. `chat()` + `stream()` 共用协议适配：review 把复制变成单一事实源

Task 4 初版在两个方法里各写了一遍：

```ts
let systemPrompt: string | undefined;
const convoMessages = messages.flatMap(/* promote system */);
const apiMessages = convoMessages.map(/* string -> text blocks */);
```

这不是“看起来相似”，而是 byte-identical 的 16 行协议适配。候选方案：

| 方案                        | 评价                                    |
| --------------------------- | --------------------------------------- |
| A. 保留两份                 | 今天能跑；以后修协议时容易只改一处      |
| B. provider 内私有 helper   | ✅ 一份规则，`chat()` / `stream()` 共享 |
| C. 抽跨 provider base class | OpenAI 没这套转换，属于假复用           |

最终选择 B：

```ts
const { systemPrompt, apiMessages } = this.toApiMessages(messages);
```

helper 见 [anthropic-chat-client.ts:105-135](../../libs/llm/anthropic-chat-client.ts#L105-L135)。它只处理 Anthropic 的两件事：

1. `system` message 提升为顶层字段；
2. `content: string` 转成 text block 数组。

为什么 Day 03 抽，不能等 Day 04？因为 duplication 已经真实出现，且 `chat()` 与 `stream()` 必须保持相同请求语义。继续复制会让下一次协议变化产生 drift。相反，跨 provider base class 还没有真实共同逻辑，所以不抽。

> **教学点**：YAGNI 不等于永远不抽象。正确时机是“第二个真实 copy site 已出现”，不是第一个实现时预测，也不是第三次出 bug 后补救。

### 9. CLAUDE.md 宿主原则：streaming 没有成为传输层偷渡入口

Day 02 已经确定：谁持有 API key，谁持有 `ChatClient`。Day 03 增加 streaming 后，最容易出现的诱惑是顺手加 SSE helper：

```text
libs/llm/                 apps/api/                    apps/web-vue/
LLM SDK + ChatClient  →   HTTP/SSE adapter        →   fetch/ReadableStream/UI
持有 provider key         定义网络 framing             只消费后端响应
```

Day 03 只完成左侧：

```ts
stream(messages: Message[]): AsyncIterable<string>;
```

故意没有：

```ts
// ❌ 不属于 libs/llm
streamAsSseResponse(...)
fetchChatStream(...)
useStreamingChat(...)
```

`AsyncIterable<string>` 是传输无关的领域边界。未来 server 可以把它编码成 SSE、WebSocket 或别的协议，但 framing、断线、重连、浏览器解码都属于 transport / UI 层。

> **教学点**：一个抽象“可以被某层使用”，不等于“应该把那一层的依赖吸进来”。Streaming 更需要边界纪律，因为它天然跨越 SDK、网络和 UI 三层。

### 10. 3-step 协调改动：interface + 两个实现必须形成闭环

依赖图很直接：`ChatClient.stream()` 契约同时约束 `OpenAIChatClient.stream()` 与 `AnthropicChatClient.stream()`。

Task 1 单独落地后真实出现两个 TS2420：

```text
OpenAIChatClient / AnthropicChatClient incorrectly implements ChatClient
Property 'stream' is missing
```

Task 2 后只剩 Anthropic 的 TS2420；Task 4 后 typecheck 才全绿。TypeScript 正在替我们检查“所有 provider 是否同步兑现契约”。

在教学分步提交里，中间态红可以被明确记录；在要求每个 commit 都可构建的生产分支里，应把 interface 与全部 implementer 放进同一原子 commit，或在合并前 squash 成绿态。

> **教学点**：typecheck 红不总是“实现写错”，也可能是协调改动尚未闭合；但“预期红”必须有明确后继任务，不能成为长期借口。

---

## ❓ 思考题

1. `stream()` 的所有 chunk 拼接后约等于 `chat()` 的字符串。未来加入 `tool_use` 或 structured output 时，这个等价性会怎样破？比较三条升级路径：改成 `AsyncIterable<Event>`、返回 `string | Event`、新增 `events()`；哪条对现有调用方最诚实？

2. `AsyncIterable<string>` 能映射到 SSE，但字符串可能包含换行、空行和 Unicode。服务端应该逐 `data:` 行编码，还是对 chunk 做 JSON 序列化？浏览器怎样区分“网络分帧”与“原始文本边界”？

3. generator 在调用方 `break` 时会收到 `return()`。这是否足以停止 SDK 的 HTTP stream 和远端 token 生成？如果加入 `AbortSignal`，signal 应进入 `ChatClient` 契约、provider options，还是只属于 `apps/api/` adapter？

4. Anthropic 用双 discriminant 过滤事件，OpenAI 用 null delta skip。若 SDK 在中途抛错，两边都会让 `for await` 抛异常；但已收到的 partial text、错误类型、重试安全性真的对称吗？ChatClient 需要统一到什么程度？

5. `ChatClient` 已有 `chat`、`stream`、`setModel` 三个方法。未来加 tool use、structured output、vision 时，继续往同一接口加方法会不会形成 fat interface？哪个真实需求出现时才应该拆分 capability interface？

6. `toApiMessages()` 在 Anthropic provider 内成立。OpenAI 当前没有相同的 system 提升和 content-block 转换。应该抽 base class、free function，还是保持 provider 私有 helper？用“真实共同变化原因”而不是“代码长得像”来判断。

7. Day 03 streaming 暴露了 `chat()` 内已有的协议适配，于是第二个 copy site 出现。这个 helper 的抽取时机是“刚好幸运”，还是第二种执行模式出现后必然会发生？如果 Task 4 reviewer 没抓到，未来最可能在哪个改动里产生 drift？

8. Task 1 的 interface commit 会让 typecheck 暂时红。教学分步提交与生产可构建提交的目标不同。什么时候可以接受已解释的中间红态，什么时候必须把三步合成一个原子 commit？

---

## ⚠️ 今日踩坑

### 1. Task 1 typecheck 红：不是 provider bug，是协调改动的中间态

**症状**：interface 新增 `stream()` 后，`pnpm typecheck` 报两个 TS2420：OpenAI / Anthropic class 缺少 required method。

**根因**：TypeScript 的 `implements` 会立即检查完整接口。计划文本一度写“只加 interface 也应通过”，这个预期与语言规则冲突。

**修法**：不加临时 optional、不加空实现、不用 flag 兜底。按依赖顺序完成 Task 2 与 Task 4 的真实实现；最终 typecheck 0 error。

**Why**：这是 interface + implementation + implementation 的 3-step 协调改动。把 `stream?()` 改成 optional 只为让中间 commit 变绿，会削弱最终契约，属于修症状不修根因。

> **学习**：预期输出也要接受编译器校验。Plan 写“应通过”不代表事实；真实 TS2420 反而准确揭示了实现者责任。

### 2. Task 4 verbatim duplication 被 reviewer 抓出

**症状**：初版 `chat()` 与 `stream()` 都包含 16 行完全相同的 system 提升 + content blocks 转换。

**根因**：brief 按“给现有 class 加 stream method”的局部视角编写，把 `stream()` 当新代码看，没有回扫同文件的 `chat()` 是否已有同一协议适配。

**修法**：提交 `7987bac`，抽成 private `toApiMessages(messages)`；两条调用路径都解构 `{ systemPrompt, apiMessages }`。

**Why**：修改五问 #3“其他地方有同类问题吗？”在这里不是流程口号。Streaming 正好制造了第二个 copy site；review 的价值就是在代码能跑、质量门全绿时继续找到结构性 drift 风险。

> **学习**：测试能证明两份代码今天行为相同，helper 才能降低它们明天变得不同的概率。

### 3. Prettier 把多行 `if` 折成单行

**症状**：Task 4 brief 里的双判别条件写成多行；实际文件经 Prettier 后变成单行：

```ts
if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
```

**根因**：条件长度没有超过项目 `printWidth: 100`，Prettier 按仓库配置选择单行。

**修法**：接受 formatter 产物，不用手工换行与工具对抗；commit 前重新跑 `format:check`。

**Why**：brief 约束的是过滤语义，不是空白字符。仓库 formatter 才是最终版式事实源。

> **学习**：实现偏离 brief 要分类。语义 deviation 必须 review；formatter 导致的纯版式 deviation 记录后接受即可。

---

## 📋 验收清单

- [x] `ChatClient.stream(messages): AsyncIterable<string>` 已加入，`chat()` 返回类型未变
- [x] `OpenAIChatClient.stream()` 使用 SDK `stream: true` 路径
- [x] OpenAI null / undefined delta 被跳过，只 yield 真实文本
- [x] `AnthropicChatClient.stream()` 使用 `client.messages.stream()`
- [x] Anthropic 只 yield `content_block_delta + text_delta`，其它事件不泄漏
- [x] `chat()` / `stream()` 共用 `toApiMessages()`，无协议适配复制
- [x] OpenAI demo 真请求、渐进输出：57～63 chunks，3～5 秒
- [x] Anthropic demo 真请求、渐进输出：6～7 chunks，约 2～4 秒
- [x] `pnpm typecheck` 0 error（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）
- [x] `pnpm lint` 0 error
- [x] `pnpm format:check` 全绿
- [x] `pnpm test` 3 / 3 passed
- [x] Day 02 OpenAI `chat()` demo 真请求成功，完整字符串一次性返回
- [x] Day 02 Anthropic `chat()` demo 真请求成功，完整字符串一次性返回
- [x] `libs/llm` 没引入 HTTP / SSE / browser dependency
- [x] AbortSignal / 单测 / `tool_use` / structured chunk / Vue 全部保持未实现
- [x] Tasks 2～5 与 fix commit 均走过 lint-staged / commitlint；Task 1 的 hook deviation 已在报告留痕

---

## 🆕 Day 03 实施回顾：spec / plan / review 的双 review loop

Day 03 第一次完整走通“实现能工作后，结构仍可被 review 推翻”的 fix loop：

```text
spec / plan → c1e8696 实现 → review 发现 duplication
            → 7987bac fix → re-review → Task 6 全分支验证
```

### 1. 双层 review：先验收功能，再检查结构

Task 4 初版满足 `messages.stream()`、只 yield `text_delta`、协议不泄漏、质量门全绿，所以功能正确。Reviewer 随后回扫相邻 `chat()`，发现两条路径各持一份相同协议适配。

Fix 的边界：

| Review 发现                                | 决策    | 原因                           |
| ------------------------------------------ | ------- | ------------------------------ |
| 同 provider、同协议、逐字重复              | ✅ 修   | 已出现真实第二 copy site       |
| 跨 OpenAI / Anthropic 抽 stream base class | ❌ 不做 | SDK 形态不同，没有共同变化原因 |
| 顺手加 AbortSignal                         | ❌ 不做 | 新能力，不是 duplication fix   |

### 2. fix subagent：只修 finding，不重写任务

`7987bac` 只改 `anthropic-chat-client.ts`：helper 保持 private，`chat()` / `stream()` 改为共同调用，事件过滤注释保留，公共 API 与行为不变。Re-review 因而只需回答两问：复制是否消失，协议语义是否保持。

### 3. Task 6：verification only，不为流程制造 commit

Task 6 跑了 4 个质量门 + 2 个 Day 02 真实 demo，共 6 个 gate 全绿。没有发现问题，所以 0 文件修改、0 commit。验证证据进入 report，Git 历史只记录状态变化。

> **教学点**：Review、fix、verification 是三种工作。Review 发现问题，fix 改状态，verification 证明状态；不是每一步都必须产生 commit。

---

## 🚀 Day 04 预告

### 候选 1：AbortSignal 取消

```ts
stream(
  messages: Message[],
  options?: { signal?: AbortSignal },
): AsyncIterable<string>;
```

这是 Day 03 最自然的语义补全：流式请求有“开始 / 进行 / 取消”三态。调用方提前退出时，不只关闭 iterator，还把取消传播到 SDK / HTTP 层，避免继续消耗 token。

Task 4 fix 抽出的 `toApiMessages()` 也让 Anthropic 请求构造更集中，加入 request option 时不必同时改两份协议适配。

### 候选 2：结构化事件 chunk

```ts
stream(messages: Message[]): AsyncIterable<ChatEvent>;
```

让流不只表达 text，还能表达 tool call、usage、citation、thinking 等事件。价值更大，但会触碰 Day 03 的 `AsyncIterable<string>` 契约，需要先决定 breaking change、并存新方法还是联合类型。

这是契约扩展课题，不应和“取消”混在一个 day 里。

### 候选 3：`apps/api/` 起步，落 HTTP / SSE adapter

把 Node 端 `AsyncIterable<string>` 编码成浏览器可消费的 SSE：

```text
ChatClient.stream()
      ↓
apps/api SSE framing
      ↓
Browser fetch + ReadableStream
```

这是新方向，会第一次落传输层、断线语义、SSE framing 与 API key 边界。它能兑现 Day 02 宿主原则，但 scope 明显大于 provider 内部演化。

### 推荐

**推荐候选 1：AbortSignal 取消。**

理由：它最贴近 Day 03 streaming 的自然延伸，公共接口只增加一个可选 options 参数，概念增量最小；完成后“流式”的生命周期语义才闭合。候选 2 是下一次契约升级，候选 3 是后端新层，两者都值得单独设计。

**Day 04 决定保留**：先做 AbortSignal 的 contract design，重点验证调用方 `break`、显式 abort、SDK 中途错误三种终止路径是否能统一，而不是先写一个 `if (signal.aborted)` 兜底。
