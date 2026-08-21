import 'dotenv/config';

const apiKey = process.env.OPENAI_API_KEY;
const baseUrl = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
const model = process.env.EMBEDDING_MODEL_NAME ?? 'qwen3-embedding-8b';

if (!apiKey) throw new Error('OPENAI_API_KEY not set');

async function tryEmbed(label: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[${label}] status=${res.status} body=${text.slice(0, 200)}`);
}

async function main(): Promise<void> {
  await tryEmbed('A. no dimensions', {
    model,
    input: ['cat'],
  });
  await tryEmbed('B. dimensions=256', {
    model,
    input: ['cat'],
    dimensions: 256,
  });
  await tryEmbed('C. dimensions=4096', {
    model,
    input: ['cat'],
    dimensions: 4096,
  });
  await tryEmbed('D. encoding_format=base64', {
    model,
    input: ['cat'],
    encoding_format: 'base64',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
