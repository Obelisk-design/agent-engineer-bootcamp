/**
 * libs/tools/index.ts
 *
 * libs/tools 公共导出。
 * Day 04 落地 CalculatorTool; Future days 加 FileTool / SearchTool / MCP Tool。
 */

export type { Tool, ToolJsonSchema, ToolDefinition } from './tool.js';
export { runTool } from './tool.js';
export { ToolRegistry } from './tool-registry.js';
export { calculatorTool } from './calculator-tool.js';
export * from './repo/index.js';
