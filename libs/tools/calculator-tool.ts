/**
 * libs/tools/calculator-tool.ts
 *
 * CalculatorTool: 加减乘除 + 括号 的数学表达式求值。
 *
 * 表达式求值走自写 tokenizer + shunting-yard + RPN evaluation。
 * 不用 eval / new Function —— 避免任意代码执行风险 (Day 04 YAGNI 纪律)。
 *
 * 表达式只允许: 数字 (整数 + 小数) / + - * / / ( ) / 空白。 其他字符 throw。
 */

import type { Tool } from './tool.js';

export const calculatorTool: Tool<{ expression: string }, { result: number }> = {
  name: 'calculator',
  description:
    'Evaluate arithmetic expressions with +, -, *, / and parentheses. Input: { expression: string }. Returns { result: number }.',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'e.g. "1+2*3"' },
    },
    required: ['expression'],
  },
  execute: async (args) => {
    const { expression } = args;
    if (typeof expression !== 'string') {
      throw new Error(`calculator: expression must be string, got ${typeof expression}`);
    }
    return { result: evaluate(expression) };
  },
};

// ---------------------------------------------------------------------------
// Expression evaluator (tokenizer + shunting-yard + RPN eval)
// ---------------------------------------------------------------------------

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
        if (top !== undefined && top.kind === 'op' && top.op !== undefined && t.op !== undefined) {
          const topP = PRECEDENCE[top.op];
          const tP = PRECEDENCE[t.op];
          if (topP !== undefined && tP !== undefined && topP >= tP) {
            out.push(ops.pop()!);
          } else break;
        } else break;
      }
      ops.push(t);
    } else if (t.kind === 'paren' && t.dir === '(') {
      ops.push(t);
    } else if (t.kind === 'paren') {
      // ')'
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top && top.kind === 'paren' && top.dir === '(') {
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
    if (t.kind === 'num') {
      stack.push(t.value);
    } else if (t.kind === 'op') {
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
    // 'paren' tokens do not appear in RPN (consumed by shunting-yard).
  }
  if (stack.length !== 1) throw new Error('calculator: malformed expression');
  return stack[0]!;
}

export function evaluate(expression: string): number {
  return evalRPN(toRPN(tokenize(expression)));
}
