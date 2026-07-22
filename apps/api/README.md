# apps/api

SSE HTTP adapter —— 把 `Agent` 暴露成对外的 `POST /agent` 端点，响应走 Server-Sent Events。

## 这是什么

`apps/api/` 是仓库首个 HTTP 出口。它把 `libs/agent/` 的 `Agent.runEvents()` 事件流
编码成 W3C SSE 帧，推给浏览器 / curl / 任何 EventSource 客户端。

**契约**：

- 请求：`POST /agent`，body = `{ "input": "user message" }`
- 响应：`Content-Type: text/event-stream`
- 每个 SSE 帧 `event:` 字段是 AgentEvent 的 `kind`，`data:` 字段是 JSON 字符串

**完整事件序列示例**（一次 calculator 调用）：

```
event: message_start
data: {"kind":"message_start"}

event: iteration
data: {"kind":"iteration","n":1}

event: tool_call
data: {"kind":"tool_call","id":"call_1","name":"calculator","args":{"expression":"1+2*3"}}

event: tool_result
data: {"kind":"tool_result","id":"call_1","name":"calculator","output":"{\"result\":7}"}

event: message_end
data: {"kind":"message_end","content":"The answer is 7"}

event: done
data: {"kind":"done"}
```

## 用法

### 1. 构造 Agent（apps/api/ 不硬编码 provider）

```typescript
import { OpenAIChatClient } from '../../libs/llm/index.js';
import { ToolRegistry, calculatorTool } from '../../libs/tools/index.js';
import { Agent } from '../../libs/agent/index.js';

const chat = new OpenAIChatClient({ apiKey, baseURL, model });
const tools = new ToolRegistry();
tools.register(calculatorTool);

const agent = new Agent({
  chat,
  tools,
  systemPrompt:
    'You are a helpful assistant. Prefer using available tools over guessing.',
});
```

### 2. 构造 Hono app 并启动

```typescript
import { createAgentApp } from './apps/api/src/index.js';
import { serve } from '@hono/node-server'; // 可选：用 hono 官方 node adapter

const app = createAgentApp({ agent });
serve({ fetch: app.fetch, port: 3000 });
console.log('SSE listening on http://localhost:3000/agent');
```

### 3. 客户端消费（curl / EventSource）

```bash
curl -N -X POST http://localhost:3000/agent \
  -H 'Content-Type: application/json' \
  -d '{"input":"用 calculator 工具计算 1+2*3"}'
```

```javascript
// 浏览器 EventSource 不支持 POST，这里用 fetch + ReadableStream reader
const res = await fetch('http://localhost:3000/agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: '1+2*3' }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}
```

## Web UI — Agent Console

`apps/api/` 同进程 serve 一个 **Agent Console** 单页 Web UI（Claude Code 风格），无需任何额外依赖。

**启动后访问 `http://localhost:<port>/`** 即可看到：

- **左栏 Conversation**：用户消息（蓝色气泡，右对齐） + AI 回复（绿色气泡，左对齐）
- **右栏 Execution Timeline**：每个 AgentEvent 一个步骤，含 ✓ 视觉标记

布局：

```
┌──────────────────────────────────────────────────┐
│ Agent Console                       [Clear]      │
├─────────────────────────┬────────────────────────┤
│ Conversation            │ Execution Timeline     │
│                         │                        │
│ You: 帮我计算 10+20     │ ✓ 接收任务             │
│ AI: 通过 calculator...  │ → Iteration 1          │
│                         │ → 调用 calculator(...) │
│                         │ ✓ Tool 返回            │
│                         │ ✓ 生成答案             │
└─────────────────────────┴────────────────────────┘
[输入框....................................] [Send]
```

**技术栈**：

- 单 HTML 文件（`apps/api/src/web/index.html`），内嵌 CSS + 原生 JS
- 零外部依赖、零构建工具
- SSE 消费用 `fetch + ReadableStream`（`EventSource` 不支持 POST）
- 响应式：≤720px 自动堆叠为单栏

**关键 UX 决策**（来自 Claude Code 的 surface model）：

- 用户消息和 tool result 在同一个 turn 内交织，**不是分开的 conversation turn**
- Timeline 是事件流的可视化投影，Conversation 是对话投影——两者从同一个事件源分发
- 每次 send 重置两栏（Day 06 YAGNI：单 turn 不持久化历史）

## 不做的事（YAGNI 边界）

- ❌ AbortSignal 取消
- ❌ Auth / API key 校验
- ❌ 多 route（`/chat` 单独端点、`/health`）
- ❌ Streaming tool calling（content 整段，不分 message_delta）
- ❌ event id / retry / 心跳 / 重连
- ❌ Docker / deploy 脚本
- ❌ Schema validation（zod/ajv）

## 文件结构

```
apps/api/
├── README.md
└── src/
    ├── index.ts          # public exports
    ├── server.ts         # createAgentApp —— Hono app 工厂（含 GET / 与 POST /agent）
    ├── sse-adapter.ts    # AgentEvent → SSE 消息（framework-agnostic）
    ├── web-loader.ts     # 加载 web/index.html（基于 import.meta.url）
    └── web/
        └── index.html    # Agent Console 单页 UI（内嵌 CSS + JS，零依赖）
```
