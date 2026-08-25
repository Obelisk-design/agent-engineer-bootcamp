/**
 * examples/langchain-side/step4_probe_embeddings.ts
 *
 * 探针：列 dev 网关有哪些可用 embedding 模型 + 验证维度。
 *
 * 用法：npx tsx examples/langchain-side/step4_probe_embeddings.ts
 *
 * 输出：
 *   - 网关支持的 embedding 模型列表（如果网关 /v1/models 端点可用）
 *   - 候选模型 (text-embedding-3-small/large, bge-large-zh 等) 试调 1 条文本的 embed 结果 + 维度
 */

import 'dotenv/config';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';

if (!apiKey) {
  console.error('OPENAI_API_KEY required');
  process.exit(1);
}

console.log(`[step4-probe] baseURL=${baseURL}`);

// ─── probe 1: 尝试列模型 ───
async function listModels(): Promise<void> {
  console.log('\n=== probe 1: GET /v1/models ===');
  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.log(`  HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.log(`  body: ${text.slice(0, 200)}`);
      return;
    }
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    const all = json.data?.map((m) => m.id) ?? [];
    const emb = all.filter((id) => /embed/i.test(id));
    console.log(`  total models: ${all.length}`);
    console.log(
      `  embedding models: ${emb.length > 0 ? emb.join(', ') : '(none matched /embed/i)'}`,
    );
    if (emb.length === 0 && all.length > 0) {
      console.log(`  all model ids: ${all.slice(0, 30).join(', ')}${all.length > 30 ? '...' : ''}`);
    }
  } catch (err) {
    console.log(`  fetch failed: ${(err as Error).message}`);
  }
}

// ─── probe 2: 候选模型逐个试调 1 条 embed ───
const CANDIDATES = [
  'qwen3-embedding-8b',
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
  'bge-large-zh-v1.5',
  'bge-large-en-v1.5',
];

async function probeEmbed(model: string, text: string): Promise<void> {
  try {
    const res = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text, model }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.log(`  ${model.padEnd(30)} HTTP ${res.status} ${body.slice(0, 120)}`);
      return;
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
      usage?: { prompt_tokens?: number };
    };
    const vec = json.data?.[0]?.embedding ?? [];
    const dim = vec.length;
    const nan = vec.some((v) => Number.isNaN(v) || !Number.isFinite(v));
    const sample = vec
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(', ');
    console.log(`  ${model.padEnd(30)} ✅ dim=${dim} sample=[${sample}...] nan=${nan}`);
  } catch (err) {
    console.log(`  ${model.padEnd(30)} ❌ ${(err as Error).message}`);
  }
}

async function probeAll(): Promise<void> {
  console.log('\n=== probe 2: 候选 embedding 模型试调 ===');
  const text = '4 闸必跑是哪 4 个';
  console.log(`  test query: "${text}"`);
  for (const m of CANDIDATES) {
    await probeEmbed(m, text);
  }
}

async function main(): Promise<void> {
  await listModels();
  await probeAll();
  console.log('\n[step4-probe] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
