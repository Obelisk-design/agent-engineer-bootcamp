/**
 * libs/tools/tool-registry.ts
 *
 * ToolRegistry: 注册 / 查找 / 校验 / 转 provider format 的中心。
 *
 * ## 为什么校验在这一层（Day 11，ADR 0003）
 *
 * 校验有两个可能的归属：
 *   A. 每个 tool 的 execute 自己 parse —— 靠纪律，每个新 tool 都可能忘
 *   B. 框架层统一 parse —— 靠结构，「忘记校验」不可能发生
 *
 * 选 B。这不是给忘记校验的情况加兜底 if，而是消除它存在的条件。
 * 代价是 `execute()` 成为调用 tool 的唯一正确入口（`get()` 只用于查询存在性）。
 */

import { z } from 'zod';
import { runTool } from './tool.js';
import type { Tool, ToolDefinition, ToolJsonSchema } from './tool.js';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): ReadonlyArray<Tool> {
    return Array.from(this.tools.values());
  }

  /**
   * 调用 tool 的唯一正确入口：先按 schema 校验，再执行。
   *
   * 三类失败全部 throw（Day 07 规则，由 Agent 层 catch 后 yield tool_result）：
   *   - tool 不存在
   *   - 参数不合 schema（含无法无损转换的类型）
   *   - execute 自身抛错（IO 前置条件等）
   */
  async execute(name: string, rawArgs: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (tool === undefined) {
      throw new Error(`tool "${name}" not found`);
    }
    return runTool(tool, rawArgs);
  }

  /**
   * 派生给 LLM 的 tool 定义。
   *
   * `parameters` 由 schema 生成，不手写 —— 这是「schema 骗 LLM」类 bug 的根因消除点。
   * `io: 'input'` 让带 `.default()` 的字段不进 required（语义正确：LLM 可以不传）。
   */
  toProviderTools(): ReadonlyArray<ToolDefinition> {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: z.toJSONSchema(t.schema, { target: 'draft-7', io: 'input' }) as ToolJsonSchema,
    }));
  }
}
