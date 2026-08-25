/**
 * libs/notion/fetch.ts
 *
 * Thin wrapper around @notionhq/client with:
 *  - rate limit (default 350ms between calls ≈ 2.8 req/s)
 *  - 429 retry with backoff
 *  - 403/404 → ok=false result; never throw on permission errors
 *  - everything else → throw
 *
 * The module exports both production entry points (listAllPages,
 * fetchPageBlocks) and an injection seam `*WithClient` for testing.
 *
 * Per spec 7.3: errors never silent; each path either throws or marks a
 * doc unreachable.
 */

// NOTE: @notionhq/client is added to package.json in Task 7. This file
// only resolves at runtime after that lands. Tests use the
// fetchPageBlocksWithClient seam with a MinimalClient fake and never
// trigger this import.
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
    return e.code === 'rate_limited' || e.status === 429;
  }
  const anyE = e as { readonly status?: number; readonly code?: string } | null;
  return anyE?.status === 429 || anyE?.code === 'rate_limited';
}

async function notionCall<T>(
  fn: () => Promise<T>,
  opts: NotionFetchOptions,
): Promise<T> {
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
  const titleProp = (page['properties'] as Record<string, Record<string, unknown>> | undefined)?.['title'];
  if (titleProp && (titleProp['type'] as string | undefined) === 'title') {
    const arr = titleProp['title'] as readonly { readonly plain_text: string }[] | undefined;
    if (arr !== undefined) return arr.map((rt) => rt.plain_text).join('');
  }
  return (page['id'] as string | undefined) ?? 'untitled';
}

export async function* listAllPages(
  opts: NotionFetchOptions,
): AsyncIterableIterator<PageMeta> {
  const client = newClient(opts.auth);
  let cursor: string | undefined = undefined;
  while (true) {
    const res = await notionCall(() => client.search({
      filter: { property: 'object', value: 'page' },
      page_size: 100,
      ...(cursor !== undefined ? { start_cursor: cursor } : {}),
    }), opts);

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
      const res = await notionCall(() => client.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        ...(cursor !== undefined ? { start_cursor: cursor } : {}),
      }), opts);
      for (const b of res.results) blocks.push(b);
      if (!res.has_more) break;
      if (res.next_cursor === null) break;
      cursor = res.next_cursor ?? undefined;
    }
    return { ok: true, blocks };
  } catch (e) {
    if (isNotionClientError(e)) {
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
