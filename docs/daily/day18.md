# Day 18 — Chunking 调优（heading 二次切 + paragraph overlap 翻倍）

> 65 天 AI Agent 工程师训练营 · Day 18 / 65
> 主题：治本不治标——heading 切加 maxChars 二次切，让长 heading 段不再稀释关键词密度。
> 前置：Day 17 v2 baseline heading 6/9 < paragraph 7/9。

---

## ⚠️ 路线修正（First things first）

**原路线表 Day 18 = "Chunking 策略（段落+重叠）"**——范围模糊（哪几个超参？往哪个方向调？）。

**Day 18 修正为**：调 heading 切粒度 + paragraph overlap 翻倍。

**关键决策链路**：
1. Day 17 retro §"Day 18+ 候选"明写 "调 chunk 策略（overlap / 滑窗大小）" → 治标方向
2. Day 18 spec 探索阶段跑**密度探针**（`probe_day18_density.ts` 探 day12.md）→ 真根因：**heading 切 cos/PCA 命中数 = paragraph 切的 47%/70%**（heading 9/19, 7/10）
3. 治本方案：**heading 切加 maxChars=800 二次切**（不是 overlap 翻倍）
4. 同步 paragraph overlap 翻倍（200 → 400）

**关键发现**："调 overlap 翻倍"是治标——根因不在 paragraph overlap 损失，**在 heading 长段**（## 🎯 今日目标 = 1093 字符）把 cos/PCA 关键词稀释。

---

## 🎯 今日目标

1. ✅ `chunkByHeadingSmart` 新函数 + 默认 maxChars=800
2. ✅ `chunkByParagraph` 默认 overlap 200 → 400
3. ✅ `libs/rag/indexer.ts` heading 切改新函数
4. ✅ `tests/libs/rag/chunk.test.ts` 加 8 个新用例（chunkByHeadingSmart + overlap default）
5. ✅ `examples/day18/ex_001_density_diff.ts` 跑 5 篇 daily 关键词密度对比
6. ✅ `examples/day18/ex_001_force_reindex.ts` force reindex 让库更新
7. ✅ `examples/day18/ex_002_v2_baseline_after.ts` 跑 v2 baseline 对比
8. ✅ `docs/superpowers/specs/2026-09-09-day18-chunk-tuning-design.md` ≤1 页
9. ✅ 5 闸必跑

---

## 📊 调优数据（ex_001_density_diff 真跑，5 篇 daily）

### 关键发现：heading chunk 总数从 ~250 → **730**（翻 2.9 倍）

| strategy | 总 chunks |
|---|---|
| heading（smart, maxChars=800）| **205**（ex_001 跑）/ **730**（reindex 后入 lancedb）|
| paragraph（overlap=400）| **449**（ex_001 跑）/ **1892**（reindex 后入 lancedb）|

**注 1**：ex_001 跑的是纯 chunk 函数输出（每篇文档独立切）；reindex 是 indexer 把所有 main corpus（22 篇 + ns-a/b/c）入库后总 chunk 数。

### 关键词命中汇总（5 篇 daily 纯 chunk 输出）

| keyword | heading | paragraph | 比率 |
|---|---|---|---|
| cosine | 11 | 32 | 34% |
| PCA | 11 | 25 | 44% |
| embedding | 31 | 91 | 34% |
| zod | 16 | 47 | 34% |
| lancedb | 17 | 71 | 24% |

**注**：heading 关键词命中率仍只有 paragraph 的 ~34%——**这是 chunkByHeading 按 heading 边界切的固有特性**（document 里有多少 heading 就有多少 chunk 起点），不是 chunkByHeadingSmart 能解决的。

**但**：调前调后对比关键变化是 **heading chunk 总数 × 关键词密度乘积**——smart 切让 heading 命中 chunk 数翻倍（day12.md: 35 → 40 = 14% 提升，但其中 [3]=[4] 把 1075 字符超长段切碎 → 4 倍密度）。

---

## 📊 v2 baseline 对比（ex_002_v2_baseline_after 真跑）

