# Notion Import 设计 Spec

- **日期**：2026-08-25
- **状态**：待审批（design 阶段完成；spec self-review 待做）
- **作者**：肥老大 + Claude（Architect 模式）
- **关联路径**：[brainstorming](./) → [writing-plans](../../README.md) → 实施

---

## 1. Context

### 1.1 背景

`agent-engineer-bootcamp` 仓库的 `libs/rag/*` 已成型（Day 13 RAG 学习），支持从本地 markdown 文件增量索引到 lancedb。**当前局限**：数据源只能是 `fs.readFile()` 读出的 markdown 文件。

用户拥有个人 Notion workspace（< 500 page），希望把全部笔记导入 RAG，让本地 RAG 召回能覆盖个人笔记。

### 1.2 关键决策汇总

| 维度 | 决策 | 替代方案（未选） |
|----|----|----|
| 用户场景 | Personal use / Single user | Workspace 多用户、Public content |
| 规模 | < 500 page | 中量、重量 |
| 存储位置 | A：同仓 `.lancedb/rag`，新表 `chunks_notion_*` | B：独立全局路径；C：独立子项目 |
| Notion 认证 | Internal Integration（secret token） | OAuth 2.0 |
| 同步策略 | 手动 + page-level diff（基于 `last_edited_time`） | 全量重拉、定时后台、实时 |
| 切分 | 复用现有 `chunkByHeading` / `chunkByParagraph` | 自定义 Notion-aware chunk |
| chunk.id 生成 | `${source}#${chunkOrdinal}`（page 内单调递增，替代 `byteStart-byteEnd`）| 维持 byte 范围 |
| 内容保真 | 纯文本 + 必要结构（title / heading / paragraph / code / list / quote / callout / toggle） | 加 database metadata、原生 markdown |
| 架构 | 方案 2：`libs/notion` lib + `examples/notion_import/main.ts` | 单文件管道、插件式抽象 |

### 1.3 命名约定

- 新 lib 路径：`libs/notion/{fetch,to-markdown,diff,index}.ts`
- 新 example 路径：`examples/notion_import/main.ts`
- lancedb 表命名：`chunks_notion_heading`、`chunks_notion_paragraph`、`chunks_notion_meta`
- meta namespace：`${prefix}_meta` 保持现有约定

---

## 2. Goals & Non-Goals

### 2.1 Goals（必须达到）

1. **可运行**：`examples/notion_import/main.ts` 跑完把全部 Notion page 入库
2. **幂等**：相同 page 跑两次，第二次 `unchanged.length === pageCount`
3. **可调试**：import 报告清晰列出 `added / modified / removed / unreachable / skipped`
4. **可测试**：核心转换（page → markdown）、diff 逻辑有单元测试
5. **零回退**：现有 `ex_001` / `ex_002` bootcamp 路径不破坏
6. **可观测**：失败 page / embed fallback / 限流重试都进报告

### 2.2 Non-Goals（明确不做）

- ❌ 数据库 page 展开（database 行不进库）
- ❌ 嵌套 child page 递归拉取
- ❌ 实时同步 / 后台 watcher
- ❌ 主动生成 Notion 评测集
- ❌ Notion web UI / GUI
- ❌ 多 workspace 支持
- ❌ 全仓库 `libs/rag` 抽象化（保持 bootcamp 强耦合）

---

## 3. Architecture

### 3.1 组件图

```
┌─────────────────────────────────────────────────────────┐
│  examples/notion_import/main.ts                          │
│    - 读 env：NOTION_TOKEN / OPENAI_* / EMBED_*           │
│    - 编排：fetch → diff → convert → index                │
│    - 打印 import 报告                                   │
└─────────────────────────────────────────────────────────┘
            ↓ 调                ↓ 调               ↓ 调
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ libs/notion/     │  │ libs/notion/     │  │ libs/rag/        │
│   fetch.ts       │  │   diff.ts        │  │   indexer.ts     │
│ - 限流 350ms     │  │ - 适配 NotionDoc │  │ - incrementalIn  │
│ - 429 重试 3 次  │  │   → DocSource    │  │   dex(DocSource  │
│ - async gen 分页 │  │ - 复用 diffDocs  │  │     [], {        │
│ - 403 标记       │  │                  │  │     tablePrefix: │
│   unreachable    │  │                  │  │     'chunks_     │
│                  │  │                  │  │     notion'})    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
            ↑
┌──────────────────────────────────────────────────┐
│ libs/notion/to-markdown.ts                         │
│    - page → markdown 字符串                       │
│    - block 类型映射（见 5.2）                      │
│    - 纯函数（无 IO），便于单测                     │
└──────────────────────────────────────────────────┘
```

