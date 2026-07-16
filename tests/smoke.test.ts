import { describe, expect, it } from 'vitest';

import { APPS_VERSION } from '../apps/index.js';
import { LIBS_VERSION } from '../libs/index.js';

describe('Bootstrap', () => {
  it('Node version is >= 22', () => {
    const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
    expect(major).toBeGreaterThanOrEqual(22);
  });

  it('libs package is importable', () => {
    expect(LIBS_VERSION).toBe('0.1.0');
  });

  it('apps package is importable', () => {
    expect(APPS_VERSION).toBe('0.1.0');
  });
});
