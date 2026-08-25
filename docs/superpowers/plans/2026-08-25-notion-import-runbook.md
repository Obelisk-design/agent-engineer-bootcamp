# Notion Import Runbook

## Pre-flight

1. `NOTION_TOKEN` is set in `.env`. Generate at https://www.notion.so/my-integrations.
2. Every page you want indexed has been shared with the integration ("Connections" → add integration).
3. Embedding API key is set; `OPENAI_BASE_URL` overrides default if needed.

## First run (always dry-run first)

```bash
npx tsx examples/notion_import/main.ts --dry-run
```

Inspect output: fetch count, diff breakdown. If `forbidden` pages appear, you forgot to share them with the integration — go share them and rerun.

## Real run

```bash
npx tsx examples/notion_import/main.ts
```

Report line counts `added/modified/removed/unchanged`.

## Idempotency

Run again immediately. All pages should be `unchanged`.

## R1 verification (lancedb add idempotency)

1. Run import once — note chunk counts.
2. Modify one page in Notion.
3. Run again — diff shows `modified=1`.
4. Read `chunks_notion_*` table via lancedb:
   ```bash
   node -e "const l = require('@lancedb/lancedb'); (async () => { const db = await l.connect('.lancedb/rag'); const t = await db.openTable('chunks_notion_heading'); console.log(await t.countRows()); })();"
   ```
5. Run again — count must be IDENTICAL to step 4. If not, the script is double-writing. Add `mode: 'overwrite'` to the `add()` call in `libs/rag/store.ts` and rerun Task 6.

## Recovery

If a run fails midway:
- rerun the same command — `diff` will idempotently repair based on what's in `chunks_notion_*`.
- if a page is stuck in `UNREACHABLE` (403/404), fix permissions or remove it from your workspace; next run will mark `removed` and clean up.

## Edge cases the current script does NOT handle (open questions in spec §14)

- Concurrent runs (don't run two imports at once)
- Pages that exceed Notion block fetch pagination (rare, R3)
- Database row expansion (out of scope, spec §11)
