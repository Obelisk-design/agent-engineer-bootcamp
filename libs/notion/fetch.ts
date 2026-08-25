/**
 * libs/notion/fetch.ts
 *
 * @notionhq/client 的薄封装，负责：
 *  - 限速（默认两次调用间隔 350ms ≈ 2.8 req/s）
 *  - 429 退避重试
 *  - 403/404 → ok=false 的结果；权限错误永远不抛
 *  - 其他错误 → 抛出
 *
 * 模块同时导出生产入口（listAllPages、fetchPageBlocks）和用于测试的注入接缝 `*WithClient`。
 *
 * 按 spec §7.3：错误绝不能静默；每条路径要么抛出、要么把文档标记为不可达。
 */

// NOTE: @notionhq/client 在 Task 7 加入 package.json 之后，本文件才会在运行时被解析。
// 测试通过 fetchPageBlocksWithClient 接缝 + MinimalClient fake 触发，永远不会真正 import 这个 SDK。
import { Client, isNotionClientError } from '@notionhq/client';

export interface NotionFetchOptions {
  readonly auth: string;
  readonly rateLimitMs?: number;
  readonly maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(e: unknown): boolean {
  if (isNotionClientError(e)) {
    if (e.code === 'rate_limited') return true;
    // HTTPResponseError 的子类（UnknownHTTPResponseError、APIResponseError）
    // 带 `.status` 字段；RequestTimeoutError 没有。用 `in` 来窄化类型。
    return 'status' in e && e.status === 429;
  }
  const anyE = e as { readonly status?: number; readonly code?: string } | null;
  return anyE?.status === 429 || anyE?.code === 'rate_limited';
}

async function notionCall<T>(fn: () => Promise<T>, opts: NotionFetchOptions): Promise<T> {
  let attempts = 0;
  const max = opts.maxRetries ?? 3;
  while (true) {
    try {
      const out = await fn();
      if (opts.rateLimitMs !== undefined && opts.rateLimitMs > 0) {
        await sleep(opts.rateLimitMs);
      }
      return out;
    } catch (e) {
      if (isRateLimited(e) && attempts < max) {
        attempts += 1;
        await sleep(2000 * attempts);
        continue;
      }
      throw e;
    }
  }
}

export interface MinimalClient {
  readonly search: (args: Record<string, unknown>) => Promise<{
    readonly results: readonly Record<string, unknown>[];
    readonly has_more: boolean;
    readonly next_cursor: string | null;
  }>;
  readonly blocks: {
    readonly children: {
      readonly list: (args: Record<string, unknown>) => Promise<{
        readonly results: readonly Record<string, unknown>[];
        readonly has_more: boolean;
        readonly next_cursor: string | null;
      }>;
    };
  };
  readonly pages: {
    readonly retrieve: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
}

function newClient(auth: string): MinimalClient {
  return new Client({ auth }) as unknown as MinimalClient;
}

export interface PageMeta {
  readonly pageId: string;
  readonly lastEditedMs: number;
  readonly lastEditedIso: string;
  readonly sourceLabel: string;
}

function buildSourceLabel(page: Record<string, unknown>): string {
  const titleProp = (page['properties'] as Record<string, Record<string, unknown>> | undefined)?.[
    'title'
  ];
  if (titleProp && (titleProp['type'] as string | undefined) === 'title') {
    const arr = titleProp['title'] as readonly { readonly plain_text: string }[] | undefined;
    if (arr !== undefined) return arr.map((rt) => rt.plain_text).join('');
  }
  return (page['id'] as string | undefined) ?? 'untitled';
}

export async function* listAllPages(opts: NotionFetchOptions): AsyncIterableIterator<PageMeta> {
  const client = newClient(opts.auth);
  let cursor: string | undefined = undefined;
  while (true) {
    const res = await notionCall(
      () =>
        client.search({
          filter: { property: 'object', value: 'page' },
          page_size: 100,
          ...(cursor !== undefined ? { start_cursor: cursor } : {}),
        }),
      opts,
    );

    for (const p of res.results) {
      if (p['object'] !== 'page') continue;
      const id = p['id'] as string;
      const lastEditedTime = (p['last_edited_time'] as string | undefined) ?? '';
      yield {
        pageId: id.replace(/-/g, ''),
        lastEditedMs: lastEditedTime.length === 0 ? 0 : Date.parse(lastEditedTime),
        lastEditedIso: lastEditedTime,
        sourceLabel: buildSourceLabel(p),
      };
    }

    if (!res.has_more) break;
    if (res.next_cursor === null) break;
    cursor = res.next_cursor ?? undefined;
  }
}

export type FetchPageResult =
  | { readonly ok: true; readonly blocks: readonly Record<string, unknown>[] }
  | { readonly ok: false; readonly reason: 'rate_limited' | 'forbidden' | 'not_found' };

export async function fetchPageBlocksWithClient(
  pageId: string,
  client: MinimalClient,
  opts: NotionFetchOptions,
): Promise<FetchPageResult> {
  const blocks: Record<string, unknown>[] = [];
  let cursor: string | undefined = undefined;
  try {
    while (true) {
      const res = await notionCall(
        () =>
          client.blocks.children.list({
            block_id: pageId,
            page_size: 100,
            ...(cursor !== undefined ? { start_cursor: cursor } : {}),
          }),
        opts,
      );
      for (const b of res.results) blocks.push(b);
      if (!res.has_more) break;
      if (res.next_cursor === null) break;
      cursor = res.next_cursor ?? undefined;
    }
    return { ok: true, blocks };
  } catch (e) {
    if (isNotionClientError(e) && 'status' in e) {
      if (e.status === 403) return { ok: false, reason: 'forbidden' };
      if (e.status === 404) return { ok: false, reason: 'not_found' };
    }
    const anyE = e as { readonly status?: number; readonly code?: string } | null;
    if (anyE?.status === 403) return { ok: false, reason: 'forbidden' };
    if (anyE?.status === 404) return { ok: false, reason: 'not_found' };
    // Rate-limit exhaustion: notionCall already retried up to maxRetries; surface as throw.
    if (isRateLimited(e)) throw e;
    throw e;
  }
}

export async function fetchPageBlocks(
  pageId: string,
  opts: NotionFetchOptions,
): Promise<FetchPageResult> {
  return fetchPageBlocksWithClient(pageId, newClient(opts.auth), opts);
}

/**
 * 按 pageId 获取单个页面的元信息（用于 child_page 递归时，
 * 该页面未被 listAllPages 枚举到的场景）。返回与 listAllPages 相同的 PageMeta 结构。
 *
 * 同时接受带连字符（8-4-4-4-12）和不带连字符的 32 位 UUID。
 * 输出的 pageId 会被规范化成 32 位不带连字符的形式，以便和
 * listAllPages 及 orchestrator 的 visited Set 保持一致。
 */
export async function getPageMeta(pageId: string, opts: NotionFetchOptions): Promise<PageMeta> {
  return getPageMetaWithClient(pageId, newClient(opts.auth), opts);
}

export async function getPageMetaWithClient(
  pageId: string,
  client: MinimalClient,
  opts: NotionFetchOptions,
): Promise<PageMeta> {
  // 必要时重新补上连字符（Notion SDK 期望 8-4-4-4-12 格式）。
  const hyphenId =
    pageId.length === 32 && !pageId.includes('-')
      ? `${pageId.slice(0, 8)}-${pageId.slice(8, 12)}-${pageId.slice(12, 16)}-${pageId.slice(16, 20)}-${pageId.slice(20)}`
      : pageId;
  const page = await notionCall(() => client.pages.retrieve({ page_id: hyphenId }), opts);
  const lastEditedTime = (page['last_edited_time'] as string | undefined) ?? '';
  return {
    pageId: ((page['id'] as string) ?? pageId).replace(/-/g, ''),
    lastEditedMs: lastEditedTime.length === 0 ? 0 : Date.parse(lastEditedTime),
    lastEditedIso: lastEditedTime,
    sourceLabel: buildSourceLabel(page),
  };
}
