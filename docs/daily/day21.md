# Day 21 — 多格式语料 + RAG-ready pipeline

> 65 天 AI Agent 工程师训练营 · Day 21 / 65
> 主题：构建 200 份多格式企业规章语料 + RAG 准备 pipeline（manifest → extract → chunk），为 Day 22+ 真接 lancedb 打地基。
> 前置：Day 20 retrieveMerged + rerank eval 闭环 + Day 18.5 force reindex。

---

## ⚠️ 路线修正（First things first）

**原路线表 Day 21 = "retrieveMerged 合并噪声修复"**——但今天老大（2026-09-10 上午）拍板**改做语料准备**：

> "我们 Day 19-20 一直在跑 ADR/day12/day07 这点东西，没有真语料；先攒一批真语料，再做合并策略才有意义。"

**Day 21 修正为**：3 件事一起做

1. **多格式生成器**——200 份企业规章制度（5 大类 × 20 份 + 17 种格式），带"陷阱条款"做 RAG ground-truth 评测
2. **多格式 parser + verify**——verify_corpus 验证 200 份全可读
3. **RAG-ready pipeline**——manifest（索引）+ extractors（多格式解析）+ chunker（按 ## 切）三个模块

**关键决策链**：
1. 老板拍板：**走"真语料"路线，不纸上谈兵**
2. 选 17 种格式覆盖（PDF/MD/DOCX/XLSX/PPTX/PNG/JPG/WEBP/TIFF/EML/ZIP/HTML/CSV/TXT/JSON/YAML/wiki.md），不做 OCR（图片占位）
3. 不上 embedding / lancedb（推 Day 22+），今天只做 RAG-ready 层

---

## 🎯 今日目标

1. ✅ `examples/day21/gen_corporate_docs.ts`（100 份，含"陷阱条款"）
2. ✅ `examples/day21/gen_corporate_docs_extra.ts`（100 份扩展格式）
3. ✅ `examples/day21/verify_corpus.ts`（多格式 parser + 验证）
4. ✅ `examples/day21/rag-ready/manifest.ts`（元数据索引）
5. ✅ `examples/day21/rag-ready/extractors.ts`（17 种格式纯文本提取）
6. ✅ `examples/day21/rag-ready/chunker.ts`（按 ## 段 + token 上限切）
7. ✅ `examples/day21/ex_001_rag_ready_pipeline.ts`（串起 3 个模块）
8. ✅ `tests/fixtures/corporate-docs/` 200 份 fixture（17 格式）
9. ✅ `docs/daily/day21.md` 3 关齐
10. ⏸️ memory retro（多格式抽取限制 + wiki.md regex 坑）

---

## 📊 真活数据

### 交付 1：200 份多格式语料（gen_corporate_docs + gen_corporate_docs_extra）

**类别分布**（5 大类 × 20 份 = 100 + 扩展 100）：
| 类别 | 主脚本 | extra 脚本 | 总计 |
|---|---|---|---|
| 人事 | 20 | 20 | 40 |
| 行政 | 20 | 20 | 40 |
| 财务 | 20 | 20 | 40 |
| IT | 20 | 20 | 40 |
| 法务 | 20 | 20 | 40 |

**格式分布**（17 种）：
| 扩展名 | 总数 | 格式 |
|---|---|---|
| pdf | 30 | pdfkit 生成（10 扫描件带印章/已盖章 标记）|
| md | 40 | 主脚本 20 + frontmatter 10 + wiki 链接 10 |
| docx | 15 | docx 包 |
| xlsx | 10 | exceljs |
| pptx | 5 | pptxgenjs |
| png | 5 | sharp SVG→PNG（模拟扫描件）|
| jpg / webp / tiff | 10 / 10 / 10 | sharp 转换（图片占位，**无 OCR**）|
| eml | 10 | 邮件格式 |
| zip | 10 | 内嵌 md/txt/json |
| json / yaml | 10 / 10 | 结构化文档 |
| html / csv / txt | 5 / 5 / 5 | 纯文本类 |

**"陷阱条款"机制**：gen_corporate_docs 在某些文件埋"前后矛盾条款"（如"以旧文为准"），为后续 Day 22+ 做 ground-truth 评测用。

