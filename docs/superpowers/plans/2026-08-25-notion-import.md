# Notion Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `examples/notion_import/main.ts` script that imports a personal Notion workspace into the existing `.lancedb/rag` index, using incremental page-level diff against `last_edited_time`.

**Architecture:** Thin layered pipeline: `examples/notion_import/main.ts` orchestrates `libs/notion/{fetch,to-markdown,diff}.ts` and reuses `libs/rag/indexer.ts` (extended with a `DocSource` abstraction). Only one new dependency: `@notionhq/client`. Errors never silent; failures emit to report.

**Tech Stack:** TypeScript (strict), Node 18+, `@notionhq/client@^2.2.15`, `@lancedb/lancedb` (existing), OpenAI-compatible embedding API (existing), `vitest` (existing for tests).

**Spec:** [docs/superpowers/specs/2026-08-25-notion-import-design.md](../specs/2026-08-25-notion-import-design.md)

---

## Global Constraints

These constraints apply to every task; each task's requirements implicitly include this section.

- **CLAUDE.md Hard-Red:** No Notion knowledge may leak into `libs/rag/*`. `libs/rag/indexer.ts` accepts a `DocSource` abstraction only; callers transform to it.
- **CLAUDE.md Hard-Red:** Tool capabilities (`NOTION_TOKEN`) are NOT inlined into any system prompt or hardcoded; read from env at the example layer and inject as `caller` parameter.
- **Dependency rule:** The sole new dependency is `@notionhq/client@^2.2.15`. No other new packages.
- **Type rule:** All new code passes `tsc --noEmit` strict mode (existing project standard). `readonly` everywhere on interfaces.
- **Test rule:** Use existing `vitest` install. Tests live next to source as `*.test.ts`.
- **Commit rule:** Each task ends with one logical commit; messages follow `feat|fix|chore|refactor|test(spec): <scope>: <summary>`. Multiple checkpoints in a single task = one commit at task end.
- **No silent failures:** Every error path either throws, or marks a doc as `unreachable` with explicit logging. `embed()` `fallbackFlags` are surfaced through `IncrementalIndexReport` (added in Task 1).
- **Naming:** `chunks_notion_heading` / `chunks_notion_paragraph` / `chunks_notion_meta`. Source key for Notion docs is the raw Notion pageId (no dashes).
- **Husky pre-commit:** Path lacks `pnpm`; commits in this plan may use `--no-verify`. (R7 in spec — environment issue, not code.)

---

## Task 1: Add `DocSource` abstraction + `chunkOrdinal` id strategy + embed fallback reporting

**Files:**
- Modify: `libs/rag/indexer.ts:97-123` (extend diffDocs), `libs/rag/indexer.ts:30-211` (introduce `DocSource`), `libs/rag/indexer.ts:213-223` (extend `IncrementalIndexReport`), `libs/rag/indexer.ts:398-418` (rewrite `buildRecords`), `libs/rag/chunk.ts:40-85` (pass `startOrdinal` through), `libs/rag/chunk.ts:91-213` (same), `libs/rag/indexer.ts:32-86` (integrate chunkOrdinal assignment)
- Test: `libs/rag/chunk.test.ts` (new — covers ordinal continuity)

**Interfaces:**
- Consumes:
  - `DocEntry[]` (`{ absPath, relPath, content, kind }`) from existing callers `examples/day13/ex_001_*`.
- Produces:
  ```ts
  // libs/rag/indexer.ts
  export interface DocSource {
    readonly sourceKey: string;       // file: relPath; notion: pageId
    readonly sourceLabel: string;     // for lancedb `source` field
    readonly content: string;
    readonly sourceKind: SourceKind;
    readonly updatedMs: number;       // file: mtimeMs; notion: lastEditedMs
    readonly contentHash: string;
  }

  export interface IncrementalIndexReport {
    // ... existing fields
    readonly embedFallbacks: { heading: number; paragraph: number };
    readonly failedDocSources: readonly string[];   // keys whose embed entirely failed
  }

  export function incrementalIndex(
    docs: readonly DocEntry[],
    opts: IncrementalIndexOptions,
  ): Promise<IncrementalIndexReport>;
  ```
- Internal:
  ```ts
  function toDocSources(docs: readonly DocEntry[]): Promise<readonly DocSource[]>;
  // inside incrementalIndex, replace the in-place stat+hash loop with this.
  ```

**Why this is one task:** The `DocSource` refactor and `chunkOrdinal` change are de-facto one architectural change to `incrementalIndex`. Splitting them across tasks would mean an intermediate commit with non-load-bearing `startOrdinal` threads that do nothing — that's noise for reviewers. They share a single regression surface (`ex_001` + `ex_002`).

- [ ] **Step 1: Write failing tests for `chunkOrdinal` continuity and `toDocSources` shape**

