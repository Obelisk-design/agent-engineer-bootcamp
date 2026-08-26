/**
 * apps/web/src/lib/sse.ts
 *
 * fetch + ReadableStream 实现的 SSE 订阅（R8 ledger 纠偏，原 brief 用 EventSource
 * 但 EventSource 是 GET-only 不支持 body，无法承载 POST /api/ingest + JSON body 契约）。
 *
 * 设计要点：
 * - 支持 POST + JSON body + headers + AbortSignal（合并外部 + 内部 controller）
 * - 用 TextDecoder('utf-8') 流式解码 Uint8Array，按 `\n\n` 切事件块
 * - 每块解析 `event:` 取名、`data:` 取 JSON.parse → onEvent(name, data)
 * - 流结束（reader done）若未被外部 abort 则视为异常结束 → onError
 * - close() 触发内部 controller.abort() → fetch signal 取消 → reader 抛错 → cleanup
 */

export interface SseHandlers<T = unknown> {
  readonly onEvent: (name: string, data: T) => void;
  readonly onError?: (err: Error) => void;
  readonly onOpen?: () => void;
}

export interface SubscribeSseOptions<T = unknown> {
  readonly url: string;
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
  readonly handlers: SseHandlers<T>;
}

export interface SseHandle {
  close(): void;
}

export function subscribeSSE<T = unknown>(opts: SubscribeSseOptions<T>): SseHandle {
  const { url, method = 'POST', body, headers = {}, signal: externalSignal, handlers } = opts;

  // 内部 controller：用于 close() 主动 abort
  const internalController = new AbortController();
  // 合并外部 signal：任一触发即断流
  const onExternalAbort = (): void => {
    internalController.abort();
  };
  if (externalSignal !== undefined) {
    if (externalSignal.aborted) {
      internalController.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  // fire-and-forget 异步启动 fetch
  void startStream(url, method, body, headers, internalController.signal, handlers);

  return {
    close(): void {
      internalController.abort();
      if (externalSignal !== undefined) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

async function startStream<T>(
  url: string,
  method: 'GET' | 'POST',
  body: unknown,
  headers: Record<string, string>,
  signal: AbortSignal,
  handlers: SseHandlers<T>,
): Promise<void> {
  let opened = false;
  try {
    const init: RequestInit = { method, headers: { ...headers }, signal };
    if (method === 'POST' && body !== undefined) {
      init.headers = { ...init.headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      handlers.onError?.(new Error(`SSE HTTP error: ${String(res.status)}`));
      return;
    }
    if (res.body === null) {
      handlers.onError?.(new Error('SSE response has no body'));
      return;
    }

    opened = true;
    handlers.onOpen?.();

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // 流式读取直到 done 或 abort

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // 流自然结束：若 buffer 还有残余（无尾随 \n\n），按单块尝试解析一次
        if (buffer.trim().length > 0) {
          dispatchBlock(buffer, handlers);
        }
        // 已 onOpen 但流意外结束 → 通知错误；未 onOpen 说明早就挂了，不重复通知
        // （不抛错时也不强制报错，由 caller 自行判定 stream-ended vs 正常 done）
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      // 按 SSE 规范：事件以 \n\n 分隔
      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const block = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        dispatchBlock(block, handlers);
        sepIdx = buffer.indexOf('\n\n');
      }
    }
  } catch (err) {
    // abort 触发的 AbortError 不当成业务错误
    if (signal.aborted) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    handlers.onError?.(new Error(`SSE stream error: ${message}${opened ? '' : ' (before open)'}`));
  }
}

function dispatchBlock<T>(rawBlock: string, handlers: SseHandlers<T>): void {
  // 单个事件块由多行组成：`event: name\ndata: json\n`（data 可多行拼接）
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of rawBlock.split('\n')) {
    if (line.startsWith(':')) {
      // SSE 注释行（heartbeat），忽略
      continue;
    }
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
      continue;
    }
    // id: / retry: 等字段暂不消费（YAGNI：spec 未要求客户端断线重连）
  }

  if (dataLines.length === 0) {
    return;
  }
  const dataStr = dataLines.join('\n');

  let parsed: T;
  try {
    parsed = JSON.parse(dataStr) as T;
  } catch (e) {
    handlers.onError?.(new Error(`SSE parse error: ${(e as Error).message}`));
    return;
  }
  handlers.onEvent(eventName, parsed);
}