### 交付 2：verify_corpus 验证（200/200 通过）

```
扩展名             总数      通过失败率
--------------------------------------------------
md              40      40100%
pdf             30      30100%
docx            15      15100%
xlsx            10      10100%
eml             10      10100%
zip             10      10100%
jpg             10      10100%
webp            10      10100%
tiff            10      10100%
json            10      10100%
yaml            10      10100%
wiki.md         10      10100%
pptx             5       5100%
png              5       5100%
html             5       5100%
csv              5       5100%
txt              5       5100%
--------------------------------------------------
TOTAL          200     200

✅ 所有文件全部通过验证
```

### 交付 3：RAG-ready pipeline（manifest → extract → chunk）

**ex_001_rag_ready_pipeline 跑通数据**：

```
=== pipeline 汇总 ===
总文件数:        200
文本提取成功:    135（含正常 md/pdf/docx/xlsx/pptx/zip/eml/json/yaml/html/csv/txt/wiki.md）
图片无 OCR:      35（PNG/JPG/WEBP/TIFF 占位）
空/失败:         30（PDF CMap 简化提取 + PPTX 简化 XML 解析）
总 chunks:       259
总 tokens:       98897
平均 chunk 数:   1.9 / 文件
平均 chunk tokens: 382
耗时:            296ms（含 buildManifest 42ms + extract+chunk 254ms）
```

**3 个模块职责**：

| 模块 | 职责 | 输出 |
|---|---|---|
| `manifest.ts` | 扫文件名 `NNN_<cat>_<title>.<ext>` 派生 id/category/title/format/keywords | `ManifestEntry[]` |
| `extractors.ts` | 17 种格式 → 纯文本（含 token 估算）| `ExtractResult { text, ok, note }` |
| `chunker.ts` | 按 ## 段切 + token 上限 512 / overlap 64 / 段内按句切 | `Chunk[]` |

---

## 🔬 关键发现：多格式抽取的局限（今日埋 TODO）

### 1. PDF 抽取依赖 CMap 近似

`extractPdf` 用 PDFKit 输出的 SimHei 子集化 CMap 做 CID→Unicode 近似：
- **CID 落在 0x4E00-0x9FFF**（CJK 基本区）→ 直接当 Unicode（TrueType 子集化时 CID=Unicode）
- 其他 CID → 丢弃

**后果**：
- ✅ 标题、关键词、正文段落能抽出
- ❌ 标点符号（，。）在 CID 空间被丢弃 → 抽出的中文没有标点
- ❌ 数字、英文单词同样丢失
- ❌ 表格/列表结构不可还原（PDFKit 流式布局）

**根因**：pdfkit 输出 PDF 用 `FlateDecode` 压缩 stream，Tj/TJ 操作符内是 hex 编码的 CID；要真解需要 TTF/OTF 解析或 OCR。

**Day 22+ 候选**：
- **方案 A**：换 PDF 生成器（puppeteer + headless Chrome）→ 文本层清晰，但体积大
- **方案 B**：抽取时仅看 `Catalog.Pages` 结构 + 章节标题，body 标记为"需 OCR"
- **方案 C**：用 `pdf-parse` 第三方解析（引入新依赖 → 红线）

### 2. PPTX 抽取简化 XML 解析

`extractPptx` 用 JSZip 解 zip + 正则 `<a:t>...</a:t>` 抓文本：
- ✅ 段落文本能抽
- ❌ 表格、图片、SmartArt 全丢
- ❌ 母版、主题、字体不保留

**根因**：pptxgenjs 输出格式简单（每页一段文本 + 标题），所以简化解析够用。但若换"复杂模板"PPT 就会漏。

### 3. 图片无 OCR

`extractImage` 直接返回 `note: 'text_unavailable_image_requires_ocr'`：
- ✅ 占位语义清晰
- ❌ 真要 OCR 需要 Tesseract.js 或云 OCR（依赖红线）

**Day 22+ 候选**：要不要给 fixture 加 ground-truth 文本（在文件名或 frontmatter），让 OCR 结果可对照。

### 4. wiki.md regex 坑（已修）

