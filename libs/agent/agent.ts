/**
 * libs/agent/agent.ts
 *
 * Agent 编排层。
 *
 * Day 04 重构：
 * - 统一 ChatClient 接口：chat({ messages, tools })
 * - ChatResponse = { content?, toolCalls? }
 *
 * Day 05 追加：
 * - 引入 AgentEvent 判别联合（见 event.ts），作为 Agent Runtime 的事件模型。
 * - 新增 runEvents(): AsyncIterable<AgentEvent> —— 暴露完整 loop 过程。
 * - run() 重构为 runEvents() 的收尾版（消除重复），返回最终 content。
 * - 删除 onIteration 回调 —— runEvents() 是它的替代品，再保留就是同一信息的两个出口。
 *
 * Day 05 追加：runEvents 在每次 chat() 前后 yield `request` / `response` 事件，
 * 把 LLM 调用的入参（累积 messages）和出参（ChatResponse）暴露给消费方。
 * 这是 Agent Runtime 事件模型的"过程快照"，前端可以可视化"为什么模型这么决定"。
 *
 * 不做（YAGNI）：
 * - 并行 tool 执行
 * - Streaming tool calling（content 整段，不分 delta）
 * - AbortSignal / 取消
 * - 持久化 / 跨会话历史
 * - token 用量 / 延迟
 */

import type { ChatClient, Message } from '../llm/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { AgentEvent } from './event.js';

export interface AgentOptions {
  readonly chat: ChatClient;
  readonly tools: ToolRegistry;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
}

export class Agent {
  constructor(private readonly options: AgentOptions) {}

  async run(userInput: string): Promise<string> {
    // 收尾版 run：委托给 runEvents，遇到 message_end 拿 content 退出。
    // 这样保证 run() 和 runEvents() 是同一份 loop 实现，不会分叉。
    for await (const ev of this.runEvents(userInput)) {
      if (ev.kind === 'message_end') return ev.content;
      if (ev.kind === 'error') throw new Error(ev.message);
    }
    return '';
  }

  async *runEvents(userInput: string): AsyncIterable<AgentEvent> {
    const messages: Message[] = [
      ...(this.options.systemPrompt !== undefined
        ? [{ role: 'system' as const, content: this.options.systemPrompt }]
        : []),
      { role: 'user', content: userInput },
    ];
    const toolDefs = this.options.tools.toProviderTools();
    const maxIterations = this.options.maxIterations ?? 5;

    yield { kind: 'message_start' };

    for (let i = 0; i < maxIterations; i++) {
      yield { kind: 'iteration', n: i + 1 };

      // 把当前累积的 messages 暴露出去（"调用过程快照"）
      // 深拷贝 messages —— 否则两次 yield 都引用同一个累积数组，
      // TraceCollector / 消费方拿到的 requests[N].messages 都指向最终累积状态。
      yield {
        kind: 'request',
        iteration: i + 1,
        messages: messages.map((m) => ({ ...m })),
      };

      const response = await this.options.chat.chat({
        messages,
        tools: toolDefs,
      });

      // 把 LLM 响应也暴露出去
      const responseEvent: AgentEvent =
        response.content !== undefined
          ? { kind: 'response', iteration: i + 1, content: response.content }
          : response.toolCalls !== undefined
            ? { kind: 'response', iteration: i + 1, toolCalls: response.toolCalls }
            : { kind: 'response', iteration: i + 1 };
      yield responseEvent;

      // 普通回复路径：返回 content
      if (response.content !== undefined) {
        yield { kind: 'message_end', content: response.content };
        yield { kind: 'done' };
        return;
      }

      // 工具调用路径
      if (response.toolCalls !== undefined && response.toolCalls.length > 0) {
        // assistant 决定调工具：把 tool_calls 写进历史
        messages.push({
          role: 'assistant',
          content: '',
          toolCalls: response.toolCalls,
        });

        // 顺序执行每个 tool_call，逐一 yield 事件
        for (const tc of response.toolCalls) {
          yield {
            kind: 'tool_call',
            id: tc.id,
            name: tc.toolName,
            args: tc.args,
          };

          const tool = this.options.tools.get(tc.toolName);
          let resultContent: string;
          if (tool === undefined) {
            resultContent = `Error: tool "${tc.toolName}" not found`;
          } else {
            try {
              const result = await tool.execute(tc.args);
              resultContent = JSON.stringify(result);
            } catch (err) {
              resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
          }

          yield {
            kind: 'tool_result',
            id: tc.id,
            name: tc.toolName,
            output: resultContent,
          };

          messages.push({
            role: 'tool',
            content: resultContent,
            toolCallId: tc.id,
          });
        }

        // 继续下一轮循环
        continue;
      }

      // 既没有 content 也没有 toolCalls：返回空字符串
      yield { kind: 'message_end', content: '' };
      yield { kind: 'done' };
      return;
    }

    throw new Error(`Agent loop exceeded ${maxIterations} iterations without final answer`);
  }
}