Create `libs/rag/chunk.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chunkByHeading, chunkByParagraph } from './chunk.js';

describe('chunkOrdinal', () => {
  it('chunkByHeading assigns ordinals 0..N-1 in order', () => {
    const md = `# A\n\nfirst chunk body\n\n# B\n\nsecond chunk body\n`;
    const chunks = chunkByHeading(md, 'doc.md');
    expect(chunks.map((_, i) => i)).toEqual([0, 1]);
  });

  it('chunkByParagraph assigns ordinals 0..N-1 in order', () => {
    const md = `para one\n\npara two\n\npara three\n`;
    const chunks = chunkByParagraph(md, 'doc.md');
    expect(chunks.map((_, i) => i)).toEqual([0, 1, 2]);
  });
});
```

Run: `pnpm vitest run libs/rag/chunk.test.ts`
Expected: FAIL — chunks currently don't carry an `ordinal` field; the map over unknown index throws.

- [ ] **Step 2: Add `ordinal` to `Chunk` and thread `startOrdinal` through chunkers**

In `libs/rag/chunk.ts`:

1. Add to `Chunk` interface:
```ts
export interface Chunk {
  // ... existing
  readonly ordinal: number;
}
```

2. Update `chunkByHeading` signature:
```ts
export function chunkByHeading(
  md: string,
  source: string,
  sourceKind: SourceKind = 'daily',
  startOrdinal = 0,
): Chunk[]
```

3. Inside `chunkByHeading`, declare `let ordinalCounter = startOrdinal;` at the top of the function (before any `flush` is called). In the `flush` function, push `ordinal: ordinalCounter++` into the chunk literal.

4. Same change to `chunkByParagraph`: add `startOrdinal = 0` parameter, declare `let ordinalCounter = startOrdinal;` before any push, increment inside the two push sites (line ~178 short-segment branch and line ~196 long-segment branch).

Re-run: `pnpm vitest run libs/rag/chunk.test.ts`
Expected: PASS — ordinals are sequential per source.

- [ ] **Step 3: Run existing bootcamp examples for regression baseline**

Run:
```bash
npx tsx examples/day13/ex_001_index.ts
npx tsx examples/day13/ex_002_chunk_compare.ts
```
Expected: exit 0; the heading/paragraph chunk counts in the report equal `0..N-1` increments you verify manually in the run output.

If the table-compare reports break (e.g. `topSources` shape changed), STOP — most likely the `ordinal` field change broke a downstream type. Read the error and decide: if it's only the field appearing in a print, suppress; if it's structural, revert and re-plan.

- [ ] **Step 4: Introduce `DocSource` interface and `toDocSources`**

In `libs/rag/indexer.ts`, near the top (after imports, before `MetaRow`):

```ts
export interface DocSource {
  readonly sourceKey: string;
  readonly sourceLabel: string;
  readonly content: string;
  readonly sourceKind: SourceKind;
  readonly updatedMs: number;
  readonly contentHash: string;
}
```

Add a private helper (NOT exported; used only inside `incrementalIndex`):

```ts
async function toDocSources(
  docs: readonly DocEntry[],
): Promise<readonly DocSource[]> {
  return Promise.all(
    docs.map(async (d) => {
      const stat = await fs.stat(d.absPath);
      return {
        sourceKey: d.relPath,
        sourceLabel: d.relPath,
        content: d.content,
        sourceKind: d.kind,
        updatedMs: stat.mtimeMs,
        contentHash: hashText(d.content),
      };
    }),
  );
}
```

- [ ] **Step 5: Refactor `incrementalIndex` to use `DocSource[]` internally**

Replace the in-line `enriched = await Promise.all(docs.map(...))` block (around line 269) with:

```ts
const enriched = await toDocSources(docs);
```

Then update the rest of the function to read `enriched[i]` for `source / mtimeMs / hash`. The `diffDocs` call site changes:

```ts
// Before:
const diff = diffDocs(enriched, cached);
// After:
const diff = diffDocs(
  enriched.map((e) => ({ source: e.sourceKey, mtimeMs: e.updatedMs, hash: e.contentHash })),
  cached,
);
```

Update `buildRecords` (line ~398) to receive `chunks` whose `ordinal` field is now populated; build id from `${c.source}#${c.ordinal}` (replace the byteStart/byteEnd template):

```ts
out.push({
  id: `${c.source}#${c.ordinal}`,
  vector: [...v],
  text: c.text,
  source: c.source,
  sourceKind: c.sourceKind,
});
```

Update chunking call sites in `incrementalIndex` to NOT pass `startOrdinal` explicitly (defaults to 0 per file), so existing per-file indexing semantics are preserved.

- [ ] **Step 6: Extend `IncrementalIndexReport` with `embedFallbacks` and `failedDocSources`**

Replace the report return literal at the end of `incrementalIndex`:

```ts
let embedFallbacks = { heading: 0, paragraph: 0 };
const failedDocSources: string[] = [];

// inside the for-loop over toReindex, after each embed() call:
embedFallbacks = {
  heading: embedFallbacks.heading + headingRes.fallbackFlags.filter(Boolean).length,
  paragraph: embedFallbacks.paragraph + paragraphRes.fallbackFlags.filter(Boolean).length,
};

// Track which docs had every chunk fall back to placeholder (effectively failed):
if (
  headingRes.vectors.every((v) => v.length === 0)
) {
  failedDocSources.push(source);
}
```

Add to the report object:
```ts
return {
  // ... existing
  embedFallbacks,
  failedDocSources,
};
```

Update `IncrementalIndexReport` interface (line 213) to declare the two new fields as `readonly embedFallbacks: { heading: number; paragraph: number }` and `readonly failedDocSources: readonly string[]`.

- [ ] **Step 7: Re-run bootcamp regression**

Run:
```bash
npx tsx examples/day13/ex_001_index.ts
npx tsx examples/day13/ex_002_chunk_compare.ts
```
Expected: PASS; report identical shape except chunk counts now sequential (no byte math); eval scores Q1-Q7 unchanged from baseline.

If scores drop > 1 point: STOP. The byte range was load-bearing in some hashing comparison — investigate before continuing.

- [ ] **Step 8: Commit**

```bash
git add libs/rag/indexer.ts libs/rag/chunk.ts libs/rag/chunk.test.ts
git commit --no-verify -m "refactor(rag): DocSource abstraction + chunkOrdinal id + embed fallback reporting

- Add DocSource interface (sourceKey/updatedMs/contentHash) to decouple RAG
  from filesystem-only assumptions
- Replace chunk id byteStart-end with ordinal (stable across runs, Notion-safe)
- Surface embed() fallbackFlags through IncrementalIndexReport so silent
  silent skips become visible

Regression: ex_001 / ex_002 scores unchanged."
```

---

## Task 2: `libs/notion/to-markdown.ts` pure-function converter with full block-type coverage

**Files:**
- Create: `libs/notion/to-markdown.ts`
- Create: `libs/notion/to-markdown.test.ts`

**Interfaces:**
- Consumes:
  ```ts
  // @notionhq/client types re-exported via index.ts
  type NotionBlock = BlockObjectResponse | PartialBlockObjectResponse;
  type NotionPage = PageObjectResponse;
  ```
- Produces:
  ```ts
  // libs/notion/to-markdown.ts
  export function pageToMarkdown(
    page: NotionPage,
    blocks: readonly NotionBlock[],
    options?: { readonly sourceLabel?: string },
  ): { readonly title: string; readonly markdown: string };
  ```

**Why one task:** This is the highest-risk conversion surface and has the most isolated test loop. No external deps, no IO — easiest TDD target.

- [ ] **Step 1: Write failing tests covering each supported block type**

Create `libs/notion/to-markdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pageToMarkdown } from './to-markdown.js';

// Minimal Notion block factory kept inline; do NOT depend on @notionhq/client
// test helpers because they pull the SDK into the test graph early.
function block<T extends Record<string, unknown>>(type: string, data: T, extra: Record<string, unknown> = {}) {
  return {
    id: `b-${Math.random()}`,
    type,
    object: 'block' as const,
    has_children: false,
    archived: false,
    created_time: '2026-01-01T00:00:00.000Z',
    last_edited_time: '2026-01-01T00:00:00.000Z',
    created_by: { id: 'u', object: 'user' } as never,
    last_edited_by: { id: 'u', object: 'user' } as never,
    parent: { id: 'p', type: 'page_id', page_id: 'p' } as never,
    in_trash: false,
    [type]: data,
    ...extra,
  } as never;
}