原代码：
```ts
const FILE_RE_WIKI = /^(\d{3,})_([^_]+)_(.+)\.wiki\.md$/;
// 只有 4 个 capture group，没有 format
```

调用方访问 `mStd[4]`（format）→ undefined → `if (!format) continue` 把所有 wiki.md 跳过。

**修法**：FILE_RE_WIKI 加 `(wiki\.md)` capture，format 字段统一为 `'wiki.md'`。

**怎么发现**：跑 ex_001 后总文件数 190 != 200，反查 manifest → 漏 10 个 wiki.md 文件 → debug regex → 找到根因。

**教训**：写完 regex 一定要列反例（边界文件名）跑一遍再 commit。

---

## 🧠 今日教训：type 错误不是"lint 噪音"而是"运行时可能崩"

`pnpm typecheck` 一开始报 **22 处**错误（[[exactOptionalPropertyTypes-gotcha]] 已知坑），分布在 manifest.ts / verify_corpus.ts / extractors.ts / gen_corporate_docs*.ts。

**修复分类**：
| 类型 | 处数 | 修法 |
|---|---|---|
| `RegExpExecArray[i]` undefined → 期望 string | 11 | `?? ''` fallback / 显式 guard |
| `Object.keys(zip.files)[i]` 隐式 any | 2 | 改 `Object.entries` + 解构 |
| Buffer<ArrayBufferLike> vs Buffer | 2 | `buf.buffer.slice(...) as ArrayBuffer` |
| `exactOptionalPropertyTypes` 严格区分 | 1 | 条件 spread `...(trap ? { trapClause } : {})` |
| 无 d.ts 的库（pdfkit / pptxgenjs）| 2 | `@ts-expect-error` / `as any` 注释 |
| `noUncheckedIndexedAccess` | 4 | guard `if (entry === undefined) continue` |

**关键教训**：
- 之前 day19-20 报告"3 处类型错"是**未走完整 grep**的失误（`pnpm typecheck 2>&1 | grep` 我自己只看 head -20）
- **正确做法**：`pnpm typecheck 2>&1 | wc -l` 先看总数，再 grep 看分布
- 22 处看着吓人，但每类都是已知模式（[[exactOptionalPropertyTypes-gotcha]]）→ 批量修不超 30 分钟

---

## ❌ 今天不做

- ❌ 不嵌入（chunks 不调 embed API）→ Day 22+ 真接 lancedb 再说
- ❌ 不写 lancedb 入库脚本（产物只到 Chunk[]）→ Day 22+
- ❌ 不做 OCR（图片 extractor 占位）→ Day 22+ 评估
- ❌ 不抽 `embedByFile` 通用接口（今天每个 extractor 独立）
- ❌ 不接 RAG eval harness（要等 Day 22+ 有 ground-truth 才能做）
- ❌ 不修 retrieveMerged 合并噪声（推 Day 22+，跟 ground-truth 一起做）

---

## 🔬 反例验证（5 个）

1. ✅ wiki.md 文件名带 `.wiki.md` 后缀（双后缀）→ manifest FILE_RE_WIKI 改 capture 后能正确解析
2. ✅ 文件名带 4 位 ID（如 `1001_xxx.pdf`）→ FILE_RE `\d{3,}` 允许 ≥3 位 → OK
3. ✅ PDF 文件损坏（0 bytes）→ verify_corpus 标记"0 bytes" 不崩
4. ✅ chunkText 输入超长段（> 512 tokens）→ packByTokens 按句切 + overlap 64
5. ✅ 图片格式（PNG/JPG/WEBP/TIFF）→ extractByFile 派发到 extractImage 返回 text_unavailable_image_requires_ocr，不抛错

---

## 📋 5 闸必跑结果

| 闸 | 命令 | 结果 |
|---|---|---|
| 1. typecheck | `pnpm typecheck` | exit 0（修了 22 处）|
| 2. typecheck:web | `pnpm typecheck:web` | exit 0（未触及 web）|
| 3. lint | `pnpm lint` | exit 0 |
| 4. 单测 | `npx vitest run tests/` | exit 0 |
| 5a. ex_001 | `pnpm exec tsx examples/day21/ex_001_rag_ready_pipeline.ts` | ✅ 200 文件 → 135 文本 / 35 图片占位 / 30 空失败，259 chunks |
| 5b. verify_corpus | `pnpm exec tsx examples/day21/verify_corpus.ts` | ✅ 200/200 通过 |
| 5c. Chrome MCP | 不适用（Day 21 是离线脚本生成/验证，无 UI）| ⏸️ 跳过 |

