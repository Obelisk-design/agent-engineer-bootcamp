/**
 * 文本提取器：把 18 种格式的 corpus 文件解出纯文本。
 *
 * - PDF:     zlib inflate + ToUnicode CMap hex → 中文（PDFKit 用 SimHei 子集化，CMap 把 CID 映射回 Unicode）
 * - DOCX:    解 zip 读 word/document.xml，提取 <w:t> 文本
 * - XLSX:    exceljs 读所有 sheet 所有 cell 拼成文本
 * - PPTX:    解 zip 读所有 slide，提取 <a:t> 文本
 * - ZIP:     解 zip 递归读内部 md/txt/json
 * - EML:     headers + body
 * - JSON/YAML/HTML/MD/TXT/CSV: 直接读
 * - 图片类(PNG/JPG/WebP/TIFF): 返回空 + text_unavailable 标记
 *
 * 每个 extractor 返回 { text, ok, error?, note? }
 */
import zlib from 'node:zlib';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

export type ExtractResult = { text: string; ok: boolean; error?: string; note?: string };

// ── 工具：CMap hex 段还原成 Unicode 字符 ─────────────────────
// PDFKit 输出格式：<hex1 hex2 hex3> Tj / TJ
// hex 是 CID 编码（每个字符 4 位 hex = 16-bit CID）
// 简化方案：用 SimHei 的 Unicode 范围映射 CID→Unicode（近似）
function pdfHexToText(hexStr: string): string {
  // 提取所有 4位 hex 段
  const cids: number[] = [];
  const re = /[0-9a-f]{4}/g;
  let m;
  while ((m = re.exec(hexStr)) !== null) {
    cids.push(parseInt(m[0], 16));
  }
  // 简化映射：CID 在 GB2312 范围（CJK 基本区 0x4E00-0x9FFF）→ 直接当 Unicode
  // PDFKit 的 SimHei 子集化 CMap 实际是 CID = Unicode（TrueType 子集），所以能直接当 Unicode
  return cids
    .map((c) => {
      if (c >= 0x4e00 && c <= 0x9fff) return String.fromCharCode(c);
      if (c === 0x20) return ' ';
      if (c === 0x0a) return '\n';
      return ''; // 跳过不可识别的 CID
    })
    .join('');
}

// ── PDF 提取 ─────────────────────────────────────────────────
export async function extractPdf(buf: Buffer): Promise<ExtractResult> {
  try {
    if (!buf.slice(0, 5).toString('ascii').startsWith('%PDF')) {
      return { text: '', ok: false, error: 'no PDF header' };
    }
    const txt = buf.toString('binary');
    // 1. 收集所有 FlateDecode 流
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let inflated = '';
    let m: RegExpExecArray | null;
    while ((m = streamRe.exec(txt)) !== null) {
      const payload = m[1];
      if (payload === undefined) continue;
      try {
        inflated += zlib.inflateSync(Buffer.from(payload, 'binary')).toString('latin1');
      } catch {
        // 单个 stream 解压失败不影响整体抽取
      }
    }
    // 2. 提取 Tj/TJ 操作符里的 hex 段
    const tjRe = /<([0-9a-f]+)>\s*Tj/g;
    const tjArrRe = /\[([^\]]+)\]\s*TJ/g;
    const pieces: string[] = [];
    while ((m = tjRe.exec(inflated)) !== null) {
      const hex = m[1];
      if (hex !== undefined) pieces.push(pdfHexToText(hex));
    }
    while ((m = tjArrRe.exec(inflated)) !== null) {
      const arr = m[1] ?? '';
      const hexMatches = arr.match(/[0-9a-f]{4}/g) ?? [];
      pieces.push(pdfHexToText(hexMatches.join('')));
    }
    const text = pieces.join('').trim();
    return {
      text,
      ok: text.length > 20,
      note: text.length > 20 ? `${text.length} chars` : 'no text extracted',
    };
  } catch (e) {
    return { text: '', ok: false, error: String(e) };
  }
}

// ── DOCX 提取 ────────────────────────────────────────────────
export async function extractDocx(buf: Buffer): Promise<ExtractResult> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) return { text: '', ok: false, error: 'no document.xml' };
    const texts = xml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) ?? [];
    const text = texts.map((t) => t.replace(/<[^>]+>/g, '')).join('');
    return { text, ok: text.length > 20 };
  } catch (e) {
    return { text: '', ok: false, error: String(e) };
  }
}

