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

  it('converts tools to provider definitions', () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const defs = registry.toProviderTools();
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({
      name: 'calculator',
      description: calculatorTool.description,
      parameters: calculatorTool.parameters,
    });
  });
});
