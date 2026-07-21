/**
 * libs/agent/agent.ts
 *
 * Agent 编排层的最小实现。
 *
 * 职责：
 * - 持有 ChatClient + ToolRegistry
 * - 运行 "chat → tool_call → execute → chat" 循环
 * - 默认 maxIterations=5 防无限循环
 * - tool 执行错误 catch 后把错误字符串回传 LLM，让模型下轮纠正
 *
 * Day 04 重构：使用统一的 chat({ messages, tools }) 接口
 * - 移除 chatWithTools，普通聊天和工具调用用同一个方法
 * - 返回 ChatResponse：{ content?, toolCalls? }
 *
 * Day 04 不做：
 * - 并行 tool 执行（按 spec 顺序跑）
 * - Streaming tool calling
 * - AbortSignal / 取消语义
 * - apps/api/ 或 web 消费层
 */

import type { ChatClient, ChatResponse, Message } from '../llm/index.js';
import type { ToolRegistry } from '../tools/index.js';

export interface AgentOptions {
  readonly chat: ChatClient;
  readonly tools: ToolRegistry;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
  readonly onIteration?: (iteration: number, response: ChatResponse) => void;
}

export class Agent {
  constructor(private readonly options: AgentOptions) {}

  async run(userInput: string): Promise<string> {
    const messages: Message[] = [
      ...(this.options.systemPrompt !== undefined
        ? [{ role: 'system' as const, content: this.options.systemPrompt }]
        : []),
      { role: 'user', content: userInput },
    ];
    const toolDefs = this.options.tools.toProviderTools();
    const maxIterations = this.options.maxIterations ?? 5;

    for (let i = 0; i < maxIterations; i++) {
      const response: ChatResponse = await this.options.chat.chat({
        messages,
        tools: toolDefs,
      });

      this.options.onIteration?.(i + 1, response);

      // 普通回复路径：返回 content
      if (response.content !== undefined) {
        return response.content;
      }

      // 工具调用路径
      if (response.toolCalls !== undefined && response.toolCalls.length > 0) {
        // assistant 决定调工具：把 tool_calls 写进历史
        messages.push({
          role: 'assistant',
          content: '',
          toolCalls: response.toolCalls,
        });

        // 顺序执行每个 tool_call，把结果写回历史
        for (const tc of response.toolCalls) {
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
          messages.push({
            role: 'tool',
            content: resultContent,
            toolCallId: tc.id,
          });
        }

        // 继续下一轮循环
        continue;
      }

      // 既没有 content 也没有 toolCalls，返回空字符串
      return '';
    }

    throw new Error(`Agent loop exceeded ${maxIterations} iterations without final answer`);
  }
}
