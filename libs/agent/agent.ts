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
 * Day 07 改造（Phase B Task 5 —— 核心改动）：
 *
 * 1) runEvents 加 options.signal：调用方可以中途 abort。
 *    - signal.aborted 检查在每次 iter 起始 / chat/stream 完成后 / 每个 stream chunk 之后
 *    - signal 触发 → yield {kind:'error', message:'aborted by signal'} → return（不发 done）
 *
 * 2) error throw → yield（行为变更，灰区，肥老大 ack）：
 *    - maxIterations 超限 → yield error → return
 *    - chat/stream 抛错 → catch → yield error → return
 *    - signal.aborted → yield error → return
 *    - run() 内部消费 runEvents 的 error 事件，转 throw new Error(message)（保持 Promise<string> 契约）
 *
 * 3) final-answer iter 切 stream()（Plan Task 5 简化方案）：
 *    - 先 chat() 探测拿 usage
 *    - 若 probe.content !== undefined → final-answer iter → 重调 stream() 流式 yield message_delta
 *    - 若 probe.toolCalls → tool_calls iter，不流式（仍走 request/response）
 *    - 代价：final-answer iter 双重调用 = 双重 token 计费（Day 10+ 评估一次 stream 方案）
 *
 * 4) usage 进 response 事件 + AgentEvent.response.usage 字段
 *    - apps/api 层累积到 TraceCollector meta
 *
 * Day 08 改造：
 * - AgentOptions 加 model 字段（可选；用于 Anthropic count_tokens 调上下文观测）
 * - runEvents 在每次 LLM 调用前 yield `context` 事件（best-effort，失败/未知 model 不 yield）
 * - runEvents 在 message_end / error 之前 yield `run_summary` 事件（累积 usage + peak）
 *
 * Day 09 改造（多轮对话历史前置）：
 * - runEvents / run 签名改成接收 `messages: readonly Message[]`，不再拼接 userInput。
 * - AgentOptions 删 systemPrompt 字段：system 消息的注入完全由调用方负责（Day 05
 *   "同一信息两个出口" 原则延伸到入口）。这样 `runEvents` 不再拥有"拼 messages"
 *   的责任，调用方拿到的就是 Agent Runtime 实际使用的完整 messages。
 * - 入口 messages 深拷贝（map {...m}）—— Day 05 request 事件深拷贝规则的
 *   入口版本：保证内部 workingMessages 上的 push 不会泄露到调用方持有的数组。
 * - run() 同样改签名，复用 runEvents 的循环实现，承诺同一份代码。
 *
 * 不做（YAGNI）：
 * - 并行 tool 执行
 * - 流式 tool_calls（tool_calls iter 仍走 request/response，不流式中间态）
 * - 持久化 / 跨会话历史
 * - latency / cost 进 response
 */

import type { ChatClient, ChatResponse, Message } from '../llm/index.js';
import { countContextTokens, getModelMeta } from '../llm/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { AgentEvent } from './event.js';

export interface AgentOptions {
  readonly chat: ChatClient;
  readonly tools: ToolRegistry;
  readonly maxIterations?: number;
  readonly model?: string; // 🆕 Day 08: 必需 if context observability 启用；未知 model → context 事件不 yield
}

export interface AgentRunOptions {
  readonly signal?: AbortSignal;
}

export class Agent {
  constructor(private readonly options: AgentOptions) {}

  async run(messages: readonly Message[], options?: AgentRunOptions): Promise<string> {
    // 收尾版 run：委托给 runEvents，遇到 message_end 拿 content，遇到 error 转 throw。
    // 这样保证 run() 和 runEvents() 是同一份 loop 实现，不会分叉。
    for await (const ev of this.runEvents(messages, options)) {
      if (ev.kind === 'message_end') return ev.content;
      if (ev.kind === 'error') throw new Error(ev.message);
    }
    return '';
  }