### 3.2 职责边界

| 组件 | 职责 | 不做什么 |
|----|----|----|
| `examples/notion_import/main.ts` | 编排 + 报告 + env 读取 | 不处理 Notion SDK 细节 |
| `libs/notion/fetch.ts` | Notion API 调用、限流、分页、错误分类 | 不产 markdown、不入库 |
| `libs/notion/to-markdown.ts` | page object → markdown string | 不读网络、不入库 |
| `libs/notion/diff.ts` | 适配 NotionDoc → DocSource，复用 `diffDocs` | 不拉网络 |
| `libs/rag/indexer.ts` | DocSource 抽象、增量索引、chunk 切分、向量写入 | 不感知 Notion 存在 |

**核心约束**：`libs/rag/*` **不引用** `@notionhq/client`。Notion 知识封死在 `libs/notion/*` 内部。

---

## 4. Data Model

### 4.1 NotionDoc（中间表示）

```ts
// libs/notion/index.ts 导出
export interface NotionDoc {
  /** Notion page UUID（无横线） */
  readonly pageId: string;
  /** diff 用毫秒时间戳 */
  readonly lastEditedMs: number;
  /** human-readable debug 用，原始 ISO 格式 */
  readonly lastEditedIso: string;
  /** 标识数据源 */
  readonly sourceKind: 'notion';
  /** lancedb `source` 字段值；debug / 评测用 */
  /** 例: 'workspace:Daily / 2026 / Day09 Review' */
  readonly sourceLabel: string;
  /** 转换后的 markdown 文本 */
  readonly content: string;
  /** 失败但被跳过时为 true */
  readonly unreachable?: boolean;
}
```

### 4.2 DocSource（重构 `libs/rag/indexer.ts` 内部）

```ts
// libs/rag/indexer.ts 内部新增
export interface DocSource {
  /** 主键 / diff key：文件用 relPath，Notion 用 pageId */
  readonly sourceKey: string;
  /** lancedb `source` 字段 */
  readonly sourceLabel: string;
  /** markdown 中间表示 */
  readonly content: string;
  readonly sourceKind: SourceKind;
  /** diff 时间：文件 mtimeMs；Notion lastEditedMs */
  readonly updatedMs: number;
  /** SHA-256 指纹，diff 兜底 */
  readonly contentHash: string;
}
```

`DocEntry[]`（filesys）通过 `map` 转 `DocSource[]`：

```ts
const sources: DocSource[] = docs.map((d) => ({
  sourceKey: d.relPath,
  sourceLabel: d.relPath,
  content: d.content,
  sourceKind: d.kind,
  updatedMs: mtimeMs,
  contentHash: hashText(d.content),
}));
```

`incrementalIndex(sources, opts)` 接收 `DocSource[]`。**外部 callers（ex_001/ex_002）接口不变**——只在 `incrementalIndex` 内部做 `DocEntry[] → DocSource[]` 转换。

### 4.3 chunk.id 生成

```ts
// libs/rag/indexer.ts buildRecords 内
id: `${c.source}#${c.byteStart}-${c.byteEnd}`  // 现有
// 改为：
id: `${c.source}#${chunkOrdinal}`              // page 内单调递增
```

byteStart/byteEnd 对 Notion 无意义。`chunkOrdinal` 在 page 内从 0 起，跨 run 稳定。

### 4.4 lancedb 表

| 表名 | 用途 |
|----|----|
| `chunks_notion_heading` | heading 切向量化结果 |
| `chunks_notion_paragraph` | paragraph 切向量化结果 |
| `chunks_notion_meta` | page-level diff 元数据 |

与现有 `chunks_*`（bootcamp）namespace 隔离，互不污染。

---

## 5. Pipeline

### 5.1 总流程

```
[1] 读 env
[2] init Notion client + lancedb
[3] 拉全部可见 page（search API，async gen）
[4] 拉每个 page 的 children blocks（限流 350ms）
[5] page object → markdown (to-markdown)
[6] 构造 NotionDoc[]
[7] 适配 DocSource[]
[8] incrementalIndex(sources, { tablePrefix: 'chunks_notion', force: false })
[9] 打印报告
```

### 5.2 block 转换规则

| Notion block 类型 | 输出 markdown |
|---------------|--------------|
| `paragraph` | 纯文本，保留行内格式（bold/italic/code） |
| `heading_1/2/3` | `# / ## / ###` |
| `bulleted_list_item` / `numbered_list_item` | `- ` / `1. `（每项一行）|
| `code` | fenced block + 语言标签 |
| `quote` | `> ` 前缀 |
| `callout` | `> {icon} ` 前缀 |
| `toggle` | 内嵌子块进父块 |
| `image` / `file` / `video` | `[image: {caption}]` / `[file]` / `[video]` 占位 |
| `table` | 每行转 `\| col1 \| col2 \|`，转 k-v 段 |
| `child_page` | **drop**（不递归）|
| 其他未知 | `[unsupported: {type}]` |

