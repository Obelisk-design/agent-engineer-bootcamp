/**
 * libs/tools/tool-registry.ts
 *
 * ToolRegistry: 注册 / 查找 / 转 provider format 的中心。
 *
 * Day 04 不做 toOpenAI() / toAnthropic() 拆分 —— ToolRegistry.toProviderTools()
 * 返统一的 ToolDefinition 形态, 由 libs/llm 各自转 SDK 期望的格式。
 *
 * 后续 day 拆开 (OpenAI 走 function calling, Anthropic 走 input_schema) 时:
 *   toProviderTools(provider: 'openai' | 'anthropic') 拆成两个 method。
 */

import type { Tool, ToolDefinition } from './tool.js';

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

  toProviderTools(): ReadonlyArray<ToolDefinition> {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
