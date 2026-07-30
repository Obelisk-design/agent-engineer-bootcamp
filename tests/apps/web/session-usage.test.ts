/**
 * tests/apps/web/session-usage.test.ts
 *
 * Day 09+ session 跨 turn token 累加器单测。
 *
 * 覆盖：
 * - emptySessionUsage 初始值全 0
 * - accumulateFromResponse 累加 in/out，不改 peak
 * - accumulateFromResponse 收到 undefined usage → 不变
 * - accumulateFromRunSummary 跨 turn Math.max peak
 * - 多 turn 累加语义：turn 1 response + run_summary → turn 2 response + run_summary
 *   验证 in/out sum 正确, peak 取整个 session 最大值
 */

import { describe, expect, it } from 'vitest';

import {
  accumulateFromResponse,
  accumulateFromRunSummary,
  emptySessionUsage,
  type SessionUsage,
} from '../../../apps/web/src/lib/sessionUsage.js';

describe('emptySessionUsage', () => {
  it('starts at zero for all fields', () => {
    expect(emptySessionUsage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      peakPromptTokens: 0,
    });
  });
});

describe('accumulateFromResponse', () => {
  it('accumulates in/out and keeps peak unchanged', () => {
    const prev: SessionUsage = { promptTokens: 100, completionTokens: 50, peakPromptTokens: 80 };
    const next = accumulateFromResponse(prev, { promptTokens: 200, completionTokens: 75 });
    expect(next).toEqual({
      promptTokens: 300,
      completionTokens: 125,
      peakPromptTokens: 80, // 不改
    });
  });

  it('returns prev unchanged when usage is undefined', () => {
    const prev: SessionUsage = { promptTokens: 100, completionTokens: 50, peakPromptTokens: 80 };
    const next = accumulateFromResponse(prev, undefined);
    expect(next).toBe(prev); // 引用相等 = 没变
  });

  it('handles start-from-zero correctly', () => {
    const next = accumulateFromResponse(emptySessionUsage, {
      promptTokens: 10,
      completionTokens: 5,
    });
    expect(next).toEqual({ promptTokens: 10, completionTokens: 5, peakPromptTokens: 0 });
  });
});

describe('accumulateFromRunSummary', () => {
  it('takes the max across turns (this turn bigger)', () => {
    const prev: SessionUsage = { promptTokens: 500, completionTokens: 200, peakPromptTokens: 80 };
    const next = accumulateFromRunSummary(prev, 200);
    expect(next.peakPromptTokens).toBe(200);
    expect(next.promptTokens).toBe(500); // 不改
    expect(next.completionTokens).toBe(200);
  });

  it('keeps previous peak when this turn is smaller', () => {
    const prev: SessionUsage = { promptTokens: 500, completionTokens: 200, peakPromptTokens: 300 };
    const next = accumulateFromRunSummary(prev, 50);
    expect(next.peakPromptTokens).toBe(300);
  });
});

describe('multi-turn accumulation (反例：跨 turn sessionUsage)', () => {
  it('accumulates in/out across 3 turns, peak is session max', () => {
    let s: SessionUsage = emptySessionUsage;

    // turn 1: 一次 chat 调用，prompt 100 / completion 50, peak 80
    s = accumulateFromResponse(s, { promptTokens: 100, completionTokens: 50 });
    s = accumulateFromRunSummary(s, 80);

    // turn 2: 一次 chat 调用，prompt 200 / completion 100, peak 250 (比 turn 1 大)
    s = accumulateFromResponse(s, { promptTokens: 200, completionTokens: 100 });
    s = accumulateFromRunSummary(s, 250);

    // turn 3: 一次 chat 调用，prompt 50 / completion 25, peak 30 (比 session 小)
    s = accumulateFromResponse(s, { promptTokens: 50, completionTokens: 25 });
    s = accumulateFromRunSummary(s, 30);

    // in/out 累加 = 100+200+50 / 50+100+25
    expect(s.promptTokens).toBe(350);
    expect(s.completionTokens).toBe(175);
    // peak 取 session 内最大 = 250 (turn 2)
    expect(s.peakPromptTokens).toBe(250);
  });

  it('multi-iteration within a turn: each response accumulates, peak only set on run_summary', () => {
    let s: SessionUsage = emptySessionUsage;

    // turn 内 3 次 LLM 调用 (e.g. tool_calls iter x2 + final answer iter)
    s = accumulateFromResponse(s, { promptTokens: 30, completionTokens: 10 });
    s = accumulateFromResponse(s, { promptTokens: 40, completionTokens: 15 });
    s = accumulateFromResponse(s, { promptTokens: 50, completionTokens: 20 });

    // turn 结束
    s = accumulateFromRunSummary(s, 50);

    // in/out: 30+40+50 / 10+15+20
    expect(s.promptTokens).toBe(120);
    expect(s.completionTokens).toBe(45);
    // peak: 本 turn 50, 之前 0 → 50
    expect(s.peakPromptTokens).toBe(50);
  });
});
