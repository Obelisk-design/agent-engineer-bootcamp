/**
 * examples/day22/ex_001_generate_gt.ts
 *
 * Day 22 — LLM 生成 GT 候选（spec §6.1）。
 *
 * 流程：
 *   1. 加载 chunks_corporate_heading 表 → 抽 ≥ 80 个 chunk 作候选
 *   2. LLM (MODEL_NAME / ai-coding) 给每个候选生成 { query, expectedAnswer, expectedChunkIds }
 *   3. 规则分类自动打 query/chunk/answer 三维度标签（libs/eval/classify）
 *   4. 写入 examples/day22/gt-raw.json
 *
 * 后续：
 *   - 老大人工修正 → gt-dataset.json v1（humanReviewed=true ≥ 30 条）
 *
 * 跑法：
 *   pnpm exec tsx examples/day22/ex_001_generate_gt.ts
 *
 * 为什么 MODEL_NAME (ai-coding) 而非 qwen3-embedding：
 *   - .env 的 MODEL_NAME 是 dev 网关的聊天模型（白名单 ai-coding）
 *   - qwen3-embedding-8b / qwen3-reranker-4b 是嵌入/重排专用
 *   - GT 生成是 LLM 聊天 → 用 ai-coding（spec §2 决策 4：都用 qwen3-8b 调试期 —— 路由同源）
 *
 * 不做：
 *   - 不做 embedding（只调聊天模型）
 *   - 不调 incrementalIndex（库已由 ex_000 入库）
 *   - 不写 gt-dataset.json（人工修正后写，今天只写 gt-raw.json）
 */

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { openVectorStore } from '../../libs/rag/store.js';
import {
  classifyQuery,
  classifyChunk,
  classifyAnswer,
  type EvalQuery,
} from '../../libs/eval/index.js';

const LANCEDB_URI = '.lancedb/corporate';
const TABLE_NAME = 'chunks_corporate_heading';
const TARGET_COUNT = 80; // spec §2 决策 9
const OUT_PATH = 'examples/day22/gt-raw.json';

interface GenRow {
  chunkId: string;
  chunkText: string;
  chunkSource: string;
  query: string;
  expectedAnswer: string;
}

async function callChat(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: { role: 'system' | 'user'; content: string }[],
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.5 }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${await resp.text()}`);
  const json = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? '';
}

/** 从 LLM 输出解析 JSON（容错：可能裹在 ```json 块里） */
function extractJson(content: string): { query: string; expectedAnswer: string } | null {
  // 尝试直接 parse
  try {
    const o = JSON.parse(content);
    if (typeof o.query === 'string' && typeof o.expectedAnswer === 'string') {
      return { query: o.query, expectedAnswer: o.expectedAnswer };
    }
  } catch {
    // fall through
  }
  // 尝试从 ```json ... ``` 块提取
  const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) {
    try {
      const o = JSON.parse(m[1]!);
      if (typeof o.query === 'string' && typeof o.expectedAnswer === 'string') {
        return { query: o.query, expectedAnswer: o.expectedAnswer };
      }
    } catch {
      // fall through
    }
  }
  return null;
}

