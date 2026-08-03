/**
 * libs/tools/tool.ts
 *
 * Tool 层基础定义。
 *
 * Tool 是 Agent Loop 中 "可被 LLM 调用" 的能力单元。
 *
 * ## 参数契约的单一事实源（Day 11，ADR 0003）
 *
 * `schema` 是 tool 参数的**唯一**事实源，三处全部派生自它：
 *
 *   zod schema ─┬─ z.toJSONSchema()  ──▶ 发给 LLM 的 JSON Schema（ToolRegistry.toProviderTools）
 *               ├─ schema.parse()    ──▶ runtime 校验（ToolRegistry.execute，框架层唯一入口）
 *               └─ z.infer<>         ──▶ execute 的参数 TS 类型
 *
 * Day 04 曾手写 `ToolParameters` 并要求「execute 自检」。当时唯一的 CalculatorTool
 * 只有 string 参数，自检成本为零，决策正确。Day 10 引入 number/boolean/array 参数后，
 * 手写 schema 与 execute 内的 `Number()` / `Boolean()` / `Array.isArray()` 成为两份
 * 互不校验的事实源，产生了 2 个可复现的静默失败 bug。详见 ADR 0003。
 *
 * ## execute 的契约
 *
 * `execute` 收到的 `args` **必然已通过 schema 校验**（由 ToolRegistry.execute 保证）。
 * 因此 execute 内**禁止**再出现 `typeof` / `Number()` / `Boolean()` / `Array.isArray()`
 * 之类的类型臆测 —— 那是把「忘记校验」这件事重新变得可能。
 *
 * IO 前置条件（路径是否存在、是否是目录）仍由 execute 自己检查 —— zod 管不了文件系统。
 */

import { type z } from 'zod';

/**
 * 发给 LLM 的 JSON Schema 形态。
 * 直接取 zod 的 JSON Schema 类型 —— 不手写，避免再次出现"两份事实源"。
 */
export type ToolJsonSchema = z.core.JSONSchema.BaseSchema;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** 派生自 Tool.schema，勿手写 */
  readonly parameters: ToolJsonSchema;
}

export interface Tool<TSchema extends z.ZodType = z.ZodType, TReturn = unknown> {
  readonly name: string;
  readonly description: string;
  /** 参数契约的事实源 */
  readonly schema: TSchema;
  /** args 已由框架层校验，可直接使用 */
  execute(args: z.infer<TSchema>): Promise<TReturn>;
}

/**
 * 把 ZodError 压成一行给 LLM 看的字符串。
 *
 * 必须带 tool 名 + 参数路径 —— LLM 拿到 tool_result 后要能定位「我传错了什么」，
 * 否则它只能重试同样的错误参数。
 */
function formatZodError(toolName: string, err: z.ZodError): string {
  const details = err.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
  return `${toolName}: invalid arguments — ${details}`;
}

/**
 * 调用单个 tool 的规范入口：先按 schema 校验，再执行。
 *
 * 直接调 `tool.execute()` 会绕过校验 —— 类型系统会拦住（execute 要求已 parse 的类型，
 * 含所有 default 填充后的字段），但语义上也不该那么用。
 *
 * `ToolRegistry.execute()` 是按名字查找版本，内部委托到这里。两个入口共享同一个
 * 校验实现 —— 「校验总会发生」这条不变量对两者都成立。
 */
export async function runTool<TSchema extends z.ZodType, TReturn>(
  tool: Tool<TSchema, TReturn>,
  rawArgs: unknown,
): Promise<TReturn> {
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    throw new Error(formatZodError(tool.name, parsed.error));
  }
  return tool.execute(parsed.data as z.infer<TSchema>);
}