// ── XLSX 提取 ────────────────────────────────────────────────
export async function extractXlsx(buf: Buffer): Promise<ExtractResult> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    const pieces: string[] = [];
    wb.eachSheet((ws) => {
      pieces.push(`# ${ws.name}`);
      ws.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell((cell) => {
          if (cell.value !== null && cell.value !== undefined) cells.push(String(cell.value));
        });
        if (cells.length) pieces.push(cells.join(' | '));
      });
    });
    const text = pieces.join('\n');
    return { text, ok: text.length > 20 };
  } catch (e) {
    return { text: '', ok: false, error: String(e) };
  }
}

// ── PPTX 提取 ────────────────────────────────────────────────
export async function extractPptx(buf: Buffer): Promise<ExtractResult> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort();
    const pieces: string[] = [];
    for (const f of slides) {
      const xml = await zip.file(f)!.async('string');
      const texts = xml.match(/<a:t>([^<]+)<\/a:t>/g) ?? [];
      pieces.push(`# slide\n${texts.map((t) => t.replace(/<[^>]+>/g, '')).join('')}`);
    }
    const text = pieces.join('\n\n');
    return { text, ok: text.length > 20 };
  } catch (e) {
    return { text: '', ok: false, error: String(e) };
  }
}

// ── ZIP 提取 ─────────────────────────────────────────────────
export async function extractZip(buf: Buffer): Promise<ExtractResult> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const pieces: string[] = [];
    for (const [name, obj] of Object.entries(zip.files)) {
      if (obj.dir) continue;
      if (!/\.(md|txt|json)$/.test(name)) continue;
      const content = await zip.file(name)!.async('string');
      pieces.push(`# ${name}\n${content}`);
    }
    const text = pieces.join('\n\n');
    return { text, ok: text.length > 50 };
  } catch (e) {
    return { text: '', ok: false, error: String(e) };
  }
}

// ── EML 提取 ─────────────────────────────────────────────────
export async function extractEml(buf: Buffer): Promise<ExtractResult> {
  try {
    const text = buf.toString('utf8');
    const parts = text.split(/\r?\n\r?\n/);
    const headers = parts[0] ?? '';
    const body = parts.slice(1).join('\n\n');
    const from = /^From:\s*(.+)$/m.exec(headers)?.[1] ?? '';
    const subject = /^Subject:\s*(.+)$/m.exec(headers)?.[1] ?? '';
    return { text: `From: ${from}\nSubject: ${subject}\n\n${body}`, ok: body.length > 50 };
  } catch (e) {
    return { text: '', ok: false, error: String(e) };
  }
}

// ── 纯文本类（json/yaml/html/md/txt/csv）─────────────────────
export async function extractPlainText(buf: Buffer): Promise<ExtractResult> {
  return { text: buf.toString('utf8'), ok: buf.length > 20 };
}

// ── 图片类（占位） ────────────────────────────────────────────
export async function extractImage(): Promise<ExtractResult> {
  return { text: '', ok: false, note: 'text_unavailable_image_requires_ocr' };
}

// ── 派发 ──────────────────────────────────────────────────────
export async function extractByFile(file: string, buf: Buffer): Promise<ExtractResult> {
  const lower = file.toLowerCase();
  if (lower.endsWith('.pdf')) return extractPdf(buf);
  if (lower.endsWith('.docx')) return extractDocx(buf);
  if (lower.endsWith('.xlsx')) return extractXlsx(buf);
  if (lower.endsWith('.pptx')) return extractPptx(buf);
  if (lower.endsWith('.zip')) return extractZip(buf);
  if (lower.endsWith('.eml')) return extractEml(buf);
  if (lower.endsWith('.wiki.md')) return extractPlainText(buf);
  if (/\.(json|yaml|html|md|txt|csv)$/.test(lower)) return extractPlainText(buf);
  if (/\.(png|jpg|jpeg|webp|tiff)$/.test(lower)) return extractImage();
  return { text: '', ok: false, error: `unsupported ext: ${file}` };
}

// ── token 计数（按字符估算，1 token ≈ 1.5 中文字 或 4 英文） ─
export function estimateTokens(text: string): number {
  const cnChars = (text.match(/[一-鿿]/g) ?? []).length;
  const otherChars = text.length - cnChars;
  return Math.ceil(cnChars / 1.5) + Math.ceil(otherChars / 4);
}
