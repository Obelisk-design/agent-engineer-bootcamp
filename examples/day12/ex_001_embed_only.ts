/**
 * examples/day12/ex_001_embed_only.ts
 *
 * 手跑 libs/embedding：在 node 环境直接调 embed() + cosineDistance，
 * 不依赖 vite env / 浏览器。验证 dev 网关 + 配置的 embedding 模型真能跑通，
 * 不必启动 dev:web 也能在终端看到向量。
 *
 * 跑法：npx tsx examples/day12/ex_001_embed_only.ts
 *
 * 准备：需要 .env 里 OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL_NAME
 * （或直接在 shell 里 export）。
 */

import 'dotenv/config';
import { embed } from '../../libs/embedding/embed.js';
import {
  cosineDistance,
  cosineSimilarity,
  euclideanDistance,
} from '../../libs/embedding/distance.js';

const TEXTS = ['cat', 'dog', 'apple', 'orange', 'happy', 'sad'] as const;

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.EMBEDDING_MODEL_NAME;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('OPENAI_API_KEY not set (export from .env)');
  }
  if (!baseUrl) {
    throw new Error('OPENAI_BASE_URL is required (set in .env or shell env)');
  }
  if (!model) {
    throw new Error('EMBEDDING_MODEL_NAME is required (set in .env or shell env)');
  }

  console.log(`--- 1. embed 6 words (4096 dim) via ${model} @ ${baseUrl} ---`);
  const t0 = Date.now();
  const { vectors, dimensions } = await embed({ input: TEXTS, model, baseUrl }, apiKey);
  console.log(`got ${vectors.length} vectors × ${dimensions} dim in ${Date.now() - t0}ms`);

  console.log('\n--- 2. 同类相聚：cat vs dog < cat vs apple (cosine) ---');
  const cat = vectors[0]!;
  const dog = vectors[1]!;
  const apple = vectors[2]!;
  const happy = vectors[4]!;
  console.log(
    `  cat↔dog   cosine=${cosineDistance(cat, dog).toFixed(4)}  sim=${cosineSimilarity(cat, dog).toFixed(4)}`,
  );
  console.log(
    `  cat↔apple cosine=${cosineDistance(cat, apple).toFixed(4)}  sim=${cosineSimilarity(cat, apple).toFixed(4)}`,
  );
  console.log(
    `  cat↔happy cosine=${cosineDistance(cat, happy).toFixed(4)}  sim=${cosineSimilarity(cat, happy).toFixed(4)}`,
  );

  console.log('\n--- 3. cosine vs euclidean：方向 vs 距离 ---');
  console.log(
    `  cat↔dog   cosine=${cosineDistance(cat, dog).toFixed(4)}  euclidean=${euclideanDistance(cat, dog).toFixed(4)}`,
  );
  console.log(
    `  cat↔apple cosine=${cosineDistance(cat, apple).toFixed(4)}  euclidean=${euclideanDistance(cat, apple).toFixed(4)}`,
  );

  console.log('\n--- 4. 反例：dim-mismatch 应该抛 ---');
  try {
    const fake256 = new Array(256).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    cosineDistance(cat, fake256); // 4096 vs 256
  } catch (err) {
    console.log(`  ok: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('\n--- 5. ex_002 探针结论：dev 网关不支持 dimensions 参数 ---');
  console.log('  原计划 4096 vs 256 Matryoshka 对比取消（vLLM/litellm 拒绝）');
  console.log('  改为同维度 cosine vs euclidean 对比（见 Panel C）');
}

main().catch((err: unknown) => {
  console.error('FAIL:', err);
  process.exit(1);
});