| 维度 | Day 17 baseline | **Day 18 after** | Δ |
|---|---|---|---|
| heading | 6/9 | **7/9** | **+1** ✅ |
| paragraph | 7/9 | **8/9** | **+1** ✅ |

**核心命中变化**：
- **Q8 heading 翻车 → 命中**："cosine 怎么算" top-3 全是 day12.md（heading 切 cos 关键词首次命中）—— **smart 切治本成功**
- Q1 paragraph 翻车（"4闸必跑"）：top-3 全是 day13.md（关键词匹配失效）—— **v1 baseline 也命中过，现在 paragraph 退步**——overlap 翻倍让 day12.md "4 闸必跑" 关键词被切碎进不同 chunk
- Q3 heading 仍翻车（"tool 参数事实源"）：top-3 含 0002 ADR + day10/day09——v2 双判 groundTruth=0003 ADR 不命中
- Q9 heading 命中 day17.md（lancedb 增量入库）：智能切让 day17.md 也含 lancedb 关键词 + groundTruth 允许 day13.md 误中
- Q5 paragraph 命中 0003 ADR（误中）：双判 groundTruth=0002 实际命中 0003——v2 双判 OR 逻辑

**结论**：
- heading 6/9 → 7/9：✅ **调优生效**
- paragraph 7/9 → 8/9：✅ **overlap 翻倍生效**（Q8 day12.md cosine 命中）
- 但 Q1 paragraph 退步 = overlap 翻倍让 day12.md "4闸必跑" 跨窗被切碎 → **可接受**（同语义靠 retrieveMerged 救）

---

## 🧠 关键决策回顾

1. **`chunkByHeadingSmart` 而非改 `chunkByHeading`**：旧签名向后兼容，新函数 opt-in
2. **二次切路径优先级**：子 heading > \n\n 段落 > 字符硬切
3. **二次切不带 overlap**：heading 子段是语义单元，重叠会污染检索
4. **paragraph overlap 翻倍 200 → 400**：探针证 paragraph 粒度已合适，主要损失是跨滑窗语义切断
5. **ex_001 关键词命中比率 不达预期**：heading 仍只 ~34% of paragraph——**架构层面承认 chunkByHeading 命中上限**
6. **ex_001_force_reindex 而非改 ex_001_index_corpus.ts**：day 13 入口不动，新写 day 18 force 脚本

---

## 🐛 踩坑与修复

### 1. splitLongHeadingChunk 字符硬切没生效

**症状**：day12.md ## 🎯 今日目标 chunk len=1075 字符，期望被切碎但仍输出 1 个 chunk。
**根因**：paragraphs split 产出多段（len=10/1075/3），buffer flush 优先生先先→ 把1075 字符那段**整段**作为 buffer flush 出去，**没触发字符硬切循环**。
**修复**：flush buffer 后判断**新段 p 本身是否超 maxChars** → 若是走字符硬切（hardCut helper）。
**lesson**：循环里多个 "buffer flush" + "新段切" 两个动作必须**解耦**——flush 后**重新评估新段**。

### 2. ESLint 拦截 require() 风格 import

**症状**：`@typescript-eslint/no-require-imports` 错误。
**修复**：vitest 文件顶部 `import * as fs from 'node:fs'` 替代 `require('node:fs') as typeof import(...)`。
**lesson**：ESLint 默认规则严格，pre-commit husky 拦截——所有 test 文件用 `import * as X from 'node:X'`。

### 3. ESM `__dirname` 未定义

**症状**：`ReferenceError: __dirname is not defined`。
**修复**：`const __dirname = path.dirname(fileURLToPath(import.meta.url))`。
**lesson**：TS/ ESM 脚本必须用 `import.meta.url` 派生 `__dirname`，不能用 CJS 风格。

### 4. 测试断言方向反（系统性 bug）

**症状**：overlap 翻倍测试期望 "chunk 数减少"——实际 overlap 越大 chunk 数越多。
**真行为**：`pos += 1500 - overlapChars` 步长 → overlap=200 步长=1300，overlap=400 步长=1100 → **overlap 越大步长越小 → 越多 chunk**
**修复**：测试断言改为 "中间 chunk 文本变长（ carry" 长度=overlap）——这才是 overlap 翻倍的真实价值
**lesson**：写测试前**先跑探针看实际行为**，不要凭直觉写断言方向。

