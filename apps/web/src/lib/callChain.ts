import type { AgentEvent } from '../../../../libs/agent/index.js';

export interface CallChainStep {
  readonly label: string;
  readonly detail: string | null;
  readonly kind: 'info' | 'tool' | 'error';
}

export function buildCallChain(events: ReadonlyArray<AgentEvent>): CallChainStep[] {
  const steps: CallChainStep[] = [];

  events.forEach((ev) => {
    switch (ev.kind) {
      case 'message_start':
        steps.push({ label: '接收任务', detail: 'Agent 已收到输入并开始执行。', kind: 'info' });
        break;
      case 'iteration':
        steps.push({
          label: `迭代 ${String(ev.n)}`,
          detail: `第 ${String(ev.n)} 轮循环开始。`,
          kind: 'info',
        });
        break;
      case 'request':
        steps.push({
          label: 'LLM 请求',
          detail: `第 ${String(ev.iteration)} 轮请求已组装。`,
          kind: 'info',
        });
        break;
      case 'response':
        if (ev.toolCalls !== undefined && ev.toolCalls.length > 0) {
          steps.push({
            label: 'LLM 响应',
            detail: `工具调用计划已生成：${ev.toolCalls.map((tool) => tool.toolName).join(', ')}`,
            kind: 'info',
          });
        } else {
          steps.push({ label: 'LLM 响应', detail: ev.content ?? '模型已返回答案。', kind: 'info' });
        }
        break;
      case 'tool_call':
        steps.push({ label: `工具调用 ${ev.name}`, detail: JSON.stringify(ev.args), kind: 'tool' });
        break;
      case 'tool_result':
        steps.push({ label: `工具返回 ${ev.name}`, detail: ev.output, kind: 'tool' });
        break;
      case 'message_delta':
        steps.push({ label: '生成文本', detail: ev.content, kind: 'info' });
        break;
      case 'message_end':
        steps.push({ label: '生成答案', detail: ev.content, kind: 'info' });
        break;
      case 'done':
        steps.push({ label: '完成', detail: '执行链路已收尾。', kind: 'info' });
        break;
      case 'error':
        steps.push({ label: '错误', detail: ev.message, kind: 'error' });
        break;
      default:
        break;
    }
  });

  return steps;
}
