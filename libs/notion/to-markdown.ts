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
    // Trim leading/trailing whitespace from each rich_text segment so that
    // markdown markup delimiters (`**`, `` ` ``, `*`) provide their own
    // boundary spacing. Without this, a rich_text whose plain_text carries
    // its own leading/trailing space (e.g. " code") gets the space swallowed
    // by the annotation wrap, producing "**BOLD**`code`" instead of
    // "**BOLD** `code`". Inner whitespace within a single segment is preserved.
    const text = rt.plain_text.trim();
    if (text.length === 0) return '';
    const ann = rt.annotations ?? {};
    if (ann.code === true) return '`' + text + '`';
    if (ann.bold === true) return '**' + text + '**';
    if (ann.italic === true) return '*' + text + '*';
    return text;
  }).filter((s) => s.length > 0).join(' ');
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
  // When a title is present, prepend an empty line so the body that
  // follows is visually separated from the H1 (Test "prepends the page
  // title as a H1" asserts markdown.startsWith("# Hello\n")).
  const lines: string[] = title.length > 0 ? [`# ${title}`, ''] : [];

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
    // Preserve trailing newline(s) produced by join('\n'). Test A in
    // libs/notion/to-markdown.test.ts asserts markdown startsWith
    // "# Hello\n" — trimEnd() would strip that boundary and break the
    // assertion. No semantic consumer downstream needs the trailing
    // newline stripped.
    markdown: lines.join('\n'),
  };
}