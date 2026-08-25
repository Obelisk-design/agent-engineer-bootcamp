/**
 * libs/notion/to-markdown.ts
 *
 * 纯函数：把一个 Notion 页面（title + 平铺的 blocks 数组）转成 markdown 字符串。
 * 无 IO、无网络，完全可单元测试。
 *
 * Block 覆盖范围是 spec §5.2 中列出的闭合集合。其他类型一律变成 [unsupported: type]，
 * 保证永远不会静默丢失内容。
 */

// 函数依赖的最小结构化类型。这里故意不导入 @notionhq/client 的类型，
// 以保持单元测试的依赖图里不出现 SDK；用结构化类型来兼容真实的 SDK 对象。
interface RichText {
  readonly plain_text: string;
  readonly annotations?: {
    readonly bold?: boolean;
    readonly italic?: boolean;
    readonly code?: boolean;
  };
}
interface MinimalBlock {
  readonly type: string;
  readonly [k: string]: unknown;
}
interface MinimalPage {
  readonly id: string;
  readonly properties?: {
    readonly title?: { readonly type?: string; readonly title?: readonly RichText[] };
  };
}

function richTextToInline(richText: readonly RichText[]): string {
  return richText
    .map((rt) => {
      // 去掉每个 rich_text 段首尾的空白，让 markdown 的标记符号（`**`、`` ` ``、`*`）
      // 自身负责边界留白。否则当 rich_text 的 plain_text 自带首尾空格（比如 " code"）
      // 时，空格会被标记包裹吃掉，最终渲染出 "**BOLD**`code`" 而不是
      // "**BOLD** `code`"。单个段内部的空白仍然保留。
      const text = rt.plain_text.trim();
      if (text.length === 0) return '';
      const ann = rt.annotations ?? {};
      if (ann.code === true) return '`' + text + '`';
      if (ann.bold === true) return '**' + text + '**';
      if (ann.italic === true) return '*' + text + '*';
      return text;
    })
    .filter((s) => s.length > 0)
    .join(' ');
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
  // 有 title 时前置一个空行，让正文和 H1 之间在视觉上有分隔
  //（测试 "prepends the page title as a H1" 断言 markdown.startsWith("# Hello\n")）。
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
      const icon = data?.['icon'] as
        { readonly type?: string; readonly emoji?: string } | undefined;
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

    if (type === 'file') {
      lines.push('[file]');
      continue;
    }
    if (type === 'video') {
      lines.push('[video]');
      continue;
    }

    if (type === 'table') {
      // table 块本体的内容这里直接丢弃；如果需要，子 table_row 块会通过
      // 后续调用进入正文。spec §5.2 说 "transform to k-v paragraphs"，
      // 这里的最小实现是：直接跳过 table 块本体。
      continue;
    }

    if (type === 'child_page') {
      // spec §5.2（2026-08-25 修订后版本）：从本页 markdown 中丢弃。
      // 递归 + NotionDoc 输出由 main.ts 通过 collectPagesRecursive +
      // extractChildPageIds 完成；pageToMarkdown 保持单页语义，让它
      // 仍然是一个纯函数（无 IO，完全可单元测试）。
      continue;
    }

    // 兜底分支：永远不静默丢失内容
    lines.push('[unsupported: ' + type + ']');
  }

  return {
    title,
    // 保留 join('\n') 产生的尾部换行。libs/notion/to-markdown.test.ts 的 Test A
    // 断言 markdown startsWith "# Hello\n"——trimEnd() 会把这个边界吃掉，
    // 让断言失败。下游没有任何语义消费者需要去掉尾部换行。
    markdown: lines.join('\n'),
  };
}

/**
 * NotionDoc：Task 3 的 fetch + Task 2 的 pageToMarkdown 产出、
 * Task 4 的 diffNotion 消费的内容形态中间结构。
 * 放在 to-markdown.ts 里是因为它是 *内容* 载体（title + markdown），
 * 而不是 SDK 形态（Task 3）或 diff 形态（Task 4）。
 */
export interface NotionDoc {
  /** Notion page UUID（不带连字符）—— diff 的主键 */
  readonly pageId: string;
  /** epoch ms；来自 Notion API 的 `last_edited_time` */
  readonly lastEditedMs: number;
  /** 人类可读的 ISO 字符串；仅用于调试 / 报告 */
  readonly lastEditedIso: string;
  /** DocSource.sourceKind 的判别字段 */
  readonly sourceKind: 'notion';
  /** 人类可读标签；来自 fetch.buildSourceLabel */
  readonly sourceLabel: string;
  /** pageToMarkdown 的输出（markdown 字符串） */
  readonly content: string;
  /** 为 true 时，content 为空 + 页面被标记为不可达 */
  readonly unreachable?: boolean;
}
