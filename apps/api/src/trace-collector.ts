/**
 * apps/api/src/trace-collector.ts
 *
 * TraceCollector —— in-memory collector for AgentEvent streams.
 *
 * 设计原则（Day 06 可观测性阶段）：
 * - Runtime (libs/agent) 不知道 Trace 存在 —— Trace 是消费方关注的事
 * - Trace = { runId, startedAt, endedAt, events[], meta }
 *   - events[] 是事实快照（真相源），原样保存 AgentEvent
 *   - meta 是 Record<string, unknown>，预留扩展点（Token/Latency/Cost/Permission...）
 * - LRU 32：只保留最近 32 次执行 —— Day 06 in-memory 够用，Day 10+ 评估持久化
 *
 * 不做的事（YAGNI）：
 * - 持久化存储（Day 10+）
 * - Trace 查询 / 分页 / 过滤 API（Day 10+ Evaluation 阶段）
 * - Token/Latency/Cost 派生计算（Day 07+ 之后）
 * - 完整 LRU 算法（用 Map insertion order 简化：超 max 时删最早插入的）
 */

import type { AgentEvent } from '../../../libs/agent/index.js';

export interface AgentTrace {
  readonly runId: string;
  readonly startedAt: number;
  endedAt: number | undefined;
  events: AgentEvent[];
  meta: Record<string, unknown>;
}

const MAX_TRACES = 32;

export class TraceCollector {
  private readonly traces = new Map<string, AgentTrace>();

  /**
   * 开始一次新的执行，分配 runId 并创建空 trace。
   * 返回分配的 runId。
   */
  start(): string {
    const runId = crypto.randomUUID();
    this.evictIfFull();
    this.traces.set(runId, {
      runId,
      startedAt: Date.now(),
      endedAt: undefined,
      events: [],
      meta: {},
    });
    return runId;
  }

  /**
   * 推一个 event 进 trace。runId 必须已经 start() 过。
   */
  collect(runId: string, ev: AgentEvent): void {
    const trace = this.traces.get(runId);
    if (trace === undefined) {
      // 不 throw —— collect 是 best-effort，不能让 trace 问题打断主流程
      return;
    }
    trace.events.push(ev);
  }

  /**
   * 标记 runId 执行结束。记录 endedAt。
   */
  end(runId: string): void {
    const trace = this.traces.get(runId);
    if (trace === undefined) return;
    trace.endedAt = Date.now();
  }

  /**
   * 拿指定 runId 的 trace 快照。返回深拷贝防止消费方修改内部状态。
   */
  get(runId: string): AgentTrace | undefined {
    const trace = this.traces.get(runId);
    if (trace === undefined) return undefined;
    return {
      runId: trace.runId,
      startedAt: trace.startedAt,
      endedAt: trace.endedAt,
      events: [...trace.events],
      meta: { ...trace.meta },
    };
  }

  /**
   * 列出所有 trace，按 startedAt 倒序（最新在前）。
   * 返回浅拷贝的 events（每个 trace 是深拷贝）。
   */
  list(): AgentTrace[] {
    const sorted = Array.from(this.traces.values()).sort((a, b) => b.startedAt - a.startedAt);
    return sorted.map((t) => ({
      runId: t.runId,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      events: [...t.events],
      meta: { ...t.meta },
    }));
  }

  /**
   * 当前在内存里的 trace 数（用于测试 + 调试）。
   */
  size(): number {
    return this.traces.size;
  }

  /**
   * Map insertion order 保证最早插入的在第一个。
   * 超 MAX_TRACES 时删最早的。
   */
  private evictIfFull(): void {
    while (this.traces.size >= MAX_TRACES) {
      const oldest = this.traces.keys().next().value;
      if (oldest === undefined) break;
      this.traces.delete(oldest);
    }
  }
}
