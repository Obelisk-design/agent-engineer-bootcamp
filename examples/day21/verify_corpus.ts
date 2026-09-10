/**
 * 验证 corporate-docs/ 语料是否可被 RAG 解析器正常读取。
 *
 * 每种格式用对应解析器做最小化解析，输出通过/失败明细。
 *
 * 运行：pnpm exec tsx examples/day21/verify_corpus.ts
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import zlib from 'node:zlib';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import sharp from 'sharp';

const ROOT = 'tests/fixtures/corporate-docs';

// ── 解析器：每种格式返回一个 { ok, summary } ─────────────────
type ParseResult = { ok: boolean; summary: string; error?: string };

async function parsePdf(buf: Buffer): Promise<ParseResult> {
  try {
    const head = buf.slice(0, 5).toString('ascii');
    if (!head.startsWith('%PDF'))
      return { ok: false, summary: 'no PDF header', error: 'header missing' };
    // 验证：必须含 Catalog 页（/Type /Catalog /Pages），含 FlateDecode 流（可解压）
    const txt = buf.toString('binary');
    const hasCatalog = /\/Type\s*\/Catalog/.test(txt);
    const hasPages = /\/Type\s*\/Pages/.test(txt);
    const hasFont = /\/Type\s*\/Font/.test(txt);
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let streamCount = 0;
    let inflatedBytes = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt)) !== null) {
      streamCount++;
      const payload = m[1];
      if (payload === undefined) continue;
      try {
        inflatedBytes += zlib.inflateSync(Buffer.from(payload, 'binary')).length;
      } catch {
        // 单个 stream 解压失败不影响整体验证，跳过
      }
    }
    const scanTag = txt.includes('扫描件') || txt.includes('已 盖 章');
    return {
      ok: hasCatalog && hasPages && hasFont && streamCount > 0,
      summary: `PDF, ${streamCount} 个流/${inflatedBytes} 字节解压, 字体注册 ${hasFont ? '✓' : '✗'}${scanTag ? ', 含扫描件/印章' : ''}`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseDocx(buf: Buffer): Promise<ParseResult> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) return { ok: false, summary: 'no document.xml', error: 'zip missing entry' };
    const texts = docXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) ?? [];
    const joined = texts.map((t) => t.replace(/<[^>]+>/g, '')).join('');
    const cnChars = (joined.match(/[一-鿿]/g) ?? []).length;
    return {
      ok: cnChars > 20,
      summary: `DOCX, ${texts.length} 段文本 / ${cnChars} 个中文字符`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseXlsx(buf: Buffer): Promise<ParseResult> {
  try {
    const wb = new ExcelJS.Workbook();
    // exceljs 期望 Buffer<ArrayBufferLike>，本项目 Buffer<ArrayBuffer> 通过 slice 重新拷贝
    await wb.xlsx.load(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    const ws = wb.worksheets[0];
    if (!ws) return { ok: false, summary: 'no worksheet', error: 'empty xlsx' };
    let cnChars = 0;
    for (let i = 1; i <= ws.rowCount; i++) {
      const v = ws.getRow(i).getCell('B').value;
      if (typeof v === 'string') cnChars += (v.match(/[一-鿿]/g) ?? []).length;
    }
    return {
      ok: cnChars > 20,
      summary: `XLSX, sheet="${ws.name}", 行数=${ws.rowCount}, ${cnChars} 个中文`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parsePptx(buf: Buffer): Promise<ParseResult> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const slideFiles = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort();
    if (!slideFiles.length) return { ok: false, summary: 'no slides', error: 'empty pptx' };
    let cnChars = 0;
    for (const f of slideFiles) {
      const xml = await zip.file(f)!.async('string');
      const texts = xml.match(/<a:t>([^<]+)<\/a:t>/g) ?? [];
      for (const t of texts) cnChars += (t.replace(/<[^>]+>/g, '').match(/[一-鿿]/g) ?? []).length;
    }
    return { ok: cnChars > 20, summary: `PPTX, ${slideFiles.length} 页, ${cnChars} 个中文` };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseZip(buf: Buffer): Promise<ParseResult> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const entries = Object.entries(zip.files)
      .filter(([, obj]) => !obj.dir)
      .map(([name]) => name);
    let cnChars = 0;
    for (const e of entries) {
      if (!/\.(md|txt|json)$/.test(e)) continue;
      const content = await zip.file(e)!.async('string');
      cnChars += (content.match(/[一-鿿]/g) ?? []).length;
    }
    return { ok: cnChars > 50, summary: `ZIP, ${entries.length} 个条目, ${cnChars} 个中文` };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseEml(buf: Buffer): Promise<ParseResult> {
  try {
    const text = buf.toString('utf8');
    const headers = text.split(/\r?\n\r?\n/)[0] ?? '';
    const from = /^From:\s*(.+)$/m.exec(headers)?.[1] ?? '';
    const subject = /^Subject:\s*(.+)$/m.exec(headers)?.[1] ?? '';
    // const date = /^Date:\s*(.+)$/m.exec(headers)?.[1] ?? ''; // 当前未用，预留
    const body = text
      .split(/\r?\n\r?\n/)
      .slice(1)
      .join('\n\n');
    const cnChars = (body.match(/[一-鿿]/g) ?? []).length;
    return {
      ok: cnChars > 50,
      summary: `EML, From="${from.slice(0, 30)}", Subject="${subject.slice(0, 30)}", ${cnChars} 个中文`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseJson(buf: Buffer): Promise<ParseResult> {
  try {
    const obj = JSON.parse(buf.toString('utf8'));
    // 接受顶级或嵌套：metadata.* / spec.* / sections.*
    const hasId = 'id' in obj;
    const hasTitle = 'title' in obj;
    const hasCategory = 'category' in obj;
    const hasSpecLike = 'spec' in obj || 'sections' in obj || 'metadata' in obj;
    const ok = hasId && hasTitle && hasCategory && hasSpecLike;
    return {
      ok,
      summary: `JSON, 顶级字段 ${Object.keys(obj).length} 个 (id ${hasId ? '✓' : '✗'}, title ${hasTitle ? '✓' : '✗'}, category ${hasCategory ? '✓' : '✗'}, spec/sections/metadata ${hasSpecLike ? '✓' : '✗'})`,
    };
  } catch (e) {
    return { ok: false, summary: 'JSON parse err', error: String(e) };
  }
}

async function parseYaml(buf: Buffer): Promise<ParseResult> {
  try {
    const text = buf.toString('utf8');
    const hasKind = /^kind:\s*.+$/m.test(text);
    const hasMeta = /^metadata:/m.test(text);
    const hasSpec = /^spec:/m.test(text);
    const cnChars = (text.match(/[一-鿿]/g) ?? []).length;
    return {
      ok: hasKind && hasMeta && hasSpec,
      summary: `YAML, kind/metadata/spec ${hasKind && hasMeta && hasSpec ? '✓' : '✗'}, ${cnChars} 个中文`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseHtml(buf: Buffer): Promise<ParseResult> {
  try {
    const text = buf.toString('utf8');
    const cnChars = (text.match(/[一-鿿]/g) ?? []).length;
    const hasDoc = /<title>[^<]+<\/title>/.test(text);
    return { ok: cnChars > 50, summary: `HTML, ${cnChars} 个中文, title ${hasDoc ? '✓' : '✗'}` };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseMd(buf: Buffer): Promise<ParseResult> {
  try {
    const text = buf.toString('utf8');
    const cnChars = (text.match(/[一-鿿]/g) ?? []).length;
    const firstLine = text.split('\n')[0] ?? '';
    const hasFrontmatter = /^---$/.test(firstLine);
    const hasWikiLink = /\[\[.+\]\]/.test(text);
    const sections = (text.match(/^##\s+.+$/gm) ?? []).length;
    // frontmatter 风格只有 1 段标题也正常
    const ok = cnChars > 50 && (sections >= 2 || hasFrontmatter);
    return {
      ok,
      summary: `MD, ${cnChars} 中文字符, ${sections} 段标题${hasFrontmatter ? ', 含 frontmatter' : ''}${hasWikiLink ? ', 含 wiki 链接' : ''}`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseCsv(buf: Buffer): Promise<ParseResult> {
  try {
    const text = buf.toString('utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const cnChars = (text.match(/[一-鿿]/g) ?? []).length;
    return {
      ok: cnChars > 50 && lines.length > 3,
      summary: `CSV, ${lines.length} 行, ${cnChars} 中文字符`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseTxt(buf: Buffer): Promise<ParseResult> {
  try {
    const text = buf.toString('utf8');
    const cnChars = (text.match(/[一-鿿]/g) ?? []).length;
    const sections = (text.match(/^##\s+.+$/gm) ?? []).length;
    return {
      ok: cnChars > 50 && sections >= 2,
      summary: `TXT, ${cnChars} 中文字符, ${sections} 段`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

async function parseImage(
  buf: Buffer,
  format: 'png' | 'jpg' | 'webp' | 'tiff',
): Promise<ParseResult> {
  try {
    const meta = await sharp(buf).metadata();
    return {
      ok: !!meta.format && meta.width! > 0 && meta.height! > 0,
      summary: `${format.toUpperCase()}, ${meta.width}×${meta.height}, channels=${meta.channels}`,
    };
  } catch (e) {
    return { ok: false, summary: 'image parse err', error: String(e) };
  }
}

async function parseWikiMd(buf: Buffer): Promise<ParseResult> {
  try {
    const text = buf.toString('utf8');
    const cnChars = (text.match(/[一-鿿]/g) ?? []).length;
    const wikiLinks = (text.match(/\[\[[^\]]+\]\]/g) ?? []).length;
    return {
      ok: cnChars > 50 && wikiLinks >= 1,
      summary: `MD.wiki, ${cnChars} 中文字符, ${wikiLinks} 个 wiki 链接`,
    };
  } catch (e) {
    return { ok: false, summary: 'parse err', error: String(e) };
  }
}

// ── 派发：根据扩展名分派解析器 ────────────────────────────────
async function detectFormat(
  file: string,
): Promise<{ parser: (b: Buffer) => Promise<ParseResult>; ext: string }> {
  const lower = file.toLowerCase();
  if (lower.endsWith('.wiki.md')) return { parser: parseWikiMd, ext: 'wiki.md' };
  const ext = extname(file).toLowerCase().replace(/^\./, '');
  switch (ext) {
    case 'pdf':
      return { parser: parsePdf, ext };
    case 'docx':
      return { parser: parseDocx, ext };
    case 'xlsx':
      return { parser: parseXlsx, ext };
    case 'pptx':
      return { parser: parsePptx, ext };
    case 'zip':
      return { parser: parseZip, ext };
    case 'eml':
      return { parser: parseEml, ext };
    case 'json':
      return { parser: parseJson, ext };
    case 'yaml':
      return { parser: parseYaml, ext };
    case 'html':
      return { parser: parseHtml, ext };
    case 'md':
      return { parser: parseMd, ext };
    case 'csv':
      return { parser: parseCsv, ext };
    case 'txt':
      return { parser: parseTxt, ext };
    case 'png':
      return { parser: (b) => parseImage(b, 'png'), ext };
    case 'jpg':
    case 'jpeg':
      return { parser: (b) => parseImage(b, 'jpg'), ext };
    case 'webp':
      return { parser: (b) => parseImage(b, 'webp'), ext };
    case 'tiff':
      return { parser: (b) => parseImage(b, 'tiff'), ext };
    default:
      return { parser: async () => ({ ok: false, summary: `unsupported ext: ${ext}` }), ext };
  }
}

// ── 主流程 ────────────────────────────────────────────────────
async function main() {
  const dir = join(process.cwd(), ROOT);
  const files = await readdir(dir);
  const filesToCheck = files.filter((f) => !f.startsWith('.'));

  console.log(`📂 待验证: ${filesToCheck.length} 个文件\n`);

  // 按扩展名分组统计
  const byExt: Record<string, { total: number; ok: number; fails: string[] }> = {};
  const samplesToShow = 2; // 每格式只展示前2个样本

  for (const file of filesToCheck) {
    const { parser, ext } = await detectFormat(file);
    const fullPath = join(dir, file);
    const st = await stat(fullPath);
    if (st.size === 0) {
      byExt[ext] ??= { total: 0, ok: 0, fails: [] };
      byExt[ext].total++;
      byExt[ext].fails.push(`${file} (0 bytes)`);
      continue;
    }
    const buf = await readFile(fullPath);
    const result = await parser(buf);
    byExt[ext] ??= { total: 0, ok: 0, fails: [] };
    byExt[ext].total++;
    if (result.ok) {
      byExt[ext].ok++;
      if (byExt[ext].total <= samplesToShow) {
        console.log(`  ✓ ${file}: ${result.summary}`);
      }
    } else {
      byExt[ext].fails.push(
        `${file}: ${result.summary}${result.error ? ` (${result.error.slice(0, 60)})` : ''}`,
      );
    }
  }

  // 汇总
  console.log('\n=== 汇总 ===');
  console.log('扩展名'.padEnd(12) + '总数'.padStart(6) + '通过'.padStart(8) + '失败率');
  console.log('-'.repeat(50));
  const sorted = Object.entries(byExt).sort((a, b) => b[1].total - a[1].total);
  let totalAll = 0;
  let totalOk = 0;
  for (const [ext, stat] of sorted) {
    const rate = ((stat.total - stat.fails.length) / stat.total) * 100;
    console.log(
      ext.padEnd(12) +
        String(stat.total).padStart(6) +
        String(stat.ok).padStart(8) +
        `${rate.toFixed(0)}%`,
    );
    totalAll += stat.total;
    totalOk += stat.ok;
  }
  console.log('-'.repeat(50));
  console.log('TOTAL'.padEnd(12) + String(totalAll).padStart(6) + String(totalOk).padStart(8));

  // 失败明细
  const failures = sorted.filter(([, s]) => s.fails.length > 0);
  if (failures.length) {
    console.log('\n=== 失败明细 ===');
    for (const [ext, s] of failures) {
      console.log(`\n[${ext}] ${s.fails.length} 个失败:`);
      s.fails.slice(0, 5).forEach((f) => console.log(`  ✗ ${f}`));
      if (s.fails.length > 5) console.log(`  ...还有 ${s.fails.length - 5} 个`);
    }
  } else {
    console.log('\n✅ 所有文件全部通过验证');
  }
}

main().catch((e) => {
  console.error('验证脚本异常：', e);
  process.exit(1);
});