**关键**：不去递归 `child_page`——避免树爆炸。

### 5.3 fetch 限流与重试

```ts
// libs/notion/fetch.ts
const RATE_LIMIT_INTERVAL_MS = 350;  // ~2.8 req/s

async function notionCall<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isRateLimitError(e) && retries > 0) {
      await sleep(2000);
      return notionCall(fn, retries - 1);
    }
    throw e;
  }
}
```

`isRateLimitError(e)`：`e.code === 'rate_limited'` 或 `e.status === 429`。

### 5.4 错误分类

| 错误 | 处理 |
|----|----|
| 401 / 403（page 不可访问）| 标记 `unreachable: true`，diff 时按 removed 处理 |
| 404 | 同上 |
| 429 | 重试 3 次（退避 2s）后仍失败 → 整脚本抛错 |
| 5xx | 同 429 |
| network error | 抛错（脚本终止）|
| block 转换异常 | 当前 page 标记 `unreachable: true` + warn |

### 5.5 增量 diff 实现

`libs/notion/diff.ts` 适配层：

```ts
import { diffDocs, type DiffResult } from '../rag/indexer.js';
import type { NotionDoc } from './index.js';

export function diffNotion(current: readonly NotionDoc[]): DiffResult {
  const enriched = current.map((d) => ({
    source: d.pageId,
    mtimeMs: d.lastEditedMs,
    hash: hashText(d.content),
  }));
  // 构造缓存 meta：来自 lancedb meta 表
  const cached = await loadCachedMeta();
  return diffDocs(enriched, cached);
}
```

`diffDocs`（`libs/rag/indexer.ts:97`）**零改动**。

### 5.6 报告输出格式

```
>>> Notion import starting
>>> Fetching pages... 487 pages in 173s (2.8 req/s avg)
>>> Diff: +12 added, +8 modified, -3 removed, 467 unchanged, 0 unreachable
>>> Embed: 32 chunks (20 heading, 12 paragraph), 2 fallback 占位
>>> Write: 32 chunks in 0.3s
>>> Total: 178s
```

任何 failure 必须有输出，**绝不静默**。

### 5.7 `--dry-run` 模式

实施首日必加的开关。第一次跑真 import 之前用 dry-run 验证全链路：

```
npx tsx examples/notion_import/main.ts --dry-run
```

| 阶段 | dry-run 行为 | 正常行为 |
|---|----|----|
| [3] fetch pages | ✅ 跑，拉全部 page | ✅ |
| [4] fetch blocks | ✅ 跑 | ✅ |
| [5] to-markdown | ✅ 跑 | ✅ |
| [6] construct NotionDoc[] | ✅ 打印 NotionDoc 数量 + sample | ✅ |
| [7] adapt to DocSource[] | ✅ 打印 DocSource 数量 | ✅ |
| [8] incrementalIndex | ⚠️ **跳过 lancedb.add**，但 diff 仍跑，**只报告 diff 结果** | ✅ 写入 |
| [9] 报告 | ✅ 打印预期 +12 added 等 | ✅ 打印实际 |

dry-run 显式区分"未写入"事实：报告开头打印 `DRY-RUN MODE: no writes to lancedb`。

---

## 6. Sync Strategy

### 6.1 page-level diff

- key：pageId（不是 content hash，因为 path 必须稳定）
- 判定：mtimeMs OR hash 变 → modified
- 重复 add 风险：用 `chunkOrdinal` 保证 id 稳定 + lancedb `add` 行为**需验证**（见 R1）

### 6.2 unreachable 处理

`unreachable` page 在本次 import 跳过拉取，写入 meta `mtimeMs=0, hash='UNREACHABLE'`。下次 diff：

```
meta.mtimeMs=0, hash='UNREACHABLE'
current 不可见（fetch 抛 403）
→ removed（按规则清理）
```

如果 next run page 重新可见（share 恢复）：

```
meta.removed
current.lastEditedMs > 0, hash != 'UNREACHABLE'
→ added（重拉）
```

### 6.3 删除语义

- workspace 删 page → API 不可见 → diff.removed → 删 chunks
- archive page → API 不可见（archive 等同删除外部视角）→ diff.removed
- **不能恢复**（除非用户手动从 trash restore）