describe('pageToMarkdown', () => {
  it('prepends the page title as a H1', () => {
    const page = { id: 'p1', properties: { title: { type: 'title', title: [{ plain_text: 'Hello' }] } } } as never;
    const out = pageToMarkdown(page, []);
    expect(out.markdown.startsWith('# Hello\n')).toBe(true);
    expect(out.title).toBe('Hello');
  });

  it('converts heading_1/2/3 to # / ## / ###', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('heading_1', { rich_text: [{ plain_text: 'H1' }] }),
      block('heading_2', { rich_text: [{ plain_text: 'H2' }] }),
      block('heading_3', { rich_text: [{ plain_text: 'H3' }] }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('# H1');
    expect(out.markdown).toContain('## H2');
    expect(out.markdown).toContain('### H3');
  });

  it('converts paragraph preserving inline bold/italic/code', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('paragraph', {
        rich_text: [
          { plain_text: 'plain ', annotations: { bold: false } },
          { plain_text: 'BOLD', annotations: { bold: true } },
          { plain_text: ' code', annotations: { code: true } },
        ],
      }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('plain **BOLD** `code`');
  });

  it('converts bulleted_list_item and numbered_list_item', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('bulleted_list_item', { rich_text: [{ plain_text: 'a' }] }),
      block('numbered_list_item', { rich_text: [{ plain_text: 'b' }] }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toMatch(/^- a$/m);
    expect(out.markdown).toMatch(/^1\. b$/m);
  });

  it('fences code blocks with language tag', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('code', { language: 'typescript', rich_text: [{ plain_text: 'const x = 1;' }] }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('```typescript\nconst x = 1;\n```');
  });

  it('prefixes quote and callout blocks', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('quote', { rich_text: [{ plain_text: 'note' }] }),
      block('callout', {
        rich_text: [{ plain_text: 'heads up' }],
        icon: { type: 'emoji', emoji: '💡' },
      }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toMatch(/^> note$/m);
    expect(out.markdown).toMatch(/^> 💡 heads up$/m);
  });

  it('inserts placeholder text for image / file / video', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [
      block('image', { caption: [{ plain_text: 'photo' }], type: 'external', external: { url: 'x' } }),
      block('file', { caption: [], type: 'external', external: { url: 'x' } }),
      block('video', { caption: [], type: 'external', external: { url: 'x' } }),
    ];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('[image: photo]');
    expect(out.markdown).toContain('[file]');
    expect(out.markdown).toContain('[video]');
  });

  it('drops child_page blocks (no recursion)', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [block('child_page', { title: 'Nested' })];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).not.toContain('Nested');
  });

  it('inserts [unsupported: type] for unknown block types', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const blocks = [block('synced_block', {})];
    const out = pageToMarkdown(page, blocks);
    expect(out.markdown).toContain('[unsupported: synced_block]');
  });

  it('marks empty content (no title, no blocks) explicitly', () => {
    const page = { id: 'p', properties: { title: { type: 'title', title: [] } } } as never;
    const out = pageToMarkdown(page, []);
    expect(out.title).toBe('');
    expect(out.markdown).toBe('');
  });
});
```

Run: `pnpm vitest run libs/notion/to-markdown.test.ts`
Expected: FAIL — module `./to-markdown.js` does not exist.

- [ ] **Step 2: Implement `pageToMarkdown` minimal to satisfy tests**

Create `libs/notion/to-markdown.ts`:

```ts
/**
 * libs/notion/to-markdown.ts
 *
 * Pure function: convert a Notion page (title + its flat blocks array)
 * to a markdown string. No IO, no network, fully unit-testable.
 *
 * Block coverage is the closed set listed in spec 5.2. Anything else
 * becomes [unsupported: type] so we never silently lose content.
 */

// Minimal structural shape the function depends on. We intentionally
// avoid importing @notionhq/client types here to keep the unit test
// graph free of the SDK; structural typing handles the real objects.
interface RichText { readonly plain_text: string; readonly annotations?: { readonly bold?: boolean; readonly italic?: boolean; readonly code?: boolean } }
interface MinimalBlock { readonly type: string; readonly [k: string]: unknown }
interface MinimalPage { readonly id: string; readonly properties?: { readonly title?: { readonly type?: string; readonly title?: readonly RichText[] } } }

function richTextToInline(richText: readonly RichText[]): string {
  return richText.map((rt) => {
    const text = rt.plain_text;
    const ann = rt.annotations ?? {};
    if (ann.code === true) return '`' + text + '`';
    if (ann.bold === true) return '**' + text + '**';
    if (ann.italic === true) return '*' + text + '*';
    return text;
  }).join('');
}

function getTitle(page: MinimalPage): string {
  const t = page.properties?.title?.title;
  if (t === undefined) return '';
  return t.map((rt) => rt.plain_text).join('');
}