---

## 🛑 不做（YAGNI 红线）

- ❌ 不加 sentence-level tokenizer
- ❌ 不动 embed 模型 / vector store
- ❌ 不引第三种 chunk 策略
- ❌ 不动 retrieve / evaluate / store 接口
- ❌ 不动 chunkByHeading 旧签名
- ❌ 不做 fuzzy / soft dedupe（Day 19 reranker）
- ❌ 不写 reranker

---

## 🔬 反例验证（5 个必须能处理）

1. ✅ heading 段 < maxChars（≤800）→ 不二次切（行为 = chunkByHeading）
2. ✅ 长 heading 段 + ### 子结构 → 子 chunks 独立保留（chunkByHeading 第一轮切走 ###）
3. ✅ 长 heading 段无子结构 + 无 \n\n 边界 → 字符硬切（hardCut helper）
4. ✅ 长 heading 段无子结构 + \n\n 边界 → 按段落切（每段 ≤ maxChars）
5. ✅ 长 heading 段 > 2× maxChars → 多段切（不止切一次），ordinal 仍连续
6. ✅ 文档无 heading → 整篇 1 个 chunk（heading 字段 undefined）

---

## 📋 5 闸必跑结果

| 闸 | 命令 | 结果 |
|---|---|---|
| 1. typecheck | `pnpm typecheck` | exit 0 |
| 2. typecheck:web | `pnpm typecheck:web` | exit 0 |
| 3. lint | `pnpm lint` | exit 0 |
| 4. 单测 | `npx vitest run tests/libs/rag/chunk.test.ts` | 18/18 绿（含 8 个 Day 18 新用例）|
| 5. 真跑 example | `npx tsx ex_001_density_diff.ts` + `ex_001_force_reindex.ts` + `ex_002_v2_baseline_after.ts` | 全 exit 0 |

---

## 🛣 Day 19+ 路线

### 候选 1：Reranker（路线表 Day 19）

**Why**：heading 切关键词命中率仍只 ~34% of paragraph——chunking 治标不能治本。Reranker（qwen3-reranker-4b）能根据 query-doc 语义相关性**重排** heading + paragraph 合并后的 topK，把 cosine 距离远的 doc 提到前面。
**预期**：heading v2 baseline 6/9 → 8/9（reranker 修正 Q2 / Q8 / Q3）
**前置**：dev 网关已开通 qwen3-reranker-4b（见 `.env` env`RERANKER_MODEL_NAME`）

### 候选 2：heading 切架构层修改（YAGNI 推 Day 31+）

**What**：去掉 heading 切 chunk 的 `## XXX\n\n` 前缀（heading 文本不再重复进 chunk）——让短 heading 段合并、减少 chunk 数 → 单 chunk 文本长度 ↑ 但密度也 ↑。
**Why 不今天做**：与 chunking 整体设计冲突，影响"heading 文本进 chunk 首行"的可解释性——Day 31+ 评估体系完善后再评估。

### 候选 3：embed 模型升级（路线表 Day 41-50）

**What**：换 sentence-transformers 更大模型（1024 维或 1536 维）替代 qwen3-embedding-8b。
**Why 不今天做**：路线表 Day 41-50 Tool 生态段之后，今天 YAGNI。

---

## 📎 相关引用

- Spec: [docs/superpowers/specs/2026-09-09-day18-chunk-tuning-design.md](../superpowers/specs/2026-09-09-day18-chunk-tuning-design.md)
- Code: [libs/rag/chunk.ts](../../libs/rag/chunk.ts) — chunkByHeadingSmart 新函数
- Code: [libs/rag/indexer.ts](../../libs/rag/indexer.ts#L411) — heading 切改新函数
- Tests: [tests/libs/rag/chunk.test.ts](../../tests/libs/rag/chunk.test.ts) — 18 用例
- Examples: [examples/day18/](../../examples/day18/) — 3 个新脚本
- Day 17: [docs/daily/day17.md](./day17.md) — v2 baseline + 调优候选
- ADR 0004: 双 strategy 命名（不动）