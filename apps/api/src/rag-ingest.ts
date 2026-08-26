/**
 * apps/api/src/rag-ingest.ts
 *
 * POST /api/ingest SSE handler。
 *
 * 流程：
 *   1. zod parse body
 *   2. streamSSE 包装：
 *      - abortController + 监听 request.signal
 *      - spawnMain 跑 examples/<ns>_import/main.ts
 *      - phase 行 → writeSSE({event:'phase', data})
 *      - 子进程 exit 0 → writeSSE({event:'done', data})
 *      - 子进程 exit ≠ 0 / 超时 → writeSSE({event:'error', data})
 */

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  IngestRequest,
  type PhaseEvent,
  type DoneEvent,
  type ErrorEvent,
  ApiError,
} from '@bootcamp/api-schema';
import { spawnMain } from './spawn-main.js';

export async function ragIngestHandler(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = IngestRequest.safeParse(body);
  if (!parsed.success) {
    return c.json(
      ApiError.parse({
        error: parsed.error.message,
        code: 'bad_request',
        details: { issues: parsed.error.issues },
      }),
      400,
    );
  }
  const { namespace, dryRun } = parsed.data;

  const abortController = new AbortController();
  c.req.raw.signal.addEventListener('abort', () => abortController.abort());

  const start = Date.now();
  let added = 0;
  let modified = 0;
  let removed = 0;

  return streamSSE(c, async (stream) => {
    const result = await spawnMain({
      namespace,
      dryRun,
      signal: abortController.signal,
      onPhase: async (ev: PhaseEvent) => {
        // 从 diff phase 提取 added/modified/removed
        if (ev.name === 'diff') {
          added = Number(ev.payload['added'] ?? 0);
          modified = Number(ev.payload['modified'] ?? 0);
          removed = Number(ev.payload['removed'] ?? 0);
        }
        await stream.writeSSE({
          event: 'phase',
          data: JSON.stringify(ev),
        });
      },
      onStderr: async (chunk) => {
        // stderr 单独写一条 event 供前端调试
        await stream.writeSSE({
          event: 'stderr',
          data: JSON.stringify({ chunk }),
        });
      },
    });

    if (result.exitCode === 0) {
      const done: DoneEvent = {
        namespace,
        dryRun,
        added,
        modified,
        removed,
        totalMs: Date.now() - start,
      };
      await stream.writeSSE({ event: 'done', data: JSON.stringify(done) });
    } else {
      const err: ErrorEvent = {
        message: result.timedOut
          ? 'ingest timeout after 5min'
          : result.aborted
            ? 'client disconnected'
            : `child exit ${result.exitCode}`,
        exitCode: result.exitCode,
        stderrTail: result.stderrTail || undefined,
      };
      await stream.writeSSE({ event: 'error', data: JSON.stringify(err) });
    }
  });
}