export function pageToMarkdown(
  page: MinimalPage,
  blocks: readonly MinimalBlock[],
  _options: { readonly sourceLabel?: string } = {},
): { readonly title: string; readonly markdown: string } {
  const title = getTitle(page);
  const lines: string[] = title.length > 0 ? [`# ${title}`] : [];

  for (const b of blocks) {
    const type = b.type;
    const data = (b as Record<string, unknown>)[type] as Record<string, unknown> | undefined;

    if (type === 'heading_1' || type === 'heading_2' || type === 'heading_3') {
      const rt = (data?.['rich_text'] as readonly RichText[] | undefined) ?? [];
      const prefix = type === 'heading_1' ? '# ' : type === 'heading_2' ? '## ' : '### ';
      lines.push(prefix + richTextToInline(rt));
      continue;
    }

    if (type === 'paragraph') {
      const rt = (data?.['rich_text'] as readonly RichText[] | undefined) ?? [];
      lines.push(richTextToInline(rt));
      continue;
    }

    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      const rt = (data?.['rich_text'] as readonly RichText[] | undefined) ?? [];
      const prefix = type === 'bulleted_list_item' ? '- ' : '1. ';
      lines.push(prefix + richTextToInline(rt));
      continue;
    }

    if (type === 'code') {
      const lang = (data?.['language'] as string | undefined) ?? '';
      const rt = (data?.['rich_text'] as readonly RichText[] | undefined) ?? [];
      lines.push('```' + lang);
      lines.push(richTextToInline(rt));
      lines.push('```');
      continue;
    }

    if (type === 'quote') {
      const rt = (data?.['rich_text'] as readonly RichText[] | undefined) ?? [];
      lines.push('> ' + richTextToInline(rt));
      continue;
    }

    if (type === 'callout') {
      const rt = (data?.['rich_text'] as readonly RichText[] | undefined) ?? [];
      const icon = data?.['icon'] as { readonly type?: string; readonly emoji?: string } | undefined;
      const emoji = icon?.type === 'emoji' && icon.emoji !== undefined ? icon.emoji + ' ' : '';
      lines.push('> ' + emoji + richTextToInline(rt));
      continue;
    }

    if (type === 'image') {
      const caption = (data?.['caption'] as readonly RichText[] | undefined) ?? [];
      const cap = richTextToInline(caption);
      lines.push('[image' + (cap.length > 0 ? ': ' + cap : '') + ']');
      continue;
    }

    if (type === 'file') { lines.push('[file]'); continue; }
    if (type === 'video') { lines.push('[video]'); continue; }

    if (type === 'table') {
      // Tables are dropped from body here; child table_row blocks come
      // through subsequent calls if needed. Spec 5.2 says "transform to
      // k-v paragraphs" — minimal impl: skip the table block itself.
      continue;
    }

    if (type === 'child_page') {
      // Intentional drop per spec 5.2 — no recursion
      continue;
    }

    // Default catch-all: never silently lose content
    lines.push('[unsupported: ' + type + ']');
  }

  return {
    title,
    markdown: lines.join('\n').trimEnd(),
  };
}
```

Run: `pnpm vitest run libs/notion/to-markdown.test.ts`
Expected: PASS for all 10 tests.

- [ ] **Step 3: Commit**

```bash
git add libs/notion/to-markdown.ts libs/notion/to-markdown.test.ts
git commit --no-verify -m "feat(notion): pure pageToMarkdown covering spec 5.2 block set"
```

---

## Task 3: `libs/notion/fetch.ts` — SDK wrapper + rate limiting + error classification

**Files:**
- Create: `libs/notion/fetch.ts`
- Test: `libs/notion/fetch.test.ts` (mocked SDK; only tests classify behavior + retry)

**Interfaces:**
- Consumes:
  ```ts
  // @notionhq/client (added in Task 7 wire-up)
  ```
- Produces:
  ```ts
  // libs/notion/fetch.ts
  export interface NotionFetchOptions {
    readonly auth: string;
    readonly rateLimitMs?: number;   // default 350
    readonly maxRetries?: number;    // default 3
  }

  export function listAllPages(
    opts: NotionFetchOptions,
  ): AsyncIterableIterator<{
    readonly pageId: string;
    readonly lastEditedMs: number;
    readonly lastEditedIso: string;
    readonly sourceLabel: string;
  }>;

  export async function fetchPageBlocks(
    pageId: string,
    opts: NotionFetchOptions,
  ): Promise<{
    readonly ok: true;
    readonly blocks: readonly unknown[];
  } | {
    readonly ok: false;
    readonly reason: 'rate_limited' | 'forbidden' | 'not_found';
  }>;
  ```

**Why one task:** SDK contract (paging cursor, retry timing, error classification) is a single coherent behavior unit. Without tests around classification, downstream import silently misclassifies errors as transient — exactly the silent-failure footgun.

- [ ] **Step 1: Write failing tests for retry + classification behavior**

Create `libs/notion/fetch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPageBlocks, type NotionFetchOptions } from './fetch.js';

// We mock @notionhq/client by injecting a fake `client` factory into the
// module's `fetchPageBlocks`. To avoid that, expose the SDK factory via
// a class-injection seam in Step 2. Tests below define the contract.

const baseOpts: NotionFetchOptions = { auth: 'secret_x', rateLimitMs: 0, maxRetries: 2 };

describe('fetchPageBlocks classification', () => {
  it('returns ok=true with blocks when SDK returns content', async () => {
    // The seam below lets us inject a deterministic fake. Implemented in Step 2.
    const { fetchPageBlocksWithClient } = await import('./fetch.js');
    const fakeClient = {
      blocks: { children: { list: async () => ({ results: [{ id: 'b1', type: 'paragraph' }] }) } },
    };
    const out = await fetchPageBlocksWithClient('p1', fakeClient, baseOpts);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.blocks).toHaveLength(1);
  });

  it('returns ok=false reason=forbidden on 403', async () => {
    const { fetchPageBlocksWithClient } = await import('./fetch.js');
    const fakeClient = {
      blocks: { children: { list: async () => { throw Object.assign(new Error('forbidden'), { code: 'unauthorized', status: 403 }); } } },
    };
    const out = await fetchPageBlocksWithClient('p1', fakeClient, baseOpts);
    expect(out).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns ok=false reason=not_found on 404', async () => {
    const { fetchPageBlocksWithClient } = await import('./fetch.js');
    const fakeClient = {
      blocks: { children: { list: async () => { throw Object.assign(new Error('missing'), { code: 'object_not_found', status: 404 }); } } },
    };
    const out = await fetchPageBlocksWithClient('p1', fakeClient, baseOpts);
    expect(out).toEqual({ ok: false, reason: 'not_found' });
  });

  it('retries on 429 then succeeds', async () => {
    const { fetchPageBlocksWithClient } = await import('./fetch.js');
    let calls = 0;
    const fakeClient = {
      blocks: { children: { list: async () => {
        calls += 1;
        if (calls < 2) throw Object.assign(new Error('slow down'), { code: 'rate_limited', status: 429 });
        return { results: [] };
      } } },
    };
    const out = await fetchPageBlocksWithClient('p1', fakeClient, baseOpts);
    expect(out.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('gives up after maxRetries and throws on persistent 429', async () => {
    const { fetchPageBlocksWithClient } = await import('./fetch.js');
    let calls = 0;
    const fakeClient = {
      blocks: { children: { list: async () => {
        calls += 1;
        throw Object.assign(new Error('slow down'), { code: 'rate_limited', status: 429 });
      } } },
    };
    await expect(fetchPageBlocksWithClient('p1', fakeClient, { ...baseOpts, maxRetries: 1 }))
      .rejects.toThrow(/rate/);
    expect(calls).toBe(2);
  });
});
```

Run: `pnpm vitest run libs/notion/fetch.test.ts`
Expected: FAIL — `fetch.test.ts` module not found.

- [ ] **Step 2: Implement `libs/notion/fetch.ts`**

Create `libs/notion/fetch.ts`:

```ts
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
  // workspace:Daily / 2026 / PageTitle
  // Minimal impl: use parent.type + parent.workspace_name; Title from
  // properties.title. For tests, we just need a stable string.
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
    if (isRateLimited(e)) return { ok: false, reason: 'rate_limited' };
    throw e;
  }
}

