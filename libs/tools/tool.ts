/**
 * libs/tools/tool.ts
 *
 * Tool 层基础定义。
 *
 * Tool 是 Agent Loop 中 "可被 LLM 调用" 的能力单元。
 * ToolRegistry 持有多个 Tool 并提供序列化给 LLM SDK 的能力。
 *
 * ToolParameters 是简化版 JSON Schema (type/object/properties/required) —— Day 04 不引入
 * zod/ajv runtime validation, 由 tool execute 自检 (Day 04 CalculatorTool 走此纪律)。
 */

export interface ToolParameters {
  readonly type: 'object';
  readonly properties: Record<string, { readonly type: string; readonly description?: string }>;
  readonly required?: ReadonlyArray<string>;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
}

export interface Tool<TArgs = unknown, TReturn = unknown> {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
  execute(args: TArgs): Promise<TReturn>;
}
