/**
 * examples/langchain-side/step5_probe_tools.ts
 *
 * LangChain 副线 Step 5 探针：用真实 API 验证 4 个假设，写 step5_calc_tool.ts 之前必跑。
 *
 * 探针要回答（按 day12 retro 第 1 条）：
 *   1. zod v4 schema 用 LangChain `tool()` 工厂创建 DynamicStructuredTool 真的能跑通吗？
 *   2. LangChain 内部的 JSON Schema 输出形态 vs 主线 `z.toJSONSchema(t.schema, { target: 'draft-7', io: 'input' })`？
 *   3. 参数校验失败时 LangChain 抛什么异常？（对比主线 `formatZodError` 的形态）
 *   4. invoke 接收的参数是 zod input（默认未填充）还是 output（默认已填充）？这关系到 LLM 调用方传参语义
 *
 * 用法：npx tsx examples/langchain-side/step5_probe_tools.ts
 *
 * 探针成功后再写 step5_calc_tool.ts。探针失败 → 回去改设计。
 */

import 'dotenv/config';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';

const schema = z.object({
  expression: z.string().describe('Arithmetic expression, e.g. "1+2*3"'),
  precision: z.number().int().min(0).max(10).default(2).describe('Decimal precision'),
});

// ─── probe 1: tool() 工厂 + invoke ───
async function probeInvoke(): Promise<void> {
  console.log('\n=== probe 1: tool() 工厂 + invoke ===');
  const calc = tool(async ({ expression }) => ({ result: expression.length }), {
    name: 'calc_probe',
    description: 'Probe tool',
    schema,
  });
  console.log(`tool instance: ${calc.constructor.name}`);
  console.log(`tool.name: ${calc.name}`);

  // 1a. 不带 default 字段（precision）
  console.log('\n  [1a] invoke without precision (default should fill)');
  try {
    const out = await calc.invoke({ expression: '1+2' });
    console.log(`  output: ${JSON.stringify(out)}`);
  } catch (err) {
    console.log(`  ❌ ${(err as Error).message}`);
  }

  // 1b. 带 default 字段
  console.log('\n  [1b] invoke with precision=4');
  try {
    const out = await calc.invoke({ expression: '1+2', precision: 4 });
    console.log(`  output: ${JSON.stringify(out)}`);
  } catch (err) {
    console.log(`  ❌ ${(err as Error).message}`);
  }

  // 1c. 类型错误（precision 是 string）
  console.log('\n  [1c] invoke with precision="abc" (should throw)');
  try {
    const out = await calc.invoke({ expression: '1+2', precision: 'abc' as unknown as number });
    console.log(`  unexpected success: ${JSON.stringify(out)}`);
  } catch (err) {
    console.log(
      `  ✅ threw: ${(err as Error).constructor.name}: ${(err as Error).message.slice(0, 200)}`,
    );
  }

  // 1d. 缺字段
  console.log('\n  [1d] invoke without expression (should throw)');
  try {
    const out = await calc.invoke({} as unknown as { expression: string });
    console.log(`  unexpected success: ${JSON.stringify(out)}`);
  } catch (err) {
    console.log(
      `  ✅ threw: ${(err as Error).constructor.name}: ${(err as Error).message.slice(0, 200)}`,
    );
  }

  // probe 4: invoke 收到的是 input 还是 output？
  console.log('\n  [4] inspect input type vs output type');
  console.log(
    `  schema._def.typeName (zod internal): ${(schema._def as { typeName?: string }).typeName}`,
  );
}

// ─── probe 2: JSON Schema 形态对比 ───
async function probeJsonSchemaShape(): Promise<void> {
  console.log('\n=== probe 2: JSON Schema 形态对比 ===');
  const calc = tool(async ({ expression }) => ({ result: expression.length }), {
    name: 'calc_probe2',
    description: 'Probe tool',
    schema,
  });

  console.log('  LangChain tool.getInputSchema() output:');
  // langchain dynamic structured tool 的 schema 通过 getInputSchema() 拿
  try {
    const lcSchema = (calc as unknown as { getInputSchema: () => unknown }).getInputSchema();
    console.log(`  ${JSON.stringify(lcSchema, null, 2).slice(0, 600)}`);
  } catch (err) {
    console.log(`  failed: ${(err as Error).message}`);
  }

  console.log('\n  主线 zod v4 native z.toJSONSchema 输出:');
  try {
    const v4Schema = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' });
    console.log(`  ${JSON.stringify(v4Schema, null, 2).slice(0, 600)}`);
  } catch (err) {
    console.log(`  failed: ${(err as Error).message}`);
  }
}

// ─── probe 3: 异常类型 ───
async function probeErrorType(): Promise<void> {
  console.log('\n=== probe 3: 异常类型 vs 主线 formatZodError ===');
  console.log(
    '  主线 formatZodError 输出形态: "calculator: invalid arguments — expression: Required"',
  );
  console.log('  LangChain 内部 ToolInputParsingException 形态待观察（probe 1c/1d 已打印）');
}

async function main(): Promise<void> {
  await probeInvoke();
  await probeJsonSchemaShape();
  await probeErrorType();

  console.log('\n[step5-probe] done');
  console.log('\n基于探针的决策：');
  console.log('  - zod v4 + tool() 兼容 ✅（probe 1 通过即确认）');
  console.log('  - JSON Schema 形态是否与主线一致 → 看 probe 2 输出决定是否需要转换');
  console.log('  - 异常类型是否被 Agent 层兼容 → 看 probe 1c/1d 输出');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
