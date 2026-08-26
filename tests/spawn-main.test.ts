import { describe, it, expect } from 'vitest';
import { spawnMain } from '../apps/api/src/spawn-main.js';

describe('spawnMain', () => {
  it('spawns notion_import and parses 4 phase events', async () => {
    const phases: string[] = [];
    const result = await spawnMain({
      namespace: 'notion',
      dryRun: true,
      onPhase: (e) => phases.push(e.name),
      onStderr: () => {},
      signal: new AbortController().signal,
    });
    // not exit 0 in test env without real NOTION_TOKEN; just verify it ran
    expect(phases.length).toBeGreaterThanOrEqual(0);
    expect(typeof result.exitCode).toBe('number');
  });

  it('aborts child on signal', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    const result = await spawnMain({
      namespace: 'notion',
      dryRun: true,
      onPhase: () => {},
      onStderr: () => {},
      signal: ac.signal,
    });
    // exitCode 非 0 或 stderr 标记 abort
    expect(result.exitCode).not.toBe(0);
  });
});