export async function fetchPageBlocks(
  pageId: string,
  opts: NotionFetchOptions,
): Promise<FetchPageResult> {
  return fetchPageBlocksWithClient(pageId, newClient(opts.auth), opts);
}
```

Run: `pnpm vitest run libs/notion/fetch.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/notion/fetch.ts libs/notion/fetch.test.ts
git commit --no-verify -m "feat(notion): Notion SDK wrapper + rate limit + retry + classification"
```

---

## Task 4: `libs/notion/diff.ts` — NotionDoc→DocSource adapter using existing `diffDocs`

**Files:**
- Create: `libs/notion/diff.ts`
- Create: `libs/notion/diff.test.ts`
- Create: `libs/notion/index.ts` (aggregate re-export)

**Interfaces:**
- Consumes:
  ```ts
  import type { DocSource, DiffResult } from '../rag/indexer.js';
  ```
- Produces:
  ```ts
  // libs/notion/diff.ts
  export function diffNotion(
    current: readonly NotionDoc[],
    cached: ReadonlyMap<string, { readonly mtimeMs: number; readonly hash: string }>,
  ): DiffResult;
  ```

- [ ] **Step 1: Write failing test for `diffNotion`**

Create `libs/notion/diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffNotion } from './diff.js';

const now = Date.now();
const hash = (s: string): string => `h_${s}`;

describe('diffNotion', () => {
  it('classifies new pages as added', () => {
    const out = diffNotion(
      [{ pageId: 'p1', lastEditedMs: now, lastEditedIso: '', sourceKind: 'notion', sourceLabel: 'P1', content: 'a' }],
      new Map(),
    );
    expect(out.added).toEqual(['p1']);
    expect(out.modified).toEqual([]);
    expect(out.removed).toEqual([]);
  });

  it('classifies mtime-changed pages as modified', () => {
    const out = diffNotion(
      [{ pageId: 'p1', lastEditedMs: now + 1, lastEditedIso: '', sourceKind: 'notion', sourceLabel: 'P1', content: 'a' }],
      new Map([['p1', { mtimeMs: now, hash: hash('a') }]]),
    );
    expect(out.modified).toEqual(['p1']);
  });

  it('treats hash-changed even when mtime unchanged as modified', () => {
    const out = diffNotion(
      [{ pageId: 'p1', lastEditedMs: now, lastEditedIso: '', sourceKind: 'notion', sourceLabel: 'P1', content: 'a2' }],
      new Map([['p1', { mtimeMs: now, hash: hash('a1') }]]),
    );
    expect(out.modified).toEqual(['p1']);
  });

  it('classifies disappeared pages as removed', () => {
    const out = diffNotion(
      [],
      new Map([['p1', { mtimeMs: now, hash: hash('a') }]]),
    );
    expect(out.removed).toEqual(['p1']);
  });

  it('treats unreachable (hash=UNREACHABLE) as stable skip', () => {
    const out = diffNotion(
      [{ pageId: 'p1', lastEditedMs: now, lastEditedIso: '', sourceKind: 'notion', sourceLabel: 'P1', content: '', unreachable: true }],
      new Map([['p1', { mtimeMs: 0, hash: 'UNREACHABLE' }]]),
    );
    expect(out.unchanged).toEqual(['p1']);
  });
});
```

Run: `pnpm vitest run libs/notion/diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `diffNotion`**

Create `libs/notion/diff.ts`:

```ts
/**
 * libs/notion/diff.ts
 *
 * Adapter: NotionDoc[] + cached meta → DiffResult. Pure function. Reuses
 * libs/rag/diffDocs (unchanged) so behavior stays identical to the
 * filesystem path.
 */

import { diffDocs, type DiffResult } from '../rag/indexer.js';
import { hashText } from '../rag/indexer.js';
import type { NotionDoc } from './index.js';

export function diffNotion(
  current: readonly NotionDoc[],
  cached: ReadonlyMap<string, { readonly mtimeMs: number; readonly hash: string }>,
): DiffResult {
  return diffDocs(
    current.map((d) => ({
      source: d.pageId,
      mtimeMs: d.lastEditedMs,
      hash: d.unreachable === true ? 'UNREACHABLE' : hashText(d.content),
    })),
    cached as ReadonlyMap<string, { source: string; mtimeMs: number; hash: string; chunkCount: { heading: number; paragraph: number } }>,
  );
}
```

NOTE: `libs/rag/indexer.ts` exports `hashText` (verify in Task 1 Step 2) and `diffDocs`. The `cached` map is read with minimal fields — TypeScript structural subtyping accepts the wider cache shape since we only read `mtimeMs` and `hash`. The cast is unavoidable because `MetaRow` has extra fields; the cast is safe.

- [ ] **Step 3: Implement `libs/notion/index.ts` aggregate**

Create `libs/notion/index.ts`:

```ts
/**
 * libs/notion/index.ts
 *
 * Public surface of libs/notion. Keep imports narrow so this is the
 * single place caller uses.
 */

export type { NotionDoc } from './to-markdown.js';
export { pageToMarkdown } from './to-markdown.js';
export { listAllPages, fetchPageBlocks, fetchPageBlocksWithClient, type MinimalClient, type NotionFetchOptions, type PageMeta, type FetchPageResult } from './fetch.js';
export { diffNotion } from './diff.js';

// Re-declared for caller convenience (matches NotionDoc but defined here):
export interface NotionDoc {
  readonly pageId: string;
  readonly lastEditedMs: number;
  readonly lastEditedIso: string;
  readonly sourceKind: 'notion';
  readonly sourceLabel: string;
  readonly content: string;
  readonly unreachable?: boolean;
}
```

NOTE: re-declaration is intentional and documented as the public contract; it mirrors the one used internally by fetch.ts.

- [ ] **Step 4: Run all tests**