function inferDomain(sourceFilename: string): EvalQuery['queryLabels']['domain'] {
  // filename 形如 `NNN_<cat>_<title>.<ext>` → cat 在第二个 segment
  const m = sourceFilename.match(/^\d+_([^_]+)_/);
  const cat = m?.[1] ?? '';
  if (cat.includes('人事') || cat.includes('hr')) return 'hr';
  if (cat.includes('行政') || cat.includes('admin')) return 'admin';
  if (cat.includes('财务') || cat.includes('finance')) return 'finance';
  if (cat.includes('IT') || cat.includes('it')) return 'it';
  if (cat.includes('法务') || cat.includes('legal')) return 'legal';
  return 'hr'; // 兜底
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const chatModel = process.env.MODEL_NAME;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!baseUrl) throw new Error('OPENAI_BASE_URL is required');
  if (!chatModel) throw new Error('MODEL_NAME (chat model) is required');

  const store = await openVectorStore(LANCEDB_URI, TABLE_NAME);
  try {
    const size = await store.size();
    if (size === 0) {
      throw new Error(`库 ${LANCEDB_URI}/${TABLE_NAME} 为空；请先跑 ex_000_index_corpus.ts`);
    }
    console.log(`库 size: ${size}`);

    // 1. 随机抽样 chunks（用 random vector 检索近似 random）
    // 简化：用零向量检索 → 取首 80 个（lancedb 不支持 random shuffle；接受近似）
    // 维度必须匹配表实际（dev qwen3-embedding-8b = 4096）
    const samples = await store.search(new Array(4096).fill(0), TARGET_COUNT);
    console.log(`抽取候选: ${samples.length} 个 chunk`);

    // 2. 逐 chunk 调 LLM 生成 query + expectedAnswer
    const rawRows: GenRow[] = [];
    const failLog: string[] = [];
    const SYSTEM_PROMPT = `你是企业制度语料出题员。给定一段制度文本（chunk），生成 1 道问题 + 期望答案。
要求：
- 问题能用该 chunk 回答（语义命中）
- 期望答案是 chunk 中能找到的事实或综合
- 输出 JSON: {"query": "...", "expectedAnswer": "..."}
- 不要编 chunk 里没有的内容
- 期望答案不超过 200 字
- 只输出 JSON，不要其他内容`;

    for (let i = 0; i < samples.length; i++) {
      const hit = samples[i]!;
      const text = hit.record.text.slice(0, 800); // 截断，避免 token 超
      try {
        const content = await callChat(apiKey, baseUrl, chatModel, [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `chunk 文本：\n"""\n${text}\n"""` },
        ]);
        const parsed = extractJson(content);
        if (!parsed) {
          failLog.push(`#${i} parse fail: ${content.slice(0, 100)}`);
          continue;
        }
        rawRows.push({
          chunkId: hit.record.id,
          chunkText: hit.record.text,
          chunkSource: hit.record.source,
          ...parsed,
        });
        // 进度打印
        if ((i + 1) % 10 === 0) {
          console.log(
            `  生成进度: ${i + 1}/${samples.length} (累计 ok=${rawRows.length}, fail=${failLog.length})`,
          );
        }
      } catch (e) {
        failLog.push(`#${i} call fail: ${(e as Error).message}`);
      }
    }

    // 3. 规则分类 + 组装 EvalQuery
    const queries: EvalQuery[] = rawRows.map((r, i) => {
      const id = `Q${String(i + 1).padStart(3, '0')}`;
      const domain = inferDomain(r.chunkSource);
      const queryLabels = classifyQuery(r.query, domain);
      const sourceFormat = 'md' as const; // Day 21 多格式 → 简化标注
      const chunkLabels = [classifyChunk(r.chunkText, sourceFormat)];
      const answerLabels = classifyAnswer(r.expectedAnswer, queryLabels.type);
      return {
        id,
        query: r.query,
        expectedAnswer: r.expectedAnswer,
        expectedChunkIds: [r.chunkId],
        queryLabels,
        chunkLabels,
        answerLabels,
        source: 'llm' as const,
        humanReviewed: false,
      };
    });

    // 4. 写 gt-raw.json
    const dataset = {
      version: '2026-09-11-raw',
      queries,
    };
    await writeFile(OUT_PATH, JSON.stringify(dataset, null, 2), 'utf8');

    console.log('\n=== GT 生成汇总 ===');
    console.log(`候选 chunks:    ${samples.length}`);
    console.log(`生成成功:       ${queries.length}`);
    console.log(`生成失败:       ${failLog.length}`);
    if (failLog.length > 0) {
      console.log('\n失败样本（前 5）：');
      for (const f of failLog.slice(0, 5)) console.log(`  ${f}`);
    }
    console.log(`\n输出:           ${OUT_PATH}`);
    console.log(`下一步：人工改 source 字段 + humanReviewed=true ≥ 30 条 → gt-dataset.json v1`);
  } finally {
    await store.close();
  }
}

main().catch((err) => {
  console.error('gt 生成异常：', err);
  process.exit(1);
});
