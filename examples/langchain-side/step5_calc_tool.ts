/**
 * examples/langchain-side/step5_calc_tool.ts
 *
 * LangChain 副线 Step 5：用 LangChain 抽象重写 bootcamp calculator-tool（zod schema + RPN 求值）。
 *
 * 目的：对比 bootcamp 手写 Tool + zod schema 单源 vs LangChain DynamicStructuredTool + tool() 工厂。
 *
 * 用法：
 *   npx tsx examples/langchain-side/step5_calc_tool.ts
 *
 * 对照 bootcamp 版（libs/tools/calculator-tool.ts）：
 *   bootcamp: ~40 行（Tool interface + zod schema + runTool + RPN evaluate）
 *   LangChain: ~50 行（tool() 工厂 + zod schema + 自带 RPN evaluate）
 *
 * 关键观察（探针 step5_probe_tools.ts 已验证）：
 *   - zod v4 + tool() 完全兼容（v1.x 进步）
 *   - invoke 时 LangChain 自动 safeParse(input) + 填 default → output 传给 func
 *     （跟 bootcamp runTool 完全一致）
 *   - 校验失败抛 ToolInputParsingException，消息自带字段路径
 *     （vs bootcamp formatZodError 带 tool name 前缀 + 错误信息更结构化）
 *   - 默认 invoke 不返回 JSON Schema（LangChain 用 input/output 分离），跟 bootcamp ToolDefinition.parameters 不同
 *
 * 公平性说明：
 *   - evaluate() 表达式求值器复制自 libs/tools/calculator-tool.ts（副线铁律：不进 libs/）
 *   - 这是 38 行 RPN 求值器的复刻，**不算新增逻辑**，只验证 LangChain 抽象边界
 */

import 'dotenv/config';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';

// ─── 1. zod schema（与 bootcamp calculator-tool.ts 完全一致）───
const calculatorSchema = z.object({
  expression: z.string().describe('Arithmetic expression, e.g. "1+2*3"'),
});

// ─── 2. 复刻 RPN evaluate（来自 libs/tools/calculator-tool.ts，避免跨目录 import）───
type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'paren'; dir: '(' | ')' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ kind: 'op', op: c });
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      tokens.push({ kind: 'paren', dir: c });
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i + 1;
      while (j < input.length && ((input[j]! >= '0' && input[j]! <= '9') || input[j] === '.')) j++;
      const value = parseFloat(input.slice(i, j));
      if (Number.isNaN(value)) throw new Error(`calculator: invalid number at ${i}`);
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }
    throw new Error(`calculator: unexpected char '${c}' at ${i}`);
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

function toRPN(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const ops: Token[] = [];
  for (const t of tokens) {
    if (t.kind === 'num') out.push(t);
    else if (t.kind === 'op') {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (
          top?.kind === 'op' &&
          top.op !== undefined &&
          t.op !== undefined &&
          (PRECEDENCE[top.op] ?? 0) >= (PRECEDENCE[t.op] ?? 0)
        ) {
          out.push(ops.pop()!);
        } else break;
      }
      ops.push(t);
    } else if (t.kind === 'paren' && t.dir === '(') {
      ops.push(t);
    } else {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top?.kind === 'paren' && top.dir === '(') {
          ops.pop();
          break;
        }
        out.push(ops.pop()!);
      }
    }
  }
  while (ops.length > 0) out.push(ops.pop()!);
  return out;
}

function evalRPN(rpn: Token[]): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.kind === 'num') stack.push(t.value);
    else if (t.kind === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error('calculator: malformed expression');
      switch (t.op) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          if (b === 0) throw new Error('calculator: division by zero');
          stack.push(a / b);
          break;
      }
    }
  }
  if (stack.length !== 1) throw new Error('calculator: malformed expression');
  return stack[0]!;
}

function evaluate(expression: string): number {
  return evalRPN(toRPN(tokenize(expression)));
}

// ─── 3. LangChain tool() 工厂（核心差异点）───
const langchainCalc = tool(
  async ({ expression }) => {
    const result = evaluate(expression);
    return `calculator: ${expression} = ${result}`;
  },
  {
    name: 'calculator',
    description:
      'Evaluate arithmetic expressions with +, -, *, / and parentheses. Input: { expression: string }. Returns the expression and result as a string.',
    schema: calculatorSchema,
  },
);

// ─── 4. demo 跑 4 个场景（与探针一致 + bootcamp calculator-tool 同场景）───
async function main(): Promise<void> {
  console.log('[step5-calc] langchain tool name:', langchainCalc.name);
  console.log('[step5-calc] tool instance:', langchainCalc.constructor.name);
  console.log('[step5-calc] tool description:', langchainCalc.description.slice(0, 80) + '...');

  console.log('\n=== scenario 1: 正常表达式（1+2*3）===');
  try {
    const out = await langchainCalc.invoke({ expression: '1+2*3' });
    console.log('  output:', out);
  } catch (err) {
    console.log('  ❌', (err as Error).message);
  }

  console.log('\n=== scenario 2: 带括号 ((1+2)*3) ===');
  try {
    const out = await langchainCalc.invoke({ expression: '(1+2)*3' });
    console.log('  output:', out);
  } catch (err) {
    console.log('  ❌', (err as Error).message);
  }

  console.log('\n=== scenario 3: 除零 (1/0) → execute 内 throw ===');
  try {
    const out = await langchainCalc.invoke({ expression: '1/0' });
    console.log('  output:', out);
  } catch (err) {
    console.log('  ✅', (err as Error).constructor.name + ':', (err as Error).message);
  }

  console.log('\n=== scenario 4: 非法字符 (1+2&3) → 校验不通过 ===');
  try {
    const out = await langchainCalc.invoke({ expression: '1+2&3' as unknown as string });
    console.log('  output:', out);
  } catch (err) {
    console.log(
      '  ✅',
      (err as Error).constructor.name + ':',
      (err as Error).message.slice(0, 200),
    );
  }

  console.log('\n=== scenario 5: 缺 expression → zod required 校验失败 ===');
  try {
    const out = await langchainCalc.invoke({} as unknown as { expression: string });
    console.log('  output:', out);
  } catch (err) {
    console.log(
      '  ✅',
      (err as Error).constructor.name + ':',
      (err as Error).message.slice(0, 200),
    );
  }

  /**
   * 关键观察（看完跑通后写 retro）：
   * 1. LangChain 帮你做了什么？tool() 工厂 + invoke + safeParse(input→output) 一条龙，不用手写 runTool
   * 2. 异常差异：LangChain 抛 ToolInputParsingException 消息更通用（"Received tool input did not match expected schema"），
   *    缺 tool name 前缀；bootcamp formatZodError 带 "calculator: invalid arguments — ..." 前缀，
   *    错误信息更结构化（path.join + issues.message）
   * 3. JSON Schema 输出：LangChain DynamicStructuredTool 没有 getInputSchema()，
   *    schema 走 input/output 分离设计（运行期才 derive）；bootcamp ToolDefinition.parameters 在 toProviderTools() 显式 derive
   * 4. provider 切换成本：tool() 函数对 schema 类型多重重载（zod v3 / v4 / JSON Schema / Interop），
   *    切换 schema 来源 0 改动；bootcamp 换 schema 来源需要改 toJSONSchema 调用
   */
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