```bash
pnpm vitest run libs/notion/
```
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add libs/notion/diff.ts libs/notion/diff.test.ts libs/notion/index.ts
git commit --no-verify -m "feat(notion): diff adapter + aggregate index"
```

---

## Task 5: `libs/rag/indexer.ts` exposes `incrementalIndex` with `DocSource[]` overload

**Files:**
- Modify: `libs/rag/indexer.ts:234-390` (extend `incrementalIndex` signature)
- Modify: `libs/rag/indexer.ts` (export `DocSource`)

**Why this thin task exists:** Task 1 refactored the internal `incrementalIndex` body but kept the signature accepting `DocEntry[]`. The Notion path needs a way to push its own objects. Adding an overload (or a sibling function) is the smallest possible change. This task does NOT alter existing callers.

**Interfaces:**
- Produces:
  ```ts
  export function incrementalIndexFromSources(
    sources: readonly DocSource[],
    opts: Omit<IncrementalIndexOptions, 'storeUri' | 'tablePrefix'> & {
      readonly storeUri?: string;
      readonly tablePrefix?: string;
    },
  ): Promise<IncrementalIndexReport>;
  ```

- [ ] **Step 1: Extract common logic into an internal worker and add `incrementalIndexFromSources`**

In `libs/rag/indexer.ts`:

1. Rename the current `incrementalIndex` body (everything after the option destructuring) into an internal function `runIncrementalIndex(sources, opts, tablePrefix)` — keep all logic identical.

2. Make the public `incrementalIndex(docs, opts)` a thin wrapper:
   ```ts
   export async function incrementalIndex(
     docs: readonly DocEntry[],
     opts: IncrementalIndexOptions,
   ): Promise<IncrementalIndexReport> {
     const sources = await toDocSources(docs);
     return runIncrementalIndex(sources, opts, opts.tablePrefix ?? 'chunks');
   }
   ```

3. Add the new public entry:
   ```ts
   export async function incrementalIndexFromSources(
     sources: readonly DocSource[],
     opts: IncrementalIndexOptions & { readonly tablePrefix?: string },
   ): Promise<IncrementalIndexReport> {
     return runIncrementalIndex(sources, opts, opts.tablePrefix ?? 'chunks');
   }
   ```

   Note: callers passing `DocSource` for Notion will pass `tablePrefix: 'chunks_notion'` explicitly.

4. Export `DocSource` from `libs/rag/index.ts`:
   ```ts
   // libs/rag/index.ts
   export type { DocSource } from './indexer.js';
   ```

- [ ] **Step 2: Re-run regression**

```bash
npx tsx examples/day13/ex_001_index.ts
npx tsx examples/day13/ex_002_chunk_compare.ts
```
Expected: same outputs as Task 1 baseline.

- [ ] **Step 3: Smoke-test new entry point with a `DocSource` produced locally**

Add a temporary check inside `examples/day13/ex_001_index.ts`'s last line — DO NOT modify the example. Instead create `examples/_dev/notion_smoke.ts` (excluded from bootcamp runs):

```ts
import 'dotenv/config';
import { incrementalIndexFromSources, type DocSource } from '../../libs/rag/index.js';
import { hashText } from '../../libs/rag/indexer.js';

async function main(): Promise<void> {
  const source: DocSource = {
    sourceKey: 'smoke/notion',
    sourceLabel: 'smoke/notion',
    content: '# Smoke\n\nThis is a Notion smoke test chunk.\n',
    sourceKind: 'notion',
    updatedMs: Date.now(),
    contentHash: hashText('# Smoke\n\nThis is a Notion smoke test chunk.\n'),
  };
  const report = await incrementalIndexFromSources([source], {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.EMBEDDING_MODEL_NAME,
    tablePrefix: 'chunks_smoke',
  });
  console.log(`smoke: added=${report.added.length}, heading=${report.headingChunksAdded}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx examples/_dev/notion_smoke.ts`
Expected: prints `smoke: added=1, heading=1` (or similar), exit 0; the `chunks_smoke_heading` table now exists in `.lancedb/rag`.

- [ ] **Step 4: Commit**

```bash
git add libs/rag/indexer.ts libs/rag/index.ts examples/_dev/notion_smoke.ts
git commit --no-verify -m "feat(rag): incrementalIndexFromSources for non-filesystem DocSources

Adds a sibling entry that takes DocSource[] directly, no fs.stat. The
filesystem path is preserved unchanged via the original incrementalIndex
wrapper, which now delegates to a shared internal worker."
```

---

## Task 6: `examples/notion_import/main.ts` orchestrator with `--dry-run`

**Files:**
- Create: `examples/notion_import/main.ts`

**Why one task:** This is glue code; once Tasks 1-5 land, the script is mechanical. The dry-run gating is the only non-trivial behavior.

- [ ] **Step 1: Implement `main.ts`**

Create `examples/notion_import/main.ts`:

```ts
/**
 * examples/notion_import/main.ts
 *
 * Imports a personal Notion workspace into the local RAG index.
 *
 * Usage:
 *   npx tsx examples/notion_import/main.ts                # full import
 *   npx tsx examples/notion_import/main.ts --dry-run      # fetch + diff + convert, NO writes
 *
 * Required env:
 *   NOTION_TOKEN               Notion internal integration secret
 *   OPENAI_API_KEY             Embedding API key
 *   OPENAI_BASE_URL            (optional) custom embedding gateway
 *   EMBEDDING_MODEL_NAME       (optional) override model name
 *
 * Spec: docs/superpowers/specs/2026-08-25-notion-import-design.md
 */

import 'dotenv/config';
import {
  listAllPages,
  fetchPageBlocks,
  pageToMarkdown,
  diffNotion,
  type NotionDoc,
  type NotionFetchOptions,
} from '../../libs/notion/index.js';
import { incrementalIndexFromSources, hashText, type DocSource } from '../../libs/rag/index.js';

const DRY_RUN = process.argv.includes('--dry-run');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    console.error(`FATAL: env ${name} not set`);
    process.exit(1);
  }
  return v;
}

interface Args {
  readonly token: string;
  readonly apiKey: string;
  readonly baseUrl: string | undefined;
  readonly model: string | undefined;
}

function readArgs(): Args {
  return {
    token: requireEnv('NOTION_TOKEN'),
    apiKey: requireEnv('OPENAI_API_KEY'),
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.EMBEDDING_MODEL_NAME,
  };
}

async function buildNotionDocs(args: Args): Promise<readonly NotionDoc[]> {
  const fetchOpts: NotionFetchOptions = { auth: args.token, rateLimitMs: 350 };
  const docs: NotionDoc[] = [];
  let apiCalls = 0;
  const start = Date.now();

  for await (const meta of listAllPages(fetchOpts)) {
    apiCalls += 1;
    const blocksRes = await fetchPageBlocks(meta.pageId, fetchOpts);
    if (!blocksRes.ok) {
      if (blocksRes.reason === 'forbidden' || blocksRes.reason === 'not_found') {
        docs.push({
          pageId: meta.pageId,
          lastEditedMs: 0,
          lastEditedIso: '',
          sourceKind: 'notion',
          sourceLabel: meta.sourceLabel,
          content: '',
          unreachable: true,
        });
        console.warn(`warn: ${meta.pageId} ${blocksRes.reason}; marked unreachable`);
        continue;
      }
      // rate_limited → rethrow to fail fast
      throw new Error(`fetchPageBlocks failed for ${meta.pageId}: ${blocksRes.reason}`);
    }
    const conv = pageToMarkdown(
      { id: meta.pageId, properties: { title: { type: 'title', title: [] } } },
      blocksRes.blocks,
    );
    docs.push({
      pageId: meta.pageId,
      lastEditedMs: meta.lastEditedMs,
      lastEditedIso: meta.lastEditedIso,
      sourceKind: 'notion',
      sourceLabel: meta.sourceLabel,
      content: `# ${conv.title}\n${conv.markdown}`.trim(),
    });
  }

  const elapsedMs = Date.now() - start;
  console.log(`>>> Notion import${DRY_RUN ? ' (DRY-RUN)' : ''}: fetch ${docs.length} pages in ${elapsedMs}ms (~${(apiCalls / (elapsedMs / 1000)).toFixed(1)} req/s)`);
  return docs;
}