---

## 7. Error Handling

### 7.1 lib 层错误模式

| 层 | 错误 | 处理 |
|----|----|----|
| `fetch.ts` | 网络/超时 | 抛错让 caller 决定 |
| `fetch.ts` | 401/403/404 | 标记 `unreachable`，**不抛** |
| `fetch.ts` | 429 | 重试 3 次后抛 |
| `to-markdown.ts` | block 类型未知 | warn 占位符，继续 |
| `to-markdown.ts` | block 转换异常 | page 级 unreachable + warn |
| `libs/rag/*` | 抛错（保持现有） | 例外上抛 |
| `examples/*` | 捕获 + 打印 + exit 1 | 不静默 |

### 7.2 重试边界

- 单 page 重试：**3 次**（fetch 失败）
- 整脚本重试：**0 次**（用户手动重跑）

### 7.3 失败恢复路径

| 失败点 | 重跑行为 |
|----|----|
| fetch 中途 | 重跑，已成功的 page 在 meta |
| embed 中途 | 重跑，diff 仍判 modified，重 embed |
| write 中途 | **依赖 R1 验证**（lancedb id 稳定性）|

---

## 8. Boundaries & Privacy

### 8.1 数据源边界表

| 场景 | 处理 |
|----|----|
| 个人 workspace page | ✅ 全部拉 |
| 嵌套子 page | ❌ 跳过不递归 |
| image / file / video | 转占位文本 |
| database page | ❌ 不展开行（每行非 page，不展开）|
| 共享 page | ✅（integration 权限范围内）|
| 跨 workspace page | ❌（integration 看不到）|
| 已删除 page（trash）| ❌ |
| 表格 block | 转 k-v 段 |

### 8.2 隐私与凭证

| 维度 | 边界 |
|----|----|
| Notion 内容上传 | ❌ **不上传**（除 embed API）|
| Embed 数据流向 | 走 `OPENAI_BASE_URL`，与现有 RAG 一致 |
| Token 存储 | `.env`（git-ignored）|
| 评估 / debug 数据 | 本地文件输出，**不外发**|
| 监控 / telemetry | **不引入**|

### 8.3 环境变量

```bash
# .env (不 commit)
NOTION_TOKEN=secret_xxx                # Notion internal integration secret
OPENAI_API_KEY=sk-xxx                  # 现有
OPENAI_BASE_URL=https://...            # 可选
EMBEDDING_MODEL_NAME=qwen3-...         # 可选
```

---

## 9. Dependencies

### 9.1 package.json 变化

```jsonc
{
  "dependencies": {
    "@notionhq/client": "^2.2.15"  // 仅新增
  }
}
```

### 9.2 红线检查

- ✅ `libs/rag/*` **零引用** `@notionhq/client`（隔离生效）
- ✅ Notion knowledge 封死在 `libs/notion/*` 内部
- ✅ 凭据从 env 注入（按 ADR-0001）
- ✅ 不绑 SDK 到 RAG 库

### 9.3 不动的依赖

- `lancedb`
- `embedding` 协议（OpenAI-compatible 通过 `fetch`）
- `node:fs`、`node:crypto`

---

## 10. Risks

| # | 风险 | 概率 | 影响 | 缓解 |
|---|----|----|----|----|
| R1 | lancedb 默认 `add` 是 append，不去重；跨 run 重复入库 | 中 | DB 虚胖 | **实施首日验证**：跑 dry-run 验证 id 稳定性；失败改 `mode: 'overwrite'` 或 `merge_insert` |
| R2 | `@notionhq/client` major 升破坏 API | 低 | fetch.ts 重写 | lock 版本（`^2.2.15`，不锁定 patch）|
| R3 | 429 限流单 page 重试 3 次不够 | 低 | import 整体失败 | 提高 retries=5、间隔 350→500ms；今天不实现 |
| R4 | child_page 不递归，导致子 page 永不进库 | 中 | 用户预期偏差 | spec 已声明 + UI 告知 |
| R5 | embed `fallback` silent skip，Notion dirty chunk 静默丢失 | 中 | 召回召回不到 | import 报告 `embedFallbacks` 字段 |
| R6 | DocSource 重构破坏 ex_001 / ex_002 测试 | 中 | bootcamp 路径断 | 实施前跑基线；分 commit；每步回归 |
| R7 | NOTION_TOKEN 误 commit | 低 | 凭证泄露 | .gitignore 早期加；`git check-ignore .env` 必跑 |
| R8 | Notion 加新 block 类型 | 中 | 转换器过时 | `[unsupported: type]` 占位；warn 不停 |