---

## 🎯 JD 映射

### JD-1 命中
| 关键词 | 今日命中点 |
|---|---|
| **Retrieval / RAG** | RAG-ready 三件套（manifest/extract/chunk）—— 把 Day 18 chunkByHeadingSmart 通用化到 17 种格式 |
| **Data pipeline** | 多格式生成器（17 种 × 200 份）+ 验证器—— 工程化语料生产能力 |
| **Debugging / 诊断** | typecheck 22 处错误分类修复 + wiki.md regex 坑（从 190 ≠ 200 反查根因）|

### JD-2 钩子
| 关键词 | 今日命中点 |
|---|---|
| **多格式处理** | 17 种格式的真实工程取舍（PDF CMap / PPTX 简化 / 图片占位）—— 不引入 OCR 重型依赖 |
| **依赖控制** | 7 个新 devDep 全是 fixture 生成/解析用途，没碰 libs/* 主链路 |
| **测试基建** | verify_corpus 作为 RAG 语料质量门槛—— Day 22+ 改 chunking 后可回归 |

---

## 🛣 Day 22+ 路线

### 候选 1：真接 lancedb 入库（路线表 Day 21+）

**What**：把 ex_001 产出的 Chunk[] 走 embed API → lancedb 入库（按 manifest 命名 `${prefix}_<format>`）。
**Why**：Day 21 准备了 200 份真语料 + RAG-ready chunks，不入库浪费。
**前置**：Day 18 chunkByHeadingSmart 仍是 heading 切法，Day 22 可换 chunker.ts 的策略 A/B/C。

### 候选 2：retrieveMerged 合并噪声修复（Day 20 候选 1）

**What**：合并前按 source 去重（每个 source 留 1 个最低距离），或扩大 K + 按 source 限额。
**Why 不今天做**：Day 22+ 有真语料后，Q1 召回失败用真语料复现更有说服力。
**前置**：Day 22 入库完成后做。

### 候选 3：PDF/PPTX 抽取增强（Day 21 候选）

**What**：用 puppeteer + headless Chrome 重新生成 PDF（拿到清晰文本层），或 pdf-parse 第三方解析。
**Why 不今天做**：红线（引入新依赖 / 大型依赖）；先 Day 22 看真 eval 数字决定要不要修。
**前置**：Day 22+ eval harness 给数字。

---

## 📎 相关引用

- Pipeline example: [examples/day21/ex_001_rag_ready_pipeline.ts](../../examples/day21/ex_001_rag_ready_pipeline.ts)
- 生成器 1（100 份）: [examples/day21/gen_corporate_docs.ts](../../examples/day21/gen_corporate_docs.ts)
- 生成器 2（100 份扩展）: [examples/day21/gen_corporate_docs_extra.ts](../../examples/day21/gen_corporate_docs_extra.ts)
- 验证器: [examples/day21/verify_corpus.ts](../../examples/day21/verify_corpus.ts)
- Manifest 索引: [examples/day21/rag-ready/manifest.ts](../../examples/day21/rag-ready/manifest.ts)
- 多格式提取: [examples/day21/rag-ready/extractors.ts](../../examples/day21/rag-ready/extractors.ts)
- Chunk 切分: [examples/day21/rag-ready/chunker.ts](../../examples/day21/rag-ready/chunker.ts)
- Fixture 200 份: [tests/fixtures/corporate-docs/](../../tests/fixtures/corporate-docs/)
- Memory（即将写入）: wiki.md regex 坑 / type 22 处批量修 / 多格式抽取限制
- Day 20: [docs/daily/day20.md](./day20.md) — retrieveMerged 合并噪声 + Q3 诊断
- Day 19: [docs/daily/day19.md](./day19.md) — heading-only rerank 9/9