  async *runEvents(
    messages: readonly Message[],
    options?: AgentRunOptions,
  ): AsyncIterable<AgentEvent> {
    const signal = options?.signal;

    // 🆕 Day 09: 调用方传入完整 messages（system + 历史 + 新 user）。
    // runEvents 不再追加 user、不再注入 systemPrompt —— 那是调用方的责任。
    // 深拷贝保证不会就地修改调用方持有的数组（Day 05 规则在入口复用）。
    const workingMessages: Message[] = messages.map((m) => ({ ...m }));

    const toolDefs = this.options.tools.toProviderTools();
    const maxIterations = this.options.maxIterations ?? 5;

    yield { kind: 'message_start' };

    // 🆕 Day 08: 累积 token / context 状态
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let peakPromptTokens = 0;
    let iterationsCompleted = 0;

    for (let i = 0; i < maxIterations; i++) {
      // 🆕 Day 07: signal 检查在每次 iter 起始
      if (signal?.aborted) {
        // 🆕 Day 08: run_summary 先于 error 发出（partial 累加）
        yield {
          kind: 'run_summary',
          totalPromptTokens,
          totalCompletionTokens,
          peakPromptTokens,
          iterations: iterationsCompleted,
        };
        yield { kind: 'error', message: 'aborted by signal' };
        return;
      }

      yield { kind: 'iteration', n: i + 1 };

      // 把当前累积的 messages 暴露出去（"调用过程快照"）
      // 深拷贝 messages —— 否则两次 yield 都引用同一个累积数组，
      // TraceCollector / 消费方拿到的 requests[N].messages 都指向最终累积状态。
      yield {
        kind: 'request',
        iteration: i + 1,
        messages: workingMessages.map((m) => ({ ...m })),
      };

      // 🆕 Day 08: context 计数（best-effort，失败不打断主流程）
      const model = this.options.model;
      if (model !== undefined) {
        const meta = getModelMeta(model);
        if (meta !== undefined) {
          const ctxResult = await countContextTokens(workingMessages, model, signal);
          if (ctxResult !== undefined) {
            yield {
              kind: 'context',
              iteration: i + 1,
              promptTokens: ctxResult.tokens,
              limit: meta.contextLimit,
            };
            peakPromptTokens = Math.max(peakPromptTokens, ctxResult.tokens);
          }
        }
      }

      let response: ChatResponse;
      try {
        // 🆕 Day 07: 先 chat() 探测拿 usage + 判定 iter 类型
        const probe = await this.options.chat.chat(
          { messages: workingMessages, tools: toolDefs },
          options,
        );

        // chat 后再检查一次 signal
        if (signal?.aborted) {
          // 🆕 Day 08: run_summary 先于 error 发出（partial 累加）
          yield {
            kind: 'run_summary',
            totalPromptTokens,
            totalCompletionTokens,
            peakPromptTokens,
            iterations: iterationsCompleted,
          };
          yield { kind: 'error', message: 'aborted by signal' };
          return;
        }

        if (probe.content !== undefined) {
          // 🆕 Day 07: final-answer iter → 重调 stream() 流式 yield message_delta
          let accumulated = '';
          for await (const chunk of this.options.chat.stream(
            { messages: workingMessages },
            options,
          )) {
            // 流式过程中 signal 检查（每个 chunk 后）
            if (signal?.aborted) {
              // 🆕 Day 08: run_summary 先于 error 发出（partial 累加）
              yield {
                kind: 'run_summary',
                totalPromptTokens,
                totalCompletionTokens,
                peakPromptTokens,
                iterations: iterationsCompleted,
              };
              yield { kind: 'error', message: 'aborted by signal' };
              return;
            }
            if (chunk.content) {
              accumulated += chunk.content;
              yield { kind: 'message_delta', content: chunk.content };
            }
          }
          // 流式完成后，usage 用 probe 的（chat 探测时已拿到）
          response = {
            content: accumulated,
            ...(probe.usage !== undefined ? { usage: probe.usage } : {}),
          };
        } else {
          // tool_calls iter：不流式，直接用 probe
          response = probe;
        }
      } catch (err) {
        // 🆕 Day 07: error throw → yield（行为变更）
        // 🆕 Day 08: run_summary 先于 error 发出（partial 累加）
        yield {
          kind: 'run_summary',
          totalPromptTokens,
          totalCompletionTokens,
          peakPromptTokens,
          iterations: iterationsCompleted,
        };
        yield {
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        };
        return;
      }

      // 🆕 Day 08: 累积 usage（不论 success / error 路径都累加）
      if (response.usage !== undefined) {
        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;
      }
      iterationsCompleted = i + 1;

      // 把 LLM 响应也暴露出去（带 usage）
      const responseEvent: AgentEvent = {
        kind: 'response',
        iteration: i + 1,
        ...(response.content !== undefined ? { content: response.content } : {}),
        ...(response.toolCalls !== undefined ? { toolCalls: response.toolCalls } : {}),
        ...(response.usage !== undefined ? { usage: response.usage } : {}),
      };
      yield responseEvent;

      // 普通回复路径：返回 content
      if (response.content !== undefined) {
        // 🆕 Day 08: run_summary 先于 message_end 发出
        yield {
          kind: 'run_summary',
          totalPromptTokens,
          totalCompletionTokens,
          peakPromptTokens,
          iterations: iterationsCompleted,
        };
        yield { kind: 'message_end', content: response.content };
        yield { kind: 'done' };
        return;
      }

      // 工具调用路径
      if (response.toolCalls !== undefined && response.toolCalls.length > 0) {
        // assistant 决定调工具：把 tool_calls 写进历史
        workingMessages.push({
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

          workingMessages.push({
            role: 'tool',
            content: resultContent,
            toolCallId: tc.id,
          });
        }

        // 继续下一轮循环
        continue;
      }

      // 既没有 content 也没有 toolCalls：返回空字符串
      // 🆕 Day 08: run_summary 先于 message_end
      yield {
        kind: 'run_summary',
        totalPromptTokens,
        totalCompletionTokens,
        peakPromptTokens,
        iterations: iterationsCompleted,
      };
      yield { kind: 'message_end', content: '' };
      yield { kind: 'done' };
      return;
    }

    // 🆕 Day 07: maxIterations 超限 → yield error（不 throw）
    // 🆕 Day 08: error 之前 yield run_summary（partial 累加也给前端看）
    yield {
      kind: 'run_summary',
      totalPromptTokens,
      totalCompletionTokens,
      peakPromptTokens,
      iterations: iterationsCompleted,
    };
    yield {
      kind: 'error',
      message: `Agent loop exceeded ${maxIterations} iterations without final answer`,
    };
    return;
  }
}