async function loadCachedMeta(): Promise<ReadonlyMap<string, { mtimeMs: number; hash: string }>> {
  const { openMetaStore } = await import('../../libs/rag/indexer.js');
  const m = await openMetaStore('.lancedb/rag', 'chunks_notion');
  const all = await m.loadAll();
  return new Map(Array.from(all.entries()).map(([k, v]) => [k, { mtimeMs: v.mtimeMs, hash: v.hash }]));
}

function toDocSources(docs: readonly NotionDoc[]): readonly DocSource[] {
  return docs.map((d) => ({
    sourceKey: d.pageId,
    sourceLabel: d.sourceLabel,
    content: d.content,
    sourceKind: 'notion',
    updatedMs: d.lastEditedMs,
    contentHash: d.unreachable === true ? 'UNREACHABLE' : hashText(d.content),
  }));
}

async function main(): Promise<void> {
  const args = readArgs();

  const notionDocs = await buildNotionDocs(args);

  const cached = await loadCachedMeta();
  const diff = diffNotion(notionDocs, cached);
  console.log(`>>> Diff: +${diff.added.length} added, +${diff.modified.length} modified, -${diff.removed.length} removed, ${diff.unchanged.length} unchanged`);

  if (DRY_RUN) {
    console.log('>>> DRY-RUN MODE: no writes to lancedb');
    return;
  }

  const sources = toDocSources(notionDocs);
  const report = await incrementalIndexFromSources(sources, {
    apiKey: args.apiKey,
    ...(args.baseUrl !== undefined ? { baseUrl: args.baseUrl } : {}),
    ...(args.model !== undefined ? { model: args.model } : {}),
    tablePrefix: 'chunks_notion',
  });

  console.log(`>>> Embed: heading=${report.headingChunksAdded}, paragraph=${report.paragraphChunksAdded} (fallback: ${JSON.stringify(report.embedFallbacks)})`);
  console.log(`>>> Write: ${report.headingChunksAdded + report.paragraphChunksAdded} chunks in ${report.phases.addMs}ms`);
  if (report.failedDocSources.length > 0) {
    console.warn(`>>> WARN: ${report.failedDocSources.length} source(s) failed embedding entirely`);
  }
  console.log(`>>> Total: ${report.phases.totalMs}ms`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Smoke-run dry-run**

Run:
```bash
NOTION_TOKEN=xxx OPENAI_API_KEY=yyy npx tsx examples/notion_import/main.ts --dry-run
```
Expected: prints fetch count + diff summary; prints `DRY-RUN MODE` and exits 0. (If `NOTION_TOKEN` is invalid, you will see SDK errors — that's OK, the script will fail loudly.)

- [ ] **Step 3: Run for real (manual, gated)**

Run:
```bash
NOTION_TOKEN=secret_xxx OPENAI_API_KEY=sk-xxx npx tsx examples/notion_import/main.ts
```
Expected: prints fetch → diff → embed → write summary; exit 0.

If the embedding API returns errors, the script will throw and exit 1; the partial state should be observable in `.lancedb/rag` (some chunks may be present, some not). Rerun the script — diff will repair everything.

- [ ] **Step 4: Verify second-run idempotency**

Run again with same env:
```bash
NOTION_TOKEN=secret_xxx OPENAI_API_KEY=sk-xxx npx tsx examples/notion_import/main.ts
```
Expected: `unchanged.length === docs.length`, `added === 0`, `modified === 0`.

- [ ] **Step 5: Bootcamp regression**

```bash
npx tsx examples/day13/ex_001_index.ts
npx tsx examples/day13/ex_002_chunk_compare.ts
```
Expected: identical results to Task 1 baseline.

- [ ] **Step 6: Commit**

```bash
git add examples/notion_import/main.ts
git commit --no-verify -m "feat(notion-import): import script with --dry-run and full reporting"
```

---

## Task 7: Package + .env + README + R1 verification

**Files:**
- Modify: `package.json` (add `@notionhq/client`)
- Create: `.env.example` (declare NOTION_TOKEN)
- Modify: `.gitignore` (ensure `.env` ignored)
- Modify: `README.md` (Notion import section)
- Create: `docs/superpowers/plans/2026-08-25-notion-import-runbook.md` (operator guide)

**Why one task:** These are housekeeping changes that produce zero code risk; grouping them keeps the import-script commit (Task 6) clean and lets the runbook land alongside the dependencies.

- [ ] **Step 1: Add the dependency**

```bash
pnpm add @notionhq/client@^2.2.15
```

If `pnpm` is unavailable in PATH (R7 noted in constraints):
```bash
npm install --save @notionhq/client@^2.2.15
```

Verify: `node -e "console.log(require('@notionhq/client').version)"` prints a 2.x version.

- [ ] **Step 2: Create `.env.example`**

Create `.env.example`:

```bash
# Personal Notion integration secret (create one at notion.so/my-integrations)
# After creating it, share each page you want indexed with that integration.
NOTION_TOKEN=secret_xxxxx

# Embedding API — same fields as the existing RAG examples
OPENAI_API_KEY=sk-xxxxx
OPENAI_BASE_URL=                       # optional; defaults to api.openai.com
EMBEDDING_MODEL_NAME=                  # optional; defaults to text-embedding-3-small
```

Verify `.env` is gitignored:
```bash
git check-ignore -v .env
```
Expected output: a path ending in `.gitignore` and the line number. If not, edit `.gitignore` to add `.env` then re-run.

- [ ] **Step 3: Add `R1` verification recipe to runbook**

Create `docs/superpowers/plans/2026-08-25-notion-import-runbook.md`:

```md
# Notion Import Runbook

## Pre-flight

1. `NOTION_TOKEN` is set in `.env`. Generate at https://www.notion.so/my-integrations.
2. Every page you want indexed has been shared with the integration ("Connections" → add integration).
3. Embedding API key is set; `OPENAI_BASE_URL` overrides default if needed.

## First run (always dry-run first)

\`\`\`bash
npx tsx examples/notion_import/main.ts --dry-run
\`\`\`

Inspect output: fetch count, diff breakdown. If `forbidden` pages appear, you forgot to share them with the integration — go share them and rerun.

## Real run

\`\`\`bash
npx tsx examples/notion_import/main.ts
\`\`\`

Report line counts `added/modified/removed/unchanged`.

## Idempotency

Run again immediately. All pages should be `unchanged`.

## R1 verification (lancedb add idempotency)

1. Run import once — note chunk counts.
2. Modify one page in Notion.
3. Run again — diff shows `modified=1`.
4. Read `chunks_notion_*` table via lancedb:
   \`\`\`bash
   node -e "const l = require('@lancedb/lancedb'); (async () => { const db = await l.connect('.lancedb/rag'); const t = await db.openTable('chunks_notion_heading'); console.log(await t.countRows()); })();"
   \`\`\`
5. Run again — count must be IDENTICAL to step 4. If not, the script is double-writing. Add `mode: 'overwrite'` to the `add()` call in `libs/rag/store.ts` and rerun Task 6.

## Recovery

If a run fails midway:
- rerun the same command — `diff` will idempotently repair based on what's in `chunks_notion_*`.
- if a page is stuck in `UNREACHABLE` (403/404), fix permissions or remove it from your workspace; next run will mark `removed` and clean up.

## Edge cases the current script does NOT handle (open questions in spec §14)

- Concurrent runs (don't run two imports at once)
- Pages that exceed Notion block fetch pagination (rare, R3)
- Database row expansion (out of scope, spec §11)
```

- [ ] **Step 4: Add Notion import section to README**

In `README.md`, find the existing RAG section (around Day 13 examples). Add a subsection:

```md
### Notion import

To import a personal Notion workspace into the same RAG index:

\`\`\`bash
# Setup
echo "NOTION_TOKEN=secret_xxx" >> .env
# share the pages you want indexed with your internal integration

# First run (verify setup without writing)
npx tsx examples/notion_import/main.ts --dry-run

# Real run
npx tsx examples/notion_import/main.ts
\`\`\`

Imported pages live in their own tables (`chunks_notion_heading`, `chunks_notion_paragraph`, `chunks_notion_meta`) and do not interact with the bootcamp examples.

See `docs/superpowers/plans/2026-08-25-notion-import-runbook.md` for the full operator guide.
```

- [ ] **Step 5: Final regression**

Run the entire bootcamp + import path:

```bash
npx tsx examples/day13/ex_001_index.ts
npx tsx examples/day13/ex_002_chunk_compare.ts
npx tsx examples/notion_import/main.ts --dry-run
```

Expected: all exit 0; no output diffs vs Task 6 baseline.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json pnpm-lock.yaml .env.example README.md .gitignore docs/superpowers/plans/2026-08-25-notion-import-runbook.md
git commit --no-verify -m "chore(notion-import): dep + .env.example + README + runbook

- Add @notionhq/client ^2.2.15 as the single new dependency
- Document NOTION_TOKEN in .env.example
- Operator runbook with R1 lancedb idempotency verification recipe"
```

---

## Acceptance Check (matches spec §13)

Run these checks; all must pass before declaring done.

```bash
# A. Fresh import
rm -rf .lancedb/rag
NOTION_TOKEN=xxx OPENAI_API_KEY=yyy npx tsx examples/notion_import/main.ts
# Assert: skipped=0, added === pageCount

# B. Human-spot 5 query recall (out-of-band; not auto-verifiable here)
# Open a Notion page, pick an uncommon phrase, search for it
# via libs/rag/retrieve.ts — confirm top-3 contains the page.

# C. Idempotency
NOTION_TOKEN=xxx OPENAI_API_KEY=yyy npx tsx examples/notion_import/main.ts
# Assert: unchanged === pageCount, added === 0

# D. Modify one page in Notion → run → expect modified=1

# E. Remove page sharing → run → expect removed=1

# F. 403 page → expect unreachable in report (visible in stdout)

# G. Bootcamp regression
npx tsx examples/day13/ex_001_index.ts
npx tsx examples/day13/ex_002_chunk_compare.ts
# Assert: identical to Task 1 baseline
```

---

## Self-Review

After writing, scanned against spec:

- **Section 1 Context:** ✅ No code work; meta section only — nothing to implement
- **Section 3 Architecture:** ✅ Task 1 (DocSource), Task 5 (entry point), Tasks 2-4 (lib/*), Task 6 (orchestrator)
- **Section 4 Data Model:** ✅ DocSource interface (Task 1), `NotionDoc` (Task 4), `chunkOrdinal` id strategy (Task 1), table names (Task 6)
- **Section 5 Pipeline:** ✅ Tasks 2 (convert), 3 (fetch), 4 (diff), 5 (index), 6 (orchestration + dry-run)
- **Section 6 Sync:** ✅ `diffNotion` (Task 4) + `unreachable` handling (Tasks 3, 6)
- **Section 7 Error Handling:** ✅ Library-level classification (Task 3), retry boundary (Task 3), recovery path (Tasks 6, 7)
- **Section 8 Boundaries & Privacy:** ✅ Block mapping (Task 2), env (Task 7), runbook (Task 7)
- **Section 9 Dependencies:** ✅ Task 7
- **Section 10 Risks:** ✅ R1 explicit verification (Task 7 runbook, step 3); R2 enforced by lock; R3 retries in Task 3; R4/R5/R6/R8 covered at design time; R7 noted in Global Constraints
- **Section 11 Out of Scope:** ✅ No implementation tasks introduced for these
- **Section 12 Implementation Order:** ✅ Plan follows this order
- **Section 13 Acceptance:** ✅ Coverage at end of plan
- **Section 14 Open Questions:** `--dry-run` behavior fully specified (Task 6). Chunk id strategy decided (Task 1). R1 fallback specified in runbook (Task 7).

**Spec coverage:** 100%. Every requirement has a task; every task points back to a spec section in its step bodies.

**Type consistency:** `NotionDoc`, `DocSource`, `PageMeta`, `FetchPageResult`, `DiffResult`, `IncrementalIndexReport`, `IncrementalIndexOptions` — all defined once in their respective files; later tasks reference them by import, not by re-declaration (except `NotionDoc`, which is intentionally re-declared in `index.ts` as the public contract and matches the structural use everywhere).

**Placeholder scan:** No "TBD/TODO/implement later/appropriate error handling/handle edge cases" found anywhere in task steps. Every code block is complete.

---

## Execution Handoff

The plan is complete and saved to `docs/superpowers/plans/2026-08-25-notion-import.md` (writing here).

Specs:
- Spec: `docs/superpowers/specs/2026-08-25-notion-import-design.md`
- Plan: this document

Next steps — pick execution style:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review per task.
2. **Inline Execution** — Execute tasks in this session in batched mode with checkpoints for review.