### 10.1 关键验证项（实施首日必跑）

- [ ] **R1 验证**：手动跑一次 dry-run，确认 chunk.id 跨 run 稳定
- [ ] **ex_001 / ex_002 回归**：跑现有 7 条 query，分数不变
- [ ] **dry-run 模式**：第一次实施加 `--dry-run` 开关，验证全链路但不写入

---

## 11. Out of Scope（YAGNI 锁定）

| 不做 | 理由 |
|----|----|
| ❌ `libs/notion` 全套单元测试（只 diff 单测）| 500 篇场景下集成已够 |
| ❌ 主动 Notion 评测集 | 需手标；今天不做 |
| ❌ 永久增量 cache | mtime + hash 已够 |
| ❌ 自动定 schedule（cron）| 手动触发足够 |
| ❌ web UI | CLI 够用 |
| ❌ 多 workspace 支持 | YAGNI |
| ❌ 数据库 page 行展开 | page-level 语义 |
| ❌ OCR / 反爬 / 镜像 | personal use 不需要 |
| ❌ Notion 数据**回写** RAG | RAG 是 read-only，不修改 Notion |
| ❌ 端到端 e2e test | spec 验收清单已覆盖 |

未来扩展触发——**先写新 spec**，不动本 spec 的代码路径。

---

## 12. Implementation Order

按依赖排序，**每步 commit 可回滚**：

1. **重构 `libs/rag/indexer.ts`**（`DocSource` 抽象）
   - 改 `incrementalIndex` 内部：DocEntry[] → DocSource[]，外接口不变
   - 跑 `ex_001` / `ex_002` 验证回归
2. **chunk id 改造**：`byteStart-end` → `chunkOrdinal`
   - 给 `chunkByHeading` / `chunkByParagraph` 加 `startOrdinal` 参数
   - 跑回归
3. **写 `libs/notion/to-markdown.ts`** + 单测（纯函数）
   - block 类型映射 + 单测覆盖每种类型
4. **写 `libs/notion/fetch.ts`**
   - async gen 分页 + 限流 + 错误分类
   - **不接 RAG**，只产 `NotionDoc[]`
5. **写 `libs/notion/diff.ts`**
   - 适配 NotionDoc → DocSource，复用 `diffDocs`
6. **写 `examples/notion_import/main.ts`**
   - 编排 + env + 报告
   - 加 `--dry-run` 开关
7. **跑验收清单（10.1 + 6.x）**
   - 跑通 A-G 全 7 项
8. **写 `.env.example` + README + .gitignore 校验**

总估时：半天到 1 个工作日。

---

## 13. Acceptance Checklist

`examples/notion_import/main.ts` 跑通 = 全部通过：

```
[ ] A. Fresh 数据库跑 → 全部 page 全部入库
    证据：skipped=0, added === pageCount
[ ] B. 5 个手写 query 召回命中
    证据：retrieve() 跑 5 条，top-3 至少 3 条相关
[ ] C. 第二次跑（同数据库）→ 全部 unchanged
    证据：unchanged.length === pageCount
[ ] D. 改一个 Notion page → 跑 → 1 个 modified
    证据：modified.length === 1, 其 hash 变化
[ ] E. 删除一个 page 共享 → 跑 → 1 个 removed
    证据：removed.length === 1
[ ] F. 失败 page 在 unreachable 报告里
    证据：模拟 403，unreachable 列表里有
[ ] G. ex_001 / ex_002 跑过，分数不变
    证据：现有 bootcamp 路径 0 影响
```

任何一项失败 → 不算完成。

---

## 14. Open Questions

- [ ] 是否加 `--dry-run` 开关？（spec 默认加）
- [ ] chunk 表 id 主键策略（ordinal）是否需要二次确认？
- [ ] `lancedb.add` 跨 run 行为验证失败时的 fallback 策略？

---

## 15. References

- ADR-0001：`docs/adr/0001-tool-capability-must-not-embed-in-system-prompt.md`
- ADR-0002：`docs/adr/0002-run-events-accepts-messages-caller-injects-system-prompt.md`
- ADR-0003：`docs/adr/0003-tool-params-single-source-of-truth-zod.md`
- 现有 RAG 库：`libs/rag/`
- 现有 embed：`libs/embedding/embed.ts`
- 现有评测：`libs/rag/evaluate.ts`

---

## Appendix A：与 bootcamp 关系

本 spec **不属于 Day 13 课程内容**。用户豁免"今日边界"原则，明确作为**项目任务**处理。
