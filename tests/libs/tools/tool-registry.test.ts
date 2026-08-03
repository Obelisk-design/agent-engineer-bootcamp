import { describe, expect, it } from 'vitest';

import { ToolRegistry } from '../../../libs/tools/tool-registry.js';
import { calculatorTool } from '../../../libs/tools/calculator-tool.js';

describe('ToolRegistry', () => {
  it('registers and retrieves a tool', () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    expect(registry.get('calculator')).toBe(calculatorTool);
  });

  it('throws on duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    expect(() => registry.register(calculatorTool)).toThrow('already registered');
  });

  it('returns undefined for unknown tool', () => {
    const registry = new ToolRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('lists registered tools', () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.name).toBe('calculator');
  });

  it('converts tools to provider definitions (JSON Schema derived from zod schema)', () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const defs = registry.toProviderTools();
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({
      name: 'calculator',
      description: calculatorTool.description,
    });
    // Day 11: parameters 派生自 schema，不再手写（ADR 0003）
    expect(defs[0]?.parameters).toMatchObject({
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    });
  });
});
