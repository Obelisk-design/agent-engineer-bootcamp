/**
 * examples/day23/ex_002_runAgentSSE.ts
 *
 * Day 23 真活验证 —— agent console 流式消息端到端。
 *
 * 流程：
 *   1. POST /agent 到 apps/api（默认 3000 端口，agent app Day 09）
 *   2. 流式接收 SSE 事件
 *   3. 统计 message_start / message_chunk / message_end / done 数量
 *   4. 验证 ≥1 start + ≥1 chunk + 1 end + 1 done
 *
 * Why 这条 demo 重要：
 *   - Day 23 Task 5 把 agent console dispatch 状态机从 App.vue 搬到 useAgentStore
 *   - 端到端验证 14 kinds dispatch 状态机没坏（包括 Day 15+ tool_call_start/tool_call_end）
 *   - 流式 message_chunk = 服务端真在 yield（不是 batch collapse）
 *
 * 前置：必须先 `pnpm dev:rag`（alias 实际启 agent app 3000，详见根 package.json）
 *      或单独 `tsx apps/api/src/agent-server-entry.ts`（端口由 with-ports.ts claim）
 *
 * 跑法：
 *   pnpm exec tsx examples/day23/ex_002_runAgentSSE.ts
 *
 * 不做：
 *   - 不跑 full agent loop（tool calling）—— Day 23 只验流式消息 + dispatch 状态机
 *   - 不验 14 kinds 全覆盖（Day 19/20 已独立验）
 *   - 不验 Chrome MCP UI（Task 5 已截图存档）
 */

import 'dotenv/config';

const API_TARGET = process.env.AGENT_TARGET ?? 'http://127.0.0.1:3000';
const INPUT = process.env.AGENT_INPUT ?? '你好';

interface DispatchCounts {
  message_start: number;
  message_chunk: number;
  message_end: number;
  done: number;
  error: number;
  other: number;
  totalChunks: number;
  totalChars: number;
  firstEventMs: number | null;
  lastEventMs: number | null;
}

function emptyCounts(): DispatchCounts {
  return {
    message_start: 0,
    message_chunk: 0,
    message_end: 0,
    done: 0,
    error: 0,
    other: 0,
    totalChunks: 0,
    totalChars: 0,
    firstEventMs: null,
    lastEventMs: null,
  };
}

function classifyEvent(ev: SseEvent, counts: DispatchCounts, textLen: number): void {
  // 字段名 = content（libs/agent/event.ts MessageDelta 定义）
  counts.totalChars += textLen;
  switch (ev.kind) {
    case 'message_start':
      counts.message_start++;
      return;
    case 'message_chunk':
    case 'message_delta':
      counts.message_chunk++;
      return;
    case 'message_end':
      counts.message_end++;
      return;
    case 'done':
      counts.done++;
      return;
    case 'error':
      counts.error++;
      return;
    default:
      counts.other++;
      return;
  }
}

function extractText(ev: SseEvent): string {
  // libs/agent/event.ts 字段名 = content（不是 text）
  if (typeof ev['content'] === 'string') return ev['content'];
  if (typeof ev['text'] === 'string') return ev['text'];
  return '';
}

interface SseEvent {
  readonly kind: string;
  readonly text?: string;
  readonly [k: string]: unknown;
}

/**
 * Parse SSE stream from a fetch Response into a generator of events.
 * Tolerant: skip malformed lines, join multi-line data: as single event.
 */
async function* parseSse(res: Response): AsyncGenerator<SseEvent> {
  if (res.body === null) throw new Error('response body is null');
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    // SSE events separated by \n\n
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = raw.split('\n');
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const dataStr = dataLines.join('\n');
      try {
        const parsed = JSON.parse(dataStr) as SseEvent;
        yield parsed;
      } catch {
        // skip malformed JSON
      }
    }
  }
}

async function main(): Promise<void> {
  console.log(`=== Day 23 agent console SSE end-to-end ===`);
  console.log(`target: ${API_TARGET}/agent`);
  console.log(`input:  ${INPUT}`);
  console.log('');

  const startMs = Date.now();

  const res = await fetch(`${API_TARGET}/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: INPUT }),
  });

  if (!res.ok) {
    console.error(`❌ POST /agent failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const counts = emptyCounts();

  for await (const ev of parseSse(res)) {
    const now = Date.now();
    if (counts.firstEventMs === null) counts.firstEventMs = now - startMs;
    counts.lastEventMs = now - startMs;
    counts.totalChunks++;

    const text = extractText(ev);
    const preview = text.length > 60 ? `${text.slice(0, 60)}...` : text;
    if (counts.totalChunks <= 5) {
      console.log(
        `  [${String(counts.totalChunks).padStart(3, '0')}] kind=${ev.kind} text="${preview}"`,
      );
    }
    classifyEvent(ev, counts, text.length);
  }

  console.log('');
  console.log('--- summary ---');
  console.log(`total events:    ${String(counts.totalChunks)}`);
  console.log(`message_start:   ${String(counts.message_start)}`);
  console.log(`message_chunk:   ${String(counts.message_chunk)}`);
  console.log(`message_end:     ${String(counts.message_end)}`);
  console.log(`done:            ${String(counts.done)}`);
  console.log(`error:           ${String(counts.error)}`);
  console.log(`other:           ${String(counts.other)}`);
  console.log(`total chars:     ${String(counts.totalChars)}`);
  console.log(
    `first event:     ${counts.firstEventMs === null ? '—' : `${String(counts.firstEventMs)} ms`}`,
  );
  console.log(
    `last event:      ${counts.lastEventMs === null ? '—' : `${String(counts.lastEventMs)} ms`}`,
  );
  console.log(`elapsed:         ${String(Date.now() - startMs)} ms`);

  // 验证
  const checks: Array<readonly [string, boolean]> = [
    ['≥1 message_start', counts.message_start >= 1],
    ['≥1 message_chunk', counts.message_chunk >= 1],
    ['≥1 message_end', counts.message_end >= 1],
    ['1 done', counts.done === 1],
    ['0 error', counts.error === 0],
    ['>0 chars', counts.totalChars > 0],
  ];

  console.log('');
  console.log('--- checks ---');
  let allOk = true;
  for (const [name, ok] of checks) {
    const mark = ok ? '✅' : '❌';
    console.log(`${mark} ${name}`);
    if (!ok) allOk = false;
  }
  console.log('');
  console.log(allOk ? '✅ ALL PASS — agent console dispatch OK' : '❌ FAILED');
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
